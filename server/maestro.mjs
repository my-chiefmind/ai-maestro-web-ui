/**
 * The single adapter between the web UI and ai-maestro's supported public API.
 *
 * Read package.json and reject an incompatible peer before importing any feature export.
 * This matters because an older peer has no export map: importing `./board` first would
 * produce an opaque ERR_PACKAGE_PATH_NOT_EXPORTED instead of an actionable boot error.
 */
import { createRequire } from "node:module";

export const PEER_RANGE = "^0.6.6";

function compatible(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\+.*)?$/.exec(String(version));
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major === 0 && minor === 6 && patch >= 6;
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

if (!compatible(peerPackage.version)) {
  throw new Error(
    `ai-maestro-web-ui requires @mychiefmind/ai-maestro ${PEER_RANGE}; found ${peerPackage.version}. ` +
    "Install a compatible peer before starting the server.",
  );
}

export const aiMaestroVersion = peerPackage.version;

// Deliberately dynamic and after the compatibility check above.
const board = await import("@mychiefmind/ai-maestro/board");
const plan = await import("@mychiefmind/ai-maestro/plan");
const spec = await import("@mychiefmind/ai-maestro/spec");
// The web UI registry has a different writable schema, so server/registry.mjs remains its
// owner. Loading the documented export here still makes it part of the peer smoke contract.
await import("@mychiefmind/ai-maestro/registry");

const boardOptions = (b) => ({ boardPath: b.boardDir });

export function readBoard(b) {
  return board.readBoard(boardOptions(b));
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
