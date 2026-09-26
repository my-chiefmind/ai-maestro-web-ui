/**
 * routes.mjs — the spec §3 API table (maestro/board/specs/kit-e17.md). Board directories are
 * resolved from the config by id only; a request never supplies a path.
 */

import { HttpError, send, sendText, readJson, onlyKeys, BODY_LIMIT } from "./http.mjs";
import {
  ABSENT_SPEC_VERSION, aiMaestroVersion, applyPlan, archiveTicket, boardPayload,
  createEpic, createTicket, dropTicket, editEpic, editTicket, getBoardVersion,
  getSpecVersion, listSpecs, readBoard, readBoardEligibility, readPlan, readSpec, setTicketStatus, writeSpec,
  DIMENSIONS, PORTFOLIO_DIMENSIONS, readPortfolioUsage, readUsage, usageCsv,
} from "./maestro.mjs";
import { activeBoards, addBoard, assertBoardUsable, removeBoard, setBoardStatus } from "./config.mjs";
import { suggestDirs } from "./dirSuggest.mjs";
import { docsDir, listDocs, listReports, listRoster, readDoc, readReport, reportsDir, sendAsset } from "./capsuleFiles.mjs";

const TICKET_CREATE_FIELDS = [
  "id", "name", "desc", "epicId", "status", "priority", "swag", "depends_on", "area",
  "model", "execution_mode", "agent_plan", "traces_to", "human_gate", "testCmd",
];
const TICKET_PATCH_FIELDS = [
  "name", "desc", "priority", "swag", "area", "model", "execution_mode", "agent_plan",
  "depends_on", "traces_to", "human_gate", "testCmd", "epicId",
  "dev_runtime", "dev_model", "reviewer_runtime", "reviewer_model",
];
const EPIC_CREATE_FIELDS = ["id", "name", "desc", "traces_to", "initiativeId"];
const EPIC_PATCH_FIELDS = ["name", "desc", "traces_to", "initiativeId"];
const PLAN_OPERATIONS = new Map([
  ["setGoal", ["text", "metrics", "clearMetrics"]],
  ["addScope", ["in", "out", "removeOut"]],
  ["addItem", ["section", "text", "verify", "budget", "enforce", "actor", "target", "mitigation", "notes", "initiativeId"]],
  ["editItem", ["id", "text", "verify", "budget", "enforce", "actor", "target", "mitigation", "notes", "initiativeId", "clearInitiative"]],
  ["removeItem", ["id"]],
  ["addGap", ["text", "need", "from"]],
  ["setGap", ["id", "status", "need", "resolvedAs"]],
  ["addInitiative", ["name", "outcome", "in", "out", "metrics", "dependsOn", "notes"]],
  ["editInitiative", ["id", "name", "outcome", "notes", "in", "out", "metrics", "dependsOn"]],
  ["removeInitiative", ["id"]],
]);

/**
 * @typedef {import("./config.mjs").Config} Config
 * @typedef {import("./config.mjs").Board} Board
 * @typedef {{req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, params: string[], config: Config, generated?: boolean}} Ctx
 */

/** @param {Config} config @param {string} id */
function boardById(config, id) {
  const b = config.boards.find((x) => x.id === id);
  if (!b) throw new HttpError(404, { error: `No configured board ${id}.` });
  return assertBoardUsable(b);
}

const projectIdentity = (b) => ({ id: b.id, key: b.key, name: b.name, label: b.label });

/** Usage endpoints have a stable error contract separate from mutable board resources. */
function usageBoardById(config, id) {
  const b = config.boards.find((candidate) => candidate.id === id);
  if (!b) throw new HttpError(404, { error: "Project was not found.", code: "project-not-found" });
  try { return assertBoardUsable(b); }
  catch {
    throw new HttpError(404, { error: "Project usage is unavailable.", code: "project-unavailable" });
  }
}

function usageFreshness(report) {
  const lastObservedAt = report.dateRange?.to ?? null;
  return {
    generatedAt: report.generatedAt,
    lastObservedAt,
    hasObservations: lastObservedAt !== null,
  };
}

