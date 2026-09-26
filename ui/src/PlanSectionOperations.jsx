/**
 * Advanced plan editor (kept from the pre-T-015 Plan window): any targeted plan operation with
 * typed fields, for parameters the section editors don't surface (initiative scope, notes, …).
 * Submits through the PlanWindow's shared `run`, so it gets the same expectVersion and 409 path.
 */
import { useMemo, useState } from "react";
import { planParams, shortVersion } from "./logic.js";
import "./plan.css";

function itemFields(includeClear) {
  return ["verify", "budget", "enforce", "actor", "target", "mitigation", "notes", "initiativeId"].map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1") }))
    .concat(includeClear ? [{ key: "clearInitiative", label: "Clear initiative ownership", kind: "bool" }] : []);
}
const initiativeFields = [
  { key: "in", label: "In scope", kind: "list" }, { key: "out", label: "Out of scope", kind: "list" },
  { key: "metrics", label: "Metrics", kind: "list" }, { key: "dependsOn", label: "Depends on", kind: "list" },
  { key: "notes", label: "Notes", kind: "long" },
];

const OPS = {
  setGoal: [{ key: "text", label: "Goal", kind: "long", required: true }, { key: "metrics", label: "Metrics", kind: "list" }, { key: "clearMetrics", label: "Clear all metrics", kind: "bool" }],
  addScope: [{ key: "in", label: "In scope", kind: "list" }, { key: "out", label: "Out of scope", kind: "list" }, { key: "removeOut", label: "Remove out-of-scope ids", kind: "list" }],
  addItem: [{ key: "section", label: "Section", required: true, options: ["deliverables", "useCases", "functional", "nonFunctional", "milestones", "risks", "openQuestions"] }, { key: "text", label: "Text", kind: "long", required: true }, ...itemFields(false)],
  editItem: [{ key: "id", label: "Item id", required: true }, { key: "text", label: "Text", kind: "long" }, ...itemFields(true)],
  removeItem: [{ key: "id", label: "Item id", required: true }],
  addGap: [{ key: "text", label: "Gap", kind: "long", required: true }, { key: "need", label: "Need", required: true, options: ["required", "optional"] }, { key: "from", label: "From" }],
  setGap: [{ key: "id", label: "Gap id", required: true }, { key: "status", label: "Status", options: ["open", "accepted", "declined"] }, { key: "need", label: "Need", options: ["required", "optional"] }, { key: "resolvedAs", label: "Resolved as" }],
  addInitiative: [{ key: "name", label: "Name", required: true }, { key: "outcome", label: "Outcome", kind: "long", required: true }, ...initiativeFields],
  editInitiative: [{ key: "id", label: "Initiative id", required: true }, { key: "name", label: "Name" }, { key: "outcome", label: "Outcome", kind: "long" }, ...initiativeFields],
  removeInitiative: [{ key: "id", label: "Initiative id", required: true }],
};

export function PlanOperationEditor({ version, run, busy, conflict }) {
  const [operation, setOperation] = useState("setGoal");
  const [draft, setDraft] = useState({});
  const fields = OPS[operation] ?? [];
  const params = useMemo(() => planParams(fields, draft), [draft, fields]);
  async function save(event) {
    event.preventDefault();
    if (await run(operation, params)) setDraft({});
  }
  return <form className="plan-editor" onSubmit={save} noValidate>
        <label className="field"><span className="label">Operation</span><select value={operation} onChange={(e) => { setOperation(e.target.value); setDraft({}); }}>{Object.keys(OPS).map((op) => <option key={op}>{op}</option>)}</select></label>
        {fields.map((field) => field.kind === "bool" ? <label className="check" key={field.key}><input type="checkbox" checked={draft[field.key] === true} onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.checked }))} /> {field.label}</label> : <label className="field" key={field.key}><span className="label">{field.label}{field.kind === "list" && <em>comma or line separated</em>}</span>{field.options ? <select value={draft[field.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))} required={field.required}><option value="">(choose)</option>{field.options.map((value) => <option key={value}>{value}</option>)}</select> : field.kind === "long" || field.kind === "list" ? <textarea rows={field.kind === "long" ? 4 : 2} value={draft[field.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))} required={field.required} /> : <input value={draft[field.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))} required={field.required} />}</label>)}
        <div className="form-foot"><span className="muted small">against v {shortVersion(version)}</span><button className="btn btn-primary" disabled={busy}>{busy ? "Applying…" : conflict ? "Reapply operation" : "Apply operation"}</button></div>
      </form>;
}
