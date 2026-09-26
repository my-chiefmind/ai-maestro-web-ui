/**
 * Ticket window: view + edit one ticket. Status goes through POST …/status, every other field
 * through PATCH with only the changed keys; both carry the board version this form was read
 * at. A 409 swaps in the server's fresh board, keeps the user's draft, and asks them to reapply.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { STATUSES, PRIORITY, SWAG, MODELS, MODES, toDraft, diffPatch, errorLines, eligibilityLines, rebaseDraft, shortVersion } from "./logic.js";

/**
 * @param {{win: any, title: string, primary: boolean, onClose: () => void, state?: {data?: any, error?: string},
 *   ensureBoard: () => void, putBoard: (payload: any) => void, afterWrite: () => Promise<void>, onOpenSpec: (sid: string) => void}} props
 */
export function TicketWindow({ win, title, primary, onClose, state, ensureBoard, putBoard, afterWrite, onOpenSpec }) {
  const data = state?.data;
  const ticket = useMemo(() => data?.tickets?.find((/** @type {any} */ t) => t.id === win.ticketId) ?? null, [data, win.ticketId]);
  const [draft, setDraft] = useState(/** @type {Record<string, any> | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(/** @type {string[]} */ ([]));
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [move, setMove] = useState(/** @type {"archive" | "drop" | null} */ (null));
  const [moveNote, setMoveNote] = useState("");
  const archiveButton = useRef(null);
  const dropButton = useRef(null);

  useEffect(() => { if (!data && !state?.error) ensureBoard(); }, [data, state?.error, ensureBoard]);
  // Fields the user edited since the last successful save. When the board is re-read (after a
  // save or a 409) the draft is rebased: untouched fields follow the fresh ticket, touched
  // ones keep the user's value — so "reapply" never reverts someone else's change.
  const [touched, setTouched] = useState(/** @type {Set<string>} */ (new Set()));
  useEffect(() => {
    if (ticket) setDraft((d) => rebaseDraft(ticket, d, touched));
  }, [ticket]);

  const patch = useMemo(() => (ticket && draft ? diffPatch(ticket, draft) : {}), [ticket, draft]);
  const statusChanged = Boolean(ticket && draft && draft.status !== ticket.status);
  const dirty = statusChanged || Object.keys(patch).length > 0;

  const set = (/** @type {string} */ k) => (/** @type {any} */ e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setDraft((d) => ({ ...d, [k]: v }));
    setTouched((t) => new Set(t).add(k));
    setSaved(false);
  };

  async function save(/** @type {import("react").FormEvent} */ e) {
    e.preventDefault();
    if (!ticket || !draft || !data) return;
    setBusy(true); setErrors([]); setSaved(false);
    let version = data.version;
    let wrote = false;
    try {
      if (statusChanged) {
        version = (await api.setStatus(win.boardId, ticket.id, draft.status, version)).version;
        wrote = true;
      }
      if (Object.keys(patch).length) {
        await api.patchTicket(win.boardId, ticket.id, patch, version);
        wrote = true;
      }
      setConflict(false);
      setTouched(new Set());
      setSaved(true);
      await afterWrite();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        // Use the fresh board the 409 carried, then re-read (also refreshes the rail counts).
        if (err.body.board) putBoard(err.body.board);
        await afterWrite();
      } else {
        setErrors(err instanceof ApiError ? errorLines(err) : [String(err)]);
        if (wrote) await afterWrite();
      }
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (ticket) setDraft(toDraft(ticket));
    setTouched(new Set());
    setConflict(false); setErrors([]); setSaved(false);
  }

  async function moveTicket() {
    if (!ticket || !data || !move) return;
    setBusy(true); setErrors([]);
    try {
      if (move === "archive") await api.archiveTicket(win.boardId, ticket.id, moveNote.trim(), data.version);
      else await api.dropTicket(win.boardId, ticket.id, moveNote.trim(), data.version);
      setMove(null); setMoveNote("");
      await afterWrite();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        if (err.body.board) putBoard(err.body.board);
        await afterWrite(); setConflict(true);
      } else setErrors(err instanceof ApiError ? errorLines(err) : [String(err)]);
    } finally { setBusy(false); }
  }

  function cancelMove() {
    const trigger = move === "archive" ? archiveButton : dropButton;
    setMove(null);
    // Keep the note as a draft: accidental Escape must never discard typed evidence/reason.
    setTimeout(() => trigger.current?.focus(), 0);
  }

  const epics = data?.epics ?? [];
  return (
    <Window title={ticket ? `${ticket.id} · ${ticket.name}` : title} kind="ticket" onClose={onClose} primary={primary}
      actions={<button type="button" className="btn" onClick={() => onOpenSpec(win.ticketId)}>Spec</button>}>
      {state?.error && <Notice lines={[state.error]} title="Board failed to load" />}
      {data && !ticket && <Notice tone="warn" lines={[`${win.ticketId} is not on the live board (archived or removed).`]} />}
      {!data && !state?.error && <p className="muted pad loading">Loading…<span className="spinner" aria-hidden="true" /></p>}
      {ticket && draft && (
        <form className="ticket-form" onSubmit={save} noValidate>
          {conflict && (
            <Notice tone="warn" title="Board changed, reapply"
              lines={["Someone else wrote this board since you opened it. The board has been reloaded; your edits are kept — review them and press Save again to reapply."]} />
          )}
          {errors.length > 0 && <Notice title="The board refused this change" lines={errors} />}
          {saved && !dirty && <Notice tone="ok" lines={["Saved."]} />}

          <section className={`eligibility ${ticket.eligibility?.eligible ? "is-eligible" : "is-blocked"}`} aria-label="Ticket eligibility">
            <strong>{ticket.eligibility?.eligible ? "Eligible" : "Not eligible"}</strong>
            <ul>{eligibilityLines(ticket).map((line) => <li key={line}>{line}</li>)}</ul>
            <dl>
              <div><dt>Agent plan</dt><dd>{(data.agentPlans?.[ticket.id] ?? ticket.agent_plan ?? []).join(" → ") || "—"}</dd></div>
              <div><dt>Dependencies</dt><dd>{ticket.depends_on?.join(", ") || "—"}</dd></div>
              <div><dt>Plan traces</dt><dd>{ticket.traces_to?.join(", ") || "—"}</dd></div>
            </dl>
          </section>

          <div className="grid">
            <Field label="Name" wide><input value={draft.name} onChange={set("name")} required /></Field>
            <Field label="Status">
              <select value={draft.status} onChange={set("status")}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
                {!STATUSES.includes(ticket.status) && <option>{ticket.status}</option>}
              </select>
            </Field>
            <Field label="Priority"><Select value={draft.priority} onChange={set("priority")} options={PRIORITY} /></Field>
            <Field label="Size"><Select value={draft.swag} onChange={set("swag")} options={SWAG} /></Field>
            <Field label="Epic">
              <select value={draft.epicId} onChange={set("epicId")}>
                <option value="">(none)</option>
                {epics.map((/** @type {any} */ e) => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}
                {draft.epicId && !epics.some((/** @type {any} */ e) => e.id === draft.epicId) && <option value={draft.epicId}>{draft.epicId}</option>}
              </select>
            </Field>
            <Field label="Area"><input value={draft.area} onChange={set("area")} /></Field>
            <Field label="Model"><Select value={draft.model} onChange={set("model")} options={MODELS} blank /></Field>
            <Field label="Execution"><Select value={draft.execution_mode} onChange={set("execution_mode")} options={MODES} blank /></Field>
            <Field label="Agent plan" hint="comma-separated codes"><input value={draft.agent_plan} onChange={set("agent_plan")} /></Field>
            <Field label="Depends on" hint="ticket ids"><input value={draft.depends_on} onChange={set("depends_on")} /></Field>
            <Field label="Traces to" hint="plan ids"><input value={draft.traces_to} onChange={set("traces_to")} /></Field>
            <Field label="Test command" wide><input className="mono" value={draft.testCmd} onChange={set("testCmd")} /></Field>
            <Field label="Description" wide><textarea rows={8} value={draft.desc} onChange={set("desc")} /></Field>
            <label className="check wide"><input type="checkbox" checked={draft.human_gate} onChange={set("human_gate")} /> Human gate</label>
          </div>

          <div className="form-foot">
            <span className="muted small">
              {dirty ? `Changes: ${[statusChanged && "status", ...Object.keys(patch)].filter(Boolean).join(", ")}` : "No changes"}
              {" · "}against v {shortVersion(data.version)}
            </span>
            <button type="button" className="btn" onClick={discard} disabled={busy}>Discard</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>{busy ? "Saving…" : conflict ? "Reapply" : "Save"}</button>
          </div>
          <fieldset className="danger-zone" onKeyDown={(event) => {
            if (event.key === "Escape" && move) { event.preventDefault(); event.stopPropagation(); cancelMove(); }
          }}>
            <legend>Remove from live board</legend>
            {!move ? <div className="danger-actions"><button ref={archiveButton} type="button" className="btn" onClick={() => setMove("archive")}>Archive as landed…</button><button ref={dropButton} type="button" className="btn btn-danger" onClick={() => setMove("drop")}>Drop ticket…</button></div> : <div className="confirm-box">
              <p><strong>Confirm {move === "archive" ? "archive" : "drop"} of {ticket.id}</strong></p>
              <label className="field"><span className="label">{move === "archive" ? "Evidence" : "Reason"}</span><textarea rows={3} value={moveNote} onChange={(e) => setMoveNote(e.target.value)} required autoFocus /></label>
              <div className="form-foot"><button type="button" className="btn" onClick={cancelMove} disabled={busy}>Cancel</button><button type="button" className={`btn ${move === "drop" ? "btn-danger" : "btn-primary"}`} onClick={moveTicket} disabled={busy || !moveNote.trim()}>{busy ? "Working…" : `Confirm ${move}`}</button></div>
            </div>}
          </fieldset>
        </form>
      )}
    </Window>
  );
}

/** @param {{label: string, hint?: string, wide?: boolean, children: import("react").ReactNode}} props */
function Field({ label, hint, wide, children }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span className="label">{label}{hint && <em>{hint}</em>}</span>
      {children}
    </label>
  );
}

/** @param {{value: string, onChange: (e: any) => void, options: string[], blank?: boolean}} props */
function Select({ value, onChange, options, blank }) {
  return (
    <select value={value} onChange={onChange}>
      {blank && <option value="">(unset)</option>}
      {options.map((o) => <option key={o}>{o}</option>)}
      {value && !options.includes(value) && <option>{value}</option>}
    </select>
  );
}
