/**
 * static.mjs — serve the built SPA (ui/dist) for every non-/api GET/HEAD. Runs after the host
 * guard. ui/dist is resolved relative to this module, never the cwd.
 *
 * Containment: the decoded path is resolved lexically inside ui/dist, then its realpath must
 * still be inside realpath(ui/dist) — so `..`, `%2e%2e`, and symlinks pointing out all miss.
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "./http.mjs";

export const DEFAULT_DIST = fileURLToPath(new URL("../ui/dist", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const NOT_BUILT = "UI not built — run npm run build";

/** Vite's content-hashed asset names (e.g. index-B1a2c3D4.js). @param {string} p */
const isHashed = (p) => /[-.][A-Za-z0-9_]{8,}\.[a-z0-9]+$/.test(p) && p.includes(`${sep}assets${sep}`);

/** @param {string} p */
function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} pathname raw (still percent-encoded) URL pathname
 * @param {string} [dist]
 */
export function serveStatic(req, res, pathname, dist = DEFAULT_DIST) {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") throw new HttpError(405, { error: `${method} is not allowed on ${pathname}.` });

  let realDist;
  try { realDist = realpathSync(dist); } catch { throw new HttpError(404, { error: NOT_BUILT }); }
  const index = resolve(realDist, "index.html");
  if (!isFile(index)) throw new HttpError(404, { error: NOT_BUILT });

  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, { error: "Malformed URL encoding." }); }
  if (decoded.includes("\0") || decoded.includes("\\")) throw new HttpError(400, { error: "Invalid path." });
  const segments = decoded.split("/");
  if (segments.some((s) => s === ".." || s === ".")) throw new HttpError(400, { error: "Invalid path." });

  let file = index;
  const rel = segments.filter(Boolean).join(sep);
  if (rel) {
    const candidate = resolve(realDist, rel);
    if (!candidate.startsWith(realDist + sep)) throw new HttpError(400, { error: "Invalid path." });
    let real = null;
    try { real = realpathSync(candidate); } catch { /* missing or dangling */ }
    if (real !== null && !(real === realDist || real.startsWith(realDist + sep))) {
      throw new HttpError(404, { error: `No file ${pathname}.` });
    }
    if (real !== null && isFile(real)) file = real;
    else if (extname(decoded)) throw new HttpError(404, { error: `No file ${pathname}.` });
    // else: extensionless unknown path → SPA fallback to index.html
  }

  const body = readFileSync(file);
  const type = TYPES[/** @type {keyof typeof TYPES} */ (extname(file).toLowerCase())] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": body.length,
    "x-content-type-options": "nosniff",
    "cache-control": file === index || !isHashed(file) ? "no-store" : "public, max-age=31536000, immutable",
  });
  res.end(method === "HEAD" ? undefined : body);
}
