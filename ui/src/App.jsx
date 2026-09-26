/**
 * App — the cockpit-shaped shell: a rail of projects (the switcher, with "All projects" first),
 * eight tabs (Board, Usage, Reports, Project plan, Roster, Documentation, Projects, Help), and a drawer of editor
 * windows on the Board tab. Scope and tab live in the URL (`?scope=&tab=`) so a view is
 * shareable and reload-stable; the operations filters keep their own keys.
 * Board data is cached per board id and refetched after every write.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { Rail } from "./Rail.jsx";
import { BoardWindow } from "./BoardWindow.jsx";
import { TicketWindow } from "./TicketWindow.jsx";
import { PlanWindow } from "./PlanWindow.jsx";
import { SpecWindow } from "./SpecWindow.jsx";
import { AddBoardWindow } from "./AddBoardWindow.jsx";
import { CreateTicketWindow } from "./CreateTicketWindow.jsx";
import { EpicsWindow } from "./EpicsWindow.jsx";
import { ArchiveWindow } from "./ArchiveWindow.jsx";
import { SpecsWindow } from "./SpecsWindow.jsx";
import { OperationsWindow } from "./OperationsWindow.jsx";
import { RosterPage } from "./RosterPage.jsx";
import { DocumentsPage } from "./DocumentsPage.jsx";
import { PlanOverviewPage } from "./PlanOverviewPage.jsx";
import { UsagePage } from "./UsagePage.jsx";
import { HelpPage } from "./HelpPage.jsx";
import { ProjectsPage } from "./ProjectsPage.jsx";
import { WelcomeModal } from "./WelcomeModal.jsx";
import { escapeBelongsToControl } from "./logic.js";
import { planRefresh, startBoardPoller } from "./autoRefresh.js";
import { applyTheme, nextTheme, readTheme } from "./theme.js";
import { ALL, TABS, shellSearch, shellState } from "./shell.js";

/**
 * @typedef {{key: string, type: "ticket" | "create" | "epics" | "specs" | "spec" | "archive" | "add", boardId?: string, ticketId?: string, specId?: string}} Win
 */

/** @param {Omit<Win, "key">} w */
const keyOf = (w) => [w.type, w.boardId, w.ticketId, w.specId].filter(Boolean).join(":");
const initialShell = () => (typeof window === "undefined" ? shellState("") : shellState(window.location.search));
const tabLabel = (/** @type {string} */ key) => TABS.find(([k]) => k === key)?.[1] ?? key;

