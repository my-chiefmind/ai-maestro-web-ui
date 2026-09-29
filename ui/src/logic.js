/**
 * logic.js — pure helpers (no DOM, no fetch) so they run under `node --test`.
 */
// The plan maths is ai-maestro's own (dependency-free) plan-core, the same module its old dashboard
// imports — so completeness, coverage and initiative progress cannot drift from the CLI's numbers.
// Deep import because plan-core is not in the package's `exports` (follow-up: ai-maestro to export it); vite bundles it into ui/dist.
import {
  PLAN_SECTIONS, TRACEABLE_PREFIXES, normalisePlan, planCompleteness, planCoverage, planItems,
  initiativeProgress, projectWideProgress,
} from "../../node_modules/@mychiefmind/ai-maestro/scripts/plan-core.mjs";

/** Live statuses, in board order (mirrors ai-maestro 0.6.x STATUSES). */
export const STATUSES = ["backlog", "todo", "in-progress", "review", "blocked", "done"];
export const PRIORITY = ["P0", "P1", "P2", "P3"];
export const SWAG = ["XS", "S", "M", "L", "XL"];
export const MODELS = ["haiku", "sonnet", "opus"];
export const MODES = ["single-agent", "multi-agent"];
export const OPERATION_BUCKETS = Object.freeze([
  ["inFlight", "In flight"], ["eligible", "Eligible"], ["blocked", "Blocked"],
  ["review", "Review"], ["recentlyLanded", "Recently landed"],
]);

export const EMPTY_OPERATIONS_FILTERS = Object.freeze({ view: "all", q: "", project: "", area: "", priority: "", status: "" });
export const TOKEN_CLASSES = Object.freeze(["total", "input", "output", "cacheRead", "cacheWrite", "thinking"]);
export const USAGE_FILTER_KEYS = Object.freeze(["token", "provider", "model", "runtime", "provenance", "project", "ticket", "date"]);
export const EMPTY_USAGE_FILTERS = Object.freeze({ token: "total", provider: "", model: "", runtime: "", provenance: "", project: "", ticket: "", date: "" });

export function usageState(search = "") {
  const query = new URLSearchParams(search);
  const state = { ...EMPTY_USAGE_FILTERS };
  for (const key of USAGE_FILTER_KEYS) {
    const value = query.get(`u_${key}`);
    if (value !== null) state[key] = value;
  }
  if (!TOKEN_CLASSES.includes(state.token)) state.token = "total";
  return state;
}

export function usageSearch(state, search = "") {
  const query = new URLSearchParams(search);
  for (const key of USAGE_FILTER_KEYS) query.delete(`u_${key}`);
  for (const key of USAGE_FILTER_KEYS) {
    const value = state[key];
    if (value && value !== EMPTY_USAGE_FILTERS[key]) query.set(`u_${key}`, value);
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}

export function usageMetric(row, tokenClass = "total") {
  return Number((row?.tokens ?? row?.metrics?.tokens)?.[tokenClass] ?? 0);
}

const TOKEN_FIELDS = ["input", "output", "cacheRead", "cacheWrite", "thinking", "total"];
const METRIC_FIELDS = ["turns", "runs", "applicationCalls", "usageRuns", "unavailableUsageRuns", "estimatedActiveMs", "exactMs", "spanMs", "firstTs", "lastTs"];
const BREAKDOWN_FIELDS = ["project", "model", "agent", "runtime", "provider", "stage", "date", "provenance"];
const COVERAGE_FIELDS = ["turns", "attributed", "skippedExact", "ticketsOnBoard", "ticketsWithUsage", "exactRuns", "telemetrySkippedLines", "applicationCalls", "applicationSkippedLines", "transcriptFiles", "transcriptSessions", "unassignedTokens", "unassignedTurns", "projectsRead", "projectsFailed"];

const selected = (source, fields) => Object.fromEntries(fields.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));
const safeTokens = (source) => selected(source, TOKEN_FIELDS);
const safeMetrics = (source) => ({ ...selected(source, METRIC_FIELDS), tokens: safeTokens(source?.tokens) });
const safeIdentity = (source) => selected(source, ["id", "key", "name", "label"]);
const safeBreakdown = (source) => Object.fromEntries(BREAKDOWN_FIELDS.filter((key) => Array.isArray(source?.[key])).map((key) => [key,
  source[key].map((row) => ({ ...selected(row, ["key", "label"]), ...safeMetrics(row) })),
]));
const safeCoverage = (source) => selected(source, COVERAGE_FIELDS);

