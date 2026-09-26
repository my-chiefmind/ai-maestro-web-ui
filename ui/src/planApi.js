/**
 * planApi.js — the Plan tab's calls, as thin wrappers over api.js (which owns the allowlist).
 * Plan edits go through the targeted PATCH /plan operation route with the plan version read;
 * trace pickers PATCH a ticket's `traces_to` with the board version read.
 */
import { api } from "./api.js";

export const planApi = {
  /**
   * Plan snapshot + board (tickets/archived for coverage and traces). The plan is required; an
   * unreadable board degrades to `board: null` so the plan stays viewable and editable.
   * @param {string} id
   */
  load: (id) => Promise.all([api.plan(id), api.board(id).catch(() => null)]).then(([plan, board]) => ({ plan, board })),
  /** @param {string} id @param {string} operation @param {object} params @param {string} expectVersion */
  apply: (id, operation, params, expectVersion) => api.applyPlan(id, operation, params, expectVersion),
  /** @param {string} id @param {string} tid @param {string[]} traces @param {string} expectVersion */
  setTraces: (id, tid, traces, expectVersion) => api.patchTicket(id, tid, { traces_to: traces }, expectVersion),
};
