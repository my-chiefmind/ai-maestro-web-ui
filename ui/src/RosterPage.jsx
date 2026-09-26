/** Roster tab: agents and skills declared in one project (or every project), with target badges. */
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { filterRoster, rosterRows } from "./shell.js";

const TARGET_LABEL = { claude: ".claude", codex: ".codex", agents: ".agents" };

/** @param {{scopeId: string | null, title: string}} props */
export function RosterPage({ scopeId, title }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");

  const load = () => {
    setPayload(null); setError("");
    api.roster(scopeId).then(setPayload, (e) => setError(e.message || "Could not load the roster."));
  };
  useEffect(load, [scopeId]);

  const rows = useMemo(() => filterRoster(rosterRows(payload), { kind, q }), [payload, kind, q]);
  const agents = rows.filter((row) => row.kind === "agent");
  const skills = rows.filter((row) => row.kind === "skill");

  return <Window title={title} kind="roster" actions={<button type="button" className="text-btn" onClick={load}>Refresh</button>}>
    <form className="toolbar roster-filters" role="search" onSubmit={(event) => event.preventDefault()}>
      <label className="field-inline"><span className="sr-only">Search roster</span>
        <input type="search" placeholder="Search agents and skills" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="segmented" role="radiogroup" aria-label="Kind">
        {[["", "All"], ["agent", "Agents"], ["skill", "Skills"]].map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "is-on" : ""} onClick={() => setKind(value)}>{label}</button>
        ))}
      </div>
      {payload && <span className="version">{agents.length} agents · {skills.length} skills</span>}
    </form>
    {error && <Notice lines={[error]} title="Roster failed to load" />}
    {!payload && !error && <p className="muted pad loading">Loading roster…<span className="spinner" aria-hidden="true" /></p>}
    {payload?.errors?.length > 0 && <section className="project-errors" aria-labelledby="roster-errors-title">
      <h3 id="roster-errors-title">Projects needing attention</h3>
      {payload.errors.map((row) => <p key={row.project.id} className="project-error" role="alert"><strong>{row.project.name}</strong><span>{row.error}</span></p>)}
    </section>}
    {payload && rows.length === 0 && <p className="muted pad">No agents or skills match.</p>}
    {payload && rows.length > 0 && <div className="roster-groups">
      {[["Agents", agents], ["Skills", skills]].map(([label, group]) => group.length ? (
        <section key={label} className="roster-group" aria-labelledby={`roster-${label}`}>
          <h3 id={`roster-${label}`} className="column-head"><span className="dot" aria-hidden="true" />{label}<span className="count">{group.length}</span></h3>
          <ul className="roster-list">
            {group.map((row, i) => (
              <li key={`${row.project?.id ?? ""}:${row.kind}:${row.name}`} className="roster-card reveal" style={{ "--i": i }}>
                <div className="roster-card-top">
                  {row.project && <span className="operation-project">{row.project.name}</span>}
                  <strong className="roster-name">{row.name}</strong>
                  <span className="roster-targets">
                    {row.targets.map((t) => <span key={t} className={`badge badge-${t}`} title={`Declared in ${TARGET_LABEL[t] ?? t}`}>{t}</span>)}
                  </span>
                </div>
                {row.description && <p className="roster-desc">{row.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : null)}
    </div>}
  </Window>;
}