/** Strictly parse the complete query contract; repeated and ignored inputs are errors. */
function usageQuery(req, dimensions) {
  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  const unknown = [...new Set([...query.keys()].filter((key) => key !== "format" && key !== "view"))];
  if (unknown.length || query.getAll("format").length > 1 || query.getAll("view").length > 1) {
    throw new HttpError(400, { error: "Invalid usage export query.", code: "usage-export-invalid" });
  }
  const format = query.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    throw new HttpError(400, { error: "Invalid usage export format.", code: "usage-export-invalid" });
  }
  if (format === "json" && query.has("view")) {
    throw new HttpError(400, { error: "A usage view is only valid for CSV exports.", code: "usage-export-invalid" });
  }
  const view = query.get("view") ?? "tickets";
  if (format === "csv" && !["tickets", ...dimensions].includes(view)) {
    throw new HttpError(400, { error: "Invalid usage export view.", code: "usage-export-invalid" });
  }
  return { format, view };
}

function sendUsage(res, query, envelope) {
  if (query.format === "csv") {
    sendText(res, 200, usageCsv(envelope.report, query.view), "text/csv", {
      // query.view was validated against the fixed view set in usageQuery.
      "content-disposition": `attachment; filename="usage-${query.view}.csv"`,
    });
  } else send(res, 200, envelope);
}

function aggregateUsage(config) {
  const identities = config.boards.map(projectIdentity);
  const unavailableProjects = [];
  const usable = [];
  for (const board of config.boards) {
    try {
      const candidate = assertBoardUsable(board);
      // The portfolio builder isolates its own reads, but its result intentionally carries no
      // registry identity. Preflight through the same public single-board API so an unreadable
      // capsule can be joined to the correct key without exposing or hashing its path.
      readUsage(candidate);
      usable.push(candidate);
    }
    catch {
      unavailableProjects.push({
        project: projectIdentity(board), code: "project-unavailable", error: "Project usage could not be read.",
      });
    }
  }
  const report = readPortfolioUsage(usable);
  for (const row of report.projects) {
    if (row.ok !== false || unavailableProjects.some((item) => item.project.key === row.name)) continue;
    const board = config.boards.find((candidate) => candidate.key === row.name);
    if (board) unavailableProjects.push({
      project: projectIdentity(board), code: "project-unavailable", error: "Project usage could not be read.",
    });
  }
  return {
    schema: 1,
    scope: "portfolio",
    projects: identities,
    unavailableProjects,
    freshness: usageFreshness(report),
    report,
  };
}

/** A write body: exactly `allowed` keys, with a string `expectVersion`. @param {any} body @param {string[]} allowed */
function writeBody(body, allowed) {
  onlyKeys(body, [...allowed, "expectVersion"], "body");
  if (typeof body.expectVersion !== "string" || !body.expectVersion) {
    throw new HttpError(400, { error: "expectVersion is required — read the board (or /version) first and send the version you read." });
  }
  return body;
}

/** @param {any} data */
function counts(data) {
  /** @type {Record<string, number>} */
  const c = {};
  for (const t of data.tickets ?? []) c[t.status] = (c[t.status] ?? 0) + 1;
  return c;
}

/** Stable public project failure text. Never echo filesystem-bearing upstream messages. */
function publicProjectError(error, project) {
  const err = /** @type {any} */ (error);
  if (project.status !== "active") return "Project is not active and cannot be addressed.";
  if (!project.available) return "Project has no Maestro capsule.";
  if (err?.code === "EBOARDINPUT") return "Invalid board input.";
  if (err?.code === "EBOARDNOTFOUND") return "Board unavailable.";
  if (err?.code === "EBOARDLOCK") return "Project is busy; try again.";
  if (err instanceof HttpError && err.status === 400) return "Project path validation failed.";
  if (err instanceof HttpError && err.status === 404) return "Project unavailable.";
  return "Project could not be read.";
}

const OPERATIONS_BUCKETS = ["inFlight", "eligible", "blocked", "review", "recentlyLanded"];

/** A path-free, project-scoped row for the aggregate operations screen. */
function operationRow(b, ticket, verdict = null) {
  return {
    project: { id: b.id, key: b.key, name: b.name, label: b.label },
    ticket: {
      id: ticket.id, name: ticket.name ?? ticket.id, desc: ticket.desc ?? "",
      status: ticket.status, priority: ticket.priority ?? null, area: ticket.area ?? null,
      epicId: ticket.epicId ?? null, human_gate: ticket.human_gate ?? null,
      doneAt: ticket.doneAt ?? ticket.archivedAt ?? null,
    },
    eligibility: verdict,
  };
}

