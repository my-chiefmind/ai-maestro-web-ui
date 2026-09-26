/** Board list view grouped by epic (T-014): an alternative to the status columns. */
import { groupByEpic } from "./logic.js";
import "./boardConsole.css";

/** @param {{tickets: any[], epics: any[], onOpenTicket: (tid: string) => void}} props */
export function BoardList({ tickets, epics, onOpenTicket }) {
  const groups = groupByEpic(tickets, epics);
  if (!groups.length) return <p className="muted pad">No tickets match these filters.</p>;
  return (
    <div className="board-list">
      {groups.map((g) => (
        <section key={g.id || "none"} className="epic-group" aria-label={`${g.name}, ${g.tickets.length}`}>
          <h3>{g.id ? `${g.id} · ${g.name}` : g.name}<span className="count">{g.tickets.length}</span></h3>
          <ul>
            {g.tickets.map((t) => (
              <li key={t.id}>
                <button type="button" className="board-row" onClick={() => onOpenTicket(t.id)}>
                  <span className="tid">{t.id}</span>
                  <span className="card-name">{t.name}</span>
                  <span className={`pri pri-${t.priority}`}>{t.priority}</span>
                  <span className="row-status">{t.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
