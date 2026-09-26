/**
 * errors.mjs — one place that turns a thrown error into an HTTP status + JSON body.
 * Duck-typed on ai-maestro's documented error `code`s. Public messages are deliberately
 * curated: upstream errors may contain absolute capsule paths, which are server details.
 */

import { HttpError } from "./http.mjs";

/**
 * @param {unknown} e
 * @returns {{status: number, body: Record<string, any>, log?: string}}
 */
export function toHttp(e) {
  if (e instanceof HttpError) return { status: e.status, body: e.body };
  const err = /** @type {any} */ (e);
  if (err?.code === "EUSAGEREAD") return {
    status: 503,
    body: { error: "Project usage could not be read.", code: "usage-unavailable" },
    log: typeof err?.message === "string" ? err.message : undefined,
  };
  if (err?.code === "EUSAGEINPUT") return {
    status: 500,
    body: { error: "Usage reporting is not configured correctly.", code: "usage-configuration-error" },
    log: typeof err?.message === "string" ? err.message : undefined,
  };
  if (err?.code === "EBOARDCONFLICT") {
    return { status: 409, body: {
      error: "The board changed on disk since you read it. Re-read it and reapply the change.",
      expected: err.expected, actual: err.actual, ...(err.webBoard ? { board: err.webBoard } : {}),
    } };
  }
  if (err?.code === "EBOARDLOCK") {
    return { status: 423, body: { error: "The board is locked by another writer.", holder: err.holder ?? null } };
  }
  if (err?.code === "EBOARDINPUT") {
    // `field` names the offending input key (e.g. "reviewer_runtime") — safe to expose.
    const field = typeof err.field === "string" && /^[A-Za-z_][\w.]*$/.test(err.field) ? err.field : null;
    return { status: 400, body: { error: "Invalid board input.", ...(field ? { field } : {}) } };
  }
  if (err?.code === "EBOARDVALIDATION") return { status: 400, body: {
    error: "The result would be an invalid board.", errors: err.errors ?? [], warnings: err.warnings ?? [],
  } };
  if (err?.code === "EBOARDNOTFOUND") return { status: 404, body: { error: "The requested board resource was not found." } };
  if (err?.code === "EBOARDDUPLICATE") return { status: 409, body: { error: "That board id is already in use." } };
  if (err?.code === "EPLANINPUT" || err?.code === "EPLANVALIDATION") return { status: 400, body: {
    error: "Invalid plan input.",
    ...(Array.isArray(err.errors) ? { errors: err.errors } : {}),
    ...(Array.isArray(err.conflicts) ? { conflicts: err.conflicts } : {}),
    ...(Array.isArray(err.traced) ? { traced: err.traced } : {}),
  } };
  if (err?.code === "EPLANNOTFOUND") return { status: 404, body: { error: "The requested plan resource was not found." } };
  if (err?.code === "EPLANCONFLICT") return { status: 409, body: {
    error: "The plan changed on disk.", expected: err.expected, actual: err.actual,
    ...(err.webPlan ? { plan: err.webPlan } : {}),
  } };
  if (err?.code === "EPLANLOCK") return { status: 423, body: { error: "The plan is locked by another writer.", holder: err.holder ?? null } };
  if (err?.code === "ESPECINPUT") return { status: 400, body: { error: "Invalid spec input." } };
  if (err?.code === "ESPECNOTFOUND") return { status: 404, body: {
    error: "The requested spec was not found.",
    spec: { id: err.id ?? null, content: null, version: "sha256:absent" },
  } };
  if (err?.code === "ESPECCONFLICT") return { status: 409, body: {
    error: "The spec changed on disk.", expected: err.expected, actual: err.actual,
    ...(err.webSpec ? { spec: err.webSpec } : {}),
  } };
  if (err?.code === "ESPECLOCK") return { status: 423, body: {
    error: "The spec is locked by another writer.", holder: err.holder ?? null,
  } };
  if (err?.code === "EREGISTRYCONFLICT") {
    return { status: 409, body: { error: err.message, expected: err.expected, actual: err.actual } };
  }
  if (err?.code === "EREGISTRYLOCK") {
    return { status: 423, body: { error: err.message, lock: err.lock } };
  }
  if (err?.code === "EREGISTRYDUP") return { status: 409, body: { error: err.message } };
  if (err?.code === "ENOREGISTRYENTRY") return { status: 404, body: { error: err.message } };
  if (["EBADREGISTRY", "EBADCAPSULE"].includes(err?.code)) return { status: 400, body: { error: err.message } };
  // A board file that no longer parses: say so plainly. The fix is the file, not a retry.
  if (typeof err?.message === "string" && /^Invalid JSON in /.test(err.message)) {
    return { status: 500, body: { error: "A project resource contains invalid JSON." }, log: err.message };
  }
  return {
    status: 500,
    body: { error: "Internal server error." },
    log: typeof err?.message === "string" ? err.message : String(e),
  };
}
