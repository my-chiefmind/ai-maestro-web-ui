/**
 * Plan tab section editors (T-015). Each section owns its own small form and submits exactly one
 * targeted plan operation through `run(operation, params)`, which the PlanWindow sends with the
 * plan version it read. `run` resolves true on success; on failure the draft is kept.
 */
import { useId, useState } from "react";
import { editItemParams, planItemFields } from "./logic.js";
import "./plan.css";

const FIELD_LABELS = { verify: "Verify", budget: "Budget", enforce: "Enforce command", actor: "Actor", target: "Target", mitigation: "Mitigation", notes: "Notes" };
const lines = (s) => String(s ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean);

/** A labelled text control. */
function Field({ label, value, onChange, long, required, hint }) {
  const id = useId();
  return <div className="field">
    <label className="label" htmlFor={id}>{label}{hint && <em>{hint}</em>}</label>
    {long
      ? <textarea id={id} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required} />
      : <input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required} />}
  </div>;
}

/** A labelled select. */
function Choice({ label, value, onChange, options }) {
  const id = useId();
  return <div className="field">
    <label className="label" htmlFor={id}>{label}</label>
    <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  </div>;
}

/** Form shell: submit → run(); clear + close on success, keep draft on failure. */
function useForm(initial = {}) {
  const [draft, setDraft] = useState(initial);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  return { draft, setDraft, set };
}

function FormFoot({ busy, label, onCancel }) {
  return <div className="plan-form-foot">
    {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
    <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : label}</button>
  </div>;
}

/** Section frame with heading, count, completeness detail and an optional edit toggle. */
export function PlanSectionFrame({ section, stat, children, editLabel, editing, onToggle }) {
  const headingId = useId();
  return <section className="plan-sec" aria-labelledby={headingId} data-section={section.key}>
    <header className="plan-sec-head">
      <h3 id={headingId}>{section.label}</h3>
      {stat && section.weight > 0 && <span className={`badge ${stat.filled ? "badge-ok" : "badge-warn"}`}>{stat.filled ? "filled" : "missing"}</span>}
      {stat && <span className="count">{stat.count}</span>}
      {onToggle && <button type="button" className="btn btn-sm plan-sec-toggle" aria-expanded={editing} onClick={onToggle}>{editing ? "Close" : editLabel}</button>}
    </header>
    {section.blurb && <p className="muted small plan-blurb">{section.blurb}</p>}
    {stat?.detail && <p className="plan-detail small">{stat.detail}</p>}
    {children}
  </section>;
}

export function GoalSection({ section, stat, goal, run, busy }) {
  const [editing, setEditing] = useState(false);
  const { draft, setDraft, set } = useForm();
  const open = () => { setDraft({ text: goal.text, metrics: goal.metrics.join("\n") }); setEditing((v) => !v); };
  async function submit(e) {
    e.preventDefault();
    const metrics = lines(draft.metrics);
    const params = { text: String(draft.text ?? "").trim() };
    if (metrics.length) params.metrics = metrics; else if (goal.metrics.length) params.clearMetrics = true;
    if (await run("setGoal", params)) setEditing(false);
  }
  return <PlanSectionFrame section={section} stat={stat} editLabel="Edit goal" editing={editing} onToggle={open}>
    {goal.text ? <p className="plan-goal-text">{goal.text}</p> : <p className="muted small">No goal set yet.</p>}
    {goal.metrics.length > 0 && <ul className="plan-items">{goal.metrics.map((m, i) => <li key={i}><span className="tid">metric</span><span>{m}</span></li>)}</ul>}
    {editing && <form className="plan-form" onSubmit={submit} aria-label="Edit goal">
      <Field label="Goal" long required value={draft.text} onChange={set("text")} />
      <Field label="Success metrics" hint="one per line" long value={draft.metrics} onChange={set("metrics")} />
      <FormFoot busy={busy} label="Save goal" onCancel={() => setEditing(false)} />
    </form>}
  </PlanSectionFrame>;
}

