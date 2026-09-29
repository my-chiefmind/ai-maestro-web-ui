/** The topbar's right-hand icon buttons: refresh boards, add a board, manage projects, check for updates. */

const Icon = {
  refresh: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" /></svg>,
  plus: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>,
  list: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.5" cy="4" r="0.6" /><circle cx="2.5" cy="8" r="0.6" /><circle cx="2.5" cy="12" r="0.6" /></svg>,
  update: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 10.5V2.5M5 5.5l3-3 3 3" /><path d="M2.5 10v2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2" /></svg>,
};

/**
 * Each button is icon-only; its name stays in the tooltip and for screen readers. A missing handler hides its button.
 * @param {{ onRefresh?: () => void, onAdd?: () => void, onProjects?: () => void, projectsActive?: boolean,
 *   onCheckUpdates?: () => void }} props
 */
export function TopbarActions({ onRefresh, onAdd, onProjects, projectsActive = false, onCheckUpdates }) {
  return (
    <div className="topbar-actions">
      {onRefresh && <button type="button" className="top-btn" onClick={onRefresh} title="Refresh boards">{Icon.refresh}<span className="sr-only">Refresh boards</span></button>}
      {onAdd && <button type="button" className="top-btn is-add" onClick={onAdd} title="Add board">{Icon.plus}<span className="sr-only">Add board</span></button>}
      {onProjects && (
        <button type="button" className={`top-btn ${projectsActive ? "is-active" : ""}`} onClick={onProjects} title="Manage projects"
          aria-current={projectsActive ? "page" : undefined}>{Icon.list}<span className="sr-only">Manage projects</span></button>
      )}
      {onCheckUpdates && <button type="button" className="top-btn" onClick={onCheckUpdates} title="Check for updates">{Icon.update}<span className="sr-only">Check for updates</span></button>}
    </div>
  );
}
