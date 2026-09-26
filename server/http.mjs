/**
 * http.mjs — request/response plumbing for node:http. No framework, no CORS headers (a
 * cross-origin page gets nothing it can read, and a JSON write forces a preflight it fails).
 */

export const BODY_LIMIT = 1024 * 1024; // 1 MiB

/** An error that already knows its HTTP status and JSON body. */
export class HttpError extends Error {
  /** @param {number} status @param {Record<string, any>} body */
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

/** Methods that change state and therefore must carry a JSON body type. */
export const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Refuse a write whose Content-Type is not application/json. A form post or a `no-cors` fetch
 * cannot send that type without a preflight, so this is also the CSRF guard.
 * @param {import("node:http").IncomingMessage} req
 */
export function assertJsonContentType(req) {
  const ct = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json") {
    throw new HttpError(415, { error: "Writes require Content-Type: application/json." });
  }
}

/**
 * Read and parse a JSON body, bounded. An empty body is `{}`.
 * @param {import("node:http").IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<any>}
 */
export async function readJson(req, limit = BODY_LIMIT) {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    req.resume();
    throw new HttpError(413, { error: `Request body exceeds ${limit} bytes.` });
  }
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      throw new HttpError(413, { error: `Request body exceeds ${limit} bytes.` });
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, { error: "Request body is not valid JSON." });
  }
}

const BASE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

/** @param {import("node:http").ServerResponse} res @param {number} status @param {any} body */
export function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...BASE_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

/** @param {import("node:http").ServerResponse} res @param {number} status @param {string} text @param {string} type */
export function sendText(res, status, text, type, extraHeaders = {}) {
  res.writeHead(status, {
    ...BASE_HEADERS,
    ...extraHeaders,
    "content-type": `${type}; charset=utf-8`,
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * Refuse any key not in `allowed` — the edge rejects what it does not understand instead of
 * silently dropping it.
 * @param {any} obj @param {string[]} allowed @param {string} what
 */
export function onlyKeys(obj, allowed, what) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new HttpError(400, { error: `${what} must be a JSON object.` });
  }
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new HttpError(400, { error: `Unknown field(s) in ${what}: ${unknown.join(", ")}. Allowed: ${allowed.join(", ")}.` });
  }
  return obj;
}