export function usageTicketKey(envelope, ticket) {
  const project = ticket?.projectKey || envelope?.project?.key || envelope?.project?.id || "project";
  return `${project}:${ticket?.id ?? ""}`;
}

/** Strip every field not in the public UI export contract, recursively. */
export function safeUsageExport(envelope) {
  const report = envelope?.report ?? {};
  const safeTicket = (ticket) => ({
    ...selected(ticket, ["id", "onBoard", "name", "status", "area", "epicId", "epicName", "boardModel", "agentPlan", "executionMode", "swag", "priority", "archived", "doneAt", "confidence", "timing", "cycleMs", "project", "projectKey"]),
    metrics: safeMetrics(ticket.metrics), breakdown: safeBreakdown(ticket.breakdown),
  });
  const safeProjectRow = (row) => ({
    ...selected(row, ["key", "name", "ok", "error", "template"]),
    ...(row.totals ? { totals: safeMetrics(row.totals) } : {}),
    ...(row.dateRange ? { dateRange: selected(row.dateRange, ["from", "to"]) } : {}),
    ...(row.coverage ? { coverage: safeCoverage(row.coverage) } : {}),
    ...(row.topTicket ? { topTicket: selected(row.topTicket, ["id", "name", "total"]) } : {}),
  });
  return {
    ...selected(envelope, ["schema", "scope"]),
    ...(envelope?.project ? { project: safeIdentity(envelope.project) } : {}),
    ...(Array.isArray(envelope?.projects) ? { projects: envelope.projects.map(safeIdentity) } : {}),
    ...(Array.isArray(envelope?.unavailableProjects) ? { unavailableProjects: envelope.unavailableProjects.map((row) => ({ project: safeIdentity(row.project), ...selected(row, ["code", "error"]) })) } : {}),
    freshness: selected(envelope?.freshness, ["generatedAt", "lastObservedAt", "hasObservations"]),
    report: {
      ...selected(report, ["generatedAt", "schema", "kind", "project"]),
      enabled: selected(report.enabled, ["transcripts", "telemetry"]),
      dateRange: selected(report.dateRange, ["from", "to"]), coverage: safeCoverage(report.coverage),
      totals: safeMetrics(report.totals), unassigned: safeMetrics(report.unassigned),
      ...(report.projectOnly ? { projectOnly: safeMetrics(report.projectOnly) } : {}),
      tickets: (report.tickets ?? []).map(safeTicket),
      ...(Array.isArray(report.projects) ? { projects: report.projects.map(safeProjectRow) } : {}),
      breakdown: safeBreakdown(report.breakdown),
    },
  };
}

export function usageFacets(envelope) {
  const report = envelope?.report;
  const projectNames = new Map((envelope?.projects ?? []).map((project) => [project.key, project.label || project.name || project.key]));
  const values = (dimension) => [...new Set((report?.breakdown?.[dimension] ?? []).map((row) => row.key).filter(Boolean))].sort();
  return {
    providers: values("provider"), models: values("model"), runtimes: values("runtime"),
    provenance: values("provenance"), dates: values("date"),
    projects: (envelope?.projects ?? []).map((p) => [p.key, p.label || p.name || p.key]),
    tickets: (report?.tickets ?? []).map((t) => {
      const projectKey = t.projectKey || envelope?.project?.key || envelope?.project?.id || "project";
      const project = t.project || projectNames.get(projectKey) || envelope?.project?.label || envelope?.project?.name || projectKey;
      return [usageTicketKey(envelope, t), `${project} · ${t.id} · ${t.name || t.id}`];
    }),
  };
}

