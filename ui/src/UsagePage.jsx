/**
 * Usage tab (T-010): token usage for one project or the whole portfolio, read from ai-maestro's
 * public usage API through the server. Token counts only — no prices or costs. Headline totals
 * are the canonical complete report; the controls are visibility filters over the breakdowns.
 * A server without the usage endpoint (404/405) shows an explicit "not available" state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { usageUnavailable } from "./shell.js";
import {
  EMPTY_USAGE_FILTERS, TOKEN_CLASSES, filterUsage, safeUsageExport, usageFacets, usageSearch, usageState,
} from "./logic.js";
import { UsagePanels } from "./UsagePanels.jsx";

const TOKEN_LABELS = { total: "Total tokens", input: "Input", output: "Output", cacheRead: "Cache read", cacheWrite: "Cache write", thinking: "Thinking" };
const initialFilters = () => typeof window === "undefined" ? { ...EMPTY_USAGE_FILTERS } : usageState(window.location.search);

function download(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** @param {{scopeId: string | null, title: string}} props */
export function UsagePage({ scopeId, title }) {
  const [state, setState] = useState(/** @type {{status: "loading" | "unavailable" | "error" | "ready", payload?: any, error?: string}} */ ({ status: "loading" }));
  const [filters, setFilters] = useState(initialFilters);

  const load = useCallback(() => {
    let live = true;
    setState({ status: "loading" });
    api.usage(scopeId).then(
      (payload) => { if (live) setState({ status: "ready", payload }); },
      (e) => { if (live) setState(usageUnavailable(e) ? { status: "unavailable" } : { status: "error", error: e.message || "Could not load usage." }); },
    );
    return () => { live = false; };
  }, [scopeId]);
  useEffect(() => load(), [load]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = usageSearch(filters, window.location.search);
    if (search !== window.location.search) window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [filters]);

  const payload = state.status === "ready" && state.payload?.report ? state.payload : null;
  const facets = useMemo(() => usageFacets(payload), [payload]);
  const filtered = useMemo(() => filterUsage(payload, filters), [payload, filters]);
  const set = (/** @type {string} */ key) => (/** @type {any} */ event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const exportJson = () => {
    if (payload) download(`${JSON.stringify(safeUsageExport(payload), null, 2)}\n`, "application/json", `${scopeId || "portfolio"}-usage.json`);
  };

  return <Window title={title} kind="usage" actions={<>
    <button type="button" className="text-btn" onClick={exportJson} disabled={!payload}>Export JSON</button>
    <button type="button" className="text-btn" onClick={load}>Refresh</button>
  </>}>
    {state.status === "loading" && <p className="muted pad loading" role="status">Loading usage…<span className="spinner" aria-hidden="true" /></p>}
    {state.status === "error" && <Notice lines={[state.error ?? ""]} title="Usage failed to load" />}
    {state.status === "unavailable" && <div className="empty-state" role="status">
      <h3>Usage is not available</h3>
      <p>This server has no usage endpoint for this scope.</p>
    </div>}
    {state.status === "ready" && !payload && <p className="muted pad">Usage data is available but in an unrecognised shape.</p>}
    {payload && <div className="usage-layout">
      <form className="usage-filters" aria-label="Usage visibility filters" onSubmit={(event) => event.preventDefault()}>
        <p>Visibility filters <small>Headline totals remain all usage</small></p>
        <label><span>Token class</span><select value={filters.token} onChange={set("token")}>{TOKEN_CLASSES.map((value) => <option key={value} value={value}>{TOKEN_LABELS[value]}</option>)}</select></label>
        <label><span>Provider</span><select value={filters.provider} onChange={set("provider")}><option value="">All providers</option>{facets.providers.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Model</span><select value={filters.model} onChange={set("model")}><option value="">All models</option>{facets.models.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Runtime</span><select value={filters.runtime} onChange={set("runtime")}><option value="">All runtimes</option>{facets.runtimes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Provenance</span><select value={filters.provenance} onChange={set("provenance")}><option value="">All provenance</option>{facets.provenance.map((value) => <option key={value}>{value}</option>)}</select></label>
        {!scopeId && <label><span>Project</span><select value={filters.project} onChange={set("project")}><option value="">All projects</option>{facets.projects.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        <label><span>Ticket</span><select value={filters.ticket} onChange={set("ticket")}><option value="">All tickets</option>{facets.tickets.map(([key, label]) => <option key={key} value={key}>{key} · {label}</option>)}</select></label>
        <label><span>Date</span><select value={filters.date} onChange={set("date")}><option value="">All dates</option>{facets.dates.map((value) => <option key={value}>{value}</option>)}</select></label>
        <button type="button" className="text-btn" onClick={() => setFilters({ ...EMPTY_USAGE_FILTERS })}>Clear filters</button>
      </form>
      <UsagePanels envelope={payload} filtered={filtered} filters={filters} />
    </div>}
  </Window>;
}
