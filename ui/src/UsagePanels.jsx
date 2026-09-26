import { formatTokens, usageMetric } from "./logic.js";

const TOKEN_LABELS = {
  total: "Total", input: "Input", output: "Output", cacheRead: "Cache read",
  cacheWrite: "Cache write", thinking: "Thinking",
};

function Metric({ label, value, prominent = false }) {
  return <div className={`usage-metric ${prominent ? "is-prominent" : ""}`}>
    <dt>{label}</dt><dd>{typeof value === "string" ? value : formatTokens(value)}</dd>
  </div>;
}

function Ranked({ title, rows, tokenClass, identity, empty = "No matching usage." }) {
  return <section className="usage-panel usage-ranking" aria-labelledby={`usage-${identity}`}>
    <h3 id={`usage-${identity}`}>{title}</h3>
    {rows.length === 0 ? <p className="usage-empty">{empty}</p> : <ol>
      {rows.slice(0, 12).map((row) => <li key={`${identity}:${row.projectKey ?? ""}:${row.key ?? row.id}`}>
        <span><strong>{row.label || row.name || row.key || row.id}</strong>{row.id && row.name && <small>{[row.project || row.projectKey, row.id].filter(Boolean).join(" · ")}</small>}</span>
        <span>{formatTokens(usageMetric(row, tokenClass))} <small>{TOKEN_LABELS[tokenClass].toLowerCase()}</small></span>
      </li>)}
    </ol>}
  </section>;
}

export function UsagePanels({ envelope, filtered, filters }) {
  const { report, freshness } = envelope;
  const totals = report.totals?.tokens ?? {};
  const maxTrend = Math.max(1, ...filtered.trend.map((row) => usageMetric(row, filters.token)));
  const coverage = report.coverage ?? {};
  const assignedPercent = coverage.turns ? Math.round((coverage.attributed / coverage.turns) * 100) : null;

  return <>
    <section className="usage-headline" aria-labelledby="usage-all-title">
      <div className="usage-headline-copy">
        <h3 id="usage-all-title">All recorded usage</h3>
        <p>Canonical totals for the complete report. Visibility filters below do not recalculate these headline numbers.</p>
      </div>
      <dl className="usage-metrics">
        <Metric label="Total tokens" value={totals.total} prominent />
        <Metric label="Input" value={totals.input} />
        <Metric label="Output" value={totals.output} />
        <Metric label="Cache read" value={totals.cacheRead} />
        <Metric label="Cache write" value={totals.cacheWrite} />
        <Metric label="Thinking (reported separately)" value={totals.thinking} />
      </dl>
      <p className="usage-freshness">Generated <time dateTime={freshness.generatedAt}>{new Date(freshness.generatedAt).toLocaleString()}</time>
        {freshness.lastObservedAt ? <> · Latest observation <time dateTime={freshness.lastObservedAt}>{new Date(freshness.lastObservedAt).toLocaleString()}</time></> : " · No observations yet"}</p>
    </section>

    <section className="usage-source-note" aria-labelledby="usage-source-title">
      <h3 id="usage-source-title">What these sources mean</h3>
      <div><strong>Orchestration</strong><span>Agent work recorded while delivering tickets, whatever runtime ran it. Provider and model name the model service used; they do not change the provenance.</span></div>
      <div><strong>Application</strong><span>Product or API calls recorded by the application itself, for any provider. They are not agent runs.</span></div>
    </section>

    <div className="usage-grid">
      <section className="usage-panel usage-trend" aria-labelledby="usage-trend-title">
        <h3 id="usage-trend-title">Usage by date</h3>
        {filtered.trend.length === 0 ? <p className="usage-empty">No matching dates.</p> : <ol>
          {filtered.trend.map((row) => <li key={row.key}>
            <time dateTime={row.key}>{row.key}</time>
            <span className="usage-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, (usageMetric(row, filters.token) / maxTrend) * 100)}%` }} /></span>
            <strong>{formatTokens(usageMetric(row, filters.token))}</strong>
          </li>)}
        </ol>}
      </section>
      <Ranked title="Projects" rows={filtered.projects} tokenClass={filters.token} identity="projects" />
      <Ranked title="Tickets" rows={filtered.tickets} tokenClass={filters.token} identity="tickets" />
      <Ranked title="Providers" rows={filtered.providers} tokenClass={filters.token} identity="providers" />
      <Ranked title="Models" rows={filtered.models} tokenClass={filters.token} identity="models" />
    </div>

    <section className="usage-panel usage-coverage" aria-labelledby="usage-coverage-title">
      <h3 id="usage-coverage-title">Coverage and assignment</h3>
      <dl>
        <Metric label="Measured runs" value={coverage.exactRuns} />
        <Metric label="Application calls" value={coverage.applicationCalls} />
        <Metric label="Tickets with usage" value={coverage.ticketsWithUsage} />
        <Metric label="Tickets on board" value={coverage.ticketsOnBoard} />
        <Metric label="Attributed transcript turns" value={coverage.attributed} />
        <Metric label="Transcript attribution" value={assignedPercent === null ? "—" : `${assignedPercent}%`} />
      </dl>
      {!report.enabled?.transcripts && <p className="usage-caveat">Transcript scanning is off. Totals still include recorded telemetry and application usage.</p>}
      {usageMetric(report.unassigned) > 0 && <p className="usage-caveat"><strong>Unassigned orchestration:</strong> {formatTokens(usageMetric(report.unassigned))} tokens could not be tied to a ticket.</p>}
      {report.projectOnly && usageMetric(report.projectOnly) > 0 && <p className="usage-caveat"><strong>Project-only application usage:</strong> {formatTokens(usageMetric(report.projectOnly))} tokens were recorded without a ticket.</p>}
    </section>

    {envelope.unavailableProjects?.length > 0 && <section className="project-errors usage-unavailable" aria-labelledby="usage-unavailable-title">
      <h3 id="usage-unavailable-title">Usage unavailable</h3>
      {envelope.unavailableProjects.map((row) => <p key={row.project.key} className="project-error" role="alert"><strong>{row.project.label || row.project.name}</strong><span>{row.error}</span></p>)}
    </section>}
  </>;
}