function hasBreakdown(ticket, dimension, value) {
  return !value || (ticket.breakdown?.[dimension] ?? []).some((row) => row.key === value);
}

export function filterUsage(envelope, filters = EMPTY_USAGE_FILTERS) {
  const report = envelope?.report;
  if (!report) return { tickets: [], projects: [], trend: [], models: [], providers: [] };
  const tickets = (report.tickets ?? []).filter((ticket) =>
    (!filters.ticket || usageTicketKey(envelope, ticket) === filters.ticket) &&
    (!filters.project || ticket.projectKey === filters.project) &&
    hasBreakdown(ticket, "provider", filters.provider) && hasBreakdown(ticket, "model", filters.model) &&
    hasBreakdown(ticket, "runtime", filters.runtime) && hasBreakdown(ticket, "provenance", filters.provenance) &&
    hasBreakdown(ticket, "date", filters.date));
  const dimension = (name, value = "") => (report.breakdown?.[name] ?? []).filter((row) => !value || row.key === value);
  const projects = dimension("project", filters.project);
  const trend = dimension("date", filters.date);
  const models = dimension("model", filters.model);
  const providers = dimension("provider", filters.provider);
  const ranked = (rows) => [...rows].sort((a, b) => usageMetric(b, filters.token) - usageMetric(a, filters.token));
  return { tickets: ranked(tickets), projects: ranked(projects), trend, models: ranked(models), providers: ranked(providers) };
}

export function formatTokens(value) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

/** Parse the shareable aggregate state. Unknown views fail closed to all. */
export function operationsState(search = "") {
  const params = new URLSearchParams(search);
  const validViews = new Set(["all", ...OPERATION_BUCKETS.map(([key]) => key)]);
  const view = params.get("view") || "all";
  return {
    view: validViews.has(view) ? view : "all",
    q: params.get("q") || "", project: params.get("project") || "",
    area: params.get("area") || "", priority: params.get("priority") || "", status: params.get("status") || "",
  };
}

