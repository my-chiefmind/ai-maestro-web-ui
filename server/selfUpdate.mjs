/**
 * selfUpdate.mjs — daily "is a newer kit / web UI published?" check and the per-project
 * update runner. Projects come only from the validated registry (board.capsuleDir's parent);
 * a request never supplies a path. Every command is spawned with an argv array, no shell.
 */
import { spawn as nodeSpawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readKitVersion } from "./kitVersion.mjs";

export const KIT_PKG = "@mychiefmind/ai-maestro";
export const UI_PKG = "@mychiefmind/ai-maestro-web-ui";
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CACHE_FILE = join(homedir(), ".cache", "ai-maestro-web-ui", "update-check.json");
const REGISTRY = "https://registry.npmjs.org";

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

/**
 * Semver order of two version strings; a prerelease sorts before its release. Unparseable
 * input returns null so callers never claim an update they cannot prove.
 * @param {string | null | undefined} a @param {string | null | undefined} b
 * @returns {number | null}
 */
export function compareSemver(a, b) {
  const x = SEMVER.exec(String(a ?? "").trim()); const y = SEMVER.exec(String(b ?? "").trim());
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  if (!x[4] && !y[4]) return 0;
  if (!x[4]) return 1;
  if (!y[4]) return -1;
  const pa = x[4].split("."); const pb = y[4].split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]); const nb = /^\d+$/.test(pb[i]);
    if (na && nb && Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) - Number(pb[i]);
    if (na !== nb) return na ? -1 : 1;
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** True only when `latest` is provably newer than `installed`. */
export const isBehind = (installed, latest) => (compareSemver(installed, latest) ?? 0) < 0;

/** @param {string} path */
function readJsonFile(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/** This running web UI's own version. */
export function ownVersion() {
  return createRequire(import.meta.url)("../package.json").version;
}

/**
 * Installed versions in one registered project: node_modules first, then the kit's own markers.
 * @param {{key: string, label: string, capsuleDir: string}} board
 */
export function projectVersions(board) {
  const root = dirname(board.capsuleDir);
  const installed = (name) => readJsonFile(join(root, "node_modules", ...name.split("/"), "package.json"))?.version ?? null;
  const pkg = readJsonFile(join(root, "package.json"));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return {
    key: board.key, label: board.label,
    hasPackageJson: pkg !== null,
    kit: installed(KIT_PKG) ?? readKitVersion(board.capsuleDir),
    ui: installed(UI_PKG),
    usesUi: UI_PKG in deps || installed(UI_PKG) !== null,
  };
}

/** @param {string} name @param {typeof fetch} fetchImpl */
async function fetchLatest(name, fetchImpl) {
  const res = await fetchImpl(`${REGISTRY}/${name.replace("/", "%2f")}/latest`, {
    headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`npm registry answered ${res.status} for ${name}`);
  const body = await res.json();
  if (typeof body?.version !== "string") throw new Error(`npm registry gave no version for ${name}`);
  return body.version;
}

/**
 * Latest published versions, fetched at most once per CHECK_INTERVAL_MS. The cache file holds
 * `{checkedAt, kit, ui}`; a failed fetch falls back to a stale cache rather than failing.
 * @param {{cacheFile?: string, fetchImpl?: typeof fetch, now?: number, force?: boolean}} [opts]
 * @returns {Promise<{checkedAt: number, kit: string | null, ui: string | null, error?: string}>}
 */
export async function latestVersions(opts = {}) {
  const cacheFile = opts.cacheFile ?? DEFAULT_CACHE_FILE;
  const now = opts.now ?? Date.now();
  const cached = readJsonFile(cacheFile);
  if (!opts.force && cached && typeof cached.checkedAt === "number" && now - cached.checkedAt < CHECK_INTERVAL_MS) return cached;
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const [kit, ui] = await Promise.all([fetchLatest(KIT_PKG, fetchImpl), fetchLatest(UI_PKG, fetchImpl)]);
    const fresh = { checkedAt: now, kit, ui };
    try {
      mkdirSync(dirname(cacheFile), { recursive: true });
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(fresh)); renameSync(tmp, cacheFile);
    } catch { /* cache is an optimisation only */ }
    return fresh;
  } catch (e) {
    if (cached) return { ...cached, error: String(/** @type {Error} */ (e).message) };
    return { checkedAt: now, kit: null, ui: null, error: String(/** @type {Error} */ (e).message) };
  }
}

