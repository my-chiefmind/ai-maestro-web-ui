#!/usr/bin/env node
import { spawn } from "node:child_process";

// The server modules are imported inside the try below: loading them checks the installed
// @mychiefmind/ai-maestro peer, and a too-old kit must print one clear line, not a stack trace.
let createServer, DEFAULT_PORT, detectMode, loadConfig, loadDashboardConfig, loadImportedConfig, NO_DASHBOARD_HELP,
  addRegistryEntry, initDashboard, removeRegistryEntry, restartArgv;

const args = process.argv.slice(2);
const commands = new Set(["start", "dashboard", "add", "remove", "list"]);
const command = commands.has(args[0]) ? args.shift() : "start";

function usage() {
  return `usage:
  ai-maestro-web-ui [start] [--import <registry>] [--allow-host <hostname>] [--no-open]
  ai-maestro-web-ui dashboard init [--home <dir>]
  ai-maestro-web-ui dashboard [--home <dir>] [--allow-host <hostname>] [--no-open]
  ai-maestro-web-ui add <path> [--key <key>] [--label <label>] [--home <dir>]
  ai-maestro-web-ui remove <key> [--home <dir>]
  ai-maestro-web-ui list [--home <dir>] [--import <registry>]

Single project: start inside a project (a folder with ./maestro) to see just that project.
Dashboard: make a folder, run \`dashboard init\` there, then \`add\` projects. The project list
lives in that folder's ai-maestro-dashboard.json; --home <dir> points at a dashboard folder from
anywhere. add, remove, and list act on the dashboard in the current folder (or --home).
start opens the browser when run from a terminal; --no-open or CI=1 skips it.
`;
}

function takeFlag(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  if (args[index + 1] == null || args[index + 1].startsWith("--")) throw new Error(`--${name} needs a value.`);
  const [value] = args.splice(index + 1, 1); args.splice(index, 1); return value;
}

function takeSwitch(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return false;
  args.splice(index, 1); return true;
}

function openBrowser(url) {
  const [cmd, cmdArgs] = process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try { spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch {}
}

function finishArgs(expected = 0) {
  if (args.length !== expected) throw new Error(`Unexpected argument(s): ${args.slice(expected).join(" ") || args.join(" ")}`);
}

function printList(config) {
  process.stdout.write(`MODE\t${config.mode}\n`);
  process.stdout.write(`VERSION\t${config.version ?? "-"}\n`);
  if (config.home) process.stdout.write(`HOME\t${config.home}\n`);
  for (const board of config.boards) process.stdout.write(`${board.key}\t${board.label}\t${board.status}\t${board.path}\n`);
}

try {
  ({ createServer } = await import("../server/index.mjs"));
  ({ DEFAULT_PORT, detectMode, loadConfig, loadDashboardConfig, loadImportedConfig, NO_DASHBOARD_HELP } = await import("../server/config.mjs"));
  ({ addRegistryEntry, initDashboard, removeRegistryEntry } = await import("../server/registry.mjs"));
  ({ restartArgv } = await import("../server/selfUpdate.mjs"));
  if (args.includes("--help") || args.includes("-h")) { process.stdout.write(usage()); process.exit(0); }
  const homeFlag = takeFlag("home");
  if (command === "dashboard" && args[0] === "init") {
    args.shift(); finishArgs();
    const { dir } = detectMode({ cwd: process.cwd(), home: homeFlag, dashboard: true });
    const result = initDashboard(dir);
    process.stdout.write(result.created ? `Created dashboard ${result.path}\nNext: ai-maestro-web-ui add <project path>, then ai-maestro-web-ui dashboard\n`
      : `Dashboard already initialized: ${result.path}\n`);
    process.exit(0);
  }
  // add/remove/list act on an existing dashboard (cwd or --home); never on a project folder.
  const dashboardConfig = () => {
    const { mode, dir } = detectMode({ cwd: process.cwd(), home: homeFlag });
    if (mode === "project") throw new Error(`Project mode: ${command} manages a dashboard's project list. Run it in a dashboard folder or pass --home <dashboard folder>.`);
    if (mode === "none") throw new Error(`No dashboard here: ${NO_DASHBOARD_HELP}`);
    return loadDashboardConfig(dir);
  };

  if (command === "add") {
    const key = takeFlag("key"); const label = takeFlag("label"); const path = args.shift();
    if (!path) throw new Error("add needs a project or capsule path."); finishArgs();
    const result = addRegistryEntry(dashboardConfig().registryPath, { key, label, path }, { cwd: process.cwd() });
    process.stdout.write(`Added ${result.entry.key}\t${result.entry.path}\n`);
    process.exit(0);
  }

  if (command === "remove") {
    const key = args.shift(); if (!key) throw new Error("remove needs a project key."); finishArgs();
    const result = removeRegistryEntry(dashboardConfig().registryPath, key);
    process.stdout.write(`Removed ${result.entry.key}; project files were not changed.\n`);
    process.exit(0);
  }

  const importPath = takeFlag("import");
  if (command === "list") {
    finishArgs(); printList(importPath ? loadImportedConfig(importPath) : dashboardConfig()); process.exit(0);
  }

  const allowHost = takeFlag("allow-host"); const noOpen = takeSwitch("no-open"); finishArgs();
  if (importPath && command === "dashboard") throw new Error("--import starts its own read-only view; use it without dashboard.");
  const config = importPath ? loadImportedConfig(importPath)
    : loadConfig(null, process.cwd(), { dashboard: command === "dashboard", home: homeFlag });
  if (allowHost) config.allowedHosts.push(allowHost);
  // After a successful self-update: free the port, re-exec this same command (now resolving the
  // freshly installed package), and exit. The page polls /api/config until the new process answers.
  const restart = () => {
    server.closeAllConnections?.();
    server.close(() => {
      spawn(process.execPath, restartArgv(process.execArgv, process.argv),
        { cwd: process.cwd(), stdio: "inherit", env: { ...process.env, AI_MAESTRO_WEB_UI_RESTART_PORT: String(port) }, detached: true }).unref();
      process.exit(0);
    });
  };
  const server = createServer({ config, generated: config.mode === "import", selfUpdate: { onRestart: restart } });
  const LAST_PORT = DEFAULT_PORT + 20;
  // A self-update restart keeps the port the page is polling.
  const restartPort = Number(process.env.AI_MAESTRO_WEB_UI_RESTART_PORT);
  let port = Number.isInteger(restartPort) && restartPort > 0 ? restartPort : DEFAULT_PORT;
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < Math.max(LAST_PORT, restartPort || 0)) { port += 1; server.listen(port, "127.0.0.1"); return; }
    process.stderr.write(`ai-maestro-web-ui: cannot bind 127.0.0.1:${port}: ${error.message}\n`);
    process.exit(1);
  });
  server.once("listening", () => {
    const url = `http://127.0.0.1:${port}`;
    if (port !== DEFAULT_PORT) process.stdout.write(`ai-maestro-web-ui: 127.0.0.1:${DEFAULT_PORT} is busy; using ${port}.\n`);
    const label = config.mode === "registry" ? `dashboard mode (${config.home ?? config.path})` : `${config.mode} mode`;
    process.stdout.write(`ai-maestro-web-ui listening on ${url} — ${label}\n`);
    if (!noOpen && !process.env.CI && process.stdout.isTTY) openBrowser(url);
  });
  server.listen(port, "127.0.0.1");
} catch (error) {
  process.stderr.write(`ai-maestro-web-ui: ${error.message}\n`);
  process.exit(1);
}
