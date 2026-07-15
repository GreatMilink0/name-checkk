import {
  Client,
  GatewayIntentBits,
  Events,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { logger } from "../lib/logger";
import { checkUsernames, parseUsernames } from "./checker";

async function registerCommands(token: string, clientId: string) {
  const commands = [
    new SlashCommandBuilder()
      .setName("check")
      .setDescription("Check which Discord usernames from a list are available")
      .addStringOption((opt) =>
        opt
          .setName("usernames")
          .setDescription("Comma or newline separated usernames to check")
          .setRequired(false),
      )
      .addAttachmentOption((opt) =>
        opt
          .setName("file")
          .setDescription("A .txt file with one username per line")
          .setRequired(false),
      )
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  logger.info("Slash commands registered");
}

const MAX_INLINE = 50; // show results inline below this count; use file above

function formatResults(
  available: string[],
  taken: string[],
  errors: string[],
): string {
  const lines: string[] = [];

  if (available.length > 0) {
    lines.push(`✅ **Available (${available.length})**`);
    lines.push("```");
    lines.push(available.join("\n"));
    lines.push("```");
  } else {
    lines.push("❌ No available usernames found.");
  }

  if (taken.length > 0) {
    lines.push(`🔴 **Taken (${taken.length})**`);
  }

  if (errors.length > 0) {
    lines.push(`⚠️ **Could not check (${errors.length}):** ${errors.join(", ")}`);
  }

  return lines.join("\n");
}

export function startBot(token: string): void {
  const clientId = process.env["DISCORD_CLIENT_ID"];
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
    if (clientId) {
      try {
        await registerCommands(token, clientId);
      } catch (err) {
        logger.error({ err }, "Failed to register slash commands");
      }
    } else {
      logger.warn("DISCORD_CLIENT_ID not set — skipping command registration");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "check") return;

    const cmd = interaction as ChatInputCommandInteraction;
    await cmd.deferReply();

    let raw = cmd.options.getString("usernames") ?? "";

    // Try to read an attached .txt file if provided
    const attachment = cmd.options.getAttachment("file");
    if (attachment) {
      try {
        const res = await fetch(attachment.url);
        const text = await res.text();
        raw += "\n" + text;
      } catch (err) {
        await cmd.editReply("⚠️ Could not read the attached file.");
        return;
      }
    }

    const usernames = parseUsernames(raw);
    if (usernames.length === 0) {
      await cmd.editReply(
        "Please provide at least one username (2–32 characters).",
      );
      return;
    }

    if (usernames.length > 500) {
      await cmd.editReply(
        `That's ${usernames.length} usernames — please keep lists under 500 at a time to avoid rate limits.`,
      );
      return;
    }

    await cmd.editReply(
      `🔍 Checking **${usernames.length}** username${usernames.length === 1 ? "" : "s"}…`,
    );

    // Discord interaction tokens expire after 15 min; leave a buffer
    const INTERACTION_DEADLINE = Date.now() + 14 * 60 * 1000;
    const BATCH_DEADLINE_MS = 28000;

    let remaining = usernames;
    let batchNum = 0;

    while (remaining.length > 0 && Date.now() < INTERACTION_DEADLINE) {
      const { results, checkedCount } = await checkUsernames(remaining, { deadlineMs: BATCH_DEADLINE_MS });
      remaining = remaining.slice(checkedCount);

      const available = results.filter((r) => r.available).map((r) => r.username);
      const taken = results.filter((r) => !r.available && !r.error).map((r) => r.username);
      const errors = results.filter((r) => r.error).map((r) => r.username);

      const progress = remaining.length > 0
        ? `\n⏳ *${remaining.length} names still to go — sending next batch now…*`
        : "";

      const body = formatResults(available, taken, errors) + progress;
      const safe = body.length > 1900 ? body.slice(0, 1900) + "\n…(truncated)" : body;

      if (batchNum === 0) {
        if (available.length > MAX_INLINE) {
          const file = new AttachmentBuilder(Buffer.from(available.join("\n"), "utf-8"), { name: "available-usernames.txt" });
          const summary = `✅ **${available.length}** available / 🔴 **${taken.length}** taken / ⚠️ **${errors.length}** errors\nAvailable names in file.${progress}`;
          await cmd.editReply({ content: summary, files: [file] });
        } else {
          await cmd.editReply(safe);
        }
      } else {
        if (available.length > MAX_INLINE) {
          const file = new AttachmentBuilder(Buffer.from(available.join("\n"), "utf-8"), { name: `available-usernames-part${batchNum + 1}.txt` });
          const summary = `✅ **${available.length}** available / 🔴 **${taken.length}** taken / ⚠️ **${errors.length}** errors\nAvailable names in file.${progress}`;
          await cmd.followUp({ content: summary, files: [file] });
        } else {
          await cmd.followUp(safe);
        }
      }

      batchNum++;
    }

    if (remaining.length > 0) {
      await cmd.followUp(`⚠️ Ran out of time (15 min limit). **${remaining.length}** names were not checked: ${remaining.join(", ")}`);
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
    process.exit(1);
  });
}
