/**
 * Usage tab. The full dashboard is T-010's; until that lands (or when the server has no usage
 * endpoint) this tab shows an explicit "not available" state instead of an error. When the
 * endpoint exists it shows the payload's top-level totals so the tab is never a dead end.
 */
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import { usageUnavailable } from "./shell.js";

/** @param {{scopeId: string | null, title: string}} props */
export function UsagePage({ scopeId, title }) {
  const [state, setState] = useState(/** @type {{status: "loading" | "unavailable" | "error" | "ready", payload?: any, error?: string}} */ ({ status: "loading" }));

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    api.usage(scopeId).then(
      (payload) => { if (live) setState({ status: "ready", payload }); },
      (e) => { if (live) setState(usageUnavailable(e) ? { status: "unavailable" } : { status: "error", error: e.message || "Could not load usage." }); },
    );
    return () => { live = false; };
  }, [scopeId]);

  const totals = state.payload && typeof state.payload === "object"
    ? Object.entries(state.payload.totals ?? state.payload).filter(([, v]) => typeof v === "number") : [];

  return <Window title={title} kind="usage">
    {state.status === "loading" && <p className="muted pad loading">Loading usage…<span className="spinner" aria-hidden="true" /></p>}
    {state.status === "error" && <Notice lines={[state.error ?? ""]} title="Usage failed to load" />}
    {state.status === "unavailable" && <div className="empty-state" role="status">
      <h3>Usage is not available yet</h3>
      <p>This server build has no usage endpoint. The Codex and DeepSeek token dashboard ships with ticket T-010, which is waiting on a compatible ai-maestro release.</p>
    </div>}
    {state.status === "ready" && (totals.length ? <dl className="stat-grid" aria-label="Usage totals">
      {totals.map(([key, value]) => <div key={key} className="stat"><dt>{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd>{value.toLocaleString()}</dd></div>)}
    </dl> : <p className="muted pad">Usage data is available but has no totals to show.</p>)}
  </Window>;
}