function aggregateProject(b) {
  const { value: boardRead, eligibility: snapshot } = readBoardEligibility(b);

  const verdicts = new Map(snapshot.verdicts.map((verdict) => [verdict.ticketId, verdict]));
  const buckets = Object.fromEntries(OPERATIONS_BUCKETS.map((name) => [name, []]));
  for (const ticket of boardRead.data.tickets ?? []) {
    const verdict = verdicts.get(ticket.id) ?? null;
    const row = operationRow(b, ticket, verdict);
    if (ticket.status === "in-progress") buckets.inFlight.push(row);
    else if (ticket.status === "review") buckets.review.push(row);
    else if (ticket.status === "blocked" || (ticket.status === "todo" && verdict && !verdict.eligible)) buckets.blocked.push(row);
    else if (ticket.status === "todo" && verdict?.eligible) buckets.eligible.push(row);
  }
  const landed = (boardRead.archive.tickets ?? [])
    .filter((ticket) => ticket.status === "done")
    .sort((a, z) => String(z.doneAt ?? z.archivedAt ?? "").localeCompare(String(a.doneAt ?? a.archivedAt ?? "")))
    .slice(0, 20)
    .map((ticket) => operationRow(b, ticket));
  buckets.recentlyLanded.push(...landed);
  return {
    project: { id: b.id, key: b.key, name: b.name, label: b.label }, buckets,
    versions: { board: boardRead.version, archive: boardRead.archiveVersion, plan: snapshot.planVersion },
  };
}

function aggregateOperations(config) {
  const projects = [];
  const errors = [];
  const buckets = Object.fromEntries(OPERATIONS_BUCKETS.map((name) => [name, []]));
  for (const configured of activeBoards(config)) {
    try {
      const project = aggregateProject(assertBoardUsable(configured));
      projects.push(project.project);
      for (const name of OPERATIONS_BUCKETS) buckets[name].push(...project.buckets[name]);
    } catch (error) {
      errors.push({
        project: { id: configured.id, key: configured.key, name: configured.name, label: configured.label },
        error: publicProjectError(error, configured),
      });
    }
  }
  buckets.recentlyLanded.sort((a, z) => String(z.ticket.doneAt ?? "").localeCompare(String(a.ticket.doneAt ?? "")));
  buckets.recentlyLanded.splice(20);
  return { buckets, projects, errors };
}

/**
 * Run `collect` for every registered project, tagging rows with a path-free project stamp and
 * isolating each failure as an `errors` entry, exactly like /api/operations.
 * @param {Config} config @param {string[]} names row collections always present in the response
 * @param {(b: Board) => Record<string, any[]>} collect
 */
function aggregateProjects(config, names, collect) {
  const projects = []; const errors = [];
  /** @type {Record<string, any[]>} */
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const configured of activeBoards(config)) {
    const project = { id: configured.id, key: configured.key, name: configured.name, label: configured.label };
    try {
      const collected = collect(assertBoardUsable(configured));
      projects.push(project);
      for (const name of names) rows[name].push(...(collected[name] ?? []).map((row) => ({ project, ...row })));
    } catch (error) {
      errors.push({ project, error: publicProjectError(error, configured) });
    }
  }
  return { projects, errors, ...rows };
}

async function planWrite(req, res, b) {
  const body = writeBody(await readJson(req), ["operation", "params"]);
  if (typeof body.operation !== "string" || !PLAN_OPERATIONS.has(body.operation)) {
    throw new HttpError(400, { error: "Unsupported plan operation.", allowed: [...PLAN_OPERATIONS.keys()] });
  }
  onlyKeys(body.params ?? {}, PLAN_OPERATIONS.get(body.operation), "params");
  const result = applyPlan(b, body.operation, body.params ?? {}, body.expectVersion);
  send(res, 200, { version: result.version, result: result.result, warnings: result.warnings ?? [] });
}

