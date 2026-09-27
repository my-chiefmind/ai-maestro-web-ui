/**
 * The single adapter between the web UI and ai-maestro's supported public API.
 *
 * Read package.json and reject an incompatible peer before importing any feature export.
 * This matters because an older peer has no export map: importing `./board` first would
 * produce an opaque ERR_PACKAGE_PATH_NOT_EXPORTED instead of an actionable boot error.
 */
import { createRequire } from "node:module";

export const PEER_RANGE = "^0.6.7";

/** True for a kit version inside PEER_RANGE (^0.6.7). */
export function isCompatibleKit(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\+.*)?$/.exec(String(version));
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major === 0 && minor === 6 && patch >= 7;
}

const peerPackage = (() => {
  try {
    return createRequire(import.meta.url)("@mychiefmind/ai-maestro/package.json");
  } catch (error) {
    throw new Error(
      `ai-maestro-web-ui requires @mychiefmind/ai-maestro ${PEER_RANGE}, but the peer is not installed.`,
      { cause: error },
    );
  }
})();

if (!isCompatibleKit(peerPackage.version)) {
  throw new Error(
    `ai-maestro-web-ui requires @mychiefmind/ai-maestro ${PEER_RANGE}; found ${peerPackage.version}. ` +
    "Update the project's kit first: npm install -D @mychiefmind/ai-maestro@latest && npx ai-maestro update",
  );
}

export const aiMaestroVersion = peerPackage.version;

// Deliberately dynamic and after the compatibility check above.
const board = await import("@mychiefmind/ai-maestro/board");
const plan = await import("@mychiefmind/ai-maestro/plan");
const spec = await import("@mychiefmind/ai-maestro/spec");
const {
  buildUsageReport, buildPortfolioUsage, usageToCsv, DIMENSIONS, PORTFOLIO_DIMENSIONS,
} = await import("@mychiefmind/ai-maestro/usage");
// The web UI registry has a different writable schema, so server/registry.mjs remains its
// owner. Loading the documented export here still makes it part of the peer smoke contract.
await import("@mychiefmind/ai-maestro/registry");

// Re-export only the documented usage surface this adapter consumes. Keeping the dimensions
// beside the builders means routes never invent an export view that the peer cannot render.
export { DIMENSIONS, PORTFOLIO_DIMENSIONS };

const boardOptions = (b) => ({ boardPath: b.boardDir });

export function readBoard(b) {
  return board.readBoard(boardOptions(b));
}

/** Canonical aggregate usage for one registered board. */
export function readUsage(b) {
  const report = buildUsageReport({ boardPath: b.boardDir });
  // The registry key is the public project identity. A capsule's project name is editable and
  // may itself contain local-machine information, so it must not become an HTTP identifier.
  return { ...report, project: b.key, ...withSliceKeys(report, () => b.key) };
}

/**
 * Usage slices (ai-maestro >= 0.6.7) carry a path-derived opaque `projectKey`. Replace it with
 * the registry key so no path fingerprint crosses the HTTP boundary.
 */
function withSliceKeys(report, keyFor) {
  if (!report.usageSlices) return {};
  const rows = (report.usageSlices.rows ?? []).map((row) => ({ ...row, projectKey: keyFor(row.projectKey) }));
  return { usageSlices: { ...report.usageSlices, rows } };
}

/**
 * Canonical portfolio merge. `buildPortfolioUsage` deliberately derives internal keys from
 * paths to distinguish same-named projects. Those hashes are useful inside Maestro, but the
 * web API already has collision-free registry keys and must not expose path fingerprints.
 */
export function readPortfolioUsage(boards) {
  const report = buildPortfolioUsage({
    projects: boards.map((b) => ({ name: b.key, path: b.capsuleDir, kitDir: b.capsuleDir })),
  });
  const registryKeys = new Map(report.projects.map((project) => [project.key, project.name]));
  const projects = report.projects.map((project) => ({ ...project, key: project.name }));
  const tickets = report.tickets.map((ticket) => ({
    ...ticket,
    project: ticket.project,
    projectKey: ticket.project,
  }));
  const breakdown = {
    ...report.breakdown,
    ...(report.breakdown.project ? {
      project: report.breakdown.project.map((row) => ({ ...row, key: row.label ?? row.key, ...(row.label ? { label: row.label } : {}) })),
    } : {}),
  };
  return { ...report, projects, tickets, breakdown, ...withSliceKeys(report, (key) => registryKeys.get(key) ?? null) };
}

