import { useState } from "react";
import { api, ApiError } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { EMPTY_TICKET, STATUSES, PRIORITY, SWAG, MODELS, MODES, errorLines, ticketPayload } from "./logic.js";

export function CreateTicketWindow({ win, title, primary, onClose, state, putBoard, afterWrite, onCreated }) {
  const [draft, setDraft] = useState({ ...EMPTY_TICKET });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [conflict, setConflict] = useState(false);
  const data = state?.data;
  const set = (key) => (event) => setDraft((value) => ({ ...value, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  async function save(event) {
    event.preventDefault();
    if (!data) return;
    setBusy(true); setErrors([]);
    try {
      const result = await api.addTicket(win.boardId, ticketPayload(draft), data.version);
      await afterWrite();
      onCreated(result.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if (error.body.board) putBoard(error.body.board);
        await afterWrite();
        setConflict(true);
      } else setErrors(error instanceof ApiError ? errorLines(error) : [String(error)]);
    } finally { setBusy(false); }
  }

  return <Window title={title} kind="create" onClose={onClose} primary={primary}>
    {state?.error && <Notice title="Board failed to load" lines={[state.error]} />}
    {conflict && <Notice tone="warn" title="Board changed, retry creation" lines={["The latest board is loaded and every field you entered is still here. Review it, then press Create again."]} />}
    {errors.length > 0 && <Notice title="Ticket was not created" lines={errors} />}
    {!data && !state?.error && <p className="muted pad loading">Loading…<span className="spinner" aria-hidden="true" /></p>}
    {data && <form className="ticket-form" onSubmit={save} noValidate>
      <div className="grid">
        <Field label="Ticket id"><input value={draft.id} onChange={set("id")} required autoFocus /></Field>
        <Field label="Name" wide><input value={draft.name} onChange={set("name")} required /></Field>
        <Field label="Status"><Select value={draft.status} onChange={set("status")} options={STATUSES} /></Field>
        <Field label="Priority"><Select value={draft.priority} onChange={set("priority")} options={PRIORITY} /></Field>
        <Field label="Size"><Select value={draft.swag} onChange={set("swag")} options={SWAG} /></Field>
        <Field label="Epic"><select value={draft.epicId} onChange={set("epicId")}><option value="">(none)</option>{data.epics?.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}</select></Field>
        <Field label="Area"><input value={draft.area} onChange={set("area")} /></Field>
        <Field label="Model"><Select value={draft.model} onChange={set("model")} options={MODELS} blank /></Field>
        <Field label="Execution"><Select value={draft.execution_mode} onChange={set("execution_mode")} options={MODES} blank /></Field>
        <Field label="Agent plan" hint="comma-separated codes"><input value={draft.agent_plan} onChange={set("agent_plan")} /></Field>
        <Field label="Depends on" hint="ticket ids"><input value={draft.depends_on} onChange={set("depends_on")} /></Field>
        <Field label="Traces to" hint="plan ids"><input value={draft.traces_to} onChange={set("traces_to")} /></Field>
        <Field label="Test command" wide><input className="mono" value={draft.testCmd} onChange={set("testCmd")} /></Field>
        <Field label="Description" wide><textarea rows={8} value={draft.desc} onChange={set("desc")} required /></Field>
        <label className="check wide"><input type="checkbox" checked={draft.human_gate} onChange={set("human_gate")} /> Human gate</label>
      </div>
      <div className="form-foot"><span className="muted small">Creates against the current board version.</span><button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : conflict ? "Retry creation" : "Create ticket"}</button></div>
    </form>}
  </Window>;
}

function Field({ label, hint, wide, children }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span className="label">{label}{hint && <em>{hint}</em>}</span>{children}</label>;
}
function Select({ value, onChange, options, blank }) {
  return <select value={value} onChange={onChange}>{blank && <option value="">(unset)</option>}{options.map((o) => <option key={o}>{o}</option>)}</select>;
}
