import { formatTokens } from "./logic.js";

const W = 140;
const H = 32;

/**
 * A 14-day token trend drawn to scale: bar heights are linear from a zero baseline to the
 * busiest day. The SVG is decorative; the visually hidden list is its text alternative.
 * @param {{ days: {day: string, tokens: number}[], label: string }} props
 */
export function TokenTrend({ days, label }) {
  const max = Math.max(0, ...days.map((d) => d.tokens));
  const slot = W / Math.max(1, days.length);
  const total = days.reduce((n, d) => n + d.tokens, 0);
  return <figure className="ot-trend">
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} className="ot-baseline" />
      {days.map((d, i) => {
        const h = max > 0 ? (d.tokens / max) * (H - 1) : 0;
        return <rect key={d.day} x={i * slot + 1} y={H - 1 - h} width={Math.max(1, slot - 2)} height={h} className="ot-bar" />;
      })}
    </svg>
    <figcaption className="sr-only">
      {`${label}: ${formatTokens(total)} tokens over ${days.length} days (UTC).`}
      <ol>{days.map((d) => <li key={d.day}>{`${d.day}: ${formatTokens(d.tokens)} tokens`}</li>)}</ol>
    </figcaption>
  </figure>;
}