/** Parse the upstream CSV (RFC 4180 quoting, "\n" record separator) into rows of cells. */
function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Neutralize spreadsheet formula injection and quote every special character. */
export function safeCsvCell(value) {
  let cell = String(value);
  const formula = FORMULA_LEAD.test(cell) && !PLAIN_NUMBER.test(cell);
  if (formula) cell = `'${cell}`;
  return formula || /[",\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function usageCsv(report, view) {
  const text = usageToCsv(report, { view });
  const trailing = text.endsWith("\n");
  const out = parseCsv(text).map((row) => row.map(safeCsvCell).join(",")).join("\n");
  return trailing ? `${out}\n` : out;
}

/** Canonical, locked eligibility snapshot from ai-maestro. */
export function listTicketEligibility(b) {
  return board.listTicketEligibility(boardOptions(b));
}

/** Pair ticket data with canonical eligibility from the same board/archive generation. */
export function readBoardEligibility(b) {
  let eligibility; let value;
  for (let attempt = 0; attempt < 3; attempt++) {
    eligibility = listTicketEligibility(b);
    value = readBoard(b);
    if (eligibility.version === value.version && eligibility.archiveVersion === value.archiveVersion) {
      return { value, eligibility };
    }
  }
  throw new Error("Project changed repeatedly while loading; refresh to try again.");
}

export function boardPayload(b) {
  const { value, eligibility } = readBoardEligibility(b);
  const verdicts = new Map(eligibility.verdicts.map((verdict) => [verdict.ticketId, verdict]));
  const tickets = (value.data.tickets ?? []).map((ticket) => ({
    ...ticket,
    eligibility: verdicts.get(ticket.id) ?? null,
  }));
  return {
    epics: value.data.epics ?? [],
    tickets,
    archived: value.archive.tickets ?? [],
    archivedEpics: value.archive.epics ?? [],
    version: value.version,
    archiveVersion: value.archiveVersion,
    planVersion: eligibility.planVersion,
    config: value.config,
    agentPlans: Object.fromEntries(tickets
      .filter((ticket) => Array.isArray(ticket.agent_plan))
      .map((ticket) => [ticket.id, ticket.agent_plan])),
  };
}

export function getBoardVersion(b) {
  return board.getBoardVersion(boardOptions(b));
}

export function readPlan(b) {
  return plan.readPlan({ boardPath: b.boardDir });
}

export function readSpec(b, id) {
  return spec.readSpec({ boardPath: b.boardDir, id });
}

export function listSpecs(b) {
  return spec.listSpecs({ boardPath: b.boardDir });
}

export function getSpecVersion(b, id) {
  return spec.getSpecVersion({ boardPath: b.boardDir, id });
}

export function writeSpec(b, id, content, expectVersion) {
  try {
    return spec.writeSpec({ boardPath: b.boardDir, id, content, expectVersion });
  } catch (error) {
    if (error?.code === "ESPECCONFLICT") {
      try { error.webSpec = readSpec(b, id); }
      catch (readError) {
        if (readError?.code === "ESPECNOTFOUND") {
          error.webSpec = { id, content: null, version: spec.ABSENT_SPEC_VERSION };
        }
      }
    }
    throw error;
  }
}

export const ABSENT_SPEC_VERSION = spec.ABSENT_SPEC_VERSION;

export function applyPlan(b, operation, params, expectVersion) {
  try {
    const projectName = readBoard(b).config?.project?.name ?? b.name ?? "Project";
    return plan.applyPlan({ boardPath: b.boardDir, operation, params, expectVersion, projectName });
  } catch (error) {
    if (error?.code === "EPLANCONFLICT") {
      try { error.webPlan = readPlan(b); } catch { /* conflict remains useful */ }
    }
    throw error;
  }
}

export function createTicket(b, values, expectVersion) {
  return boardWrite(b, () => board.createTicket({ ...boardOptions(b), ...values, expectVersion }));
}

export function editTicket(b, id, changes, expectVersion) {
  return boardWrite(b, () => board.editTicket({ ...boardOptions(b), id, changes, expectVersion }));
}

export function setTicketStatus(b, id, status, expectVersion) {
  return boardWrite(b, () => board.setTicketStatus({ ...boardOptions(b), id, status, expectVersion }));
}

export function createEpic(b, values, expectVersion) {
  return boardWrite(b, () => board.createEpic({ ...boardOptions(b), ...values, expectVersion }));
}

export function editEpic(b, id, changes, expectVersion) {
  return boardWrite(b, () => board.editEpic({ ...boardOptions(b), id, changes, expectVersion }));
}

export function archiveTicket(b, values, expectVersion) {
  return boardWrite(b, () => board.archiveTicket({ ...boardOptions(b), ...values, expectVersion }));
}

export function dropTicket(b, values, expectVersion) {
  return boardWrite(b, () => board.dropTicket({ ...boardOptions(b), ...values, expectVersion }));
}

function boardWrite(b, operation) {
  try {
    return operation();
  } catch (error) {
    if (error?.code === "EBOARDCONFLICT") {
      try { error.webBoard = boardPayload(b); } catch { /* conflict remains useful */ }
    }
    throw error;
  }
}

/** Registration validation uses the same locked reader and validator as normal requests. */
export function validateCapsule(b) {
  const value = readBoard(b);
  if (value.errors.length) {
    throw new board.BoardValidationError("The Maestro capsule has an invalid board.", {
      errors: value.errors,
      warnings: value.warnings,
    });
  }
  // project.name is optional: the registry label falls back to the project folder name.
  if (!value.config || typeof value.config !== "object" || Array.isArray(value.config)) {
    throw new board.BoardInputError("The Maestro capsule config must be a JSON object.");
  }
  return { config: value.config, data: value.data };
}
