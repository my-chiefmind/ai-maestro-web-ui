/**
 * autoRefresh.js — cockpit parity: notice when agents change a board on disk.
 * Polls the (already allowlisted) board list, which carries each board's `version`, so one
 * cheap request covers the active project, "All projects", and the rail counts at once.
 * Framework-free and clock-injectable so it is unit-testable with fake timers.
 */

/**
 * Board ids whose version differs from the previous poll (new or vanished boards count too).
 * @param {Map<string, string | undefined> | null} prev
 * @param {Map<string, string | undefined>} next
 * @returns {string[]}
 */
export function changedBoards(prev, next) {
  if (!prev) return [];
  const ids = new Set([...prev.keys(), ...next.keys()]);
  return [...ids].filter((id) => prev.get(id) !== next.get(id));
}

/**
 * Split changed boards into those safe to reload and those with unsaved edits (notice only).
 * @param {string[]} changed
 * @param {{ cached: Iterable<string>, dirty: Iterable<string> }} ctx
 * @returns {{ reload: string[], notice: string[] }}
 */
export function planRefresh(changed, { cached, dirty }) {
  const c = new Set(cached);
  const d = new Set(dirty);
  const relevant = changed.filter((id) => c.has(id));
  return { reload: relevant.filter((id) => !d.has(id)), notice: relevant.filter((id) => d.has(id)) };
}

/**
 * Start polling. Pauses while the document is hidden (resuming with an immediate poll),
 * doubles the delay on errors up to `maxIntervalMs`, and stops for good on `stop()`.
 * @param {{
 *   fetchList: () => Promise<Array<{id: string, version?: string}>>,
 *   onChange: (changed: string[], list: Array<{id: string, version?: string}>) => void,
 *   intervalMs?: number, maxIntervalMs?: number,
 *   timers?: { setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout },
 *   doc?: { visibilityState: string, addEventListener: Function, removeEventListener: Function } | null,
 * }} opts
 * @returns {{ stop: () => void }}
 */
export function startBoardPoller({ fetchList, onChange, intervalMs = 5000, maxIntervalMs = 60000, timers = globalThis, doc = globalThis.document ?? null }) {
  /** @type {Map<string, string | undefined> | null} */
  let last = null;
  let delay = intervalMs;
  let stopped = false;
  let inflight = false;
  /** @type {any} */
  let timer = null;
  const hidden = () => !!doc && doc.visibilityState === "hidden";

  const schedule = () => {
    if (stopped || hidden()) return;
    timers.clearTimeout(timer);
    timer = timers.setTimeout(tick, delay);
  };

  async function tick() {
    timer = null;
    if (stopped || hidden() || inflight) return;
    inflight = true;
    try {
      const list = await fetchList();
      if (stopped) return;
      const next = new Map(list.map((b) => [b.id, b.version]));
      const changed = changedBoards(last, next);
      last = next;
      delay = intervalMs;
      if (changed.length) onChange(changed, list);
    } catch {
      delay = Math.min(delay * 2, maxIntervalMs);
    } finally {
      inflight = false;
    }
    schedule();
  }

  const onVisibility = () => {
    if (stopped) return;
    if (hidden()) { timers.clearTimeout(timer); timer = null; }
    else if (!timer && !inflight) tick();
  };
  doc?.addEventListener("visibilitychange", onVisibility);
  schedule();

  return {
    stop() {
      stopped = true;
      timers.clearTimeout(timer);
      timer = null;
      doc?.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
