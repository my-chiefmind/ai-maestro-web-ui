import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import {
  EMPTY_OPERATIONS_FILTERS, OPERATION_BUCKETS, filterOperations, operationsFacets, operationsState,
} from "./logic.js";
import { mergeSearch } from "./shell.js";

const initialFilters = () => typeof window === "undefined" ? { ...EMPTY_OPERATIONS_FILTERS } : operationsState(window.location.search);

export function OperationsWindow({ title, onClose, primary, onOpenTicket, onOpenArchive, refreshTick = 0 }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(initialFilters);

  const load = useCallback(async () => {
    setPayload(null); setError("");
    try { setPayload(await api.operations()); }
    catch (e) { setError(e.message || "Could not load operations."); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Background reload on an external refresh signal: swap data in without clearing it first,
  // so there is no loading flash and filters, scroll, and focus are untouched.
  const firstTick = useRef(refreshTick);
  useEffect(() => {
    if (refreshTick === firstTick.current) return;
    let live = true;
    api.operations().then((next) => { if (live) { setPayload(next); setError(""); } }, () => {});
    return () => { live = false; };
  }, [refreshTick]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = mergeSearch(window.location.search, Object.keys(EMPTY_OPERATIONS_FILTERS), filters, { view: "all" });
      window.history.replaceState(null, "", `${window.location.pathname}${search}`);
    }
  }, [filters]);

  const filtered = useMemo(() => filterOperations(payload?.buckets, filters), [payload, filters]);
  const facets = useMemo(() => operationsFacets(payload), [payload]);
  const visibleCount = OPERATION_BUCKETS.reduce((sum, [key]) => sum + (filtered[key]?.length ?? 0), 0);
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const clear = () => setFilters({ ...EMPTY_OPERATIONS_FILTERS });

  return <Window title={title} kind="operations" onClose={onClose} primary={primary}
    actions={<button type="button" className="text-btn" onClick={load}>Refresh</button>}>
    <div className="operations-layout">
      <form className="operations-filters" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="search-field"><span>Search</span><input type="search" value={filters.q} onChange={set("q")} placeholder="Project, ticket, title, description" /></label>
        <label><span>View</span><select value={filters.view} onChange={set("view")}><option value="all">All buckets</option>{OPERATION_BUCKETS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>Project</span><select value={filters.project} onChange={set("project")}><option value="">All projects</option>{facets.projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label><span>Area</span><select value={filters.area} onChange={set("area")}><option value="">All areas</option>{facets.areas.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Priority</span><select value={filters.priority} onChange={set("priority")}><option value="">All priorities</option>{facets.priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Status</span><select value={filters.status} onChange={set("status")}><option value="">All statuses</option>{facets.statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        <button type="button" className="text-btn filters-clear" onClick={clear}>Clear filters</button>
      </form>

      {error && <Notice lines={[error]} />}
      {!payload && !error && <p className="operations-state loading" role="status">Loading operations…<span className="spinner" aria-hidden="true" /></p>}
      {payload?.errors?.length > 0 && <section className="project-errors" aria-labelledby="project-errors-title">
        <h3 id="project-errors-title">Projects needing attention</h3>
        {payload.errors.map((row) => <p key={row.project.id} className="project-error" role="alert"><strong>{row.project.name}</strong><span>{row.error}</span></p>)}
      </section>}
      {payload && visibleCount === 0 && <div className="operations-state"><p>No work matches this view.</p><button type="button" className="text-btn" onClick={clear}>Show all operations</button></div>}
      {payload && visibleCount > 0 && <div className="operations-buckets">
        {OPERATION_BUCKETS.map(([key, label], bucketIndex) => filtered[key]?.length ? <section className={`operations-bucket bucket-${key}`} key={key} style={{ "--i": bucketIndex }} aria-labelledby={`bucket-${key}`}>
          <header><h3 id={`bucket-${key}`}>{label}</h3><span aria-label={`${filtered[key].length} tickets`}>{filtered[key].length}</span></header>
          <ul>{filtered[key].map((row, i) => {
            const identity = `${row.project.id}:${row.ticket.id}`;
            const action = key === "recentlyLanded" ? () => onOpenArchive(row.project.id) : () => onOpenTicket(row.project.id, row.ticket.id);
            return <li key={identity} className="reveal" style={{ "--i": i }}><button type="button" className="operation-card" onClick={action}>
              <span className="operation-project">{row.project.name}</span>
              <span className="operation-id">{row.ticket.id}</span>
              <strong>{row.ticket.name}</strong>
              {row.ticket.desc && <span className="operation-desc">{row.ticket.desc}</span>}
              <span className="operation-meta">{[row.ticket.priority, row.ticket.area, row.ticket.status].filter(Boolean).join(" · ")}</span>
              {row.eligibility?.reasons?.length > 0 && <span className="operation-reasons">{row.eligibility.reasons.map((reason) => reason.message).join(" · ")}</span>}
            </button></li>;
          })}</ul>
        </section> : null)}
      </div>}
    </div>
  </Window>;
}
