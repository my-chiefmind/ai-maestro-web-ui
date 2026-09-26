import { formatTokens } from "./logic.js";

/**
 * A project's tickets ranked by total tokens (highest first). Token counts only.
 * @param {{ tickets: {id: string, name: string, tokens: number}[], label: string, limit?: number }} props
 */
export function TicketTokenList({ tickets, label, limit = 5 }) {
  if (tickets.length === 0) return <p className="ot-state">No ticket tokens recorded.</p>;
  return <ol className="ot-tickets" aria-label={label}>
    {tickets.slice(0, limit).map((t) => <li key={t.id}>
      <span className="ot-ticket" title={t.name}><span className="ot-ticket-id">{t.id}</span> {t.name}</span>
      <span className="ot-ticket-tokens">{formatTokens(t.tokens)}</span>
    </li>)}
  </ol>;
}
