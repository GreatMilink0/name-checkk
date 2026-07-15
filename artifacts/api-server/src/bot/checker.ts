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
export async function checkUsername(username: string, retries = 1): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = process.env["DISCORD_BOT_TOKEN"];
    if (token) headers["Authorization"] = `Bot ${token}`;

    const res = await fetch(
      `${DISCORD_API}/unique-username/username-attempt-unauthed`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ username }),
        signal: controller.signal,
      },
    );

    clearTimeout(timer);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 3);
      logger.warn({ username, retryAfter }, "Rate limited");
      // If the wait is too long to survive Discord's 15-min interaction window, bail out fast
      if (retryAfter > 10) {
        return { username, available: false, error: "rate-limited" };
      }
      await delay(retryAfter * 1000);
      if (retries > 0) return checkUsername(username, retries - 1);
      return { username, available: false, error: "rate-limited" };
    }

    if (!res.ok) {
      return { username, available: false, error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { taken?: boolean };
    return { username, available: !data.taken };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") && retries > 0) {
      await delay(1000);
      return checkUsername(username, retries - 1);
    }
    return { username, available: false, error: msg };
  }
}

export type CheckSummary = {
  results: CheckResult[];
  /** true when the deadline was hit before all names were checked */
  partial: boolean;
  checkedCount: number;
  totalCount: number;
};

/**
 * Checks a list of usernames in parallel batches to stay within
 * Discord's rate limits while being much faster than sequential.
 * If deadlineMs is set, stops after that many ms and returns partial results.
 */
export async function checkUsernames(
  usernames: string[],
  { batchSize = 2, batchDelayMs = 2000, deadlineMs }: { batchSize?: number; batchDelayMs?: number; deadlineMs?: number } = {},
): Promise<CheckSummary> {
  const results: CheckResult[] = [];
  const deadline = deadlineMs ? Date.now() + deadlineMs : null;

  for (let i = 0; i < usernames.length; i += batchSize) {
    if (deadline && Date.now() >= deadline) {
      return { results, partial: true, checkedCount: results.length, totalCount: usernames.length };
    }
    const batch = usernames.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(checkUsername));
    results.push(...batchResults);
    if (i + batchSize < usernames.length) {
      if (deadline && Date.now() >= deadline) break;
      await delay(batchDelayMs);
    }
  }
  return { results, partial: results.length < usernames.length, checkedCount: results.length, totalCount: usernames.length };
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
