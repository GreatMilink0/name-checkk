import {
  Client,
  GatewayIntentBits,
  Events,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { logger } from "../lib/logger";
import { checkUsernames, parseUsernames } from "./checker";

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
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
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
      `🔍 Checking **${usernames.length}** username${usernames.length === 1 ? "" : "s"}… this may take a moment.`,
    );

    const results = await checkUsernames(usernames);
    const available = results
      .filter((r) => r.available)
      .map((r) => r.username);
    const taken = results
      .filter((r) => !r.available && !r.error)
      .map((r) => r.username);
    const errors = results.filter((r) => r.error).map((r) => r.username);

    // If available list is large, send as a file attachment instead
    if (available.length > MAX_INLINE) {
      const fileContent = available.join("\n");
      const file = new AttachmentBuilder(Buffer.from(fileContent, "utf-8"), {
        name: "available-usernames.txt",
      });
      const summary = `✅ **${available.length}** available / 🔴 **${taken.length}** taken / ⚠️ **${errors.length}** errors\nAvailable usernames attached as a file.`;
      await cmd.editReply({ content: summary, files: [file] });
    } else {
      const message = formatResults(available, taken, errors);
      // Discord messages cap at 2000 chars; truncate gracefully
      const safe =
        message.length > 1900 ? message.slice(0, 1900) + "\n…(truncated)" : message;
      await cmd.editReply(safe);
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
    process.exit(1);
  });
}
