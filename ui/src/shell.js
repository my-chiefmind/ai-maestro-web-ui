/**
 * shell.js — pure helpers for the cockpit-shaped shell: the project scope + tab URL state, the
 * roster filters, and the All-projects plan overview rows. No DOM, no fetch (node --test).
 */

export const ALL = "all";
export const TABS = Object.freeze([
  ["board", "Board"], ["usage", "Usage"], ["tokens", "Ticket tokens"], ["reports", "Reports"],
  ["plan", "Project plan"], ["roster", "Roster"], ["docs", "Documentation"], ["projects", "Projects"], ["help", "Help"],
]);
const TAB_KEYS = new Set(TABS.map(([key]) => key));
const SHELL_KEYS = ["scope", "tab"];
const SCOPE = /^[a-z0-9][a-z0-9_-]*$/;

/** Parse the shell state from a query string. Unknown tabs and scopes fail closed. */
export function shellState(search = "") {
  const params = new URLSearchParams(search);
  const scope = params.get("scope") || ALL;
  const tab = params.get("tab") || "board";
  return { scope: scope === ALL || SCOPE.test(scope) ? scope : ALL, tab: TAB_KEYS.has(tab) ? tab : "board" };
}

/**
 * Merge `own` keys into an existing query string, leaving every other key (e.g. the
 * operations filters) untouched. Empty and default values are removed so URLs stay short.
 * @param {string} search @param {string[]} keys @param {Record<string, string>} own @param {Record<string, string>} [defaults]
 */
export function mergeSearch(search, keys, own, defaults = {}) {
  const params = new URLSearchParams(search);
  for (const key of keys) {
    const value = String(own[key] ?? "").trim();
    if (!value || value === defaults[key]) params.delete(key);
    else params.set(key, value);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

/** @param {string} search @param {{scope: string, tab: string}} state */
export const shellSearch = (search, state) => mergeSearch(search, SHELL_KEYS, state, { scope: ALL, tab: "board" });

/** Filter roster rows by kind ("agent" | "skill" | "") and free text over name, description, targets, project. */
export function filterRoster(rows, { kind = "", q = "" } = {}) {
  const needle = q.trim().toLocaleLowerCase();
  return rows.filter((row) => (!kind || row.kind === kind) && (!needle ||
    [row.name, row.slug, row.description, row.project?.name, ...(row.targets ?? [])]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(needle))));
}

/** Flatten a roster payload ({agents, skills}) into rows tagged with their kind. */
export function rosterRows(payload) {
  return [
    ...(payload?.agents ?? []).map((row) => ({ ...row, kind: "agent" })),
    ...(payload?.skills ?? []).map((row) => ({ ...row, kind: "skill" })),
  ];
}

/** One All-projects plan overview row: the goal text and how many gaps are open. @param {any} snapshot */
export function planOverview(snapshot) {
  const sections = snapshot?.plan?.sections ?? {};
  const goal = typeof sections.goal === "string" ? sections.goal : sections.goal?.text ?? "";
  const gaps = Array.isArray(sections.gaps) ? sections.gaps : [];
  const open = gaps.filter((gap) => !gap || typeof gap !== "object" || (gap.status ?? "open") === "open").length;
  const count = (key) => planRowCount(sections[key]);
  return { goal, gaps: { open, total: gaps.length }, deliverables: count("deliverables"), risks: count("risks") };
}

function planRowCount(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value).length;
  return 1;
}

/** Whether a usage request failure means "not available in this build" rather than an error. */
export const usageUnavailable = (error) => error?.status === 404 || error?.status === 405;

/**
 * Projects tab rows: every configured board, active first then parked, each by label. Active
 * rows carry their ticket counts (or read error) from the /api/boards rail list.
 * @param {any[] | undefined} boards @param {any[] | null} rail
 */
export function projectRows(boards, rail) {
  const byKey = new Map((rail ?? []).map((row) => [row.key ?? row.id, row]));
  return (boards ?? []).map((b) => {
    const status = b.status === "parked" ? "parked" : "active"; const listed = byKey.get(b.key);
    return { key: b.key, label: b.label ?? b.name ?? b.key, path: b.path, status, counts: listed?.counts ?? null, error: listed?.error ?? null };
  }).sort((a, z) => (a.status === z.status ? 0 : a.status === "active" ? -1 : 1) || a.label.localeCompare(z.label));
}
