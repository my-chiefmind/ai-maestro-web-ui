/**
 * hostGuard.mjs — anti-DNS-rebinding. The server binds 127.0.0.1, but a browser will happily
 * send a page from `evil.com` (re-pointed at 127.0.0.1) to it; the Host header is what gives
 * that away. Loopback names are always allowed; anything else must be listed exactly in the
 * config's `allowedHosts` (e.g. a dev-gateway name like `mw.loc`).
 */

/**
 * Hostname of a Host header value, lowercased, port stripped. `[::1]:3021` → `[::1]`.
 * Parsed strictly: `[addr]` or `name`, optionally followed by `:<digits>`, and nothing else.
 * Anything malformed (`[::1]evil`, `127.0.0.1:1@evil.com`, `localhost:`) yields "" — refused.
 * @param {string} host
 */
export function hostnameOf(host) {
  const h = String(host).trim().toLowerCase();
  const m = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d+)?$/.exec(h);
  return m ? m[1] : "";
}

/** @param {string} name @param {string[]} allowedHosts */
export function isAllowedHostname(name, allowedHosts = []) {
  if (!name) return false;
  if (name === "localhost" || name === "127.0.0.1" || name === "[::1]") return true;
  if (name.endsWith(".localhost") && name.length > ".localhost".length) return true;
  return allowedHosts.map((a) => String(a).toLowerCase()).includes(name);
}

/**
 * @param {string | undefined} hostHeader
 * @param {string[]} [allowedHosts]
 */
export function isAllowedHost(hostHeader, allowedHosts = []) {
  if (!hostHeader) return false;
  return isAllowedHostname(hostnameOf(hostHeader), allowedHosts);
}

/**
 * An `Origin` header, when present, must name an allowed host too — a cross-site page that
 * somehow got the Host right still cannot drive writes. Absent Origin (curl, same-origin GET)
 * passes.
 * @param {string | undefined} origin @param {string[]} [allowedHosts]
 */
export function isAllowedOrigin(origin, allowedHosts = []) {
  if (origin === undefined) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return isAllowedHostname(u.hostname.toLowerCase(), allowedHosts);
  } catch {
    return false; // includes the literal "null" origin
  }
}