/** Serialize only non-default state so URLs stay readable. */
export function operationsSearch(state) {
  const params = new URLSearchParams();
  for (const key of ["view", "q", "project", "area", "priority", "status"]) {
    const value = String(state[key] ?? "").trim();
    if (value && !(key === "view" && value === "all")) params.set(key, value);
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

/** Apply all aggregate filters together while preserving bucket order and project-scoped IDs. */
export function filterOperations(buckets = {}, filters = EMPTY_OPERATIONS_FILTERS) {
  const needle = String(filters.q || "").trim().toLocaleLowerCase();
  return Object.fromEntries(OPERATION_BUCKETS.map(([bucket]) => {
    const source = filters.view === "all" || filters.view === bucket ? (buckets[bucket] ?? []) : [];
    return [bucket, source.filter((row) => {
      const project = row.project ?? {}; const ticket = row.ticket ?? {};
      if (filters.project && project.id !== filters.project) return false;
      if (filters.area && ticket.area !== filters.area) return false;
      if (filters.priority && ticket.priority !== filters.priority) return false;
      if (filters.status && ticket.status !== filters.status) return false;
      if (!needle) return true;
      return [project.name, project.label, project.id, project.key, ticket.id, ticket.name, ticket.desc]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(needle));
    })];
  }));
}

export function operationsFacets(payload) {
  const rows = OPERATION_BUCKETS.flatMap(([key]) => payload?.buckets?.[key] ?? []);
  const values = (field) => [...new Set(rows.map((row) => row.ticket?.[field]).filter(Boolean))].sort();
  return {
    projects: (payload?.projects ?? []).map((project) => [project.id, project.name]).sort((a, b) => a[1].localeCompare(b[1])),
    areas: values("area"), priorities: values("priority"), statuses: values("status"),
  };
}

export const EMPTY_TICKET = Object.freeze({
  id: "", name: "", desc: "", epicId: "", status: "todo", priority: "P2", swag: "M",
  area: "", model: "", execution_mode: "", agent_plan: "", depends_on: "", traces_to: "",
  testCmd: "", human_gate: false,
});

/** Editable fields → kind. Mirrors the server's PATCH whitelist (status has its own endpoint). */
export const FIELDS = {
  name: "text", desc: "longtext", epicId: "text", priority: "enum", swag: "enum", area: "text",
  model: "enum", execution_mode: "enum", agent_plan: "list", depends_on: "list", traces_to: "list",
  testCmd: "text", human_gate: "bool",
  dev_runtime: "text", dev_model: "text", reviewer_runtime: "text", reviewer_model: "text",
};
/** Fields the server requires; clearing them is not a deletion. */
const REQUIRED = new Set(["name", "desc"]);

/** @param {any[]} tickets @returns {{status: string, tickets: any[]}[]} */
export function groupByStatus(tickets) {
  /** @type {Map<string, any[]>} */
  const cols = new Map(STATUSES.map((s) => [s, []]));
  for (const t of tickets || []) {
    if (!cols.has(t.status)) cols.set(t.status, []);
    /** @type {any[]} */ (cols.get(t.status)).push(t);
  }
  const rank = (/** @type {any} */ t) => PRIORITY.indexOf(t.priority) === -1 ? 9 : PRIORITY.indexOf(t.priority);
  return [...cols].map(([status, ts]) => ({ status, tickets: ts.sort((a, b) => rank(a) - rank(b)) }));
}

/** A ticket → form draft (strings/booleans only). @param {any} t */
export function toDraft(t) {
  /** @type {Record<string, any>} */
  const d = { status: t.status };
  for (const [k, kind] of Object.entries(FIELDS)) {
    const v = t[k];
    if (kind === "list") d[k] = Array.isArray(v) ? v.join(", ") : "";
    else if (kind === "bool") d[k] = v === true;
    else d[k] = v == null ? "" : String(v);
  }
  return d;
}

/** @param {string} s */
const splitList = (s) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

/** Convert a ticket creation form to the exact server payload, omitting blank optionals. */
export function ticketPayload(draft) {
  const out = {};
  for (const [key, value] of Object.entries(draft)) {
    if (["agent_plan", "depends_on", "traces_to"].includes(key)) {
      const list = splitList(String(value || ""));
      if (list.length) out[key] = list;
    } else if (key === "human_gate") {
      if (value) out[key] = true;
    } else if (typeof value === "string") {
      const normalized = key === "desc" ? value : value.trim();
      if (normalized !== "") out[key] = normalized;
    }
  }
  return out;
}

/** @param {any} epic */
export function toEpicDraft(epic = {}) {
  epic = epic || {};
  return {
    id: epic.id ?? "", name: epic.name ?? "", desc: epic.desc ?? "",
    initiativeId: epic.initiativeId ?? "", traces_to: Array.isArray(epic.traces_to) ? epic.traces_to.join(", ") : "",
  };
}

/** @param {any} epic @param {Record<string, string>} draft */
export function diffEpic(epic, draft) {
  const patch = {};
  for (const key of ["name", "desc", "initiativeId", "traces_to"]) {
    let next = key === "traces_to" ? splitList(draft[key] || "") : String(draft[key] ?? "").trim();
    const before = epic[key];
    if (key === "traces_to") {
      if (!next.length) next = before === undefined ? undefined : null;
      if (Array.isArray(before) && Array.isArray(next) && before.join("\0") === next.join("\0")) continue;
    } else if (!next) next = before === undefined ? undefined : null;
    if (next === undefined || (before ?? "") === (next ?? "")) continue;
    patch[key] = next;
  }
  return patch;
}

/** Compact, exact explanations suitable for cards and assistive text. @param {any} ticket */
export function eligibilityLines(ticket) {
  const e = ticket?.eligibility;
  if (!e) return [];
  if (e.eligible) return ["Eligible now"];
  const canonical = (e.reasons ?? []).filter((reason) => reason && typeof reason === "object")
    .map((reason) => reason.message || reason.code).filter(Boolean);
  if (canonical.length) return canonical;
  const lines = [];
  if (e.reasons?.includes("human-gate")) lines.push("Waiting for human approval");
  if (e.blockedBy?.length) lines.push(`Blocked by ${e.blockedBy.join(", ")}`);
  if (e.missingDependencies?.length) lines.push(`Missing ${e.missingDependencies.join(", ")}`);
  if (e.reasons?.some((x) => String(x).startsWith("status:"))) lines.push(`Not queued: ${ticket.status}`);
  return lines;
}

/** Turn the typed plan editor controls into one targeted operation params object. */
export function planParams(fields, draft) {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = draft[field.key];
    if (field.kind === "bool") return value === true ? [[field.key, true]] : [];
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    return [[field.key, field.kind === "list" ? raw.split(/\n|,/).map((x) => x.trim()).filter(Boolean) : raw]];
  }));
}

