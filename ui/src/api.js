/**
 * api.js — the only module that talks to the server. Every call is a targeted endpoint from
 * the kit-132 API; there is deliberately no function that PUTs a whole board, and `call` enforces
 * an allowlist at runtime so none can be added by accident (AC7).
 * Every resource write carries `expectVersion`; a 409 surfaces the server's fresh resource.
 */

/** A non-2xx response, carrying the parsed JSON body (409 → body.board, 400 → body.errors). */
export class ApiError extends Error {
  /** @param {number} status @param {any} body */
  constructor(status, body) {
    super((body && body.error) || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body || {};
  }
}

const SEG = "[^/]+";
/**
 * The structural AC7 guard: every request the UI can make, as (method, path-pattern).
 * `call` throws before touching the network on anything else — so a whole-board PUT
 * (`PUT /boards/:id`) cannot be sent even if a future component constructs one.
 * @type {ReadonlyArray<readonly [string, RegExp]>}
 */
export const ALLOWED = Object.freeze([
  ["GET", /^\/config$/],
  ["GET", /^\/operations$/],
  ["GET", /^\/usage$/],
  ["GET", /^\/roster$/],
  ["GET", /^\/reports$/],
  ["GET", /^\/docs$/],
  ["GET", new RegExp(`^/boards/${SEG}/usage$`)],
  ["GET", new RegExp(`^/boards/${SEG}/roster$`)],
  ["GET", new RegExp(`^/boards/${SEG}/reports$`)],
  ["GET", new RegExp(`^/boards/${SEG}/reports/${SEG}$`)],
  ["GET", new RegExp(`^/boards/${SEG}/docs$`)],
  ["GET", new RegExp(`^/boards/${SEG}/docs/${SEG}$`)],
  ["GET", /^\/boards$/],
  ["GET", new RegExp(`^/boards/${SEG}$`)],
  ["GET", new RegExp(`^/boards/${SEG}/plan$`)],
  ["PATCH", new RegExp(`^/boards/${SEG}/plan$`)],
  ["GET", new RegExp(`^/boards/${SEG}/specs$`)],
  ["GET", new RegExp(`^/boards/${SEG}/specs/${SEG}$`)],
  ["PUT", new RegExp(`^/boards/${SEG}/specs/${SEG}$`)],
  ["POST", new RegExp(`^/boards/${SEG}/tickets/${SEG}/status$`)],
  ["PATCH", new RegExp(`^/boards/${SEG}/tickets/${SEG}$`)],
  ["POST", new RegExp(`^/boards/${SEG}/tickets$`)],
  ["POST", new RegExp(`^/boards/${SEG}/tickets/${SEG}/archive$`)],
  ["POST", new RegExp(`^/boards/${SEG}/tickets/${SEG}/drop$`)],
  ["POST", new RegExp(`^/boards/${SEG}/epics$`)],
  ["PATCH", new RegExp(`^/boards/${SEG}/epics/${SEG}$`)],
  ["POST", /^\/config\/boards$/],
  ["PATCH", new RegExp(`^/config/boards/${SEG}$`)],
  ["DELETE", new RegExp(`^/config/boards/${SEG}$`)],
  ["POST", /^\/fs\/dirs$/],
  ["GET", /^\/updates$/],
  ["POST", /^\/updates\/run$/],
].map(([m, re]) => Object.freeze([m, re])));

/** True if a path segment decodes (repeatedly, until stable) to "." or "..". @param {string} seg */
function isDotSegment(seg) {
  let cur = seg;
  for (let i = 0; i < 10; i++) {
    if (cur === "." || cur === "..") return true;
    let next;
    try {
      next = decodeURIComponent(cur);
    } catch {
      return false;
    }
    if (next === cur) return false;
    cur = next;
  }
  return true; // still decoding after 10 rounds: treat as hostile
}

/** Throws unless (method, path) is on the allowlist. @param {string} method @param {string} path */
export function assertAllowed(method, path) {
  const m = method.toUpperCase();
  // kit-137: the browser normalises dot segments (incl. %2e forms) before sending, so a path
  // that matches the allowlist raw can still reach a different endpoint. Reject any segment that
  // decodes to "." or "..", and require the WHATWG-normalised pathname to equal the raw one.
  if (path.split("/").some(isDotSegment)) {
    throw new Error(`api: ${m} ${path} contains a dot segment (path traversal)`);
  }
  let normalised;
  try {
    normalised = new URL(`/api${path}`, "http://x").pathname;
  } catch {
    normalised = null;
  }
  if (normalised !== `/api${path}`) {
    throw new Error(`api: ${m} ${path} is not in normalised form (path traversal)`);
  }
  if (!ALLOWED.some(([am, re]) => am === m && re.test(path))) {
    throw new Error(`api: ${m} ${path} is not an allowed request`);
  }
}

/** @param {string} path @param {RequestInit & {json?: any}} [opts] */
export async function call(path, opts = {}) {
  const { json, ...init } = opts;
  assertAllowed(init.method || "GET", path);
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers = { "content-type": "application/json", ...(init.headers || {}) };
  }
  const res = await fetch(`/api${path}`, init);
  const type = res.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) throw new ApiError(res.status, typeof body === "string" ? { error: body } : body);
  return body;
}

