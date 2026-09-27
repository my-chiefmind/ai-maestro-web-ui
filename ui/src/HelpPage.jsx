/**
 * Help tab: the cheat sheet (dashboard commands, ticket statuses, adding projects, keyboard
 * hints) and a short guide to how the dashboard and AI Maestro fit together. Ported from the
 * ai-maestro cockpit's HelpPage/CheatSheet and docs/help.html, adapted to this package.
 */
import { useEffect, useRef, useState } from "react";
import { Window } from "./Window.jsx";
import "./help.css";

// The prompt a user pastes into Claude Code at a project's root. The only copy: the welcome
// dialog and the Help tab both import it.
export const ONBOARDING_PROMPT = `Plan this project in AI Maestro.

Read the brief I gave setup and propose an answer for anything I left as
"propose one", drawn from the ACTUAL codebase (README, manifests, configs)
— not guesses. Then turn the brief into a board: a few outcome-based epics
and small, dependency-ordered tickets, each with acceptance criteria I
could verify, all at status "todo".

Validate the board, then STOP and show me the epics, the tickets in
delivery order, which one is ready first, and every assumption that needs
my approval. Do NOT implement anything yet — once I've approved the plan
I'll ask the orchestrator agent to start.`;

/** Dashboard CLI commands, as bin/ai-maestro-web-ui.mjs accepts them. */
export const COMMANDS = [
  ["npx ai-maestro-web-ui", "Inside a project: show just that project. In a dashboard folder: the dashboard. Serves 127.0.0.1:3021 (next free port if busy) and opens the browser"],
  ["npx ai-maestro-web-ui --no-open", "Start without opening a browser (CI=1 does the same)"],
  ["npx ai-maestro-web-ui dashboard init", "Make the current (non-project) folder a dashboard: creates ai-maestro-dashboard.json"],
  ["npx ai-maestro-web-ui dashboard --home <dir>", "Start the dashboard kept in <dir> from any folder"],
  ["npx ai-maestro-web-ui add <path>", "Dashboard: register a project folder; --key, --label and --home are optional"],
  ["npx ai-maestro-web-ui list", "Dashboard: print the registered projects"],
  ["npx ai-maestro-web-ui remove <key>", "Dashboard: unregister a project; its files are not changed"],
];

/** @param {{cfg?: any}} props */
function ModeNote({ cfg }) {
  if (cfg?.mode === "project") {
    return <p className="help-mode" data-mode="project"><strong>Project mode.</strong> You started inside a project, so only
      this project is shown and projects cannot be added or removed here. To follow several projects, make a separate
      dashboard folder and run <code>npx ai-maestro-web-ui dashboard init</code> there.</p>;
  }
  if (cfg?.mode === "registry") {
    return <p className="help-mode" data-mode="dashboard"><strong>Dashboard mode.</strong> The project list lives in
      <code>{cfg.path}</code>{cfg.home ? <> (dashboard folder <code>{cfg.home}</code>)</> : null}. Project data stays in each
      project's own <code>maestro</code> folder.</p>;
  }
  return null;
}

/** Agent commands, run inside Claude Code at a project's root. */
export const AGENT_COMMANDS = [
  ["/project-plan", "Write the project plan, then turn it into epics and tickets"],
  ["/plan-update", "Fill in the plan section by section and triage gaps"],
  ["/orchestrator", "Build the next unblocked ticket: plan, build, QA, merge"],
];

export const STATUS_HELP = [
  ["backlog", "Captured, not ready to start"],
  ["todo", "Ready; eligible once its dependencies are done"],
  ["in-progress", "An agent is working on it"],
  ["review", "Built; waiting on QA or delivery gates"],
  ["blocked", "Stuck on something outside the ticket"],
  ["done", "Landed; archive it to keep the board small"],
];

/**
 * Copy text: the async clipboard when available, else select a hidden textarea and
 * execCommand("copy"). Resolves true when either path succeeded.
 * @param {string} text @param {{clipboard?: any, doc?: any}} [env]
 */
