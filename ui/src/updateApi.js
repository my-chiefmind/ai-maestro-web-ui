import { call, callStream } from "./api.js";

/** Update check (cached server-side for a day). */
export const fetchUpdates = () => call("/updates");

/** Manual "Check for updates": asks npm now, ignoring the daily cache. */
export const checkUpdates = () => call("/updates/check", { method: "POST", json: {} });

/** "Up to date" line for a manual check that found nothing newer. */
export function upToDateSummary(status) {
  if (!status || status.available) return null;
  if (status.error) return `Could not check for updates: ${status.error}`;
  const kit = status.projects?.find((p) => p.kit)?.kit;
  const parts = [status.running?.ui && `web UI ${status.running.ui}`, kit && `kit ${kit}`].filter(Boolean);
  return `Everything is up to date${parts.length ? ` (${parts.join(", ")})` : ""}.`;
}

/** "Update available: kit X → Y, web UI A → B" from the server's status, or null when current. */
export function updateSummary(status) {
  if (!status?.available) return null;
  const behind = (status.projects ?? []).filter((p) => status.behind?.includes(p.key));
  const kitFrom = behind.find((p) => p.kitBehind)?.kit;
  const uiFrom = behind.find((p) => p.uiBehind)?.ui ?? status.running?.ui;
  const parts = [];
  if (kitFrom && status.latest?.kit) parts.push(`kit ${kitFrom} → ${status.latest.kit}`);
  if (uiFrom && status.latest?.ui && uiFrom !== status.latest.ui) parts.push(`web UI ${uiFrom} → ${status.latest.ui}`);
  return parts.length ? `Update available: ${parts.join(", ")}` : null;
}

/**
 * Run the update and hand each streamed event to `onEvent`. @param {(ev: any) => void} onEvent
 * @returns {Promise<any>} the final `done` event
 */
export async function runUpdates(onEvent) {
  let done = null;
  await callStream("/updates/run", { method: "POST", json: {} }, (ev) => { onEvent(ev); if (ev.type === "done") done = ev; });
  if (!done) throw new Error("Update stream ended without a result.");
  return done;
}

/** Poll until the restarted server answers, then resolve. */
export async function waitForServer({ intervalMs = 1000, timeoutMs = 120_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const start = Date.now();
  await sleep(intervalMs);
  while (Date.now() - start < timeoutMs) {
    try { await call("/config"); return true; } catch { /* still restarting */ }
    await sleep(intervalMs);
  }
  return false;
}
