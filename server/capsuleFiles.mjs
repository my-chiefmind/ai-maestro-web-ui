/**
 * capsuleFiles.mjs — read-only, project-level listings Maestro shows but ai-maestro 0.6.6
 * exposes no public API for: the roster (agents and skills), generated reports, and docs.
 *
 * Every directory is derived from the registered capsule (never from a request), every entry
 * id is matched against a strict allowlist with no path separators, symlinked entries are
 * skipped on listing and refused on detail, and nothing returned carries a filesystem path.
 * Home-level ~/.claude, ~/.codex and ~/.agents are never scanned: only the project root is.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, sep } from "node:path";
import { HttpError } from "./http.mjs";

/** One path segment: no leading dot, no separators, bounded length. */
export const ENTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const CONTENT_LIMIT = 2 * 1024 * 1024; // 2 MiB per entry
const DOCUMENT_KINDS = new Map([[".md", "markdown"], [".html", "html"]]);

/**
 * Roster sources, relative to the project root (the capsule's parent directory). Agents are
 * one file each; skills are one directory each holding SKILL.md.
 */
const ROSTER_SOURCES = [
  { kind: "agent", target: "claude", dir: [".claude", "agents"], ext: ".md" },
  { kind: "agent", target: "codex", dir: [".codex", "agents"], ext: ".toml" },
  { kind: "skill", target: "claude", dir: [".claude", "skills"] },
  { kind: "skill", target: "agents", dir: [".agents", "skills"] },
];

/** @param {{capsuleDir: string}} b */
export const projectRoot = (b) => dirname(b.capsuleDir);
/** @param {{boardDir: string}} b */
export const reportsDir = (b) => join(b.boardDir, "reports");
/** @param {{capsuleDir: string}} b */
export const docsDir = (b) => join(b.capsuleDir, "docs");

// ── parsing ───────────────────────────────────────────────────────────────────────────────

/** Minimal YAML frontmatter: `key: value` lines between the leading `---` fences. */
export function frontmatter(text) {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(text);
  /** @type {Record<string, string>} */
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim());
    if (kv) out[kv[1]] = unquote(kv[2]);
  }
  return out;
}

/** Top-level `key = "value"` pairs of a TOML file (basic strings with escapes, or literal strings). */
export function tomlTopLevel(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) break; // first table ends the top level
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = unquote(kv[2]);
  }
  return out;
}

