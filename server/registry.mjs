import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync,
  renameSync, rmSync, statSync, writeFileSync, writeSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { validateCapsule } from "./maestro.mjs";

export const REGISTRY_RELATIVE_PATH = join("maestro", "web-ui.json");
export const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const ENTRY_KEYS = new Set(["key", "label", "path", "status"]);
export const ENTRY_STATUSES = Object.freeze(["active", "parked"]);
const AI_TOP_KEYS = new Set(["projects"]);
const AI_ENTRY_KEYS = new Set(["name", "path", "registry", "status", "kind", "note"]);
const LENSE_TOP_KEYS = new Set(["$comment", "schemaVersion", "projects"]);
const LENSE_ENTRY_KEYS = new Set([
  "key", "label", "kind", "status", "path", "remote", "board", "docs", "note", "app",
  "gate", "marketingFeed", "platformOutputs",
]);
const waitArray = new Int32Array(new SharedArrayBuffer(4));

export class RegistryError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = "RegistryError"; this.code = code; Object.assign(this, details);
  }
}

export function expandPath(value, base = process.cwd()) {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return resolve(base, value);
}

export function registryVersion(entries) {
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function fail(code, message, details) { throw new RegistryError(code, message, details); }

function parseJson(path) {
  let text;
  try { text = readFileSync(path, "utf8"); }
  catch (error) { fail("EREGISTRYREAD", `Cannot read registry ${path}: ${error.message}`); }
  try { return JSON.parse(text); }
  catch (error) { fail("EBADREGISTRY", `Invalid JSON in registry ${path}: ${error.message}`); }
}

function validateEntry(entry, where) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) fail("EBADREGISTRY", `${where} must be an object.`);
  const unknown = Object.keys(entry).filter((key) => !ENTRY_KEYS.has(key));
  if (unknown.length) fail("EBADREGISTRY", `${where} has unknown field(s): ${unknown.join(", ")}.`);
  if (typeof entry.key !== "string" || !KEY_PATTERN.test(entry.key)) fail("EBADREGISTRY", `${where}.key must match ${KEY_PATTERN}.`);
  if (typeof entry.label !== "string" || !entry.label.trim()) fail("EBADREGISTRY", `${where}.label is required.`);
  if (typeof entry.path !== "string" || !entry.path.trim() || !isAbsolute(entry.path)) {
    fail("EBADREGISTRY", `${where}.path must be an absolute capsule path.`);
  }
  if (entry.status !== undefined && !ENTRY_STATUSES.includes(entry.status)) fail("EBADREGISTRY", `${where}.status must be active or parked.`);
  // `status` is optional (absent = active) and only carried when present, so a legacy file
  // keeps its exact shape and its version.
  return { key: entry.key, label: entry.label, path: resolve(entry.path), ...(entry.status !== undefined ? { status: entry.status } : {}) };
}

export function validateRegistry(raw, where = "registry") {
  if (!Array.isArray(raw)) fail("EBADREGISTRY", `${where} must be a JSON array.`);
  const entries = raw.map((entry, index) => validateEntry(entry, `${where}[${index}]`));
  const keys = new Set(); const paths = new Set();
  for (const entry of entries) {
    if (keys.has(entry.key)) fail("EBADREGISTRY", `${where} has duplicate key "${entry.key}".`);
    if (paths.has(entry.path)) fail("EBADREGISTRY", `${where} has duplicate path "${entry.path}".`);
    keys.add(entry.key); paths.add(entry.path);
  }
  return entries;
}

export function readRegistry(path) {
  const abs = resolve(path); const present = existsSync(abs);
  const entries = present ? validateRegistry(parseJson(abs), abs) : [];
  return { path: abs, entries, version: registryVersion(entries), exists: present };
}

function capsuleCandidate(input, base) {
  const requested = expandPath(input, base);
  if (existsSync(join(requested, "config.json")) && existsSync(join(requested, "board", "data.json"))) return requested;
  return join(requested, "maestro");
}

export function canonicalCapsule(input, base = process.cwd(), opts = {}) {
  const candidate = capsuleCandidate(input, base); let canonical;
  try { canonical = realpathSync(candidate); }
  catch { fail("EBADCAPSULE", `No Maestro capsule at ${candidate}. Expected config.json and board/data.json.`); }
  try {
    const board = realpathSync(join(canonical, "board"));
    const config = realpathSync(join(canonical, "config.json"));
    const data = realpathSync(join(board, "data.json"));
    if (board !== join(canonical, "board") || !config.startsWith(canonical + sep) || !data.startsWith(board + sep)) throw new Error();
    if (!statSync(config).isFile() || !statSync(data).isFile()) throw new Error();
    if (opts.validateContent !== false) {
      validateCapsule({ config, data, boardDir: board, archive: join(board, "archive.json"), plan: join(board, "plan.json"), specs: join(board, "specs") });
    }
  } catch (error) {
    fail("EBADCAPSULE", `Invalid Maestro capsule at ${candidate}: ${error.message ?? "expected config.json and board/data.json"}`);
  }
  return canonical;
}

