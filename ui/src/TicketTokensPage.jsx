import { useCallback, useEffect, useMemo, useState } from "react";
import "./ticketTokens.css";
import { fetchTicketTokens } from "./ticketTokensApi.js";
import { formatTokens } from "./logic.js";
import { Notice } from "./Window.jsx";
import { usageUnavailable } from "./shell.js";

export const TOKEN_COLUMNS = Object.freeze([
  ["input", "Input"], ["output", "Output"], ["cacheRead", "Cache read"],
  ["cacheWrite", "Cache write"], ["thinking", "Reasoning"], ["total", "Total"],
]);
const SORTABLE = new Set(TOKEN_COLUMNS.map(([key]) => key));

// Recorded telemetry ("exact") and application-reported calls are measured. Transcript
// attribution (high/medium confidence) is inferred. The report keeps the weakest confidence
// of a ticket's sources, so any inferred source marks the whole row inferred.
const MEASURED = new Set(["exact", "application"]);
export const provenanceOf = (confidence) => (MEASURED.has(confidence) ? "measured" : "inferred");

/** Flatten a usage envelope into visible per-ticket rows. */
export function ticketTokenRows(envelope) {
  const report = envelope?.report;
  if (!report) return [];
  const names = new Map((envelope.projects ?? []).map((p) => [p.key, p.label || p.name || p.key]));
  const single = envelope.project;
  return (report.tickets ?? []).map((ticket) => {
    const projectKey = ticket.projectKey || single?.key || single?.id || "";
    const tokens = ticket.metrics?.tokens ?? {};
    return {
      key: `${projectKey}:${ticket.id}`, id: ticket.id, name: ticket.name || ticket.id, projectKey,
      project: ticket.project || names.get(projectKey) || single?.label || single?.name || projectKey,
      provenance: provenanceOf(ticket.confidence),
      ...Object.fromEntries(TOKEN_COLUMNS.map(([key]) => [key, Number(tokens[key] ?? 0)])),
    };
  });
}

export function sortTicketRows(rows, sort) {
  const key = SORTABLE.has(sort?.key) ? sort.key : "total";
  const dir = sort?.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => (a[key] - b[key]) * dir || a.key.localeCompare(b.key));
}

const zero = () => Object.fromEntries(TOKEN_COLUMNS.map(([key]) => [key, 0]));
const add = (sum, row) => { for (const [key] of TOKEN_COLUMNS) sum[key] += row[key]; return sum; };

/** Per-project subtotals plus a grand total over the ticket rows (portfolio view). */
export function aggregateByProject(rows) {
  const byProject = new Map();
  for (const row of rows) {
    if (!byProject.has(row.projectKey)) byProject.set(row.projectKey, { projectKey: row.projectKey, project: row.project, tickets: 0, ...zero() });
    const agg = byProject.get(row.projectKey);
    agg.tickets += 1; add(agg, row);
  }
  const projects = [...byProject.values()].sort((a, b) => b.total - a.total || a.projectKey.localeCompare(b.projectKey));
  return { projects, total: rows.reduce(add, zero()) };
}

