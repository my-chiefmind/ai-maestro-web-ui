import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { HttpError } from "./http.mjs";
import { assertKitSupported } from "./kitVersion.mjs";
import {
  REGISTRY_RELATIVE_PATH, addRegistryEntry, assertCapsulePath, canonicalCapsule, readImport, readRegistry,
  removeRegistryEntry, setRegistryEntryStatus,
} from "./registry.mjs";

export const DEFAULT_PORT = 3021;
export const CONFIG_FILE = REGISTRY_RELATIVE_PATH;

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
    mode: "registry", path: registry.path, registryPath: registry.path,
    version: registry.version, readonly: false, port: DEFAULT_PORT, allowedHosts: [],
    boards: registry.entries.map(resolveBoard),
  };
}

export function loadConfig(path = null, cwd = process.cwd()) {
  if (path != null) return configFromRegistry(resolve(cwd, path));
  const registryPath = resolve(cwd, REGISTRY_RELATIVE_PATH);
  if (existsSync(registryPath)) return configFromRegistry(registryPath);
  // No registry and no ./maestro: start empty and writable; the registry file appears on the first add.
  if (!existsSync(resolve(cwd, "maestro"))) return configFromRegistry(registryPath);
  // No registry but a ./maestro capsule: the project the console starts in is the first registered
  // project, so more can be added from the UI straight away.
  addRegistryEntry(registryPath, { path: resolve(cwd, "maestro") });
  return configFromRegistry(registryPath);
}

export function loadImportedConfig(path) {
  const imported = readImport(path);
  return {
    mode: "import", path: imported.path, registryPath: null, version: imported.version,
    readonly: true, port: DEFAULT_PORT, allowedHosts: [], boards: imported.boards.map(resolveBoard),
  };
}

export function refreshConfig(config) {
  if (config.mode !== "registry") return config;
  const allowedHosts = config.allowedHosts;
  Object.assign(config, configFromRegistry(config.registryPath));
  config.allowedHosts = allowedHosts;
  return config;
}

export function assertBoardUsable(board) {
  if (board.status !== "active") throw new HttpError(404, { error: `Project ${board.key} is ${board.status} and cannot be addressed.` });
  if (!board.available) throw new HttpError(404, { error: `Project ${board.key} has no Maestro capsule (status: ${board.status}).` });
  try { assertCapsulePath(board.canonicalPath); }
  catch { throw new HttpError(400, { error: "Project path validation failed.", code: "project-path-invalid" }); }
  return board;
}

export function addBoard(config, entry) {
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
  if (config.readonly || !config.registryPath) throw new HttpError(400, { error: `${config.mode} mode is read-only.` });
  const result = removeRegistryEntry(config.registryPath, key, { expectVersion }); refreshConfig(config);
  return { key, id: key, version: result.version };
}

export function setBoardStatus(config, key, status, expectVersion) {
  if (config.readonly || !config.registryPath) throw new HttpError(400, { error: `${config.mode} mode is read-only.` });
  const result = setRegistryEntryStatus(config.registryPath, key, status, { expectVersion }); refreshConfig(config);
  return { key, status: result.status, version: result.version };
}

/** Parked boards are listed only by /api/config; every list and aggregate skips them. */
export const activeBoards = (config) => config.boards.filter((b) => b.status === "active");
