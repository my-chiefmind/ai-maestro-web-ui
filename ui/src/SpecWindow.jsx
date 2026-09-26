/** Spec window: read a board's specs/<id>.md, edit it, PUT it back. A missing spec starts empty. */
import { useEffect, useState } from "react";
import { api, ApiError } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { errorLines } from "./logic.js";

const ABSENT_SPEC_VERSION = "sha256:absent";

/** @param {{win: any, title: string, primary: boolean, onClose: () => void}} props */
export function SpecWindow({ win, title, primary, onClose }) {
  const [text, setText] = useState(/** @type {string | null} */ (null));
  const [draft, setDraft] = useState("");
  const [version, setVersion] = useState(ABSENT_SPEC_VERSION);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState(/** @type {string[]} */ ([]));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    setText(null); setDraft(""); setVersion(ABSENT_SPEC_VERSION); setMissing(false);
    setEditing(false); setErrors([]); setSaved(false);
    api.spec(win.boardId, win.specId).then(
      (spec) => { if (live) { setText(spec.content); setDraft(spec.content); setVersion(spec.version); } },
      (e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) {
          const fresh = e.body.spec;
          setMissing(true); setText(""); setDraft(""); setVersion(fresh?.version ?? ABSENT_SPEC_VERSION);
        }
        else setErrors(e instanceof ApiError ? errorLines(e) : [String(e)]);
      });
    return () => { live = false; };
  }, [win.boardId, win.specId]);

  async function save() {
    setBusy(true); setErrors([]); setSaved(false);
    try {
      const result = await api.putSpec(win.boardId, win.specId, draft, version);
      setText(draft); setVersion(result.version); setMissing(false); setEditing(false); setSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body.spec) {
        const fresh = e.body.spec;
        setText(fresh.content ?? ""); setVersion(fresh.version);
        setMissing(fresh.content === null);
        setErrors(["The spec changed on disk. Your draft is preserved; review the fresh version and save again."]);
      } else {
        setErrors(e instanceof ApiError ? errorLines(e) : [String(e)]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Window title={title} kind="spec" onClose={onClose} primary={primary} actions={text !== null && (editing ? <>
      <button type="button" className="btn" onClick={() => { setDraft(text); setEditing(false); }} disabled={busy}>Cancel</button>
      <button type="button" className="btn btn-primary" onClick={save} disabled={busy || draft === text}>{busy ? "Saving…" : "Save spec"}</button>
    </> : <button type="button" className="btn" onClick={() => { setEditing(true); setSaved(false); }}>{missing ? "Create" : "Edit"}</button>)}>
      {errors.length > 0 && <Notice lines={errors} title="Spec error" />}
      {saved && <Notice tone="ok" lines={["Spec saved."]} />}
      {text === null && errors.length === 0 && <p className="muted pad loading">Loading spec…<span className="spinner" aria-hidden="true" /></p>}
      {text !== null && (editing ? (
        <label className="spec-edit">
          <span className="sr-only">Spec markdown</span>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck="true" />
        </label>
      ) : missing ? (
        <p className="muted pad">No spec <code>{win.specId}.md</code> yet. Create one to start it.</p>
      ) : (
        <pre className="spec-view">{text}</pre>
      ))}
    </Window>
  );
}
