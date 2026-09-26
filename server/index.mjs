/**
 * ai-maestro-web-ui server — node:http, no framework, no board logic of its own.
 *
 * Pipeline per request: host guard → content-type guard (writes) → router (reads the body)
 * → error mapper. Paths outside /api fall through to the built UI (static.mjs), still behind
 * the host guard. Callers bind it to 127.0.0.1 (see bin/ai-maestro-web-ui.mjs).
 *
 * Known limit: ai-maestro's board lock waits synchronously (Atomics.wait, up to 10 s), so a
 * write against a board another process holds locked stalls this process until the lock is
 * released or the wait times out (→ 423). Acceptable for a single-user loopback console; the
 * fix is an upstream `timeoutMs` on mutateBoard, not a forked lock.
 */

import { createServer as createHttpServer } from "node:http";
import { isAllowedHost, isAllowedOrigin } from "./hostGuard.mjs";
import { HttpError, WRITE_METHODS, assertJsonContentType, send } from "./http.mjs";
import { match } from "./routes.mjs";
import { toHttp } from "./errors.mjs";
import { loadConfig, refreshConfig } from "./config.mjs";
import { serveStatic, DEFAULT_DIST } from "./static.mjs";

export { loadConfig };

/**
 * @param {{config?: import("./config.mjs").Config, configPath?: string | null, cwd?: string, log?: (msg: string) => void, generated?: boolean, uiDist?: string}} [opts]
 * @returns {import("node:http").Server}
 */
export function createServer(opts = {}) {
  const config = opts.config ?? loadConfig(opts.configPath ?? null, opts.cwd);
  const generated = opts.generated === true;
  const uiDist = opts.uiDist ?? DEFAULT_DIST;
  const log = opts.log ?? ((m) => process.stderr.write(`[ai-maestro-web-ui] ${m}\n`));

  // requireHostHeader off: node would answer a Host-less request with its own 400; the guard
  // below answers it with the same 403 as any other disallowed host.
  return createHttpServer({ requireHostHeader: false }, async (req, res) => {
    try {
      if (!isAllowedHost(req.headers.host, config.allowedHosts)) {
        throw new HttpError(403, { error: "Host not allowed." });
      }
      if (!isAllowedOrigin(/** @type {string | undefined} */ (req.headers.origin), config.allowedHosts)) {
        throw new HttpError(403, { error: "Origin not allowed." });
      }
      const method = req.method ?? "GET";
      if (WRITE_METHODS.has(method)) assertJsonContentType(req);
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      if (pathname !== "/api" && !pathname.startsWith("/api/")) {
        serveStatic(req, res, pathname, uiDist);
        return;
      }
      refreshConfig(config);
      const { handler, params } = match(method, pathname);
      await handler({ req, res, params, config, generated });
    } catch (e) {
      const { status, body, log: msg } = toHttp(e);
      if (msg) log(`${req.method} ${req.url}: ${msg}`);
      if (!res.headersSent) send(res, status, body);
      else res.end();
      // An unread request body would otherwise keep the socket busy.
      if (!req.complete) req.resume();
    }
  });
}
