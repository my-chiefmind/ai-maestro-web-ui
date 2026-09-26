/** Board window: status columns or an epic-grouped list, with URL-backed filters, focus modes and drag-to-move. */
import { useEffect, useMemo, useState } from "react";
import { Window, Notice } from "./Window.jsx";
import { BoardFilters } from "./BoardFilters.jsx";
import { BoardList } from "./BoardList.jsx";
import { api, ApiError } from "./api.js";
import { mergeSearch } from "./shell.js";
import {
  EMPTY_BOARD_FILTERS, boardAreas, boardFilterParams, boardFilterState, boardInitiatives, boardStats,
  eligibilityLines, errorLines, filterBoardTickets, groupByStatus, shortVersion,
} from "./logic.js";
import "./boardConsole.css";

const DRAG_TYPE = "text/x-ticket-id";
const initialFilters = () => typeof window === "undefined" ? { ...EMPTY_BOARD_FILTERS } : boardFilterState(window.location.search);

/**
 * @param {{win: any, title: string, primary: boolean, onClose: () => void, state?: {data?: any, error?: string, loading?: boolean},
 *   onReload: () => void, onOpenTicket: (tid: string) => void, onCreateTicket: () => void, onOpenPlan: () => void,
 *   onOpenEpics: () => void, onOpenSpecs: () => void, onOpenArchive: () => void, onOpenSpec: (sid: string) => void}} props
 */
export function BoardWindow({ title, primary, onClose, state, onReload, onOpenTicket, onCreateTicket, onOpenPlan, onOpenEpics, onOpenSpecs, onOpenArchive, onOpenSpec }) {
  const [filters, setFilters] = useState(initialFilters);
  const [specId, setSpecId] = useState("");
  const [dragOver, setDragOver] = useState("");
  const [moveError, setMoveError] = useState(/** @type {{title: string, lines: string[]} | null} */ (null));
  const [moving, setMoving] = useState(false);
  const data = state?.data;
  const tickets = data?.tickets ?? [];
  const epics = data?.epics ?? [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { keys, own, defaults } = boardFilterParams(filters);
    const search = mergeSearch(window.location.search, keys, own, defaults);
    if (search !== window.location.search) window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
  }, [filters]);

  const patchFilters = (/** @type {Record<string, string>} */ patch) => setFilters((f) => ({ ...f, ...patch }));
  const stats = useMemo(() => boardStats(tickets), [tickets]);
  const shown = useMemo(() => filterBoardTickets(tickets, epics, filters), [tickets, epics, filters]);
  const cols = useMemo(() => groupByStatus(shown), [shown]);

  /** Move a ticket via the status route, guarded by the board version we rendered. */
  const moveTicket = async (/** @type {string} */ tid, /** @type {string} */ status) => {
    const ticket = tickets.find((/** @type {any} */ t) => t.id === tid);
    if (!ticket || ticket.status === status || !data?.id || moving) return;
    setMoving(true);
    setMoveError(null);
    try {
      await api.setStatus(data.id, tid, status, data.version);
      await onReload();
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      setMoveError({
        title: conflict ? `The board changed since you loaded it — ${tid} was not moved. Reload and try again.` : `Could not move ${tid}`,
        lines: err instanceof ApiError ? errorLines(err) : [String(/** @type {any} */ (err)?.message ?? err)],
      });
    } finally {
      setMoving(false);
    }
  };

  const epicName = (/** @type {string} */ id) => data?.epics?.find((/** @type {any} */ e) => e.id === id)?.name ?? id;

  return (
    <Window title={title} kind="board" onClose={onClose} primary={primary} actions={<>
      <button type="button" className="btn" onClick={onCreateTicket}>New ticket</button>
      <button type="button" className="btn" onClick={onOpenEpics}>Epics</button>
      <button type="button" className="btn" onClick={onOpenPlan}>Plan</button>
      <button type="button" className="btn" onClick={onOpenSpecs}>Specs</button>
      <button type="button" className="btn" onClick={onOpenArchive}>Archive</button>
      <button type="button" className="btn" onClick={onReload} aria-label="Reload board">↻</button>
    </>}>
      {state?.error && <Notice lines={[state.error]} title="This board failed to load" />}
      {!data && !state?.error && <p className="muted pad loading">Loading board…<span className="spinner" aria-hidden="true" /></p>}
      {data && (
        <>
          <div className="toolbar">
            <label className="field-inline">
              <span className="sr-only">Filter tickets</span>
              <input type="search" placeholder="Filter id, name, area" value={filters.q} onChange={(e) => patchFilters({ q: e.target.value })} />
            </label>
            <form className="field-inline spec-open" onSubmit={(e) => { e.preventDefault(); if (specId.trim()) onOpenSpec(specId.trim()); }}>
              <label>
                <span className="sr-only">Spec id</span>
                <input placeholder="spec id" value={specId} onChange={(e) => setSpecId(e.target.value)} />
              </label>
              <button type="submit" className="btn">Open spec</button>
            </form>
            <span className="version" title="Board version you are editing against">v {shortVersion(data.version)}</span>
          </div>
          <BoardFilters filters={filters} onChange={patchFilters} stats={stats} epics={epics}
            areas={boardAreas(tickets)} initiatives={boardInitiatives(epics)} />
          {moveError && <Notice title={moveError.title} lines={moveError.lines} />}
          {filters.view === "list" ? <BoardList tickets={shown} epics={epics} onOpenTicket={onOpenTicket} /> : (
          <div className="columns" role="list" aria-label="Status columns">
            {cols.map((c) => (
              <section key={c.status} className={`column st-${c.status}${dragOver === c.status ? " drop-target" : ""}`} role="listitem"
                aria-label={`${c.status}, ${c.tickets.length}`}
                onDragOver={(e) => { e.preventDefault(); if (dragOver !== c.status) setDragOver(c.status); }}
                onDragLeave={() => setDragOver((s) => s === c.status ? "" : s)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver("");
                  const tid = e.dataTransfer?.getData(DRAG_TYPE);
                  if (tid) moveTicket(tid, c.status);
                }}>
                <h3 className="column-head"><span className="dot" aria-hidden="true" />{c.status}<span className="count">{c.tickets.length}</span></h3>
                <ul className="cards">
                  {c.tickets.map((/** @type {any} */ t, i) => (
                    <li key={t.id} className="reveal" style={{ "--i": i }} draggable="true"
                      onDragStart={(e) => { e.dataTransfer?.setData(DRAG_TYPE, t.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}>
                      <button type="button" className="card" onClick={() => onOpenTicket(t.id)}>
                        <span className="card-top">
                          <span className="tid">{t.id}</span>
                          <span className={`pri pri-${t.priority}`}>{t.priority}</span>
                          <span className="swag">{t.swag}</span>
                        </span>
                        <span className="card-name">{t.name}</span>
                        {t.epicId && <span className="card-epic">{epicName(t.epicId)}</span>}
                        {t.eligibility && <span className={`card-ready ${t.eligibility.eligible ? "yes" : "no"}`}>{eligibilityLines(t).join(" · ")}</span>}
                      </button>
                    </li>
                  ))}
                  {c.tickets.length === 0 && <li className="empty">—</li>}
                </ul>
              </section>
            ))}
          </div>
          )}
        </>
      )}
    </Window>
  );
}