/**
 * Like `call`, but for an NDJSON response: each line is parsed and handed to `onEvent` as it
 * arrives (used for the self-update's live output).
 * @param {string} path @param {RequestInit & {json?: any}} opts @param {(ev: any) => void} onEvent
 */
export async function callStream(path, opts, onEvent) {
  const { json, ...init } = opts;
  assertAllowed(init.method || "GET", path);
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers = { "content-type": "application/json", ...(init.headers || {}) };
  }
  const res = await fetch(`/api${path}`, init);
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  const reader = res.body.getReader(); const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line));
    }
    if (done) break;
  }
}

const enc = encodeURIComponent;

export const api = {
  config: () => call("/config"),
  operations: () => call("/operations"),
  // Cockpit parity data (T-011): per project when `id` is given, aggregate otherwise.
  usage: (/** @type {string | null} */ id = null) => call(id ? `/boards/${enc(id)}/usage` : "/usage"),
  roster: (/** @type {string | null} */ id = null) => call(id ? `/boards/${enc(id)}/roster` : "/roster"),
  reports: (/** @type {string | null} */ id = null) => call(id ? `/boards/${enc(id)}/reports` : "/reports"),
  report: (/** @type {string} */ id, /** @type {string} */ rid) => call(`/boards/${enc(id)}/reports/${enc(rid)}`),
  docs: (/** @type {string | null} */ id = null) => call(id ? `/boards/${enc(id)}/docs` : "/docs"),
  doc: (/** @type {string} */ id, /** @type {string} */ did) => call(`/boards/${enc(id)}/docs/${enc(did)}`),
  boards: () => call("/boards"),
  board: (/** @type {string} */ id) => call(`/boards/${enc(id)}`),
  plan: (/** @type {string} */ id) => call(`/boards/${enc(id)}/plan`),
  applyPlan: (/** @type {string} */ id, /** @type {string} */ operation, /** @type {object} */ params, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/plan`, { method: "PATCH", json: { operation, params, expectVersion } }),
  specs: (/** @type {string} */ id) => call(`/boards/${enc(id)}/specs`),
  spec: (/** @type {string} */ id, /** @type {string} */ sid) => call(`/boards/${enc(id)}/specs/${enc(sid)}`),
  putSpec: (/** @type {string} */ id, /** @type {string} */ sid, /** @type {string} */ markdown, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/specs/${enc(sid)}`, { method: "PUT", json: { markdown, expectVersion } }),
  setStatus: (/** @type {string} */ id, /** @type {string} */ tid, /** @type {string} */ status, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/tickets/${enc(tid)}/status`, { method: "POST", json: { status, expectVersion } }),
  patchTicket: (/** @type {string} */ id, /** @type {string} */ tid, /** @type {object} */ patch, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/tickets/${enc(tid)}`, { method: "PATCH", json: { patch, expectVersion } }),
  addTicket: (/** @type {string} */ id, /** @type {object} */ ticket, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/tickets`, { method: "POST", json: { ticket, expectVersion } }),
  archiveTicket: (/** @type {string} */ id, /** @type {string} */ tid, /** @type {string} */ evidence, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/tickets/${enc(tid)}/archive`, { method: "POST", json: { evidence, expectVersion } }),
  dropTicket: (/** @type {string} */ id, /** @type {string} */ tid, /** @type {string} */ reason, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/tickets/${enc(tid)}/drop`, { method: "POST", json: { reason, expectVersion } }),
  addEpic: (/** @type {string} */ id, /** @type {object} */ epic, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/epics`, { method: "POST", json: { epic, expectVersion } }),
  patchEpic: (/** @type {string} */ id, /** @type {string} */ eid, /** @type {object} */ patch, /** @type {string} */ expectVersion) =>
    call(`/boards/${enc(id)}/epics/${enc(eid)}`, { method: "PATCH", json: { patch, expectVersion } }),
  dirs: (/** @type {string} */ prefix) => call("/fs/dirs", { method: "POST", json: { prefix } }),
  addBoard: (/** @type {{label?: string, path: string}} */ entry, /** @type {string} */ expectVersion) =>
    call("/config/boards", { method: "POST", json: { ...entry, expectVersion } }),
};
