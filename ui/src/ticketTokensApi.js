import { api } from "./api.js";

/**
 * Per-ticket token usage. A null/empty scope reads the portfolio report across every
 * registered project; a board id reads that one project. Thin wrapper over the existing
 * allowlisted usage routes — no new endpoints.
 * @param {string | null | undefined} scopeId
 */
export function fetchTicketTokens(scopeId) {
  return api.usage(scopeId || null);
}