function unquote(value) {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    return v.slice(1, -1).replace(/\\(["\\nt])/g, (_, c) => ({ '"': '"', "\\": "\\", n: "\n", t: "\t" })[c]);
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1);
  return v;
}

function documentTitle(kind, text, fallback) {
  const m = kind === "markdown" ? /^#\s+(.+?)\s*$/m.exec(text) : /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  const title = m?.[1]?.replace(/\s+/g, " ").trim();
  return title || fallback;
}

// ── containment ───────────────────────────────────────────────────────────────────────────

/** Regular (non-symlink) children of `dir` of the requested type, sorted by name. Missing dir → []. */
function children(dir, type) {
  if (!existsSync(dir)) return [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((d) => (type === "file" ? d.isFile() : d.isDirectory()) && ENTRY_ID.test(d.name))
    .map((d) => d.name)
    .sort((a, z) => a.localeCompare(z));
}

/**
 * Resolve `<dir>/<id>` to a regular file that really lives under `dir`. Refuses bad ids (400),
 * symlinks, escapes and anything missing (404).
 */
export function containedFile(dir, id) {
  if (typeof id !== "string" || !ENTRY_ID.test(id)) throw new HttpError(400, { error: "Invalid entry id." });
  const notFound = () => new HttpError(404, { error: "The requested entry was not found." });
  const abs = join(dir, id);
  let real; let base;
  try {
    if (lstatSync(abs).isSymbolicLink()) throw notFound();
    real = realpathSync(abs); base = realpathSync(dir);
  } catch (error) { throw error instanceof HttpError ? error : notFound(); }
  if (!real.startsWith(base + sep) || !statSync(real).isFile()) throw notFound();
  return real;
}

function readBounded(file) {
  const { size } = statSync(file);
  if (size > CONTENT_LIMIT) throw new HttpError(413, { error: `Entry exceeds ${CONTENT_LIMIT} bytes.` });
  return readFileSync(file, "utf8");
}

// ── roster ────────────────────────────────────────────────────────────────────────────────

/**
 * Agents and skills declared in the project, merged by kind + name across targets.
 * @param {{capsuleDir: string}} b
 * @returns {{agents: Array<{name: string, slug: string, description: string, targets: string[]}>, skills: typeof agents}}
 */
export function listRoster(b) {
  const root = projectRoot(b);
  /** @type {Map<string, any>} */
  const merged = new Map();
  for (const source of ROSTER_SOURCES) {
    const dir = join(root, ...source.dir);
    const found = source.kind === "agent"
      ? children(dir, "file").filter((f) => extname(f) === source.ext).map((f) => ({ slug: f.slice(0, -source.ext.length), file: join(dir, f) }))
      : children(dir, "dir").map((d) => ({ slug: d, file: join(dir, d, "SKILL.md") })).filter((s) => isRegularFile(s.file));
    for (const item of found) {
      let meta = {};
      try {
        const text = readBounded(item.file);
        meta = source.ext === ".toml" ? tomlTopLevel(text) : frontmatter(text);
      } catch { /* unreadable metadata: keep the slug */ }
      const name = String(meta.name || item.slug).trim() || item.slug;
      const key = `${source.kind}\0${name.toLowerCase()}`;
      const row = merged.get(key) ?? { kind: source.kind, name, slug: item.slug, description: "", targets: [] };
      if (!row.description && meta.description) row.description = String(meta.description).trim();
      if (!row.targets.includes(source.target)) row.targets.push(source.target);
      merged.set(key, row);
    }
  }
  const rows = [...merged.values()].sort((a, z) => a.name.localeCompare(z.name));
  const pick = (kind) => rows.filter((r) => r.kind === kind).map(({ kind: _kind, ...row }) => row);
  return { agents: pick("agent"), skills: pick("skill") };
}

function isRegularFile(file) {
  try { return !lstatSync(file).isSymbolicLink() && statSync(file).isFile(); } catch { return false; }
}

// ── documents (reports, docs) ─────────────────────────────────────────────────────────────

/** List .md/.html documents in `dir`: id, kind, title, size, modifiedAt. */
export function listDocuments(dir) {
  const rows = [];
  for (const name of children(dir, "file")) {
    const kind = DOCUMENT_KINDS.get(extname(name).toLowerCase());
    if (!kind) continue;
    const file = join(dir, name);
    let stat;
    try { stat = statSync(file); } catch { continue; }
    let title = name;
    if (stat.size <= CONTENT_LIMIT) {
      try { title = documentTitle(kind, readFileSync(file, "utf8"), name); } catch { /* keep the file name */ }
    }
    rows.push({ id: name, kind, title, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }
  return rows;
}

/** One document by id, with its content. */
export function readDocument(dir, id) {
  const kind = DOCUMENT_KINDS.get(extname(String(id)).toLowerCase());
  if (!kind) throw new HttpError(400, { error: "Invalid entry id." });
  const file = containedFile(dir, id);
  const content = readBounded(file);
  const stat = statSync(file);
  return { id, kind, title: documentTitle(kind, content, id), size: stat.size, modifiedAt: stat.mtime.toISOString(), content };
}

/** @param {{boardDir: string}} b */
export const listReports = (b) => listDocuments(reportsDir(b)).sort((a, z) => z.modifiedAt.localeCompare(a.modifiedAt) || a.id.localeCompare(z.id));
/** @param {{boardDir: string}} b @param {string} id */
export const readReport = (b, id) => readDocument(reportsDir(b), id);
/** @param {{capsuleDir: string}} b */
export const listDocs = (b) => listDocuments(docsDir(b));
/** @param {{capsuleDir: string}} b @param {string} id */
export const readDoc = (b, id) => readDocument(docsDir(b), id);

// ── document assets (images referenced from docs / reports) ───────────────────────────────

export const ASSET_LIMIT = 5 * 1024 * 1024; // 5 MiB per image
export const ASSET_TYPES = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".gif", "image/gif"], [".webp", "image/webp"], [".svg", "image/svg+xml"],
]);

/**
 * Resolve an image under `dir` from a relative, `/`-separated path. Every segment must be an
 * ENTRY_ID (so `..`, `.`, empty, hidden and encoded separators all fail), no segment may be a
 * symlink, and the realpath must stay inside realpath(dir). Returns {file, type, size}.
 * @param {string} dir @param {string} rel
 */
export function resolveAsset(dir, rel) {
  const invalid = () => new HttpError(400, { error: "Invalid asset path." });
  const notFound = () => new HttpError(404, { error: "The requested asset was not found." });
  if (typeof rel !== "string" || rel.length > 512 || rel.includes("\\") || rel.includes("\0")) throw invalid();
  const segments = rel.split("/");
  if (segments.length > 8 || !segments.every((s) => ENTRY_ID.test(s))) throw invalid();
  const type = ASSET_TYPES.get(extname(segments[segments.length - 1]).toLowerCase());
  if (!type) throw new HttpError(415, { error: "Only png, jpg, gif, webp and svg assets are served." });
  let base; let real;
  try {
    base = realpathSync(dir);
    let walk = dir;
    for (const s of segments) {
      walk = join(walk, s);
      if (lstatSync(walk).isSymbolicLink()) throw notFound();
    }
    real = realpathSync(walk);
  } catch { throw notFound(); }
  if (!real.startsWith(base + sep)) throw notFound();
  const stat = statSync(real);
  if (!stat.isFile()) throw notFound();
  if (stat.size > ASSET_LIMIT) throw new HttpError(413, { error: `Asset exceeds ${ASSET_LIMIT} bytes.` });
  return { file: real, type, size: stat.size };
}

/**
 * Stream-free, bounded image response. SVG is sandboxed by CSP so any script inside it never
 * runs, and nosniff stops the browser from reinterpreting any asset as something else.
 * @param {import("node:http").ServerResponse} res @param {string} dir @param {string} rel
 */
export function sendAsset(res, dir, rel) {
  const { file, type } = resolveAsset(dir, rel);
  const body = readFileSync(file);
  res.writeHead(200, {
    "content-type": type,
    "content-length": body.length,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "cache-control": "no-store",
  });
  res.end(body);
}