export function ScopeSection({ section, stat, scope, run, busy }) {
  const [editing, setEditing] = useState(false);
  const { draft, setDraft, set } = useForm();
  async function submit(e) {
    e.preventDefault();
    const params = {};
    if (lines(draft.in).length) params.in = lines(draft.in);
    if (lines(draft.out).length) params.out = lines(draft.out);
    if (!Object.keys(params).length) return;
    if (await run("addScope", params)) { setDraft({}); setEditing(false); }
  }
  return <PlanSectionFrame section={section} stat={stat} editLabel="Add to scope" editing={editing} onToggle={() => setEditing((v) => !v)}>
    <div className="plan-scope">
      <div><h4>In scope</h4>{scope.in.length ? <ul className="plan-items">{scope.in.map((s, i) => <li key={i}><span>{s}</span></li>)}</ul> : <p className="muted small">—</p>}</div>
      <div><h4>Out of scope</h4>{scope.out.length ? <ul className="plan-items">{scope.out.map((o) => <li key={o.id}>
        <span className="tid">{o.id}</span><span>{o.text}</span>
        <button type="button" className="btn btn-sm plan-remove" disabled={busy} aria-label={`Remove ${o.id} from out of scope`} onClick={() => run("addScope", { removeOut: [o.id] })}>Remove</button>
      </li>)}</ul> : <p className="muted small">—</p>}</div>
    </div>
    {editing && <form className="plan-form" onSubmit={submit} aria-label="Add to scope">
      <Field label="In scope" hint="one per line" long value={draft.in} onChange={set("in")} />
      <Field label="Out of scope" hint="one per line" long value={draft.out} onChange={set("out")} />
      <FormFoot busy={busy} label="Add to scope" onCancel={() => setEditing(false)} />
    </form>}
  </PlanSectionFrame>;
}

function initiativeOptions(initiatives) {
  return [["", "Project-wide"], ...initiatives.filter((i) => i.id).map((i) => [i.id, `${i.id} — ${i.name}`])];
}