/** Form controls own Escape; contenteditable editors do too. @param {unknown} target */
export function escapeBelongsToControl(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName ?? "").toLowerCase();
  return ["input", "select", "textarea"].includes(tag) || target.isContentEditable === true;
}

/**
 * The minimal PATCH body turning `ticket` into `draft`: only changed fields; an emptied
 * optional field becomes `null` (the server deletes it). Status is never included.
 * @param {any} ticket @param {Record<string, any>} draft
 */
export function diffPatch(ticket, draft) {
  /** @type {Record<string, any>} */
  const patch = {};
  for (const [k, kind] of Object.entries(FIELDS)) {
    const before = ticket[k];
    let after;
    if (kind === "list") {
      const list = splitList(draft[k] || "");
      after = list.length ? list : (before === undefined ? undefined : null);
      if (Array.isArray(before) && Array.isArray(after) && before.join("\u0000") === after.join("\u0000")) continue;
      if (after === null && Array.isArray(before) && before.length === 0) continue;
    } else if (kind === "bool") {
      after = draft[k] ? true : (before === undefined ? undefined : null);
      if (Boolean(before) === Boolean(draft[k])) continue;
    } else {
      const s = String(draft[k] ?? "");
      const trimmed = kind === "longtext" ? s : s.trim();
      after = trimmed === "" && !REQUIRED.has(k) ? (before === undefined ? undefined : null) : trimmed;
      if ((before ?? "") === (after ?? "")) continue;
    }
    if (after === undefined) continue;
    patch[k] = after;
  }
  return patch;
}

/**
 * Human-readable lines for a failed write.
 * @param {{status?: number, message?: string, body?: any}} err
 */
export function errorLines(err) {
  const body = err.body || {};
  if (Array.isArray(body.errors) && body.errors.length) {
    return body.errors.map((/** @type {any} */ e) => typeof e === "string" ? e : (e.message || JSON.stringify(e)));
  }
  if (Array.isArray(body.conflicts) && body.conflicts.length) {
    return body.conflicts.map((/** @type {any} */ e) => typeof e === "string" ? e : (e.message || JSON.stringify(e)));
  }
  if (err.status === 423) {
    const resource = String(body.error || "This resource is locked").replace(/ by another writer\.?$/, "").replace(/\.$/, "");
    return [`${resource}${body.holder ? ` by ${formatHolder(body.holder)}` : ""} — try again in a moment.`];
  }
  if (typeof body.field === "string" && body.field) {
    return [`${String(body.error || "Invalid input").replace(/\.$/, "")} (field: ${body.field}).`];
  }
  return [body.error || err.message || "Request failed."];
}

/** @param {any} h */
function formatHolder(h) {
  if (typeof h === "string") return h;
  return [h.op, h.pid && `pid ${h.pid}`].filter(Boolean).join(", ") || "another process";
}

