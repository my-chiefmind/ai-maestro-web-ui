/**
 * Projects tab: every registered project (from /api/config), active first then parked, each
 * sorted by label. Registry mode can add, park, unpark, and remove; every write sends the
 * registry version read from /api/config and refreshes the rail and config afterwards.
 * Removing (or parking) only edits the registry file — project files are never touched.
 */
import { useState } from "react";
import { ApiError } from "./api.js";
import { projectsApi, isConflict } from "./projectsApi.js";
import { Window, Notice } from "./Window.jsx";
import { addBoardMode, errorLines, total } from "./logic.js";
import { projectRows } from "./shell.js";
import "./projects.css";

const CONFLICT = "The project list changed since it was loaded (another tab or a hand edit). It has been refreshed; review it and try again.";

/**
 * @param {{title: string, cfg: any, rail: any[] | null, onAdd: () => void, onChanged: () => Promise<unknown>,
 *   onOpenProject: (id: string) => void}} props
 */
export function ProjectsPage({ title, cfg, rail, onAdd, onChanged, onOpenProject }) {
  const [errors, setErrors] = useState(/** @type {string[]} */ ([]));
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [confirming, setConfirming] = useState(/** @type {string | null} */ (null));
  const { canWrite } = addBoardMode(cfg);
  const rows = projectRows(cfg?.boards, rail);

  /** @param {string} key @param {() => Promise<unknown>} write */
  async function run(key, write) {
    setBusy(key); setErrors([]);
    try { await write(); setConfirming(null); }
    catch (err) {
      if (isConflict(err)) setErrors([CONFLICT]);
      else setErrors(err instanceof ApiError ? errorLines(err) : [String(err)]);
    }
    finally { setBusy(null); await onChanged(); }
  }

  return <Window title={title} kind="projects" actions={<>
    <button type="button" className="text-btn" onClick={() => onChanged()}>Refresh</button>
    <button type="button" className="btn btn-primary" onClick={onAdd} disabled={!canWrite}>Add project</button>
  </>}>
    {cfg && !canWrite && <Notice tone="warn" title="Read-only" lines={[
      cfg.mode === "import"
        ? "These projects come from an imported registry. Change their status in that file instead."
        : "No writable registry is loaded, so projects cannot be added, parked, or removed here.",
    ]} />}
    {errors.length > 0 && <Notice title="Could not update the project" lines={errors} />}
    {!cfg && <p className="muted pad loading">Loading projects…<span className="spinner" aria-hidden="true" /></p>}
    {cfg && rows.length === 0 && <p className="muted pad">No projects registered yet. Add one to get started.</p>}
    {rows.length > 0 && <ul className="project-list" aria-label="Registered projects">
      {rows.map((row, i) => {
        const parked = row.status === "parked";
        return <li key={row.key} className={`project-row reveal ${parked ? "is-parked" : ""}`} style={{ "--i": i }}>
          <div className="project-main">
            {parked ? <strong className="project-name">{row.label}</strong>
              : <button type="button" className="project-link project-name" onClick={() => onOpenProject(row.key)}>{row.label}</button>}
            <span className={`badge ${parked ? "badge-warn" : "badge-ok"}`}>{row.status}</span>
            <code className="project-key">{row.key}</code>
            <code className="project-path" title={row.path}>{row.path}</code>
            {!parked && row.counts && <span className="project-counts">
              {total(row.counts)} tickets
              {Object.entries(row.counts).map(([s, n]) => <span key={s} className={`chip st-${s}`}>{n} {s}</span>)}
            </span>}
            {!parked && row.error && <span className="project-error-text">{row.error}</span>}
          </div>
          {confirming === row.key ? <div className="confirm-box project-actions" role="group" aria-label={`Remove ${row.label}`}>
            <p>Remove {row.label} from this console? Only the registry entry is deleted; project files are not changed.</p>
            <div className="danger-actions">
              <button type="button" className="btn" onClick={() => setConfirming(null)} disabled={busy === row.key}>Cancel</button>
              <button type="button" className="btn btn-danger" disabled={busy === row.key}
                onClick={() => run(row.key, () => projectsApi.remove(row.key, cfg.version))}>{busy === row.key ? "Removing…" : "Remove project"}</button>
            </div>
          </div> : <div className="danger-actions project-actions">
            <button type="button" className="btn" disabled={!canWrite || busy !== null}
              aria-label={`${parked ? "Unpark" : "Park"} ${row.label}`}
              onClick={() => run(row.key, () => projectsApi.setStatus(row.key, parked ? "active" : "parked", cfg.version))}>
              {parked ? "Unpark" : "Park"}
            </button>
            <button type="button" className="btn btn-danger" disabled={!canWrite || busy !== null}
              aria-label={`Remove ${row.label}…`} onClick={() => setConfirming(row.key)}>Remove…</button>
          </div>}
        </li>;
      })}
    </ul>}
  </Window>;
}
