import { api } from "./api.js";

/**
 * Overview token usage (T-017). Thin wrapper over the existing allowlisted per-project usage
 * route (`GET /api/boards/:key/usage`) — the key is a registry key, never a path. No new
 * endpoints and no query strings.
 * @param {string} key
 */
export function fetchProjectTokens(key) {
  return api.usage(key);
}

const DAY_MS = 86_400_000;
/** UTC calendar day (YYYY-MM-DD), matching the usage report's `date` breakdown keys. @param {number} ms */
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Daily total tokens for the `days` UTC days ending today, zero-filled, oldest first.
 * @param {any} report @param {number} [days] @param {number} [now]
 * @returns {{day: string, tokens: number}[]}
 */
export function dailyTokens(report, days = 14, now = Date.now()) {
  const byDay = new Map();
  for (const row of report?.breakdown?.date ?? []) {
    byDay.set(row.key, (byDay.get(row.key) ?? 0) + Number(row.tokens?.total ?? 0));
  }
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDay(now - i * DAY_MS);
    out.push({ day, tokens: byDay.get(day) ?? 0 });
  }
  return out;
}

/**
 * 7-day, 30-day, and all-time total tokens for one project report.
 * @param {any} report @param {number} [now]
 */
export function tokenWindows(report, now = Date.now()) {
  const sum = (rows) => rows.reduce((n, r) => n + r.tokens, 0);
  return {
    d7: sum(dailyTokens(report, 7, now)),
    d30: sum(dailyTokens(report, 30, now)),
    all: Number(report?.totals?.tokens?.total ?? 0),
  };
}

/**
 * The project's tickets ranked by total tokens, highest first (ties by id). Tickets with no
 * recorded tokens are left out.
 * @param {any} report
 * @returns {{id: string, name: string, tokens: number}[]}
 */
export function rankTicketsByTokens(report) {
  return (report?.tickets ?? [])
    .map((t) => ({ id: String(t.id), name: t.name || String(t.id), tokens: Number(t.metrics?.tokens?.total ?? 0) }))
    .filter((t) => t.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id));
}
