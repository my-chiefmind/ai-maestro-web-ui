/**
 * Add board: in registry mode it writes maestro/web-ui.json (POST /api/config/boards). When an
 * imported registry is read-only, it explains where the board has to be added instead. The server assigns
 * the id; the path field suggests folders under the home directory as you type.
 */
import { useEffect, useState } from "react";
import { api, ApiError } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { addBoardMode, errorLines, projectsJsonSnippet } from "./logic.js";

/** @param {{title: string, primary: boolean, onClose: () => void, cfg: any, onAdded: (id: string) => void}} props */
export function AddBoardWindow({ title, primary, onClose, cfg, onAdded }) {
  const [entry, setEntry] = useState({ id: "", name: "", path: "" });
  const [dirs, setDirs] = useState(/** @type {{path: string, maestro: boolean}[]} */ ([]));
  const [errors, setErrors] = useState(/** @type {string[]} */ ([]));
  const [busy, setBusy] = useState(false);
  const mode = addBoardMode(cfg);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api.dirs(entry.path || "~/").then((rows) => { if (live) setDirs(rows); }).catch(() => { if (live) setDirs([]); });
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [entry.path]);
  const set = (/** @type {"name" | "path"} */ k) => (/** @type {any} */ e) => setEntry((x) => ({ ...x, [k]: e.target.value }));

  async function submit(/** @type {import("react").FormEvent} */ e) {
    e.preventDefault();
    setBusy(true); setErrors([]);
    try {
      const name = entry.name.trim();
      const added = await api.addBoard({ ...(name ? { label: name } : {}), path: entry.path.trim() }, cfg.version);
      onAdded(added.key);
    } catch (err) {
      setErrors(err instanceof ApiError ? errorLines(err) : [String(err)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Window title={title} kind="config" onClose={onClose} primary={primary}>
      <form className="add-form" onSubmit={submit}>
        {mode.reason === "generated" && (
          <Notice tone="warn" title="Add it to projects.json" lines={[
            "This console's config is generated from projects.json, so a board added here would be overwritten.",
            "Register the project in projects.json instead (entry below), then regenerate the config.",
          ]} />
        )}
        {mode.reason === "readonly" && (
          <Notice tone="warn" title="Read-only project list" lines={[
            "This console was started with --import, so its project list is read-only.",
            "Add the project to that projects.json (entry below), or start ai-maestro-web-ui without --import to manage projects here.",
          ]} />
        )}
        {errors.length > 0 && <Notice lines={errors} title="Could not add board" />}
        <div className="grid">
          <label className="field wide"><span className="label">Project folder<em>the project root or its maestro folder</em></span>
            <input className="mono" value={entry.path} onChange={set("path")} placeholder="~/source/my-project"
              list="add-board-dirs" autoComplete="off" spellCheck={false} required /></label>
          <datalist id="add-board-dirs">
            {dirs.map((d) => <option key={d.path} value={`${d.path}/`} label={d.maestro ? "Maestro project" : undefined} />)}
          </datalist>
          <label className="field wide"><span className="label">Name<em>optional, defaults to the project name</em></span>
            <input value={entry.name} onChange={set("name")} autoComplete="off" /></label>
        </div>
        {!mode.canWrite && (
          <div className="snippet">
            <span className="label">projects.json entry</span>
            <pre>{projectsJsonSnippet(entry)}</pre>
          </div>
        )}
        <div className="form-foot">
          {cfg?.path && <span className="muted small">Config: <code>{cfg.path}</code></span>}
          <button type="submit" className="btn btn-primary" disabled={busy || !mode.canWrite || !entry.path.trim()}>
            {busy ? "Adding…" : "Add board"}
          </button>
        </div>
      </form>
    </Window>
  );
}