/** @type {[string, RegExp, (ctx: Ctx) => Promise<void> | void][]} */
const ROUTES = [
  ["GET", /^\/api\/health$/, ({ res, config }) => send(res, 200, { ok: true, mode: config.mode, aiMaestro: aiMaestroVersion })],

  ["GET", /^\/api\/usage$/, ({ req, res, config }) => {
    const query = usageQuery(req, PORTFOLIO_DIMENSIONS);
    sendUsage(res, query, aggregateUsage(config));
  }],

  ["GET", /^\/api\/boards\/([^/]+)\/usage$/, ({ req, res, params, config }) => {
    const query = usageQuery(req, DIMENSIONS);
    const b = usageBoardById(config, params[0]);
    const report = readUsage(b);
    sendUsage(res, query, {
      schema: 1,
      scope: "project",
      project: projectIdentity(b),
      freshness: usageFreshness(report),
      report,
    });
  }],

  ["GET", /^\/api\/operations$/, ({ res, config }) => send(res, 200, aggregateOperations(config))],

  // Cockpit parity data (read-only, project-level; no public ai-maestro API in 0.6.6).
  ["GET", /^\/api\/roster$/, ({ res, config }) => send(res, 200, aggregateProjects(config, ["agents", "skills"], listRoster))],
  ["GET", /^\/api\/reports$/, ({ res, config }) => send(res, 200, aggregateProjects(config, ["reports"], (b) => ({ reports: listReports(b) })))],
  ["GET", /^\/api\/docs$/, ({ res, config }) => send(res, 200, aggregateProjects(config, ["docs"], (b) => ({ docs: listDocs(b) })))],
  ["GET", /^\/api\/boards\/([^/]+)\/roster$/, ({ res, params, config }) => send(res, 200, listRoster(boardById(config, params[0])))],
  ["GET", /^\/api\/boards\/([^/]+)\/reports$/, ({ res, params, config }) => send(res, 200, { reports: listReports(boardById(config, params[0])) })],
  ["GET", /^\/api\/boards\/([^/]+)\/reports\/([^/]+)$/, ({ res, params, config }) => send(res, 200, readReport(boardById(config, params[0]), params[1]))],
  ["GET", /^\/api\/boards\/([^/]+)\/docs$/, ({ res, params, config }) => send(res, 200, { docs: listDocs(boardById(config, params[0])) })],
  ["GET", /^\/api\/boards\/([^/]+)\/docs\/([^/]+)$/, ({ res, params, config }) => send(res, 200, readDoc(boardById(config, params[0]), params[1]))],
  // Images referenced by docs/reports: `<img src>` loads these directly; the path stays under that dir.
  ["GET", /^\/api\/boards\/([^/]+)\/docs-assets\/(.+)$/, ({ res, params, config }) => sendAsset(res, docsDir(boardById(config, params[0])), params[1])],
  ["GET", /^\/api\/boards\/([^/]+)\/reports-assets\/(.+)$/, ({ res, params, config }) => sendAsset(res, reportsDir(boardById(config, params[0])), params[1])],

  ["GET", /^\/api\/boards$/, ({ res, config }) => {
    // Per-board isolation: one unreadable board is an `error` entry, never a failed list.
    send(res, 200, activeBoards(config).map((b) => {
      try {
        assertBoardUsable(b);
        const snapshot = readBoard(b);
        return {
          id: b.id, key: b.key, name: b.name, label: b.label, status: b.status,
          mode: config.mode, counts: counts(snapshot.data), version: snapshot.version,
          archiveVersion: snapshot.archiveVersion,
        };
      } catch (e) {
        const error = publicProjectError(e, b);
        return { id: b.id, key: b.key, name: b.name, label: b.label, status: b.status, mode: config.mode, error };
      }
    }));
  }],

  ["GET", /^\/api\/boards\/([^/]+)$/, ({ res, params, config }) => {
    const b = boardById(config, params[0]);
    send(res, 200, { id: b.id, name: b.name, ...boardPayload(b) });
  }],

  ["GET", /^\/api\/boards\/([^/]+)\/version$/, ({ res, params, config }) => {
    const b = boardById(config, params[0]);
    send(res, 200, { version: getBoardVersion(b) });
  }],

  ["GET", /^\/api\/boards\/([^/]+)\/plan$/, ({ res, params, config }) => {
    send(res, 200, readPlan(boardById(config, params[0])));
  }],

  ["PATCH", /^\/api\/boards\/([^/]+)\/plan$/, async ({ req, res, params, config }) => {
    await planWrite(req, res, boardById(config, params[0]));
  }],

  ["POST", /^\/api\/boards\/([^/]+)\/plan\/operations$/, async ({ req, res, params, config }) => {
    await planWrite(req, res, boardById(config, params[0]));
  }],

  ["GET", /^\/api\/boards\/([^/]+)\/specs$/, ({ res, params, config }) => {
    send(res, 200, { specs: listSpecs(boardById(config, params[0])) });
  }],

  ["GET", /^\/api\/boards\/([^/]+)\/specs\/([^/]+)$/, ({ res, params, config }) => {
    const value = readSpec(boardById(config, params[0]), params[1]);
    send(res, 200, value);
  }],

  ["GET", /^\/api\/boards\/([^/]+)\/specs\/([^/]+)\/version$/, ({ res, params, config }) => {
    send(res, 200, { id: params[1], version: getSpecVersion(boardById(config, params[0]), params[1]) });
  }],

  ["PUT", /^\/api\/boards\/([^/]+)\/specs\/([^/]+)$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = onlyKeys(await readJson(req), ["markdown", "expectVersion"], "body");
    if (typeof body.markdown !== "string") throw new HttpError(400, { error: "markdown must be a string." });
    if (typeof body.expectVersion !== "string" || !body.expectVersion) {
      throw new HttpError(400, { error: `expectVersion is required (use ${ABSENT_SPEC_VERSION} when creating a spec).` });
    }
    if (Buffer.byteLength(body.markdown) > BODY_LIMIT) throw new HttpError(413, { error: "markdown too large." });
    const result = writeSpec(b, params[1], body.markdown, body.expectVersion);
    send(res, 200, { ok: true, id: result.id, version: result.version });
  }],

  ["POST", /^\/api\/boards\/([^/]+)\/tickets$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = writeBody(await readJson(req), ["ticket"]);
    onlyKeys(body.ticket, TICKET_CREATE_FIELDS, "ticket");
    const { version, result } = createTicket(b, body.ticket, body.expectVersion);
    send(res, 201, { version, id: result.id });
  }],

  ["PATCH", /^\/api\/boards\/([^/]+)\/tickets\/([^/]+)$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = writeBody(await readJson(req), ["patch"]);
    onlyKeys(body.patch, TICKET_PATCH_FIELDS, "patch");
    const { version } = editTicket(b, params[1], body.patch, body.expectVersion);
    send(res, 200, { version });
  }],

  ["POST", /^\/api\/boards\/([^/]+)\/tickets\/([^/]+)\/status$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = writeBody(await readJson(req), ["status"]);
    const { version, result } = setTicketStatus(b, params[1], body.status, body.expectVersion);
    send(res, 200, { version, ...result });
  }],

  ["POST", /^\/api\/boards\/([^/]+)\/tickets\/([^/]+)\/archive$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = writeBody(await readJson(req), ["evidence", "status", "doneAt"]);
    if (body.evidence !== undefined && (typeof body.evidence !== "string" || !body.evidence)) throw new HttpError(400, { error: "evidence must be a non-empty string." });
    if (body.status !== undefined && typeof body.status !== "string") throw new HttpError(400, { error: "status must be a string." });
    if (body.doneAt !== undefined && (typeof body.doneAt !== "string" || !body.doneAt)) throw new HttpError(400, { error: "doneAt must be a non-empty string." });
    const { version, archiveVersion, result } = archiveTicket(b, {
      id: params[1], evidence: body.evidence, status: body.status, doneAt: body.doneAt,
    }, body.expectVersion);
    send(res, 200, { version, archiveVersion, ...result });
  }],

  ["POST", /^\/api\/boards\/([^/]+)\/tickets\/([^/]+)\/drop$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = writeBody(await readJson(req), ["reason", "status"]);
    if (body.reason !== undefined && (typeof body.reason !== "string" || !body.reason)) throw new HttpError(400, { error: "reason must be a non-empty string." });
    if (body.status !== undefined && typeof body.status !== "string") throw new HttpError(400, { error: "status must be a string." });
    const { version, archiveVersion, result } = dropTicket(b, {
      id: params[1], reason: body.reason, status: body.status,
    }, body.expectVersion);
    send(res, 200, { version, archiveVersion, ...result });
  }],

  ["POST", /^\/api\/boards\/([^/]+)\/epics$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = writeBody(await readJson(req), ["epic"]);
    onlyKeys(body.epic, EPIC_CREATE_FIELDS, "epic");
    const { version, result } = createEpic(b, body.epic, body.expectVersion);
    send(res, 201, { version, id: result.id });
  }],

  ["PATCH", /^\/api\/boards\/([^/]+)\/epics\/([^/]+)$/, async ({ req, res, params, config }) => {
    const b = boardById(config, params[0]);
    const body = writeBody(await readJson(req), ["patch"]);
    onlyKeys(body.patch, EPIC_PATCH_FIELDS, "patch");
    const { version } = editEpic(b, params[1], body.patch, body.expectVersion);
    send(res, 200, { version });
  }],

  ["GET", /^\/api\/config$/, ({ res, config, generated }) => {
    send(res, 200, {
      generated: generated === true,
      mode: config.mode, readonly: config.readonly, path: config.path, version: config.version,
      port: config.port, allowedHosts: config.allowedHosts,
      boards: config.boards.map((b) => ({ id: b.id, key: b.key, name: b.name, label: b.label, path: b.path, status: b.status })),
    });
  }],

  ["POST", /^\/api\/fs\/dirs$/, async ({ req, res }) => {
    const body = onlyKeys(await readJson(req), ["prefix"], "body");
    if (typeof body.prefix !== "string") throw new HttpError(400, { error: "prefix must be a string." });
    send(res, 200, suggestDirs(body.prefix));
  }],

  ["POST", /^\/api\/config\/boards$/, async ({ req, res, config }) => {
    const body = onlyKeys(await readJson(req), ["key", "label", "path", "expectVersion"], "body");
    if (typeof body.path !== "string" || !body.path.trim()) throw new HttpError(400, { error: "path is required." });
    if (typeof body.expectVersion !== "string" || !body.expectVersion) throw new HttpError(400, { error: "expectVersion is required." });
    send(res, 201, addBoard(config, body));
  }],

  ["PATCH", /^\/api\/config\/boards\/([^/]+)$/, async ({ req, res, params, config }) => {
    const body = onlyKeys(await readJson(req), ["status", "expectVersion"], "body");
    if (body.status !== "active" && body.status !== "parked") throw new HttpError(400, { error: "status must be active or parked." });
    if (typeof body.expectVersion !== "string" || !body.expectVersion) throw new HttpError(400, { error: "expectVersion is required." });
    send(res, 200, setBoardStatus(config, params[0], body.status, body.expectVersion));
  }],

  ["DELETE", /^\/api\/config\/boards\/([^/]+)$/, async ({ req, res, params, config }) => {
    const body = onlyKeys(await readJson(req), ["expectVersion"], "body");
    if (typeof body.expectVersion !== "string" || !body.expectVersion) throw new HttpError(400, { error: "expectVersion is required." });
    send(res, 200, removeBoard(config, params[0], body.expectVersion));
  }],
];

/**
 * Route one request. Path segments are percent-decoded AFTER matching, so an encoded `/`
 * (`%2f`) stays inside its segment and is rejected by the id rules rather than re-splitting.
 * @param {string} method @param {string} pathname
 */
export function match(method, pathname) {
  let pathMatched = false;
  for (const [m, re, handler] of ROUTES) {
    const hit = re.exec(pathname);
    if (!hit) continue;
    pathMatched = true;
    if (m !== method) continue;
    const params = hit.slice(1).map((s) => {
      try { return decodeURIComponent(s); } catch { throw new HttpError(400, { error: "Malformed URL encoding." }); }
    });
    return { handler, params };
  }
  if (pathMatched) throw new HttpError(405, { error: `${method} is not allowed on ${pathname}.` });
  throw new HttpError(404, { error: `No route ${method} ${pathname}.` });
}