/** Total live tickets in a rail entry's counts. @param {Record<string, number> | undefined} c */
export function total(c) {
  return Object.values(c || {}).reduce((a, b) => a + b, 0);
}

/**
 * Whether "Add board" can write the package registry, and what to tell the user otherwise.
 * @param {{mode?: string, generated?: boolean, path?: string | null} | null} cfg
 * @returns {{canWrite: boolean, reason: "generated" | "readonly" | "project" | null}}
 */
export function addBoardMode(cfg) {
  if (!cfg) return { canWrite: false, reason: null };
  if (cfg.mode === "project") return { canWrite: false, reason: "project" };
  if (cfg.generated) return { canWrite: false, reason: "generated" };
  if (cfg.mode !== "registry" || !cfg.path || cfg.readonly) return { canWrite: false, reason: "readonly" };
  return { canWrite: true, reason: null };
}

/**
 * The product name for the current mode: one project is "Maestro"; the standalone multi-project
 * view (a dashboard folder or an imported list) is "Maestro Hub". Null until the config loads, so
 * neither name flashes before the mode is known.
 * @param {{mode?: string} | null} cfg
 * @returns {"Maestro" | "Maestro Hub" | null}
 */
export function brandName(cfg) {
  if (!cfg?.mode) return null;
  return cfg.mode === "project" ? "Maestro" : "Maestro Hub";
}

/** A projects.json registry entry suggestion for a new board. @param {{id: string, name: string, path: string}} e */
export function projectsJsonSnippet(e) {
  const root = e.path.replace(/\/maestro\/?$/, "");
  return JSON.stringify({ key: e.id || "my-project", name: e.name || e.id || "My project", path: root || "~/source/my-project" }, null, 2);
}

/**
 * Re-seed a form draft from a fresh ticket, keeping only the fields the user edited.
 * @param {any} ticket @param {Record<string, any> | null} draft @param {Set<string>} touched
 */
export function rebaseDraft(ticket, draft, touched) {
  const fresh = toDraft(ticket);
  if (!draft) return fresh;
  for (const k of touched) if (k in draft) fresh[k] = draft[k];
  return fresh;
}

/** "sha256:abcdef…" → "abcdef12". @param {unknown} v */
export function shortVersion(v) {
  return String(v ?? "").replace(/^[a-z0-9]+:/, "").slice(0, 8);
}

/** Plan section value → normalized list of {id?, text, meta[]} rows. @param {any} v */
export function planRows(v) {
  if (v == null) return [];
  if (typeof v === "string") return [{ text: v, meta: [] }];
  if (Array.isArray(v)) {
    return v.map((x) => {
      if (typeof x === "string") return { text: x, meta: [] };
      const { id, text, name, outcome, ...rest } = x || {};
      const meta = Object.entries(rest)
        .filter(([, val]) => val != null && val !== "" && typeof val !== "object")
        .map(([k, val]) => `${k}: ${val}`);
      return { id, text: [name, text ?? outcome].filter(Boolean).join(" — ") || JSON.stringify(x), meta };
    });
  }
  if (typeof v === "object") {
    /** @type {{id?: string, text: string, meta: string[]}[]} */
    const rows = [];
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "string") rows.push({ id: k, text: val, meta: [] });
      else if (Array.isArray(val)) for (const r of planRows(val)) rows.push({ ...r, id: r.id ?? k });
      else if (val && typeof val === "object") rows.push({ id: k, text: JSON.stringify(val), meta: [] });
    }
    return rows;
  }
  return [{ text: String(v), meta: [] }];
}

// ---- Board console (T-014): filters, focus modes, stat counts, epic grouping ----

