/** The rail (dock): every configured board with its counts; a broken board shows its error in place. */
import { useEffect, useRef, useState } from "react";
import { formatTokens, total } from "./logic.js";
import { dailyTokens, msToNextUtcDay, queuedProjectTokens, rankTicketsByTokens, tokenWindows, utcDay } from "./overviewTokensApi.js";
import { TokenTrend } from "./TokenTrend.jsx";
import { TicketTokenList } from "./TicketTokenList.jsx";
import { usageUnavailable } from "./shell.js";
import "./overviewTokens.css";

const Icon = {
  refresh: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" /></svg>,
  pulse: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 8h3l2-4.5 3 9 2-4.5h3" /></svg>,
  plus: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>,
  system: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="8.5" rx="1.5" /><path d="M6 14h4" /></svg>,
  light: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></svg>,
  collapse: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M6 2.5v11" /></svg>,
  list: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.5" cy="4" r="0.6" /><circle cx="2.5" cy="8" r="0.6" /><circle cx="2.5" cy="12" r="0.6" /></svg>,
  dark: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" /></svg>,
};

/**
 * T-017: a project card's token usage — 7d / 30d / all-time totals and a 14-day trend; when the
 * project is the open view, its tickets ranked by tokens. Token counts only.
 * `version` changes (rail refresh, UTC day rollover) reload the card while the previous values
 * stay visible; `enabled=false` (desktop rail collapsed) defers fetching until it is shown.
 * @param {{ id: string, name: string, active: boolean, version?: string | number, enabled?: boolean,
 *   load?: (id: string) => Promise<any> }} props
 */
export function ProjectTokens({ id, name, active, version = 0, enabled = true, load = queuedProjectTokens }) {
  const [state, setState] = useState(/** @type {{id: string, report?: any, error?: string} | null} */ (null));
  const loaded = useRef(/** @type {string | null} */ (null));
  const want = `${id}\u0000${version}`;
  useEffect(() => {
    if (!enabled || loaded.current === want) return undefined;
    let live = true;
    load(id).then((env) => { if (live) { loaded.current = want; setState({ id, report: env?.report ?? null }); } },
      (e) => { if (live) { loaded.current = want; setState({ id, error: usageUnavailable(e) ? "Token usage unavailable" : "Token usage could not be read" }); } });
    return () => { live = false; };
  }, [id, want, enabled, load]);
  // A different project never shows the previous project's numbers; a refresh of the same one does.
  const shown = state && state.id === id ? state : null;

  let body;
  if (!shown) body = <p className="ot-state" role="status">Loading tokens…</p>;
  else if (shown.error || !shown.report) body = <p className="ot-state is-error"><span className="ot-err-mark" aria-hidden="true">!</span>{shown.error || "Token usage unavailable"}</p>;
  else {
    const w = tokenWindows(shown.report);
    body = <>
      <dl className="ot-windows">
        <div><dt>7d</dt><dd>{formatTokens(w.d7)}</dd></div>
        <div><dt>30d</dt><dd>{formatTokens(w.d30)}</dd></div>
        <div><dt>All</dt><dd>{formatTokens(w.all)}</dd></div>
      </dl>
      {w.all === 0 ? <p className="ot-state">No tokens recorded yet.</p>
        : <TokenTrend days={dailyTokens(shown.report, 14)} label={`${name} tokens per day, last 14 days`} />}
      {active && w.all > 0 && <>
        <p className="ot-tickets-title" aria-hidden="true">Top tickets by tokens</p>
        <TicketTokenList tickets={rankTicketsByTokens(shown.report)} label={`${name} tickets ranked by tokens`} />
      </>}
    </>;
  }
  return <section className="ot-card" aria-label={`${name} token usage`}>{body}</section>;
}

/**
 * @param {{rail: any[] | null, error: string | null, active: string | null, operationsActive?: boolean, mode?: {kind: string, label: string, title: string} | null,
 *   theme?: string, onTheme?: () => void, collapsed?: boolean, onCollapse?: () => void,
 *   onOperations: () => void, onOpen: (id: string) => void, onAdd: () => void, onRefresh: () => void,
 *   onProjects?: () => void, projectsActive?: boolean}} props
 */
/** The current UTC day, re-rendering at each UTC midnight so rolling windows move forward. */
function useUtcDay() {
  const [day, setDay] = useState(() => utcDay(Date.now()));
  useEffect(() => {
    const t = setTimeout(() => setDay(utcDay(Date.now())), msToNextUtcDay() + 1000);
    return () => clearTimeout(t);
  }, [day]);
  return day;
}

