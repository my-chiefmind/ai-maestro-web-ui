import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { HttpError } from "./http.mjs";
import { assertKitSupported } from "./kitVersion.mjs";
import {
  DASHBOARD_FILE, addRegistryEntry, assertCapsulePath, canonicalCapsule, dashboardFilePath, expandPath,
  isDashboardDir, readImport, readRegistry, removeRegistryEntry, setRegistryEntryStatus, suggestIdentity,
} from "./registry.mjs";

export const DEFAULT_PORT = 3021;

export function resolveBoard(entry) {
  const capsuleDir = resolve(entry.path); const boardDir = join(capsuleDir, "board");
  return {
    id: entry.key, key: entry.key, name: entry.label, label: entry.label, path: capsuleDir,
    capsuleDir, canonicalPath: capsuleDir, status: entry.status ?? "active",
    available: entry.available ?? true, boardDir, data: join(boardDir, "data.json"),
    archive: join(boardDir, "archive.json"), plan: join(boardDir, "plan.json"),
    specs: join(boardDir, "specs"), config: join(capsuleDir, "config.json"),
  };
}

function configFromRegistry(path) {
  const registry = readRegistry(path);
  return {
    mode: "registry", path: registry.path, registryPath: registry.path, home: null,
    version: registry.version, readonly: false, port: DEFAULT_PORT, allowedHosts: [],
    boards: registry.entries.map(resolveBoard),
  };
}

export const PROJECT_MODE_ERROR = "Project mode: start the dashboard to manage projects (ai-maestro-web-ui dashboard).";

export const NO_DASHBOARD_HELP = "run `ai-maestro-web-ui dashboard init` here to make this folder a dashboard, or start inside a project (a folder with ./maestro).";

/**
 * Where a start points and which mode it uses:
 * - --home <dir>, a dashboard file in the start folder, or the `dashboard` command → dashboard;
 * - otherwise a ./maestro capsule → project (that one project, no project management);
 * - otherwise neither ("none"): the caller prints guidance and creates nothing.
 */
export function detectMode({ cwd = process.cwd(), home = null, dashboard = false } = {}) {
  if (home != null) return { mode: "dashboard", dir: expandPath(String(home), cwd) };
  if (isDashboardDir(cwd)) {
    if (existsSync(resolve(cwd, "maestro"))) {
      throw new Error(`${resolve(cwd)} has both ./maestro and ${DASHBOARD_FILE}; a dashboard must not live inside a project. Move ${DASHBOARD_FILE} to its own folder and use --home <that folder>.`);
    }
    return { mode: "dashboard", dir: resolve(cwd) };
  }
  if (dashboard) return { mode: "dashboard", dir: resolve(cwd) };
  if (existsSync(resolve(cwd, "maestro"))) return { mode: "project", dir: resolve(cwd) };
  return { mode: "none", dir: resolve(cwd) };
}

/** Project mode: exactly the ./maestro project. No project list is read or written. */
export function loadProjectConfig(cwd = process.cwd()) {
  const capsule = canonicalCapsule(resolve(cwd, "maestro"));
  const { key, label } = suggestIdentity(capsule);
  return {
    mode: "project", path: capsule, registryPath: null, home: null, version: null,
    readonly: false, port: DEFAULT_PORT, allowedHosts: [], boards: [resolveBoard({ key, label, path: capsule })],
  };
}

/** Dashboard mode: the dashboard file must already exist (see `dashboard init`); nothing is created here. */
export function loadDashboardConfig(dir) {
  const file = dashboardFilePath(dir);
  if (!existsSync(file)) {
    throw new Error(existsSync(join(dir, "maestro"))
      ? `${dir} is a project, not a dashboard. Run the dashboard from its own folder (or pass --home <dashboard folder>).`
      : `No dashboard at ${dir}: ${NO_DASHBOARD_HELP}`);
  }
  return { ...configFromRegistry(file), home: resolve(dir) };
}

/**
 * `path` names an explicit registry file (tests, embedding). Without it the start folder picks
 * the mode (see detectMode). Project mode never reads or writes a project list.
 */
export function loadConfig(path = null, cwd = process.cwd(), opts = {}) {
  if (path != null) return configFromRegistry(resolve(cwd, path));
  const { mode, dir } = detectMode({ cwd, home: opts.home, dashboard: opts.dashboard });
  if (mode === "project") return loadProjectConfig(dir);
  if (mode === "none") throw new Error(`Nothing to show in ${dir}: ${NO_DASHBOARD_HELP}`);
  return loadDashboardConfig(dir);
}

export function loadImportedConfig(path) {
  const imported = readImport(path);
  return {
    mode: "import", path: imported.path, registryPath: null, home: null, version: imported.version,
    readonly: true, port: DEFAULT_PORT, allowedHosts: [], boards: imported.boards.map(resolveBoard),
  };
}

export function refreshConfig(config) {
  if (config.mode !== "registry") return config;
  const allowedHosts = config.allowedHosts;
  const home = config.home;
  Object.assign(config, configFromRegistry(config.registryPath));
  config.allowedHosts = allowedHosts; config.home = home;
  return config;
}

export function assertBoardUsable(board) {
  if (board.status !== "active") throw new HttpError(404, { error: `Project ${board.key} is ${board.status} and cannot be addressed.` });
  if (!board.available) throw new HttpError(404, { error: `Project ${board.key} has no Maestro capsule (status: ${board.status}).` });
  try { assertCapsulePath(board.canonicalPath); }
  catch { throw new HttpError(400, { error: "Project path validation failed.", code: "project-path-invalid" }); }
  return board;
}

export function assertCanManageProjects(config) {
  if (config.mode === "project") throw new HttpError(403, { error: PROJECT_MODE_ERROR, code: "project-mode" });
}

export function addBoard(config, entry) {
  assertCanManageProjects(config);
  if (config.readonly || !config.registryPath) throw new HttpError(400, { error: `${config.mode} mode is read-only.` });
  // Refuse outdated or unversioned kits before anything touches the registry.
  assertKitSupported(canonicalCapsule(entry.path));
  const result = addRegistryEntry(config.registryPath, {
    key: entry.key ?? entry.id, label: entry.label ?? entry.name, path: entry.path,
  }, { expectVersion: entry.expectVersion });
  refreshConfig(config);
  return { key: result.entry.key, id: result.entry.key, version: result.version };
}

export function removeBoard(config, key, expectVersion) {
  assertCanManageProjects(config);
  if (config.readonly || !config.registryPath) throw new HttpError(400, { error: `${config.mode} mode is read-only.` });
  const result = removeRegistryEntry(config.registryPath, key, { expectVersion }); refreshConfig(config);
  return { key, id: key, version: result.version };
}

export function setBoardStatus(config, key, status, expectVersion) {
  assertCanManageProjects(config);
  if (config.readonly || !config.registryPath) throw new HttpError(400, { error: `${config.mode} mode is read-only.` });
  const result = setRegistryEntryStatus(config.registryPath, key, status, { expectVersion }); refreshConfig(config);
  return { key, status: result.status, version: result.version };
}

/** Parked boards are listed only by /api/config; every list and aggregate skips them. */
export const activeBoards = (config) => config.boards.filter((b) => b.status === "active");