export function assertCapsulePath(expected) {
  let actual;
  try { actual = realpathSync(expected); }
  catch { fail("EBADCAPSULE", `Registered capsule is no longer available: ${expected}`); }
  if (actual !== expected) fail("EBADCAPSULE", `Registered capsule path changed since registration: ${expected} now resolves to ${actual}.`);
  canonicalCapsule(expected, process.cwd(), { validateContent: false }); return expected;
}

export function suggestIdentity(capsule) {
  let name = basename(dirname(capsule));
  try {
    const raw = JSON.parse(readFileSync(join(capsule, "config.json"), "utf8"));
    if (typeof raw?.project?.name === "string" && raw.project.name.trim()) name = raw.project.name.trim();
  } catch { /* project.name is optional */ }
  let key = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z0-9]+|[-_]+$/g, "");
  if (!KEY_PATTERN.test(key)) key = "project";
  return { key, label: name };
}

function acquireLock(path, timeoutMs = 2_000) {
  const lock = `${path}.lock`; const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, "holder.json"), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }) + "\n");
      return () => rmSync(lock, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() - start >= timeoutMs) fail("EREGISTRYLOCK", `Timed out waiting for registry lock ${lock}.`, { lock });
      Atomics.wait(waitArray, 0, 0, 15);
    }
  }
}

