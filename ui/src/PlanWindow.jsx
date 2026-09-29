/**
 * Plan tab for one project (T-015, old-dashboard parity): completeness, coverage, initiative progress,
 * section-by-section editing through targeted plan operations (each sent with the plan version
 * read — compare-and-swap), and trace pickers that set a ticket's `traces_to`.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "./api.js";
import { planApi } from "./planApi.js";
import { Window, Notice } from "./Window.jsx";
import { errorLines, planSummary, PLAN_SECTION_LIST, shortVersion, traceOptions } from "./logic.js";
import { GapsSection, GoalSection, InitiativesSection, ListSection, ProgressBar, ScopeSection } from "./PlanSections.jsx";
import { TracePicker } from "./PlanSectionTraces.jsx";
import { PlanOperationEditor } from "./PlanSectionOperations.jsx";
import "./plan.css";

export function PlanWindow({ win, title, primary, onClose }) {
  const [data, setData] = useState(/** @type {{plan: any, board: any} | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [errors, setErrors] = useState(/** @type {string[]} */ ([]));
  const [conflict, setConflict] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = () => planApi.load(win.boardId).then((value) => { setData(value); setError(null); }, (e) => setError(e.message || "Plan unavailable."));
  useEffect(() => { setData(null); setEditing(false); setErrors([]); setConflict(null); load(); }, [win.boardId]);

  const summary = useMemo(() => data && planSummary(data.plan.plan, data.board?.tickets ?? [], data.board?.archived ?? []), [data]);
  const coverageById = useMemo(() => new Map((summary?.coverage ?? []).map((r) => [r.id, r])), [summary]);

  /** Shared write path: success reloads; 409 reloads and says so; the caller keeps its draft on false. */
  async function write(kind, send) {
    setBusy(true); setErrors([]);
    try {
      const result = await send();
      await load(); setConflict(null);
      if (result?.warnings?.length) setErrors(result.warnings);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(kind === "plan"
          ? "The plan changed since you loaded it. The latest plan is loaded and your draft is preserved — review it, then save again."
          : "The board changed since you loaded it. The latest tickets are loaded and your trace selection is preserved — review it, then save again.");
        // A plan 409 carries the fresh plan; hydrate from it rather than re-reading.
        if (kind === "plan" && e.body.plan?.version) setData((d) => d && { ...d, plan: e.body.plan });
        else await load();
      } else setErrors(e instanceof ApiError ? errorLines(e) : [String(e)]);
      return false;
    } finally { setBusy(false); }
  }
  const run = (operation, params) => write("plan", () => planApi.apply(win.boardId, operation, params, data.plan.version));
  const saveTraces = (tid, traces) => write("board", () => planApi.setTraces(win.boardId, tid, traces, data.board?.version ?? ""));

  const c = summary?.completeness;
  const stat = (key) => c?.sections.find((s) => s.key === key);
  const liveTickets = (data?.board?.tickets ?? []).filter((t) => t.status !== "done");

  return <Window title={title} kind="plan" onClose={onClose} primary={primary} actions={data && <button type="button" className="btn" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>{editing ? "Close editor" : "Edit plan"}</button>}>
    {error && <Notice lines={[error]} title="Plan failed to load" />}
    {conflict && <Notice tone="warn" title="Changed underneath you" lines={[conflict]} />}
    {data && !data.board && <Notice tone="warn" title="Tickets unavailable" lines={["The board could not be read, so coverage, progress and trace pickers show no tickets."]} />}
    {errors.length > 0 && <Notice lines={errors} title="Change was not accepted" />}
    {!data && !error && <p className="muted pad loading">Loading plan…<span className="spinner" aria-hidden="true" /></p>}
    {summary && <div className="plan-tab">
      <section className="plan-summary" aria-label="Plan summary">
        <div className="plan-score">
          <p className="plan-score-line"><span className="plan-score-value">{c.percent}%</span> <span>complete</span> <span className="muted small">({c.earned}/{c.possible} weight{c.requiredGaps.length ? `, ${c.requiredGaps.length} required gap${c.requiredGaps.length === 1 ? "" : "s"} open` : ""})</span></p>
          <div className="plan-meter" role="progressbar" aria-label="Plan completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.percent}><span style={{ width: `${c.percent}%` }} /></div>
          {c.missing.length > 0 && <p className="small plan-detail">Missing: {c.missing.map((k) => stat(k)?.label ?? k).join(", ")}</p>}
        </div>
        <div className="plan-coverage">
          <h3>Coverage</h3>
          <p className="small"><strong>{summary.coverageStats.covered}</strong> of {summary.coverageStats.total} plan items have a ticket · <strong>{summary.coverageStats.done}</strong> delivered</p>
          {summary.initiatives.map((p) => <ProgressBar key={p.id} label={`${p.id} ${p.name}`} progress={p} />)}
          <ProgressBar label={summary.initiatives.length ? "Project-wide" : "Delivery"} progress={summary.projectWide} />
        </div>
        <p className="muted small plan-version">plan v {shortVersion(data.plan.version)}</p>
      </section>

      {editing && <PlanOperationEditor version={data.plan.version} run={run} busy={busy} conflict={!!conflict} />}
      <div className="plan-sections">
        {PLAN_SECTION_LIST.map((section) => {
          const value = summary.plan.sections[section.key];
          const common = { section, stat: stat(section.key), run, busy };
          if (section.kind === "prose") return <GoalSection key={section.key} {...common} goal={value} />;
          if (section.kind === "scope") return <ScopeSection key={section.key} {...common} scope={value} />;
          if (section.kind === "initiatives") return <InitiativesSection key={section.key} {...common} initiatives={value} progress={summary.initiatives} />;
          if (section.kind === "gaps") return <GapsSection key={section.key} {...common} gaps={value} />;
          return <ListSection key={section.key} {...common} items={value} initiatives={summary.plan.sections.initiatives} coverageById={coverageById} />;
        })}
        <TracePicker tickets={liveTickets} options={traceOptions(summary.plan)} sections={PLAN_SECTION_LIST} onSave={saveTraces} busy={busy} />
      </div>
    </div>}
  </Window>;
}
