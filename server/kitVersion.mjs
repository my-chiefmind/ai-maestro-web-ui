/**
 * kitVersion.mjs — refuse registering a project whose vendored AI Maestro kit is older than
 * this web UI supports. The minimum comes from one source of truth: the
 * @mychiefmind/ai-maestro peerDependency range in this package's package.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { HttpError } from "./http.mjs";

const SEMVER = /(\d+)\.(\d+)\.(\d+)/;
const UPDATE_HINT = "Update the project first: npx @mychiefmind/ai-maestro@latest update";

/** @param {string} v @returns {number[] | null} */
function parse(v) {
  const m = SEMVER.exec(String(v ?? ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** @param {number[]} a @param {number[]} b */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Lowest version satisfying the peer range (e.g. "^0.6.7" → "0.6.7"). */
export function minimumKitVersion() {
  const pkg = createRequire(import.meta.url)("../package.json");
  const range = pkg.peerDependencies?.["@mychiefmind/ai-maestro"];
  const min = parse(range);
  if (!min) throw new Error(`Cannot derive a minimum AI Maestro version from peer range "${range}".`);
  return min.join(".");
}

/**
 * Read a capsule's kit version: <capsule>/VERSION, then the project's .maestro.lock
 * kitVersion, then <capsule>/package.json version. Returns null when none is readable.
 * @param {string} capsule absolute path of the project's maestro/ directory
 */
export function readKitVersion(capsule) {
  const readers = [
    () => readFileSync(join(capsule, "VERSION"), "utf8").trim(),
    () => JSON.parse(readFileSync(join(dirname(capsule), ".maestro.lock"), "utf8")).kitVersion,
    () => JSON.parse(readFileSync(join(capsule, "package.json"), "utf8")).version,
  ];
  for (const read of readers) {
    try {
      const v = parse(read());
      if (v) return v.join(".");
    } catch { /* try the next marker */ }
  }
  return null;
}

/** @param {string} capsule */
export function assertKitSupported(capsule) {
  const min = minimumKitVersion();
  const found = existsSync(capsule) ? readKitVersion(capsule) : null;
  if (!found) {
    throw new HttpError(400, {
      code: "kit-version-unknown",
      error: `Could not determine this project's AI Maestro version (no readable maestro/VERSION or .maestro.lock); ai-maestro-web-ui needs ${min} or newer. ${UPDATE_HINT}`,
    });
  }
  if (compareVersions(/** @type {number[]} */ (parse(found)), /** @type {number[]} */ (parse(min))) < 0) {
    throw new HttpError(400, {
      code: "kit-outdated",
      error: `This project uses AI Maestro ${found}; ai-maestro-web-ui needs ${min} or newer. ${UPDATE_HINT}`,
    });
  }
  return found;
}
