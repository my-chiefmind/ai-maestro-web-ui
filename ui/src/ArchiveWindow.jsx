import { useEffect } from "react";
import { Window, Notice } from "./Window.jsx";

export function ArchiveWindow({ title, primary, onClose, state, ensureBoard }) {
  const data = state?.data;
  useEffect(() => { if (!data && !state?.error) ensureBoard(); }, [data, state?.error, ensureBoard]);
  const tickets = data?.archived ?? [];
  return <Window title={title} kind="archive" onClose={onClose} primary={primary}>
    {state?.error && <Notice title="Board failed to load" lines={[state.error]} />}
    {!data && !state?.error && <p className="muted pad loading">Loading archive…<span className="spinner" aria-hidden="true" /></p>}
    {data && tickets.length === 0 && <p className="muted pad">Nothing has landed or been dropped yet.</p>}
    {tickets.length > 0 && <ol className="archive-list" aria-label="Recently landed and dropped tickets">
      {[...tickets].reverse().map((ticket, i) => <li key={`${ticket.id}-${ticket.doneAt ?? "archived"}`} className={`reveal st-${ticket.status}`} style={{ "--i": i }}>
        <div><span className="tid">{ticket.id}</span><strong>{ticket.name}</strong><span className={`archive-status st-${ticket.status}`}>{ticket.status}</span></div>
        {ticket.doneAt && <time dateTime={ticket.doneAt}>{new Date(ticket.doneAt).toLocaleString()}</time>}
        {(ticket.evidence || ticket.reason) && <p>{ticket.evidence || ticket.reason}</p>}
      </li>)}
    </ol>}
  </Window>;
}
