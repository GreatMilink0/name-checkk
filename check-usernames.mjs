#!/usr/bin/env node
/**
 * Discord Username Availability Checker
 * ─────────────────────────────────────
 * Requirements: Node.js 18+ (uses built-in fetch — no npm install needed)
 *
 * Usage:
 *   node check-usernames.mjs usernames.txt
 *   node check-usernames.mjs usernames.txt --out available.txt
 *   node check-usernames.mjs usernames.txt --delay 600
 *
 * Options:
 *   --out <file>     Write available usernames to a file (default: prints to console)
 *   --delay <ms>     Milliseconds between requests to avoid rate limits (default: 500)
 *
 * Input file format: one username per line, or comma-separated, or mixed.
 * Lines starting with # are treated as comments and skipped.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Discord Username Availability Checker
Usage: node check-usernames.mjs <input-file> [options]

Options:
  --out <file>    Save available usernames to a file
  --delay <ms>    Delay between requests in ms (default 500)
  --help          Show this help message

Example:
  node check-usernames.mjs usernames.txt
  node check-usernames.mjs usernames.txt --out available.txt --delay 600
`);
  process.exit(0);
}

const inputFile = args[0];
const outIndex = args.indexOf("--out");
const outFile = outIndex !== -1 ? args[outIndex + 1] : null;
const delayIndex = args.indexOf("--delay");
const delayMs = delayIndex !== -1 ? Number(args[delayIndex + 1]) : 500;

if (!existsSync(inputFile)) {
  console.error(`❌ File not found: ${inputFile}`);
  process.exit(1);
}

// ─── Parse usernames ─────────────────────────────────────────────────────────

function parseUsernames(raw) {
  return [
    ...new Set(
      raw
        .split(/[\n,]+/)
        .map((u) => u.trim().replace(/^@/, "").toLowerCase())
        .filter((u) => {
          if (!u || u.startsWith("#")) return false;
          if (u.length < 2 || u.length > 32) return false;
          return true;
        }),
    ),
  ];
}

const raw = readFileSync(resolve(inputFile), "utf-8");
const usernames = parseUsernames(raw);

if (usernames.length === 0) {
  console.error("❌ No valid usernames found in the input file.");
  process.exit(1);
}

// ─── Username checker ─────────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkUsername(username, retries = 2) {
  try {
    const res = await fetch(
      "https://discord.com/api/v9/unique-username/username-attempt-unauthed",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      },
    );

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 3);
      process.stdout.write(` [rate limited, waiting ${retryAfter}s]`);
      await delay(retryAfter * 1000);
      if (retries > 0) return checkUsername(username, retries - 1);
      return { available: false, error: "rate-limited" };
    }

    if (!res.ok) {
      return { available: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { available: !data.taken };
  } catch (err) {
    return { available: false, error: String(err) };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n🔍 Checking ${usernames.length} username(s) with ${delayMs}ms delay between requests…\n`);

const available = [];
const taken = [];
const errors = [];

for (let i = 0; i < usernames.length; i++) {
  const username = usernames[i];
  const progress = `[${i + 1}/${usernames.length}]`;
  process.stdout.write(`${progress} ${username} …`);

  const result = await checkUsername(username);
  await delay(delayMs);

  if (result.error) {
    process.stdout.write(` ⚠️  error (${result.error})\n`);
    errors.push(username);
  } else if (result.available) {
    process.stdout.write(` ✅ available\n`);
    available.push(username);
  } else {
    process.stdout.write(` 🔴 taken\n`);
    taken.push(username);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Available : ${available.length}
🔴 Taken     : ${taken.length}
⚠️  Errors    : ${errors.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

if (available.length > 0) {
  console.log("Available usernames:");
  available.forEach((u) => console.log("  " + u));
  console.log();
}

if (outFile) {
  writeFileSync(outFile, available.join("\n") + "\n", "utf-8");
  console.log(`📄 Available usernames saved to: ${outFile}`);
}
