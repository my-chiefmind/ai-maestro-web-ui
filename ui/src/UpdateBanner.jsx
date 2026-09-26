import { useEffect, useRef, useState } from "react";
import { fetchUpdates, runUpdates, updateSummary, waitForServer } from "./updateApi.js";

/**
 * Self-update banner: shows when a newer kit / web UI is published, lists the projects that
 * are behind, and runs the server-side update with its output streamed live.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState(/** @type {any} */ (null));
  const [phase, setPhase] = useState("idle"); // idle | running | restarting | failed
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  const logRef = useRef(/** @type {HTMLPreElement | null} */ (null));

  useEffect(() => { fetchUpdates().then(setStatus).catch(() => {}); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const summary = updateSummary(status);
  if (!summary && phase === "idle") return null;
  const behind = (status?.projects ?? []).filter((p) => status.behind?.includes(p.key));

  const start = async () => {
    setPhase("running"); setLog(""); setError("");
    const append = (t) => setLog((l) => l + t);
    try {
      const done = await runUpdates((ev) => {
        if (ev.type === "project") append(`\n== ${ev.label} ==\n`);
        else if (ev.type === "step") append(`$ ${ev.command}\n`);
        else if (ev.type === "out" || ev.type === "err") append(ev.text);
        else if (ev.type === "exit" && ev.code !== 0) append(`[${ev.label} exited ${ev.code}]\n`);
      });
      if (!done.ok) { setPhase("failed"); setError(`${done.project ? `${done.project}: ` : ""}${done.error}`); return; }
      if (!done.restarting) { window.location.reload(); return; }
      setPhase("restarting");
      if (await waitForServer()) window.location.reload();
      else { setPhase("failed"); setError("The web UI did not come back after restarting. Start it again from your terminal."); }
    } catch (e) { setPhase("failed"); setError(String(/** @type {Error} */ (e).message)); }
  };

  return (
    <div className={`notice update-banner ${phase === "failed" ? "notice-error" : "notice-warn"}`} role="status">
      {summary && <strong>{summary}</strong>}
      {behind.length > 0 && (
        <ul className="update-projects">
          {behind.map((p) => (
            <li key={p.key}>{p.label}: kit {p.kit ?? "?"}{p.usesUi ? `, web UI ${p.ui ?? "?"}` : ""}</li>
          ))}
        </ul>
      )}
      {phase === "idle" && <button type="button" className="btn" onClick={start}>Update</button>}
      {phase === "running" && <span>Updating…</span>}
      {phase === "restarting" && <span>Restarting the web UI…</span>}
      {phase === "failed" && (
        <>
          <span className="update-error">Update failed: {error}</span>{" "}
          <button type="button" className="btn" onClick={start}>Retry</button>
        </>
      )}
      {log && <pre ref={logRef} className="update-log" aria-label="Update output">{log}</pre>}
    </div>
  );
}