/** One item row with inline edit + remove. */
function ListItem({ item, sectionKey, fields, owned, initiatives, coverage, run, busy }) {
  const [editing, setEditing] = useState(false);
  const { draft, setDraft, set } = useForm();
  const open = () => { setDraft(Object.fromEntries(["text", ...fields, "initiativeId"].map((k) => [k, item[k] ?? ""]))); setEditing((v) => !v); };
  async function submit(e) {
    e.preventDefault();
    const params = editItemParams(item, draft, fields);
    if (Object.keys(params).length === 1) { setEditing(false); return; }
    if (await run("editItem", params)) setEditing(false);
  }
  const meta = fields.filter((f) => item[f]).map((f) => `${f}: ${item[f]}`);
  if (item.initiativeId) meta.push(`initiative: ${item.initiativeId}`);
  return <li className="plan-item">
    <div className="plan-item-row">
      <span className="tid">{item.id}</span>
      <span className="plan-item-text">{item.text}</span>
      {coverage && <span className={`badge ${coverage.done ? "badge-ok" : coverage.tickets.length ? "" : "badge-warn"}`} title={coverage.tickets.join(", ") || "No ticket traces here"}>
        {coverage.done ? "done" : coverage.tickets.length ? `${coverage.tickets.length} ticket${coverage.tickets.length === 1 ? "" : "s"}` : "uncovered"}
      </span>}
      <span className="plan-item-actions">
        <button type="button" className="btn btn-sm" aria-expanded={editing} aria-label={`Edit ${item.id}`} onClick={open}>Edit</button>
        <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Remove ${item.id}`} onClick={() => run("removeItem", { id: item.id })}>Remove</button>
      </span>
    </div>
    {meta.length > 0 && <span className="meta">{meta.join(" · ")}</span>}
    {editing && <form className="plan-form" onSubmit={submit} aria-label={`Edit ${item.id}`} data-section={sectionKey}>
      <Field label="Text" long required value={draft.text} onChange={set("text")} />
      {fields.map((f) => <Field key={f} label={FIELD_LABELS[f] ?? f} value={draft[f]} onChange={set(f)} />)}
      {owned && initiatives.length > 0 && <Choice label="Initiative" value={draft.initiativeId} onChange={set("initiativeId")} options={initiativeOptions(initiatives)} />}
      <FormFoot busy={busy} label={`Save ${item.id}`} onCancel={() => setEditing(false)} />
    </form>}
  </li>;
}

const OWNED = new Set(["deliverables", "useCases", "functional", "nonFunctional", "milestones", "risks"]);

export function ListSection({ section, stat, items, initiatives, coverageById, run, busy }) {
  const [adding, setAdding] = useState(false);
  const { draft, setDraft, set } = useForm();
  const fields = planItemFields(section.key);
  const owned = OWNED.has(section.key);
  async function submit(e) {
    e.preventDefault();
    const params = { section: section.key, text: String(draft.text ?? "").trim() };
    for (const f of fields) { const v = String(draft[f] ?? "").trim(); if (v) params[f] = v; }
    if (owned && draft.initiativeId) params.initiativeId = draft.initiativeId;
    if (await run("addItem", params)) { setDraft({}); setAdding(false); }
  }
  return <PlanSectionFrame section={section} stat={stat} editLabel={`Add ${(section.itemLabel ?? "item").toLowerCase()}`} editing={adding} onToggle={() => setAdding((v) => !v)}>
    {items.length === 0 ? <p className="muted small">—</p> : <ul className="plan-items">{items.map((item) =>
      <ListItem key={item.id} item={item} sectionKey={section.key} fields={fields} owned={owned} initiatives={initiatives} coverage={coverageById.get(item.id)} run={run} busy={busy} />)}</ul>}
    {adding && <form className="plan-form" onSubmit={submit} aria-label={`Add ${section.itemLabel ?? "item"}`}>
      <Field label={section.itemLabel ?? "Text"} long required value={draft.text} onChange={set("text")} />
      {fields.map((f) => <Field key={f} label={FIELD_LABELS[f] ?? f} value={draft[f]} onChange={set(f)} />)}
      {owned && initiatives.length > 0 && <Choice label="Initiative" value={draft.initiativeId} onChange={set("initiativeId")} options={initiativeOptions(initiatives)} />}
      <FormFoot busy={busy} label="Add" onCancel={() => setAdding(false)} />
    </form>}
  </PlanSectionFrame>;
}

export function GapsSection({ section, stat, gaps, run, busy }) {
  const [adding, setAdding] = useState(false);
  const { draft, setDraft, set } = useForm({ need: "required" });
  async function submit(e) {
    e.preventDefault();
    const params = { text: String(draft.text ?? "").trim(), need: draft.need || "required" };
    if (String(draft.from ?? "").trim()) params.from = draft.from.trim();
    if (await run("addGap", params)) { setDraft({ need: "required" }); setAdding(false); }
  }
  return <PlanSectionFrame section={section} stat={stat} editLabel="Raise gap" editing={adding} onToggle={() => setAdding((v) => !v)}>
    {gaps.length === 0 ? <p className="muted small">No gaps raised.</p> : <ul className="plan-items">{gaps.map((g) => {
      const status = g.status ?? "open";
      return <li key={g.id} className="plan-item"><div className="plan-item-row">
        <span className="tid">{g.id}</span><span className="plan-item-text">{g.text}</span>
        <span className={`badge ${status === "open" ? (g.need === "required" ? "badge-warn" : "") : "badge-ok"}`}>{status} · {g.need}</span>
        {status === "open" && <span className="plan-item-actions">
          <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Accept ${g.id}`} onClick={() => run("setGap", { id: g.id, status: "accepted" })}>Accept</button>
          <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Decline ${g.id}`} onClick={() => run("setGap", { id: g.id, status: "declined" })}>Decline</button>
        </span>}
      </div>{g.from && <span className="meta">from: {g.from}</span>}</li>;
    })}</ul>}
    {adding && <form className="plan-form" onSubmit={submit} aria-label="Raise gap">
      <Field label="Gap" long required value={draft.text} onChange={set("text")} />
      <Choice label="Need" value={draft.need} onChange={set("need")} options={[["required", "required"], ["optional", "optional"]]} />
      <Field label="From" value={draft.from} onChange={set("from")} />
      <FormFoot busy={busy} label="Raise gap" onCancel={() => setAdding(false)} />
    </form>}
  </PlanSectionFrame>;
}

function InitiativeForm({ initial, label, onSubmit, onCancel, busy }) {
  const { draft, set } = useForm(initial);
  return <form className="plan-form" onSubmit={(e) => { e.preventDefault(); onSubmit(draft); }} aria-label={label}>
    <Field label="Name" required value={draft.name} onChange={set("name")} />
    <Field label="Outcome" long required value={draft.outcome} onChange={set("outcome")} />
    <Field label="Metrics" hint="one per line" long value={draft.metrics} onChange={set("metrics")} />
    <Field label="Depends on" hint="initiative ids, one per line" value={draft.dependsOn} onChange={set("dependsOn")} />
    <FormFoot busy={busy} label={label} onCancel={onCancel} />
  </form>;
}

function initiativeParams(draft) {
  const params = {};
  for (const k of ["name", "outcome"]) { const v = String(draft[k] ?? "").trim(); if (v) params[k] = v; }
  for (const k of ["metrics", "dependsOn"]) if (draft[k] !== undefined) params[k] = lines(draft[k]);
  return params;
}

export function InitiativesSection({ section, stat, initiatives, progress, run, busy }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(/** @type {string | null} */ (null));
  const byId = new Map(progress.map((p) => [p.id, p]));
  return <PlanSectionFrame section={section} stat={stat} editLabel="Add initiative" editing={adding} onToggle={() => setAdding((v) => !v)}>
    {initiatives.length === 0 ? <p className="muted small">No initiatives — the plan goes straight to epics.</p> : <ul className="plan-items">{initiatives.map((init) => {
      const p = byId.get(init.id);
      return <li key={init.id} className="plan-item">
        <div className="plan-item-row">
          <span className="tid">{init.id}</span><span className="plan-item-text"><strong>{init.name}</strong>{init.outcome && <> — {init.outcome}</>}</span>
          <span className="plan-item-actions">
            <button type="button" className="btn btn-sm" aria-expanded={editing === init.id} aria-label={`Edit ${init.id}`} onClick={() => setEditing((v) => v === init.id ? null : init.id)}>Edit</button>
            <button type="button" className="btn btn-sm" disabled={busy} aria-label={`Remove ${init.id}`} onClick={() => run("removeInitiative", { id: init.id })}>Remove</button>
          </span>
        </div>
        {p && <ProgressBar label={`${init.id} delivery`} progress={p} />}
        {editing === init.id && <InitiativeForm busy={busy} label={`Save ${init.id}`} onCancel={() => setEditing(null)}
          initial={{ name: init.name, outcome: init.outcome, metrics: init.metrics.join("\n"), dependsOn: init.depends_on.join("\n") }}
          onSubmit={async (d) => { if (await run("editInitiative", { id: init.id, ...initiativeParams(d) })) setEditing(null); }} />}
      </li>;
    })}</ul>}
    {adding && <InitiativeForm busy={busy} label="Add initiative" onCancel={() => setAdding(false)} initial={{}}
      onSubmit={async (d) => { if (await run("addInitiative", initiativeParams(d))) setAdding(false); }} />}
  </PlanSectionFrame>;
}

/** Delivery progress (done ÷ scored items) with covered/uncovered counts. */
export function ProgressBar({ label, progress }) {
  return <div className="plan-progress">
    <div className="plan-progress-head small">
      <span>{label}</span>
      <span className="muted">{progress.done}/{progress.total} done · {progress.covered} covered · {progress.uncovered.length} uncovered</span>
    </div>
    <div className="plan-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
      <span style={{ width: `${progress.percent}%` }} />
    </div>
  </div>;
}
