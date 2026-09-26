/**
 * Trace picker (T-015): choose which plan items a live ticket serves. Saves the ticket's
 * `traces_to` through the targeted ticket PATCH with the board version read.
 */
import { useEffect, useId, useRef, useState } from "react";
import { toggleTrace } from "./logic.js";
import "./plan.css";

/** @param {{tickets: any[], options: {id: string, section: string, text: string}[], sections: any[], onSave: (tid: string, traces: string[]) => Promise<boolean>, busy: boolean}} props */
export function TracePicker({ tickets, options, sections, onSave, busy }) {
  const selectId = useId();
  const headingId = useId();
  const [tid, setTid] = useState(tickets[0]?.id ?? "");
  const ticket = tickets.find((t) => t.id === tid) ?? null;
  const serverTraces = Array.isArray(ticket?.traces_to) ? ticket.traces_to : [];
  const serverKey = JSON.stringify(serverTraces);
  const [traces, setTraces] = useState(/** @type {string[]} */ (serverTraces));
  // `touched` = the user has an unsaved selection. A reload (a 409, or any plan save) hands us a
  // new ticket object; that must never wipe an unsaved selection. Reseed only on a ticket switch,
  // or when the server value really changed and nothing is pending.
  const [touched, setTouched] = useState(false);
  const seeded = useRef({ tid, key: serverKey });
  useEffect(() => {
    if (seeded.current.tid !== tid) { seeded.current = { tid, key: serverKey }; setTraces(serverTraces); setTouched(false); return; }
    if (seeded.current.key !== serverKey && !touched) { seeded.current = { tid, key: serverKey }; setTraces(serverTraces); }
  }, [tid, serverKey, touched]);
  const dirty = ticket && JSON.stringify(traces) !== serverKey;
  const labelOf = new Map(sections.map((s) => [s.key, s.label]));
  const groups = [...new Set(options.map((o) => o.section))];

  return <section className="plan-sec plan-traces" aria-labelledby={headingId}>
    <header className="plan-sec-head"><h3 id={headingId}>Ticket traces</h3></header>
    <p className="muted small plan-blurb">Set which plan items a ticket serves. Untraced plan items read as uncovered.</p>
    {tickets.length === 0 ? <p className="muted small">No live tickets to trace.</p> : <form className="plan-form" aria-label="Ticket traces" onSubmit={async (e) => { e.preventDefault(); if (ticket && await onSave(ticket.id, traces)) setTouched(false); }}>
      <div className="field">
        <label className="label" htmlFor={selectId}>Ticket</label>
        <select id={selectId} value={tid} onChange={(e) => setTid(e.target.value)}>
          {tickets.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.name}</option>)}
        </select>
      </div>
      {options.length === 0 ? <p className="muted small">The plan has no traceable items yet.</p> : groups.map((g) => <fieldset key={g} className="plan-trace-group">
        <legend>{labelOf.get(g) ?? g}</legend>
        {options.filter((o) => o.section === g).map((o) => <label key={o.id} className="check">
          <input type="checkbox" checked={traces.includes(o.id)} onChange={() => { setTouched(true); setTraces((t) => toggleTrace(t, o.id)); }} />
          <span className="tid">{o.id}</span> <span>{o.text}</span>
        </label>)}
      </fieldset>)}
      <div className="plan-form-foot">
        <span className="muted small">{traces.length ? traces.join(", ") : "No traces"}</span>
        <button className="btn btn-primary" disabled={busy || !dirty}>{busy ? "Saving…" : "Save traces"}</button>
      </div>
    </form>}
  </section>;
}
