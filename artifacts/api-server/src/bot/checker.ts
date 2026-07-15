import { logger } from "../lib/logger";

const DISCORD_API = "https://discord.com/api/v9";

/** Delay helper to respect rate limits */
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export type CheckResult = {
  username: string;
  available: boolean;
  error?: string;
};

/**
 * Checks a single Discord username for availability.
 * Returns true when the username is NOT taken.
 */
export async function checkUsername(username: string): Promise<CheckResult> {
  try {
    const res = await fetch(
      `${DISCORD_API}/unique-username/username-attempt-unauthed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      },
    );

    if (res.status === 429) {
      // Rate limited — back off and retry once
      const retryAfter = Number(res.headers.get("retry-after") ?? 2);
      logger.warn({ username, retryAfter }, "Rate limited, retrying");
      await delay(retryAfter * 1000);
      return checkUsername(username);
    }

    if (!res.ok) {
      return { username, available: false, error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { taken?: boolean };
    return { username, available: !data.taken };
  } catch (err) {
    return { username, available: false, error: String(err) };
  }
}

/**
 * Checks a list of usernames in parallel batches to stay within
 * Discord's rate limits while being much faster than sequential.
 */
export async function checkUsernames(
  usernames: string[],
  { batchSize = 5, batchDelayMs = 500 } = {},
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (let i = 0; i < usernames.length; i += batchSize) {
    const batch = usernames.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(checkUsername));
    results.push(...batchResults);
    if (i + batchSize < usernames.length) {
      await delay(batchDelayMs);
    }
  }
  return results;
}

/**
 * Parses a raw string into a deduplicated list of lowercase usernames.
 * Accepts comma, newline, or space as separators.
 */
export function parseUsernames(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,\n]+/)
        .map((u) => u.trim().toLowerCase().replace(/^@/, ""))
        .filter((u) => u.length >= 2 && u.length <= 32),
    ),
  ];
}