/**
 * The update report the banner renders.
 * @param {any[]} boards @param {{kit: string | null, ui: string | null, checkedAt: number, error?: string}} latest
 */
export function updateStatus(boards, latest) {
  const running = ownVersion();
  const projects = boards.filter((b) => b.available !== false).map(projectVersions).map((p) => ({
    ...p,
    kitBehind: isBehind(p.kit, latest.kit),
    uiBehind: p.usesUi && isBehind(p.ui, latest.ui),
  }));
  const behind = projects.filter((p) => p.hasPackageJson && (p.kitBehind || p.uiBehind));
  const uiBehind = isBehind(running, latest.ui);
  return {
    checkedAt: latest.checkedAt, error: latest.error ?? null,
    latest: { kit: latest.kit, ui: latest.ui },
    running: { ui: running },
    projects,
    behind: behind.map((p) => p.key),
    available: behind.length > 0 || uiBehind,
  };
}

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

/**
 * The fixed, ordered steps for one project. Kit before web UI so npm never sees the new web
 * UI's peer range against the old kit (ERESOLVE).
 * @param {{usesUi: boolean}} project
 * @returns {{label: string, cmd: string, args: string[]}[]}
 */
export function updateSteps(project) {
  const steps = [
    { label: "install kit", cmd: NPM, args: ["install", "-D", `${KIT_PKG}@latest`] },
    { label: "ai-maestro update", cmd: NPX, args: ["ai-maestro", "update"] },
  ];
  if (project.usesUi) steps.push({ label: "install web UI", cmd: NPM, args: ["install", "-D", `${UI_PKG}@latest`] });
  return steps;
}

/**
 * Run steps one after another in `cwd`; stop at the first non-zero exit or spawn error.
 * `emit` receives {type: "step"|"out"|"err"|"exit", ...} events as they happen.
 * @param {{label: string, cmd: string, args: string[]}[]} steps @param {string} cwd
 * @param {(ev: any) => void} emit @param {{spawn?: typeof nodeSpawn}} [opts]
 * @returns {Promise<{ok: boolean, failed?: string, code?: number | null, error?: string}>}
 */
export async function runSteps(steps, cwd, emit, opts = {}) {
  const spawn = opts.spawn ?? nodeSpawn;
  for (const step of steps) {
    emit({ type: "step", label: step.label, command: [step.cmd, ...step.args].join(" ") });
    const result = await new Promise((resolve) => {
      let settled = false;
      const done = (r) => { if (!settled) { settled = true; resolve(r); } };
      let child;
      try {
        child = spawn(step.cmd, step.args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], env: process.env });
      } catch (e) { done({ code: null, error: String(/** @type {Error} */ (e).message) }); return; }
      child.stdout?.on("data", (d) => emit({ type: "out", text: String(d) }));
      child.stderr?.on("data", (d) => emit({ type: "err", text: String(d) }));
      child.on("error", (e) => done({ code: null, error: e.message }));
      child.on("close", (code) => done({ code }));
    });
    emit({ type: "exit", label: step.label, code: result.code });
    if (result.code !== 0) {
      return { ok: false, failed: step.label, code: result.code, error: result.error ?? `${step.label} exited with code ${result.code}` };
    }
  }
  return { ok: true };
}

/**
 * Update every registered project that has a package.json, in registry order; stop at the
 * first project whose steps fail.
 * @param {any[]} boards @param {(ev: any) => void} emit @param {{spawn?: typeof nodeSpawn}} [opts]
 */
export async function runUpdate(boards, emit, opts = {}) {
  const projects = boards.filter((b) => b.available !== false)
    .map((b) => ({ board: b, versions: projectVersions(b) }))
    .filter((p) => p.versions.hasPackageJson);
  if (!projects.length) return { ok: false, error: "No registered project has a package.json to update." };
  for (const { board, versions } of projects) {
    emit({ type: "project", key: board.key, label: board.label });
    const r = await runSteps(updateSteps(versions), dirname(board.capsuleDir), emit, opts);
    if (!r.ok) return { ...r, project: board.key };
  }
  return { ok: true, projects: projects.map((p) => p.board.key) };
}