function writeAtomic(path, entries) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`); let fd;
  try {
    fd = openSync(tmp, "wx", 0o600); writeSync(fd, JSON.stringify(entries, null, 2) + "\n"); fsyncSync(fd);
    closeSync(fd); fd = undefined; renameSync(tmp, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(tmp)) rmSync(tmp, { force: true });
  }
}

export function mutateRegistry(path, expectVersion, change, opts = {}) {
  const abs = resolve(path); mkdirSync(dirname(abs), { recursive: true });
  const release = acquireLock(abs, opts.timeoutMs);
  try {
    const current = readRegistry(abs);
    if (expectVersion != null && expectVersion !== current.version) {
      fail("EREGISTRYCONFLICT", "Registry changed since it was read.", { expected: expectVersion, actual: current.version });
    }
    const entries = validateRegistry(change(current.entries.map((entry) => ({ ...entry }))), abs);
    writeAtomic(abs, entries); return { entries, version: registryVersion(entries) };
  } finally { release(); }
}

export function addRegistryEntry(path, input, opts = {}) {
  const capsule = canonicalCapsule(input.path, opts.cwd); const suggested = suggestIdentity(capsule);
  const entry = { key: input.key || suggested.key, label: input.label || suggested.label, path: capsule };
  validateEntry(entry, "entry");
  const result = mutateRegistry(path, opts.expectVersion, (entries) => {
    if (!input.key) {
      // System-assigned key: suffix -2, -3, … until it is unique.
      const base = entry.key; for (let n = 2; entries.some((item) => item.key === entry.key); n++) entry.key = `${base}-${n}`;
    }
    if (entries.some((item) => item.key === entry.key)) fail("EREGISTRYDUP", `Registry key "${entry.key}" already exists.`);
    if (entries.some((item) => item.path === entry.path)) fail("EREGISTRYDUP", `Capsule "${entry.path}" is already registered.`);
    entries.push(entry); return entries;
  }, opts);
  return { ...result, entry };
}

export function removeRegistryEntry(path, key, opts = {}) {
  if (!KEY_PATTERN.test(key)) fail("EBADREGISTRY", `Invalid registry key "${key}".`); let removed;
  const result = mutateRegistry(path, opts.expectVersion, (entries) => {
    const index = entries.findIndex((entry) => entry.key === key);
    if (index === -1) fail("ENOREGISTRYENTRY", `No registered project "${key}".`);
    [removed] = entries.splice(index, 1); return entries;
  }, opts);
  return { ...result, entry: removed };
}

/** Park or unpark one entry. Unparking drops the field, so the entry returns to its default shape. */
export function setRegistryEntryStatus(path, key, status, opts = {}) {
  if (!KEY_PATTERN.test(key)) fail("EBADREGISTRY", `Invalid registry key "${key}".`);
  if (!ENTRY_STATUSES.includes(status)) fail("EBADREGISTRY", "status must be active or parked.");
  const result = mutateRegistry(path, opts.expectVersion, (entries) => {
    const entry = entries.find((item) => item.key === key);
    if (!entry) fail("ENOREGISTRYENTRY", `No registered project "${key}".`);
    if (status === "parked") entry.status = "parked"; else delete entry.status;
    return entries;
  }, opts);
  return { ...result, status };
}

function importCapsule(entry, file, base) {
  const projectRoot = expandPath(entry.path, base);
  if (typeof entry.board === "string" && entry.board.trim()) return dirname(expandPath(entry.board, projectRoot));
  return capsuleCandidate(projectRoot, base);
}

function onlyKnown(value, allowed, where) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail("EBADREGISTRY", `${where} has unknown field(s): ${unknown.join(", ")}.`);
}

function safeKeyBase(value) {
  let base = String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z0-9]+|[-_]+$/g, "");
  if (!KEY_PATTERN.test(base)) base = "project";
  return base;
}

function safeImportKey(value, identity, keys) {
  const base = safeKeyBase(value); let key = base;
  if (keys.has(key)) {
    const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 8);
    key = `${base}-${suffix}`;
    let n = 2;
    while (keys.has(key)) key = `${base}-${suffix}-${n++}`;
  }
  keys.add(key); return key;
}

export function readImport(path, opts = {}) {
  let file;
  try { file = realpathSync(expandPath(path)); } catch { fail("EREGISTRYREAD", `Import registry not found: ${expandPath(path)}`); }
  const cwd = opts.cwd ?? process.cwd();
  const boards = []; const keys = new Set(); const names = new Map(); const loading = new Set();
  const load = (source) => {
    const sourceFile = realpathSync(source);
    if (loading.has(sourceFile)) fail("EBADREGISTRY", `Import registry cycle at ${sourceFile}.`);
    loading.add(sourceFile);
    const raw = parseJson(sourceFile);
    if (!raw || !Array.isArray(raw.projects)) fail("EBADREGISTRY", `${sourceFile}.projects must be an array.`);
    const lense = raw.schemaVersion !== undefined || raw.$comment !== undefined || raw.projects.some((entry) => entry?.key !== undefined || entry?.label !== undefined || entry?.board !== undefined);
    onlyKnown(raw, lense ? LENSE_TOP_KEYS : AI_TOP_KEYS, sourceFile);
    if (lense && raw.schemaVersion !== undefined && !Number.isInteger(raw.schemaVersion)) fail("EBADREGISTRY", `${sourceFile}.schemaVersion must be an integer.`);
    for (const [index, entry] of raw.projects.entries()) {
      const where = `${sourceFile}.projects[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("EBADREGISTRY", `${where} must be an object.`);
      onlyKnown(entry, lense ? LENSE_ENTRY_KEYS : AI_ENTRY_KEYS, where);
      if (entry.note != null && typeof entry.note !== "string") fail("EBADREGISTRY", `${where}.note must be a string.`);
      if (lense) {
        if (entry.key != null && (typeof entry.key !== "string" || !entry.key.trim())) fail("EBADREGISTRY", `${where}.key must be a non-empty string.`);
        if (entry.label != null && (typeof entry.label !== "string" || !entry.label.trim())) fail("EBADREGISTRY", `${where}.label must be a non-empty string.`);
        if (entry.board != null && (typeof entry.board !== "string" || !entry.board.trim())) fail("EBADREGISTRY", `${where}.board must be a non-empty string.`);
      } else if (entry.name != null && (typeof entry.name !== "string" || !entry.name.trim())) {
        fail("EBADREGISTRY", `${where}.name must be a non-empty string.`);
      }
      if (entry.registry != null) {
        if (lense) fail("EBADREGISTRY", `${where}.registry is not part of the imported registry shape.`);
        if (typeof entry.registry !== "string" || entry.path != null) fail("EBADREGISTRY", `${where}.registry must be a string and cannot accompany path.`);
        load(expandPath(entry.registry, dirname(sourceFile))); continue;
      }
      if (typeof entry.path !== "string" || !entry.path.trim()) fail("EBADREGISTRY", `${where} needs a non-empty path.`);
      const status = entry.status ?? "active";
      if (status !== "active" && status !== "parked") fail("EBADREGISTRY", `${where}.status must be active or parked.`);
      if (entry.kind != null && entry.kind !== "product" && entry.kind !== "ops") fail("EBADREGISTRY", `${where}.kind must be product or ops.`);
      const name = lense ? entry.label ?? entry.key : entry.name ?? entry.path;
      if (typeof name !== "string" || !name.trim()) fail("EBADREGISTRY", `${where} needs a non-empty ${lense ? "key or label" : "name or path"}.`);
      if (!lense) {
        const prior = names.get(name);
        if (prior) fail("EBADREGISTRY", `Duplicate imported project name "${name}": ${prior} and ${where}.`);
        names.set(name, where);
      }
      const pathBase = lense ? dirname(sourceFile) : cwd;
      const candidate = importCapsule(entry, sourceFile, pathBase); let capsule = resolve(candidate); let available = false;
      // Portfolio registries can intentionally contain projects that have not adopted Maestro
      // yet. Keep them visible as unavailable instead of forcing a second, filtered list.
      try { capsule = canonicalCapsule(candidate, pathBase, { validateContent: false }); available = true; } catch { /* unavailable */ }
      const seed = lense ? entry.key ?? name : entry.name ?? basename(expandPath(entry.path, cwd));
      let key;
      if (lense && entry.key != null) {
        key = safeKeyBase(entry.key);
        if (keys.has(key)) fail("EBADREGISTRY", `Duplicate or colliding explicit imported registry key "${entry.key}" at ${where}.`);
        keys.add(key);
      } else {
        key = safeImportKey(seed, `${sourceFile}\0${name}\0${entry.path}`, keys);
      }
      boards.push({ key, label: name, path: capsule, status, available });
    }
    loading.delete(sourceFile);
  };
  load(file);
  return { path: file, boards, version: registryVersion(boards) };
}
