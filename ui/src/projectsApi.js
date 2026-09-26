/**
 * projectsApi.js — the Projects tab's registry writes, as thin wrappers over api.js (which owns
 * the allowlist). Every write sends the registry version read from /api/config; a stale version
 * comes back as 409 and the page asks the user to retry against the refreshed list.
 */
import { call } from "./api.js";

const enc = encodeURIComponent;

export const projectsApi = {
  /** @param {string} key @param {"active" | "parked"} status @param {string} expectVersion */
  setStatus: (key, status, expectVersion) =>
    call(`/config/boards/${enc(key)}`, { method: "PATCH", json: { status, expectVersion } }),
  /** Registry-only: drops the entry; project files are never touched. @param {string} key @param {string} expectVersion */
  remove: (key, expectVersion) => call(`/config/boards/${enc(key)}`, { method: "DELETE", json: { expectVersion } }),
};

/** A registry write lost a compare-and-swap race. @param {{status?: number}} err */
export const isConflict = (err) => err?.status === 409;
