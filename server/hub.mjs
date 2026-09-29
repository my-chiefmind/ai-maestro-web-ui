/**
 * hub.mjs — Maestro Hub start-up helpers (T-028): the address to open, whether to open
 * a browser at all, and the starter package.json a new Maestro Hub folder gets so `npm start`
 * works next time. Pure where possible so the CLI's decisions are unit-testable.
 */
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { aiMaestroVersion } from "./maestro.mjs";

export const DISPLAY_NAME = "Maestro Hub";
export const HUB_HOST = "maestro.localhost";
export const UI_PKG = "@mychiefmind/ai-maestro-web-ui";
export const KIT_PKG = "@mychiefmind/ai-maestro";
/** `npm start` in a Maestro Hub folder runs the locally installed bin: offline, no npx lookup. It uses
 * the original bin name, which every published version has (`maestro-hub` arrived later). */
export const START_SCRIPT = "ai-maestro-web-ui";

/** @param {number} port */
export const hubUrl = (port) => `http://${HUB_HOST}:${port}`;

/**
 * Open a browser only for an interactive start: never with --no-open, CI, MAESTRO_NO_OPEN=1,
 * a non-TTY stdout, or a self-update restart (the page is already open and polling).
 * @param {{noOpen?: boolean, isTTY?: boolean, env?: NodeJS.ProcessEnv}} opts
 */
export function shouldOpenBrowser({ noOpen = false, isTTY = false, env = process.env } = {}) {
  if (noOpen || !isTTY) return false;
  if (env.CI || env.MAESTRO_NO_OPEN === "1" || env.AI_MAESTRO_WEB_UI_RESTART_PORT) return false;
  return true;
}

/**
 * The fixed argv that opens `url` in the default browser. No shell: `cmd /c start "" <url>` on
 * Windows only ever receives our own http://maestro.localhost:<port> string.
 * @param {string} url @param {NodeJS.Platform} [platform]
 * @returns {[string, string[]]}
 */
export function openCommand(url, platform = process.platform) {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") return ["cmd", ["/c", "start", "", url]];
  return ["xdg-open", [url]];
}

/**
 * The versions this process is running: the web UI itself and the kit it loaded (with npx that
 * is the peer npm installed next to it). Pinned with ^ so `npm install` reproduces them.
 */
export function runningVersions() {
  return { ui: createRequire(import.meta.url)("../package.json").version, kit: aiMaestroVersion };
}

/** @param {{ui: string, kit: string | null}} versions */
export function starterPackageJson({ ui, kit }) {
  const dependencies = { [UI_PKG]: `^${ui}` };
  if (kit) dependencies[KIT_PKG] = `^${kit}`;
  return { name: "maestro-hub", private: true, scripts: { start: START_SCRIPT }, dependencies };
}

/**
 * Give a new Maestro Hub folder a package.json so `npm start` works next time. Never overwrites:
 * the file is created with O_EXCL. Returns what the "Next time" hint should say.
 * @param {string} dir @param {{ui: string, kit: string | null}} [versions]
 * @returns {{created: boolean, hasStart: boolean}}
 */
export function ensureStarterPackageJson(dir, versions = runningVersions()) {
  const file = join(resolve(dir), "package.json");
  if (!existsSync(file)) {
    try {
      writeFileSync(file, `${JSON.stringify(starterPackageJson(versions), null, 2)}\n`, { flag: "wx" });
      return { created: true, hasStart: true };
    } catch (error) {
      if (/** @type {any} */ (error).code !== "EEXIST") throw error;
    }
  }
  return { created: false, hasStart: hasStartScript(dir) };
}

/** Whether `dir/package.json` has a start script (read-only; unreadable counts as no). @param {string} dir */
export function hasStartScript(dir) {
  try {
    const pkg = JSON.parse(readFileSync(join(resolve(dir), "package.json"), "utf8"));
    return typeof pkg?.scripts?.start === "string";
  } catch { return false; }
}

/** The one-line "Next time" hint. @param {boolean} hasStart */
export const nextTimeHint = (hasStart) => hasStart ? "Next time: npm start" : `Next time: npx ${UI_PKG}`;

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * One-time `npm install` in a new Maestro Hub so the next `npm start` is local and offline. Runs
 * before the server starts (this process already has the kit loaded, so ordering is safe).
 * MAESTRO_SKIP_INSTALL=1 skips it (tests). Never throws: a failure returns the fix command.
 * @param {string} dir @param {{env?: NodeJS.ProcessEnv, spawnSync?: typeof nodeSpawnSync}} [opts]
 * @returns {{skipped: boolean, ok: boolean, fix?: string}}
 */
export function installOnce(dir, opts = {}) {
  const env = opts.env ?? process.env;
  if (env.MAESTRO_SKIP_INSTALL === "1") return { skipped: true, ok: true };
  const spawnSync = opts.spawnSync ?? nodeSpawnSync;
  const fix = `cd ${JSON.stringify(resolve(dir))} && npm install`;
  try {
    const r = spawnSync(NPM, ["install", "--no-audit", "--no-fund", "--loglevel=error"],
      { cwd: resolve(dir), stdio: "ignore", shell: process.platform === "win32", env });
    return r.status === 0 ? { skipped: false, ok: true } : { skipped: false, ok: false, fix };
  } catch { return { skipped: false, ok: false, fix }; }
}