export function App() {
  const [rail, setRail] = useState(/** @type {any[] | null} */ (null));
  const [railError, setRailError] = useState(/** @type {string | null} */ (null));
  const [cfg, setCfg] = useState(/** @type {any} */ (null));
  const [boards, setBoards] = useState(/** @type {Record<string, {data?: any, error?: string, loading?: boolean}>} */ ({}));
  const [wins, setWins] = useState(/** @type {Win[]} */ ([]));
  const [active, setActive] = useState(/** @type {string | null} */ (null));
  const [shell, setShell] = useState(initialShell);
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try { return globalThis.localStorage?.getItem("mwu-rail") === "collapsed"; } catch { return false; }
  });
  useEffect(() => {
    try { globalThis.localStorage?.setItem("mwu-rail", railCollapsed ? "collapsed" : "open"); } catch { /* private mode */ }
  }, [railCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `${window.location.pathname}${shellSearch(window.location.search, shell)}`);
  }, [shell]);

  const loadRail = useCallback(async () => {
    try {
      const [list, conf] = await Promise.all([api.boards(), api.config()]);
      setRail(list);
      setCfg(conf);
      setRailError(null);
      return list;
    } catch (e) {
      setRailError(/** @type {Error} */ (e).message);
      return null;
    }
  }, []);

  const loadBoard = useCallback(async (/** @type {string} */ id) => {
    setBoards((b) => ({ ...b, [id]: { ...b[id], loading: true } }));
    try {
      const data = await api.board(id);
      setBoards((b) => ({ ...b, [id]: { data } }));
      return data;
    } catch (e) {
      setBoards((b) => ({ ...b, [id]: { error: /** @type {Error} */ (e).message } }));
      return null;
    }
  }, []);

  /** Replace a board's cache with a payload the server handed back (e.g. on 409). */
  const putBoard = useCallback((/** @type {string} */ id, /** @type {any} */ payload) => {
    setBoards((b) => ({ ...b, [id]: { data: { ...(b[id]?.data || {}), ...payload } } }));
  }, []);

  // Auto-refresh (T-019): boards with unsaved edits in an open editor are never reloaded under
  // the user; they get a "changed on disk" notice instead. Typing in the drawer marks its board dirty.
  const dirty = useRef(/** @type {Set<string>} */ (new Set()));
  const [stale, setStale] = useState(/** @type {string[]} */ ([]));
  const [opsTick, setOpsTick] = useState(0);
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const clean = useCallback((/** @type {string} */ id) => {
    dirty.current.delete(id);
    setStale((s) => s.filter((x) => x !== id));
  }, []);

  /** After any write: refetch that board and the rail counts. */
  const afterWrite = useCallback(async (/** @type {string} */ id) => {
    clean(id);
    await Promise.all([loadBoard(id), loadRail()]);
  }, [loadBoard, loadRail, clean]);

  useEffect(() => {
    const poller = startBoardPoller({
      fetchList: api.boards,
      onChange: (changed, list) => {
        setRail(list);
        // Signal the portfolio view to reload in the background; it keeps its state and never moves focus.
        setOpsTick((t) => t + 1);
        const { reload, notice } = planRefresh(changed, { cached: Object.keys(boardsRef.current), dirty: dirty.current });
        reload.forEach((id) => loadBoard(id));
        if (notice.length) setStale((s) => [...new Set([...s, ...notice])]);
      },
    });
    return () => poller.stop();
  }, [loadBoard]);

  useEffect(() => { loadRail(); }, []);

  const scopeId = shell.scope === ALL ? null : shell.scope;
  useEffect(() => {
    if (rail && scopeId && !rail.some((b) => b.id === scopeId)) setScope(ALL);
  }, [rail, scopeId]);
  useEffect(() => {
    if (scopeId && shell.tab === "board" && !boards[scopeId]?.data && !boards[scopeId]?.loading) loadBoard(scopeId);
  }, [scopeId, shell.tab]);

  const setScope = useCallback((/** @type {string} */ scope) => setShell((s) => (s.scope === scope ? s : { ...s, scope })), []);
  const setTab = useCallback((/** @type {string} */ tab) => setShell((s) => ({ ...s, tab })), []);

  // Focus management: remember what opened each window so closing it returns focus there,
  // and move focus into a window when it becomes the visible one (it may be off-screen at 375px).
  const openers = useRef(/** @type {Map<string, Element | null>} */ (new Map()));
  const drawerRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  const open = useCallback((/** @type {Omit<Win, "key">} */ w) => {
    const key = keyOf(w);
    if (typeof document !== "undefined" && !openers.current.has(key)) openers.current.set(key, document.activeElement);
    setWins((ws) => (ws.some((x) => x.key === key) ? ws : [...ws, { ...w, key }]));
    setActive(key);
    // Editors live in the Board tab's drawer: switch there so the window is visible at once.
    if (w.boardId) setShell((s) => ({ ...s, scope: /** @type {string} */ (w.boardId), tab: "board" }));
    else setShell((s) => ({ ...s, tab: "board" }));
  }, []);

  const close = useCallback((/** @type {string} */ key) => {
    const closing = wins.find((x) => x.key === key);
    if (closing?.boardId && !wins.some((x) => x.key !== key && x.boardId === closing.boardId)) clean(closing.boardId);
    const opener = openers.current.get(key);
    openers.current.delete(key);
    const inside = typeof document !== "undefined" && (drawerRef.current?.contains(document.activeElement) || !!document.activeElement?.closest(".taskbar") || document.activeElement === document.body);
    if (inside) {
      // After React commits the removal, return focus to the opener or, failing that, the desk.
      setTimeout(() => {
        const target = opener instanceof HTMLElement && opener.isConnected ? opener : document.querySelector("main.desk");
        if (target instanceof HTMLElement) target.focus();
      }, 0);
    }
    setWins((ws) => {
      const i = ws.findIndex((x) => x.key === key);
      const next = ws.filter((x) => x.key !== key);
      setActive((a) => (a === key ? (next[Math.min(i, next.length - 1)]?.key ?? null) : a));
      return next;
    });
  }, [wins, clean]);

  // Editor windows belong to the project they were opened for; only the current scope's show.
  const panels = useMemo(() => wins.filter((w) => (w.type === "add" ? true : w.boardId === scopeId)), [wins, scopeId]);
  const current = panels.find((w) => w.key === active) ?? panels[panels.length - 1] ?? null;
  const drawerOpen = shell.tab === "board" && current !== null;
  useEffect(() => {
    if (!drawerOpen || !current || !drawerRef.current) return;
    if (drawerRef.current.contains(document.activeElement)) return;
    const heading = drawerRef.current.querySelector(".window .title");
    if (heading instanceof HTMLElement) heading.focus();
  }, [drawerOpen, current?.key]);

  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Escape" && drawerOpen && current && !escapeBelongsToControl(e.target)) close(current.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, current, close]);

  const nameOf = (/** @type {string | undefined | null} */ id) => rail?.find((b) => b.id === id)?.name ?? id ?? "";
  const scopeName = scopeId ? nameOf(scopeId) : "All projects";
  const titleOf = (/** @type {Win} */ w) => {
    if (w.type === "ticket") return w.ticketId ?? "";
    if (w.type === "create") return `New ticket · ${nameOf(w.boardId)}`;
    if (w.type === "epics") return `Epics · ${nameOf(w.boardId)}`;
    if (w.type === "specs") return `Specs · ${nameOf(w.boardId)}`;
    if (w.type === "spec") return `Spec · ${w.specId}`;
    if (w.type === "archive") return `Archive · ${nameOf(w.boardId)}`;
    return "Add board";
  };

  /** @param {Win} w */
  const renderPanel = (w) => {
    const common = { win: w, title: titleOf(w), onClose: () => close(w.key), primary: true };
    const b = w.boardId ? boards[w.boardId] : undefined;
    const bid = /** @type {string} */ (w.boardId);
    switch (w.type) {
      case "ticket":
        return <TicketWindow key={w.key} {...common} state={b} ensureBoard={() => loadBoard(bid)}
          putBoard={(p) => putBoard(bid, p)} afterWrite={() => afterWrite(bid)}
          onOpenSpec={(sid) => open({ type: "spec", boardId: bid, specId: sid })} />;
      case "create":
        return <CreateTicketWindow key={w.key} {...common} state={b}
          putBoard={(p) => putBoard(bid, p)} afterWrite={() => afterWrite(bid)}
          onCreated={(tid) => { close(w.key); open({ type: "ticket", boardId: bid, ticketId: tid }); }} />;
      case "epics":
        return <EpicsWindow key={w.key} {...common} state={b} ensureBoard={() => loadBoard(bid)}
          putBoard={(p) => putBoard(bid, p)} afterWrite={() => afterWrite(bid)} />;
      case "specs":
        return <SpecsWindow key={w.key} {...common} onOpenSpec={(sid) => open({ type: "spec", boardId: bid, specId: sid })} />;
      case "spec":
        return <SpecWindow key={w.key} {...common} />;
      case "archive":
        return <ArchiveWindow key={w.key} {...common} state={b} ensureBoard={() => loadBoard(bid)} />;
      default:
        return <AddBoardWindow key={w.key} {...common} cfg={cfg} onAdded={async (id) => {
          await loadRail();
          close(w.key);
          setShell({ scope: id, tab: "board" });
        }} />;
    }
  };

  const renderTab = () => {
    const title = `${tabLabel(shell.tab)} · ${scopeName}`;
    switch (shell.tab) {
      case "board":
        if (!scopeId) {
          return <OperationsWindow refreshTick={opsTick} title="Operations" primary
            onOpenTicket={(boardId, ticketId) => open({ type: "ticket", boardId, ticketId })}
            onOpenArchive={(boardId) => open({ type: "archive", boardId })} />;
        }
        return <BoardWindow title={scopeName} primary state={boards[scopeId]} onReload={() => loadBoard(scopeId)}
          onOpenTicket={(tid) => open({ type: "ticket", boardId: scopeId, ticketId: tid })}
          onCreateTicket={() => open({ type: "create", boardId: scopeId })}
          onOpenEpics={() => open({ type: "epics", boardId: scopeId })}
          onOpenPlan={() => setTab("plan")}
          onOpenSpecs={() => open({ type: "specs", boardId: scopeId })}
          onOpenArchive={() => open({ type: "archive", boardId: scopeId })}
          onOpenSpec={(sid) => open({ type: "spec", boardId: scopeId, specId: sid })} />;
      case "usage":
        return <UsagePage key={scopeId ?? ALL} scopeId={scopeId} title={title} />;
      case "reports":
        return <DocumentsPage key={`reports:${scopeId ?? ALL}`} kind="reports" scopeId={scopeId} title={title} />;
      case "plan":
        if (!scopeId) return <PlanOverviewPage rail={rail} title={title} onOpenProject={(id) => setScope(id)} />;
        return <PlanWindow key={scopeId} win={{ boardId: scopeId }} title={title} primary />;
      case "projects":
        // Portfolio-level: the registry is shared, so the page ignores the project scope.
        return <ProjectsPage title="Projects" cfg={cfg} rail={rail} onChanged={loadRail}
          onAdd={() => open({ type: "add" })} onOpenProject={(id) => setShell({ scope: id, tab: "board" })} />;
      case "help":
        return <HelpPage title="Help" />;
      case "roster":
        return <RosterPage key={scopeId ?? ALL} scopeId={scopeId} title={title} />;
      default:
        return <DocumentsPage key={`docs:${scopeId ?? ALL}`} kind="docs" scopeId={scopeId} title={title} />;
    }
  };

  return (
    <div className={`shell ${railCollapsed ? "rail-collapsed" : ""}`}>
      <Rail rail={rail} error={railError} active={scopeId} operationsActive={!scopeId}
        onOperations={() => setScope(ALL)} onOpen={(id) => setScope(id)}
        onAdd={() => open({ type: "add" })} onRefresh={loadRail} mode={cfg?.mode}
        projectsActive={shell.tab === "projects"} onProjects={() => setShell({ scope: ALL, tab: "projects" })}
        theme={theme} onTheme={() => setTheme((t) => nextTheme(t))}
        collapsed={railCollapsed} onCollapse={() => setRailCollapsed((c) => !c)} />
      <div className="workspace">
        <h1 className="sr-only">Maestro boards</h1>
        <header className="topbar">
          <div className="topbar-scope">
            <span className="kind">{scopeId ? "project" : "portfolio"}</span>
            <span className="topbar-title">{scopeName}</span>
          </div>
          <nav className="tabs" aria-label="Areas">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" className={`tab ${shell.tab === key ? "is-active" : ""}`}
                aria-current={shell.tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
        </header>
        {shell.tab === "board" && panels.length > 0 && (
          <nav className="taskbar" aria-label="Open windows">
            {panels.map((w) => (
              <div key={w.key} className={`task ${w.key === current?.key ? "is-active" : ""}`}>
                <button type="button" className="task-focus" onClick={() => setActive(w.key)} aria-current={w.key === current?.key ? "true" : undefined}>
                  <span className={`task-glyph glyph-${w.type}`} aria-hidden="true" />
                  {titleOf(w)}
                </button>
                <button type="button" className="task-close" aria-label={`Close ${titleOf(w)}`} onClick={() => close(w.key)}>×</button>
              </div>
            ))}
          </nav>
        )}
        <main className={`desk ${drawerOpen ? "has-companion" : ""}`} tabIndex={-1}>
          {renderTab()}
          {drawerOpen && current && (
            <div className="drawer" ref={drawerRef} onInput={() => { if (current.boardId) dirty.current.add(current.boardId); }}
              onChange={() => { if (current.boardId) dirty.current.add(current.boardId); }}>
              {current.boardId && stale.includes(current.boardId) && (
                <div className="notice notice-warn" role="status">
                  <span>Board changed on disk. </span>
                  <button type="button" className="btn" onClick={() => { const id = /** @type {string} */ (current.boardId); clean(id); loadBoard(id); }}>Reload</button>
                </div>
              )}
              {renderPanel(current)}
            </div>
          )}
        </main>
      </div>
      <WelcomeModal />
    </div>
  );
}