const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV of exactly the visible table, in its current order. */
export function ticketTokensCsv(rows) {
  const header = ["project", "ticket", "name", ...TOKEN_COLUMNS.map(([, label]) => label.toLowerCase().replace(/ /g, "_")), "source"];
  const lines = [header, ...rows.map((r) => [r.project, r.id, r.name, ...TOKEN_COLUMNS.map(([key]) => r[key]), r.provenance])];
  return `${lines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.hidden = true;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function SortHeader({ column, label, sort, onSort }) {
  const active = sort.key === column;
  const next = active && sort.dir === "desc" ? "ascending" : "descending";
  return <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" className="tt-sort" onClick={() => onSort(column)} aria-label={`Sort by ${label}, ${next}`}>
      {label}{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </button>
  </th>;
}

/**
 * Token usage per ticket. `scopeId` null = "All projects" portfolio view.
 * @param {{ scopeId?: string | null, title?: string, load?: (scopeId: string | null) => Promise<any> }} props
 */
export function TicketTokensPage({ scopeId = null, title = "Ticket tokens", load = fetchTicketTokens }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  const refresh = useCallback(async () => {
    setPayload(null); setError("");
    try { setPayload(await load(scopeId || null)); }
    catch (e) { setError(usageUnavailable(e) ? "This server has no usage endpoint for this scope." : e?.message || "Token usage is unavailable."); }
  }, [scopeId, load]);
  useEffect(() => { refresh(); }, [refresh]);

  const rows = useMemo(() => sortTicketRows(ticketTokenRows(payload), sort), [payload, sort]);
  const portfolio = !scopeId;
  const summary = useMemo(() => aggregateByProject(rows), [rows]);
  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const exportCsv = () => download(ticketTokensCsv(rows), `${scopeId || "portfolio"}-ticket-tokens.csv`);

  return <section className="tt-page" aria-labelledby="tt-title">
    <header className="tt-head">
      <div>
        <h2 id="tt-title">{title}</h2>
        <p>{portfolio ? "Token counts per ticket across all active projects." : "Token counts per ticket for this project."}</p>
      </div>
      <div className="tt-actions">
        <button type="button" className="text-btn" onClick={exportCsv} disabled={rows.length === 0}>Export CSV</button>
        <button type="button" className="text-btn" onClick={refresh}>Refresh</button>
      </div>
    </header>
    {error && <Notice lines={[error]} title="Token usage unavailable" />}
    {!payload && !error && <p className="tt-state" role="status">Loading token usage…</p>}
    {payload && rows.length === 0 && <p className="tt-state" role="status">No ticket token usage recorded yet.</p>}
    {rows.length > 0 && <>
      {portfolio && <section className="tt-projects" aria-labelledby="tt-projects-title">
        <h3 id="tt-projects-title">By project</h3>
        <div className="tt-scroll" tabIndex={0} role="region" aria-label="Per-project token totals">
          <table className="tt-table">
            <thead><tr><th scope="col">Project</th><th scope="col">Tickets</th>{TOKEN_COLUMNS.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
            <tbody>{summary.projects.map((p) => <tr key={p.projectKey}>
              <th scope="row">{p.project}</th><td>{p.tickets}</td>
              {TOKEN_COLUMNS.map(([key]) => <td key={key}>{formatTokens(p[key])}</td>)}
            </tr>)}</tbody>
            <tfoot><tr><th scope="row">All projects</th><td>{rows.length}</td>{TOKEN_COLUMNS.map(([key]) => <td key={key}>{formatTokens(summary.total[key])}</td>)}</tr></tfoot>
          </table>
        </div>
      </section>}
      <div className="tt-scroll" tabIndex={0} role="region" aria-label="Per-ticket token table">
        <table className="tt-table">
          <caption>Measured = recorded telemetry or application calls. Inferred = attributed from transcripts.</caption>
          <thead><tr>
            <th scope="col">Ticket</th>
            {portfolio && <th scope="col" className="tt-left">Project</th>}
            {TOKEN_COLUMNS.map(([key, label]) => <SortHeader key={key} column={key} label={label} sort={sort} onSort={onSort} />)}
            <th scope="col" className="tt-left">Source</th>
          </tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key}>
            <th scope="row" className="tt-left">{r.id}<span className="tt-name">{r.name}</span></th>
            {portfolio && <td className="tt-left">{r.project}</td>}
            {TOKEN_COLUMNS.map(([key]) => <td key={key}>{formatTokens(r[key])}</td>)}
            <td className="tt-left"><span className={`tt-marker tt-${r.provenance}`}>{r.provenance}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    {payload?.unavailableProjects?.length > 0 && <div className="tt-errors" role="alert">
      {payload.unavailableProjects.map((row) => <p key={row.project.key}><strong>{row.project.label || row.project.name}</strong>: {row.error}</p>)}
    </div>}
  </section>;
}
