import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { diffEpic, errorLines, toEpicDraft } from "./logic.js";

export function EpicsWindow({ win, title, primary, onClose, state, ensureBoard, putBoard, afterWrite }) {
  const data = state?.data;
  const [selected, setSelected] = useState("");
  const epic = useMemo(() => data?.epics?.find((item) => item.id === selected) ?? null, [data, selected]);
  const [draft, setDraft] = useState(toEpicDraft());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [conflict, setConflict] = useState(false);
  const [touched, setTouched] = useState(new Set());
  useEffect(() => { if (!data && !state?.error) ensureBoard(); }, [data, state?.error, ensureBoard]);
  useEffect(() => {
    const fresh = toEpicDraft(epic);
    setDraft((current) => {
      for (const key of touched) fresh[key] = current[key];
      return fresh;
    });
  }, [epic]);
  const set = (key) => (event) => {
    setDraft((value) => ({ ...value, [key]: event.target.value }));
    setTouched((value) => new Set(value).add(key));
  };

  async function save(event) {
    event.preventDefault();
    if (!data) return;
    const creating = !epic;
    const value = creating ? {
      id: draft.id.trim(), name: draft.name.trim(), ...(draft.desc.trim() && { desc: draft.desc.trim() }),
      ...(draft.initiativeId.trim() && { initiativeId: draft.initiativeId.trim() }),
      ...(draft.traces_to.trim() && { traces_to: draft.traces_to.split(/[,\s]+/).filter(Boolean) }),
    } : diffEpic(epic, draft);
    setBusy(true); setErrors([]);
    try {
      const result = creating
        ? await api.addEpic(win.boardId, value, data.version)
        : await api.patchEpic(win.boardId, epic.id, value, data.version);
      setTouched(new Set());
      await afterWrite(); setSelected(result.id ?? epic.id); setConflict(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        if (error.body.board) putBoard(error.body.board);
        await afterWrite(); setConflict(true);
      } else setErrors(error instanceof ApiError ? errorLines(error) : [String(error)]);
    } finally { setBusy(false); }
  }

  const choose = (id) => { setTouched(new Set()); setConflict(false); setSelected(id); };
  return <Window title={title} kind="epics" onClose={onClose} primary={primary} actions={<button className="btn" type="button" onClick={() => choose("")}>New epic</button>}>
    {state?.error && <Notice title="Board failed to load" lines={[state.error]} />}
    {conflict && <Notice tone="warn" title="Board changed" lines={["The latest board is loaded and your epic draft is preserved. Review and save again."]} />}
    {errors.length > 0 && <Notice title="Epic was not saved" lines={errors} />}
    {data && <div className="split-view">
      <nav className="item-list" aria-label="Epics">{data.epics?.length ? data.epics.map((item) => <button type="button" key={item.id} aria-current={selected === item.id ? "true" : undefined} onClick={() => choose(item.id)}><span className="tid">{item.id}</span>{item.name}</button>) : <p className="muted pad">No epics yet.</p>}</nav>
      <form className="detail-form" onSubmit={save} noValidate>
        <h3>{epic ? `Edit ${epic.id}` : "Create an epic"}</h3>
        {!epic && <Field label="Epic id"><input value={draft.id} onChange={set("id")} required /></Field>}
        <Field label="Name"><input value={draft.name} onChange={set("name")} required /></Field>
        <Field label="Description"><textarea rows={5} value={draft.desc} onChange={set("desc")} /></Field>
        <Field label="Initiative id"><input value={draft.initiativeId} onChange={set("initiativeId")} /></Field>
        <Field label="Traces to"><input value={draft.traces_to} onChange={set("traces_to")} /></Field>
        <button className="btn btn-primary" disabled={busy || (epic && !Object.keys(diffEpic(epic, draft)).length)}>{busy ? "Saving…" : epic ? "Save epic" : "Create epic"}</button>
      </form>
    </div>}
  </Window>;
}
function Field({ label, children }) { return <label className="field"><span className="label">{label}</span>{children}</label>; }