export const BOARD_FOCUS = Object.freeze(["active", "ready", "gated", "blocked"]);
export const BOARD_VIEWS = Object.freeze(["columns", "list"]);
/** URL keys are prefixed so they never collide with the operations filters (q, area, …). */
export const BOARD_URL_KEYS = Object.freeze({
  q: "bq", epic: "bepic", priority: "bpriority", area: "barea", status: "bstatus",
  initiative: "binitiative", focus: "bfocus", view: "bview",
});
export const EMPTY_BOARD_FILTERS = Object.freeze({
  q: "", epic: "", priority: "", area: "", status: "", initiative: "", focus: "active", view: "columns",
});
export const NO_INITIATIVE = "none";

/** Parse board filters from a query string. Unknown focus/view values fail closed to defaults. */
export function boardFilterState(search = "") {
  const params = new URLSearchParams(search);
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, urlKey] of Object.entries(BOARD_URL_KEYS)) out[key] = params.get(urlKey) || "";
  if (!BOARD_FOCUS.includes(out.focus)) out.focus = "active";
  if (!BOARD_VIEWS.includes(out.view)) out.view = "columns";
  if (out.priority && !PRIORITY.includes(out.priority)) out.priority = "";
  if (out.status && !STATUSES.includes(out.status)) out.status = "";
  return /** @type {typeof EMPTY_BOARD_FILTERS} */ (out);
}

/** Board filters keyed by their URL names, for shell.js mergeSearch. @param {Record<string, string>} f */
export function boardFilterParams(f) {
  /** @type {Record<string, string>} */
  const own = {};
  /** @type {Record<string, string>} */
  const defaults = {};
  for (const [key, urlKey] of Object.entries(BOARD_URL_KEYS)) {
    own[urlKey] = f[key] ?? "";
    defaults[urlKey] = /** @type {Record<string, string>} */ (EMPTY_BOARD_FILTERS)[key];
  }
  return { keys: Object.values(BOARD_URL_KEYS), own, defaults };
}

/** Human-gated: an explicit human_gate, or an eligibility verdict citing one. @param {any} t */
export function isGated(t) {
  if (t?.human_gate) return true;
  const reasons = t?.eligibility?.reasons ?? [];
  return reasons.some((/** @type {any} */ r) => (typeof r === "string" ? r : r?.code) === "human-gate");
}

/**
 * Ready to pick up: todo and eligible. Uses the server's eligibility verdict when present,
 * otherwise mirrors the old dashboard rule (todo, not gated, every dependency done).
 * @param {any} t @param {any[]} tickets
 */
export function isReady(t, tickets = []) {
  if (t?.status !== "todo") return false;
  if (t.eligibility) return Boolean(t.eligibility.eligible);
  if (isGated(t)) return false;
  const done = new Set(tickets.filter((x) => x.status === "done").map((x) => x.id));
  return (t.depends_on ?? []).every((/** @type {string} */ d) => done.has(d));
}

/** Stat card counts for the focus modes. @param {any[]} tickets */
export function boardStats(tickets = []) {
  return {
    active: tickets.length,
    ready: tickets.filter((t) => isReady(t, tickets)).length,
    gated: tickets.filter(isGated).length,
    blocked: tickets.filter((t) => t.status === "blocked").length,
  };
}

/** Distinct, sorted areas across tickets. @param {any[]} tickets */
export function boardAreas(tickets = []) {
  return [...new Set(tickets.map((t) => t.area).filter(Boolean))].sort();
}

/**
 * Apply focus mode + filters. A ticket's initiative is derived through its epic.
 * @param {any[]} tickets @param {any[]} epics @param {Partial<typeof EMPTY_BOARD_FILTERS>} f
 */
export function filterBoardTickets(tickets = [], epics = [], f = EMPTY_BOARD_FILTERS) {
  const initiativeOf = (/** @type {any} */ t) => epics.find((e) => e.id === t.epicId)?.initiativeId ?? "";
  const needle = String(f.q ?? "").trim().toLowerCase();
  const focus = f.focus || "active";
  return tickets.filter((t) =>
    (focus !== "ready" || isReady(t, tickets)) &&
    (focus !== "gated" || isGated(t)) &&
    (focus !== "blocked" || t.status === "blocked") &&
    (!f.status || t.status === f.status) &&
    (!f.priority || t.priority === f.priority) &&
    (!f.area || t.area === f.area) &&
    (!f.epic || t.epicId === f.epic) &&
    (!f.initiative || (f.initiative === NO_INITIATIVE ? !initiativeOf(t) : initiativeOf(t) === f.initiative)) &&
    (!needle || `${t.id} ${t.name} ${t.area ?? ""}`.toLowerCase().includes(needle)));
}

