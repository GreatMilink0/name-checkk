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
import { generateIcpNames } from "./generator";

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
    new SlashCommandBuilder()
      .setName("generate")
      .setDescription("Generate and check ICP-themed usernames — only shows available ones")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  logger.info("Slash commands registered");
}

const MAX_INLINE = 50;

function formatResults(available: string[], taken: string[], errors: string[]): string {
  const lines: string[] = [];
  if (available.length > 0) {
    lines.push(`✅ **Available (${available.length})**`);
    lines.push("```");
    lines.push(available.join("\n"));
    lines.push("```");
  } else {
    lines.push("❌ No available usernames found.");
  }
  if (taken.length > 0) lines.push(`🔴 **Taken (${taken.length})**`);
  if (errors.length > 0) lines.push(`⚠️ **Could not check (${errors.length}):** ${errors.join(", ")}`);
  return lines.join("\n");
}

function makeSafe(text: string): string {
  return text.length > 1900 ? text.slice(0, 1900) + "\n…(truncated)" : text;
}

async function sendResult(
  cmd: ChatInputCommandInteraction,
  available: string[],
  taken: string[],
  errors: string[],
  progress: string,
  isFirst: boolean,
  filePrefix: string,
  batchNum: number,
) {
  if (available.length > MAX_INLINE) {
    const fname = batchNum === 0 ? `${filePrefix}.txt` : `${filePrefix}-part${batchNum + 1}.txt`;
    const file = new AttachmentBuilder(Buffer.from(available.join("\n"), "utf-8"), { name: fname });
    const summary = `✅ **${available.length}** available / 🔴 **${taken.length}** taken / ⚠️ **${errors.length}** errors\nAvailable names in file.${progress}`;
    if (isFirst) await cmd.editReply({ content: summary, files: [file] });
    else await cmd.followUp({ content: summary, files: [file] });
  } else {
    const body = makeSafe(formatResults(available, taken, errors) + progress);
    if (isFirst) await cmd.editReply(body);
    else await cmd.followUp(body);
  }
}

/**
 * Runs the full check loop, sending batch updates every 30 s.
 * When done, sends a final summary of ALL available names if more than one batch ran.
 */
async function runCheckLoop(
  cmd: ChatInputCommandInteraction,
  usernames: string[],
  filePrefix: string,
) {
  const INTERACTION_DEADLINE = Date.now() + 14 * 60 * 1000;
  const BATCH_DEADLINE_MS = 28000;

  let remaining = usernames;
  let batchNum = 0;
  const allAvailable: string[] = [];

  while (remaining.length > 0 && Date.now() < INTERACTION_DEADLINE) {
    const { results, checkedCount } = await checkUsernames(remaining, { deadlineMs: BATCH_DEADLINE_MS });
    remaining = remaining.slice(checkedCount);

    const available = results.filter((r) => r.available).map((r) => r.username);
    const taken = results.filter((r) => !r.available && !r.error).map((r) => r.username);
    const errors = results.filter((r) => r.error).map((r) => r.username);
    allAvailable.push(...available);

    const progress = remaining.length > 0
      ? `\n⏳ *${remaining.length} names still to go…*`
      : "";

    await sendResult(cmd, available, taken, errors, progress, batchNum === 0, filePrefix, batchNum);
    batchNum++;
  }

  if (remaining.length > 0) {
    await cmd.followUp(`⚠️ Ran out of time (15 min limit). **${remaining.length}** names not checked: ${remaining.join(", ")}`);
  }

  // Final summary when multiple batches ran and there were any available names
  if (batchNum > 1 && allAvailable.length > 0) {
    const header = `🏁 **Done! All available names (${allAvailable.length} total):**`;
    if (allAvailable.length > MAX_INLINE) {
      const file = new AttachmentBuilder(Buffer.from(allAvailable.join("\n"), "utf-8"), { name: `${filePrefix}-all-available.txt` });
      await cmd.followUp({ content: header + "\nFull list attached.", files: [file] });
    } else {
      const body = `${header}\n\`\`\`\n${allAvailable.join("\n")}\n\`\`\``;
      await cmd.followUp(makeSafe(body));
    }
  }
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
    const cmd = interaction as ChatInputCommandInteraction;

    // ── /check ──────────────────────────────────────────────────────────────
    if (cmd.commandName === "check") {
      await cmd.deferReply();

      let raw = cmd.options.getString("usernames") ?? "";
      const attachment = cmd.options.getAttachment("file");
      if (attachment) {
        try {
          const res = await fetch(attachment.url);
          raw += "\n" + (await res.text());
        } catch {
          await cmd.editReply("⚠️ Could not read the attached file.");
          return;
        }
      }

      const usernames = parseUsernames(raw);
      if (usernames.length === 0) {
        await cmd.editReply("Please provide at least one username (2–32 characters).");
        return;
      }
      if (usernames.length > 500) {
        await cmd.editReply(`That's ${usernames.length} usernames — please keep lists under 500.`);
        return;
      }

      await cmd.editReply(`🔍 Checking **${usernames.length}** username${usernames.length === 1 ? "" : "s"}…`);
      await runCheckLoop(cmd, usernames, "available-usernames");
      return;
    }

    // ── /generate ────────────────────────────────────────────────────────────
    if (cmd.commandName === "generate") {
      await cmd.deferReply();
      const names = generateIcpNames();
      await cmd.editReply(`🎪 Checking **${names.length}** ICP-themed names… only available ones will be shown.`);
      await runCheckLoop(cmd, names, "icp-available");
      return;
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
    process.exit(1);
  });
}
