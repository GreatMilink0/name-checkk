/**
 * One-time script: registers the /check slash command with Discord.
 * Run with: pnpm --filter @workspace/api-server run register
 */
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];

if (!token) {
  console.error("DISCORD_BOT_TOKEN environment variable is required.");
  process.exit(1);
}

if (!clientId) {
  console.error(
    "DISCORD_CLIENT_ID environment variable is required.\n" +
      "Find it on your application page at https://discord.com/developers/applications",
  );
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("check")
    .setDescription("Check which Discord usernames from a list are available")
    .addStringOption((opt) =>
      opt
        .setName("usernames")
        .setDescription(
          "Comma or newline separated list of usernames to check (e.g. coolname, another, onemore)",
        )
        .setRequired(false),
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("file")
        .setDescription(
          "A .txt file with one username per line (can combine with the usernames field)",
        )
        .setRequired(false),
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering /check slash command globally…");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Slash command registered successfully.");
    console.log(
      "Note: global commands can take up to 1 hour to appear in Discord.",
    );
    console.log(
      "For instant testing, add a guild ID and use Routes.applicationGuildCommands instead.",
    );
  } catch (err) {
    console.error("Failed to register commands:", err);
    process.exit(1);
  }
})();