/**
 * Group tickets by epic in board epic order; tickets without a known epic go last.
 * @param {any[]} tickets @param {any[]} epics
 * @returns {{id: string, name: string, tickets: any[]}[]}
 */
export function groupByEpic(tickets = [], epics = []) {
  const groups = epics.map((e) => ({ id: e.id, name: e.name ?? e.id, tickets: /** @type {any[]} */ ([]) }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const none = { id: "", name: "No epic", tickets: /** @type {any[]} */ ([]) };
  for (const t of tickets) (byId.get(t.epicId) ?? none).tickets.push(t);
  return [...groups, none].filter((g) => g.tickets.length);
}

/** Distinct initiative ids referenced by epics. @param {any[]} epics */
export function boardInitiatives(epics = []) {
  return [...new Set(epics.map((e) => e.initiativeId).filter(Boolean))].sort();
}

// ---- Plan tab (T-015): sections, completeness, coverage, initiative progress, traces ----

/** The plan's section registry (ai-maestro's), in display order. */
export const PLAN_SECTION_LIST = PLAN_SECTIONS;
/** Sections edited as id'd item lists through addItem/editItem/removeItem. */
export const PLAN_LIST_SECTIONS = PLAN_SECTIONS.filter((s) => s.kind === "list");

/**
 * Everything the Plan tab derives, computed by ai-maestro's own helpers.
 * @param {any} planRaw @param {any[]} [tickets] @param {any[]} [archived]
 */
export function planSummary(planRaw, tickets = [], archived = []) {
  const plan = normalisePlan(planRaw);
  const coverage = planCoverage(plan, tickets, archived);
  return {
    plan,
    completeness: planCompleteness(plan),
    coverage,
    coverageStats: {
      total: coverage.length,
      covered: coverage.filter((r) => r.tickets.length).length,
      done: coverage.filter((r) => r.done).length,
    },
    initiatives: initiativeProgress(plan, tickets, archived),
    projectWide: projectWideProgress(plan, tickets, archived),
  };
}

/** Plan items a ticket may trace to, as {id, section, text}, in plan order. @param {any} planRaw */
export function traceOptions(planRaw) {
  return [...planItems(planRaw).values()]
    .filter((item) => TRACEABLE_PREFIXES.includes(item.prefix))
    .map(({ id, section, text }) => ({ id, section, text }));
}

/** Add or remove one id, keeping order stable. @param {string[]} list @param {string} id */
export function toggleTrace(list = [], id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Per-item fields a list section accepts (plus notes), for add/edit forms. @param {string} key */
export function planItemFields(key) {
  const section = PLAN_SECTIONS.find((s) => s.key === key);
  return [...(section?.fields ?? []), "notes"];
}

/**
 * editItem params from an item and its draft: only changed fields, "" never sent (the operation
 * rejects blanks), initiative ownership changes via initiativeId / clearInitiative.
 * @param {any} item @param {Record<string, string>} draft @param {string[]} fields
 */
export function editItemParams(item, draft, fields) {
  /** @type {Record<string, any>} */
  const params = { id: item.id };
  for (const key of ["text", ...fields]) {
    const next = String(draft[key] ?? "").trim();
    if (next && next !== (item[key] ?? "")) params[key] = next;
  }
  const init = draft.initiativeId ?? (item.initiativeId ?? "");
  if (init !== (item.initiativeId ?? "")) {
    if (init) params.initiativeId = init; else params.clearInitiative = true;
  }
  return params;
}