/** The desktop rail hides token cards when collapsed; the phone rail always shows them. */
const desktopWidth = () => typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 761px)").matches;

export function Rail({ rail, error, active, operationsActive, single = false, mode, theme = "system", onTheme, collapsed = false, onCollapse, onOperations, onOpen, onAdd, onRefresh, onProjects, projectsActive = false, onCheckUpdates }) {
  const [refreshes, setRefreshes] = useState(0);
  const day = useUtcDay();
  const tokensVersion = `${refreshes}:${day}`;
  const tokensEnabled = !(collapsed && desktopWidth());
  const refresh = () => { setRefreshes((n) => n + 1); onRefresh(); };
  return (
    <aside className={`rail ${collapsed ? "is-collapsed" : ""}`} aria-label="Projects">
      <div className="rail-head">
        <span className="brand" aria-hidden="true"><img src="./logo.png" alt="" width="26" height="26" decoding="async" /></span>
        {onCollapse && (
          <button type="button" className="icon-btn rail-toggle" aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"} title={collapsed ? "Expand menu" : "Collapse menu"} onClick={onCollapse}>
            {Icon.collapse}
          </button>
        )}
        <span className="rail-title">Maestro</span>
        {mode && <span className={`mode-tag mode-${mode.kind}`} title={mode.title} aria-label={`${mode.label} mode. ${mode.title}`}>{mode.label}</span>}
        {onTheme && (
          <button type="button" className="icon-btn theme-btn" aria-label={`Theme: ${theme}. Switch theme`} title={`Theme: ${theme}`} onClick={onTheme}>
            {Icon[theme] ?? Icon.system}
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Refresh boards" onClick={refresh}>{Icon.refresh}</button>
      </div>
      {!single && <>
        <button type="button" className={`rail-operations ${operationsActive ? "is-active" : ""}`} onClick={onOperations}
          aria-current={operationsActive ? "page" : undefined} title="All projects">{Icon.pulse} <span className="rail-label">All projects</span></button>
        <div className="rail-section" aria-hidden="true">Projects</div>
      </>}
      {error && <p className="rail-error" role="alert">Could not list boards: {error}</p>}
      {!rail && !error && <p className="rail-loading loading">Loading…<span className="spinner" aria-hidden="true" /></p>}
      <ul className="rail-list">
        {rail?.map((b, i) => (
          <li key={b.id} className="reveal" style={{ "--i": i }}>
            {b.error ? (
              <div className="rail-item is-broken" title={b.error}>
                <span className="rail-name">{b.name}</span>
                <span className="rail-err">{b.error}</span>
              </div>
            ) : (
              <button type="button" className={`rail-item ${active === b.id ? "is-active" : ""}`} onClick={() => onOpen(b.id)}
                aria-current={active === b.id ? "true" : undefined} title={b.name}>
                <span className="rail-initial" aria-hidden="true">{String(b.name).slice(0, 2)}</span>
                <span className="rail-name">{b.name}</span>
                <span className="rail-total" aria-label={`${total(b.counts)} tickets`}>{total(b.counts)}</span>
                <span className="rail-counts">
                  {["in-progress", "review", "blocked"].map((s) => b.counts?.[s] ? (
                    <span key={s} className={`chip st-${s}`}>{b.counts[s]} {s}</span>
                  ) : null)}
                </span>
              </button>
            )}
            {!b.error && <ProjectTokens id={b.id} name={b.name} active={active === b.id} version={tokensVersion} enabled={tokensEnabled} />}
          </li>
        ))}
      </ul>
      {onAdd && <button type="button" className="rail-add" onClick={onAdd} title="Add board">{Icon.plus} <span className="rail-label">Add board</span></button>}
      {onProjects && (
        <button type="button" className={`rail-manage ${projectsActive ? "is-active" : ""}`} onClick={onProjects} title="Manage projects"
          aria-current={projectsActive ? "page" : undefined}>{Icon.list} <span className="rail-label">Manage projects</span></button>
      )}
      {onCheckUpdates && (
        <button type="button" className="rail-manage" onClick={onCheckUpdates} title="Check for updates">
          {Icon.refresh} <span className="rail-label">Check for updates</span></button>
      )}
    </aside>
  );
}
