/** Board console filters + focus stat cards (T-014). Pure presentational; state lives in BoardWindow. */
import { PRIORITY, STATUSES, NO_INITIATIVE } from "./logic.js";
import "./boardConsole.css";

const FOCUS_CARDS = [["active", "Active"], ["ready", "Ready"], ["gated", "Human gates"], ["blocked", "Blocked"]];

/**
 * @param {{filters: Record<string, string>, onChange: (patch: Record<string, string>) => void,
 *   stats: Record<string, number>, epics: any[], areas: string[], initiatives: string[]}} props
 */
export function BoardFilters({ filters, onChange, stats, epics, areas, initiatives }) {
  /** @param {string} key @param {string} label @param {[string, string][]} options */
  const select = (key, label, options) => (
    <label className="field-inline">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={filters[key]} onChange={(e) => onChange({ [key]: e.target.value })}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
  return (
    <>
      <div className="board-stats" role="group" aria-label="Focus mode">
        {FOCUS_CARDS.map(([key, label]) => (
          <button key={key} type="button" className="stat-card" aria-pressed={filters.focus === key}
            onClick={() => onChange({ focus: filters.focus === key && key !== "active" ? "active" : key })}>
            <span className="stat-value">{stats[key] ?? 0}</span>
            <span className="stat-label">{label}</span>
          </button>
        ))}
      </div>
      <div className="board-filters">
        {select("priority", "Priority", [["", "All priorities"], ...PRIORITY.map((p) => /** @type {[string, string]} */ ([p, p]))])}
        {select("area", "Area", [["", "All areas"], ...areas.map((a) => /** @type {[string, string]} */ ([a, a]))])}
        {select("status", "Status", [["", "All statuses"], ...STATUSES.map((s) => /** @type {[string, string]} */ ([s, s]))])}
        {select("epic", "Epic", [["", "All epics"], ...epics.map((e) => /** @type {[string, string]} */ ([e.id, `${e.id} · ${e.name}`]))])}
        {select("initiative", "Initiative", [["", "All initiatives"], [NO_INITIATIVE, "No initiative"],
          ...initiatives.map((i) => /** @type {[string, string]} */ ([i, i]))])}
        <div className="board-view-toggle" role="group" aria-label="View">
          <button type="button" className="btn" aria-pressed={filters.view === "columns"} onClick={() => onChange({ view: "columns" })}>Columns</button>
          <button type="button" className="btn" aria-pressed={filters.view === "list"} onClick={() => onChange({ view: "list" })}>List</button>
        </div>
      </div>
    </>
  );
}
