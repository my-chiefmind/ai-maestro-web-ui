/**
 * WelcomeModal — shown once, on the first visit: the onboarding prompt to paste into an agent,
 * with a Copy button. "Don't show again" (or "Got it") is remembered in localStorage; the same
 * content lives on the Help tab. Storage failures (private mode) never break rendering.
 */
import { useEffect, useId, useRef, useState } from "react";
import { ONBOARDING_PROMPT, CopyButton } from "./HelpPage.jsx";
import "./help.css";

export const WELCOME_KEY = "mwu-welcome-v1";

/** Whether the welcome (storage defaults to localStorage, resolved inside the try) was dismissed for good. Unreadable storage counts as "not seen". */
export function welcomeSeen(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(WELCOME_KEY) === "1"; } catch { return false; }
}

/** Persist the dismissal; returns false when storage is unavailable. */
export function markWelcomeSeen(storage) {
  try { const store = storage ?? globalThis.localStorage; if (!store) return false; store.setItem(WELCOME_KEY, "1"); return true; } catch { return false; }
}

/** @param {{onClose?: () => void}} props */
export function WelcomeModal({ onClose, projectMode = false }) {
  const [open, setOpen] = useState(() => !welcomeSeen());
  const [dontShow, setDontShow] = useState(true);
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const opener = useRef(/** @type {Element | null} */ (null));

  const close = () => {
    if (dontShow) markWelcomeSeen();
    setOpen(false);
    onClose?.();
    const target = opener.current;
    setTimeout(() => {
      const el = target instanceof HTMLElement && target.isConnected && target !== document.body ? target : document.querySelector("main.desk");
      if (el instanceof HTMLElement) el.focus();
    }, 0);
  };

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    opener.current = document.activeElement;
    const heading = dialogRef.current?.querySelector("h2");
    if (heading instanceof HTMLElement) heading.focus();
  }, [open]);

  if (!open) return null;

  /** Escape closes; Tab stays inside the dialog. @param {import("react").KeyboardEvent} e */
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = [...dialogRef.current.querySelectorAll("button, input, [href], [tabindex]:not([tabindex='-1'])")];
    if (!items.length) return;
    const first = /** @type {HTMLElement} */ (items[0]);
    const last = /** @type {HTMLElement} */ (items[items.length - 1]);
    const activeEl = document.activeElement;
    if (e.shiftKey && (activeEl === first || !dialogRef.current.contains(activeEl) || activeEl === dialogRef.current.querySelector("h2"))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="welcome-backdrop">
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
        ref={dialogRef} onKeyDown={onKeyDown}>
        <header className="welcome-head">
          <p className="help-eyebrow">Welcome to the Maestro dashboard</p>
          <h2 id={titleId} tabIndex={-1}>Plan your first project</h2>
        </header>
        <div className="welcome-body">
          <p id={descId}>{projectMode
            ? <>Paste this prompt into Claude Code (or any agentic tool) at this project's root. The agent writes the plan
              and board; you review them here.</>
            : <>Add a project with <strong>Add board</strong>, then paste this prompt into Claude Code (or any
              agentic tool) at that project's root. The agent writes the plan and board; you review them here.</>}</p>
          <div className="help-prompt">
            <pre>{ONBOARDING_PROMPT}</pre>
            <CopyButton text={ONBOARDING_PROMPT} label="Copy prompt" />
          </div>
          <p className="muted">You can find this again on the <strong>Help</strong> tab.</p>
        </div>
        <footer className="welcome-foot">
          <label className="welcome-check">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            Don't show again
          </label>
          <button type="button" className="btn btn-primary" onClick={close}>Got it</button>
        </footer>
      </div>
    </div>
  );
}
