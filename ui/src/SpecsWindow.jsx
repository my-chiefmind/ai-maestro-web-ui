import { useEffect, useState } from "react";
import { api, ApiError } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { errorLines } from "./logic.js";

export function SpecsWindow({ win, title, primary, onClose, onOpenSpec }) {
  const [specs, setSpecs] = useState(null);
  const [newId, setNewId] = useState("");
  const [errors, setErrors] = useState([]);
  const load = () => {
    setSpecs(null); setErrors([]);
    api.specs(win.boardId).then((value) => setSpecs(value.specs ?? []), (error) => setErrors(error instanceof ApiError ? errorLines(error) : [String(error)]));
  };
  useEffect(load, [win.boardId]);
  return <Window title={title} kind="specs" onClose={onClose} primary={primary} actions={<button type="button" className="btn" onClick={load}>Reload</button>}>
    {errors.length > 0 && <Notice title="Specs failed to load" lines={errors} />}
    {specs === null && errors.length === 0 && <p className="muted pad loading">Loading specs…<span className="spinner" aria-hidden="true" /></p>}
    {specs && <>
      <form className="toolbar" onSubmit={(event) => { event.preventDefault(); if (newId.trim()) onOpenSpec(newId.trim()); }}>
        <label className="field-inline"><span className="sr-only">New spec id</span><input value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="new spec id" /></label>
        <button className="btn" type="submit">Create or open</button>
      </form>
      {specs.length === 0 ? <p className="muted pad">No specs yet.</p> : <ul className="spec-list">{specs.map((spec, i) => {
        const id = typeof spec === "string" ? spec : spec.id;
        return <li key={id} className="reveal" style={{ "--i": i }}><button type="button" onClick={() => onOpenSpec(id)}><span className="tid">{id}</span>{typeof spec === "object" && spec.title ? spec.title : "Open spec"}</button></li>;
      })}</ul>}
    </>}
  </Window>;
}
