/** Window chrome: a title bar with a kind label, actions, and a close button. */
import { useId } from "react";

/**
 * @param {{title: string, kind: string, onClose?: () => void, actions?: import("react").ReactNode,
 *   children: import("react").ReactNode, primary?: boolean}} props
 */
export function Window({ title, kind, onClose, actions, children, primary = true }) {
  const id = useId();
  return (
    <section className={`window window-${kind} ${primary ? "is-primary" : "is-companion"}`} aria-labelledby={id}>
      <header className="titlebar">
        {onClose && <button type="button" className="close-dot" aria-label={`Close ${title}`} onClick={onClose} />}
        <span className="kind">{kind}</span>
        <h2 id={id} className="title" tabIndex={-1}>{title}</h2>
        <div className="actions">{actions}</div>
      </header>
      <div className="window-body">{children}</div>
    </section>
  );
}

/** @param {{lines: string[], tone?: "error" | "warn" | "ok", title?: string}} props */
export function Notice({ lines, tone = "error", title }) {
  if (!lines.length) return null;
  return (
    <div className={`notice notice-${tone}`} role={tone === "ok" ? "status" : "alert"}>
      {title && <strong>{title}</strong>}
      {lines.length === 1 && !title ? <span>{lines[0]}</span> : (
        <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      )}
    </div>
  );
}