export async function copyText(text, env = {}) {
  const clipboard = "clipboard" in env ? env.clipboard : globalThis.navigator?.clipboard;
  const doc = "doc" in env ? env.doc : globalThis.document;
  if (clipboard?.writeText) {
    try { await clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  if (!doc?.body) return false;
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  doc.body.appendChild(area);
  try { area.focus?.(); area.select(); return !!doc.execCommand?.("copy"); } catch { return false; } finally { area.remove(); }
}

/** @param {{text: string, label: string}} props */
export function CopyButton({ text, label }) {
  const [state, setState] = useState(/** @type {"" | "ok" | "fail"} */ (""));
  const timer = useRef(/** @type {any} */ (null));
  useEffect(() => () => clearTimeout(timer.current), []);
  const onClick = async () => {
    const ok = await copyText(text);
    setState(ok ? "ok" : "fail");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(""), 1600);
  };
  return <>
    <button type="button" className="btn help-copy" onClick={onClick} aria-label={`${state === "ok" ? "Copied" : label}: ${text.split("\n")[0]}`}>
      {state === "ok" ? "Copied" : label}
    </button>
    <span className="sr-only" role="status">{state === "ok" ? "Copied to clipboard" : state === "fail" ? "Copy failed; select the text instead" : ""}</span>
  </>;
}

/** @param {{rows: string[][], copy?: boolean}} props */
function CommandList({ rows, copy = true }) {
  return <ul className="help-commands">
    {rows.map(([cmd, what]) => <li key={cmd}>
      <code>{cmd}</code><span>{what}</span>
      {copy && <CopyButton text={cmd} label="Copy" />}
    </li>)}
  </ul>;
}

/** @param {{title: string, cfg?: any}} props */
export function HelpPage({ title, cfg }) {
  return <Window title={title} kind="help">
    <div className="help">
      {cfg?.mode === "project"
        ? <p className="help-lede">This page shows one AI Maestro project: its board, plan, reports, usage and roster.
          The work itself is done by AI Maestro agents inside the project; you plan, review and edit here.</p>
        : <p className="help-lede">This dashboard shows every registered AI Maestro project side by side: boards, plans,
          reports, usage and roster. The work itself is done by AI Maestro agents inside each project; you plan,
          review and edit here.</p>}
      <ModeNote cfg={cfg} />

      <section aria-labelledby="help-start">
        <h3 id="help-start">Getting started</h3>
        <ol className="help-steps">
          <li><strong>Single project:</strong> run <code>npx ai-maestro-web-ui</code> inside the project. <strong>Several
            projects:</strong> make a dashboard folder, run <code>npx ai-maestro-web-ui dashboard init</code> there, then click
            <strong> Add board</strong> or run <code>npx ai-maestro-web-ui add &lt;path&gt;</code>. The list lives in the
            dashboard's <code>ai-maestro-dashboard.json</code>.</li>
          <li><strong>Plan it.</strong> In Claude Code at the project root run <code>/project-plan</code>, or paste the prompt below.</li>
          <li><strong>Conduct.</strong> Approve the plan, then run <code>/orchestrator</code>; watch tickets move on the Board tab.</li>
        </ol>
        <h4>Planning prompt</h4>
        <div className="help-prompt">
          <pre>{ONBOARDING_PROMPT}</pre>
          <CopyButton text={ONBOARDING_PROMPT} label="Copy prompt" />
        </div>
      </section>

      <section aria-labelledby="help-cmds">
        <h3 id="help-cmds">Dashboard commands</h3>
        <CommandList rows={COMMANDS} />
        <h4>Agent commands (inside Claude Code)</h4>
        <CommandList rows={AGENT_COMMANDS} />
      </section>

      <section aria-labelledby="help-status">
        <h3 id="help-status">Ticket statuses</h3>
        <dl className="help-statuses">
          {STATUS_HELP.map(([s, what]) => <div key={s}><dt><code>{s}</code></dt><dd>{what}</dd></div>)}
        </dl>
      </section>

      <section aria-labelledby="help-keys">
        <h3 id="help-keys">Keyboard</h3>
        <ul className="help-keys">
          <li><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> move between controls; every action is a button.</li>
          <li><kbd>Esc</kbd> closes the open editor window and returns focus to what opened it.</li>
          <li><kbd>Enter</kbd> or <kbd>Space</kbd> opens a focused ticket card.</li>
          <li>Every view has its own URL (<code>?scope=&amp;tab=</code>), so reload and share keep your place.</li>
        </ul>
      </section>

      <section aria-labelledby="help-guide">
        <h3 id="help-guide">How it works</h3>
        <p>Each project keeps its work in a <code>maestro/</code> folder: the board, plan, specs, reports and usage.
          The dashboard server runs only on <code>127.0.0.1</code> and reads those folders through AI Maestro's own API.</p>
        <p>Edits go back through the same API, which locks the file and checks it has not changed since you loaded it.
          If an agent changed the board meanwhile, you get a conflict notice instead of overwriting their work.</p>
        {cfg?.mode === "project"
          ? <p>Every tab shows this one project. Nothing leaves your machine.</p>
          : <p>Pick <strong>All projects</strong> for one operations view across every project, or a single project for its
            board and plan. Nothing leaves your machine.</p>}
      </section>
    </div>
  </Window>;
}
