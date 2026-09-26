/** Project plan tab, All projects: every readable project's goal, gap counts and plan size. */
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { planOverview } from "./shell.js";
import { planSummary } from "./logic.js";

/** @param {{rail: any[] | null, title: string, onOpenProject: (id: string) => void}} props */
export function PlanOverviewPage({ rail, title, onOpenProject }) {
  const [rows, setRows] = useState(/** @type {any[] | null} */ (null));
  const ids = (rail ?? []).filter((b) => !b.error).map((b) => b.id).join("\0");

  useEffect(() => {
    let live = true;
    setRows(null);
    const boards = (rail ?? []).filter((b) => !b.error);
    Promise.all(boards.map((b) => api.plan(b.id).then(
      (snapshot) => ({ project: b, overview: planOverview(snapshot), percent: planSummary(snapshot.plan).completeness.percent, error: "" }),
      (e) => ({ project: b, overview: null, error: e.message || "Plan unavailable." }),
    ))).then((value) => { if (live) setRows(value); });
    return () => { live = false; };
  }, [ids]);

  const broken = (rail ?? []).filter((b) => b.error);
  return <Window title={title} kind="plan">
    {!rail && <p className="muted pad loading">Loading projects…<span className="spinner" aria-hidden="true" /></p>}
    {rail && !rows && <p className="muted pad loading">Loading plans…<span className="spinner" aria-hidden="true" /></p>}
    {broken.length > 0 && <Notice tone="warn" title="Projects needing attention" lines={broken.map((b) => `${b.name}: ${b.error}`)} />}
    {rows && rows.length === 0 && <p className="muted pad">No readable projects.</p>}
    {rows && rows.length > 0 && <ul className="plan-overview" aria-label="Project plans">
      {rows.map((row, i) => (
        <li key={row.project.id} className="reveal" style={{ "--i": i }}>
          <button type="button" className="plan-card" onClick={() => onOpenProject(row.project.id)}>
            <span className="operation-project">{row.project.name}</span>
            {row.error ? <span className="plan-goal muted">{row.error}</span> : <>
              <span className="plan-goal">{row.overview.goal || "No goal set yet."}</span>
              <span className="plan-stats">
                <span className={`badge ${row.percent === 100 ? "badge-ok" : "badge-warn"}`}>{row.percent}% complete</span>
                <span className={`badge ${row.overview.gaps.open ? "badge-warn" : "badge-ok"}`}>{row.overview.gaps.open} open gap{row.overview.gaps.open === 1 ? "" : "s"}</span>
                <span className="muted small">{row.overview.gaps.total} total · {row.overview.deliverables} deliverables · {row.overview.risks} risks</span>
              </span>
            </>}
          </button>
        </li>
      ))}
    </ul>}
  </Window>;
}
