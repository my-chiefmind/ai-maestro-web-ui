#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "../server/index.mjs";
import { DEFAULT_PORT, loadConfig, loadImportedConfig } from "../server/config.mjs";
import { REGISTRY_RELATIVE_PATH, addRegistryEntry, readRegistry, removeRegistryEntry } from "../server/registry.mjs";

const args = process.argv.slice(2);
const commands = new Set(["start", "add", "remove", "list"]);
const command = commands.has(args[0]) ? args.shift() : "start";

function usage() {
  return `usage:
  ai-maestro-web-ui [start] [--import <registry>] [--allow-host <hostname>] [--no-open]
  ai-maestro-web-ui add <path> [--key <key>] [--label <label>]
  ai-maestro-web-ui remove <key>
  ai-maestro-web-ui list [--import <registry>]

The writable registry is ./${REGISTRY_RELATIVE_PATH}. With no registry, start uses ./maestro, or starts with no projects.
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
  for (const board of config.boards) process.stdout.write(`${board.key}\t${board.label}\t${board.status}\t${board.path}\n`);
}

try {
  if (args.includes("--help") || args.includes("-h")) { process.stdout.write(usage()); process.exit(0); }
  const registryPath = resolve(process.cwd(), REGISTRY_RELATIVE_PATH);

  if (command === "add") {
    const key = takeFlag("key"); const label = takeFlag("label"); const path = args.shift();
    if (!path) throw new Error("add needs a project or capsule path."); finishArgs();
    const result = addRegistryEntry(registryPath, { key, label, path }, { cwd: process.cwd() });
    process.stdout.write(`Added ${result.entry.key}\t${result.entry.path}\n`);
    process.exit(0);
  }

  if (command === "remove") {
    const key = args.shift(); if (!key) throw new Error("remove needs a project key."); finishArgs();
    const result = removeRegistryEntry(registryPath, key);
    process.stdout.write(`Removed ${result.entry.key}; project files were not changed.\n`);
    process.exit(0);
  }

  const importPath = takeFlag("import");
  if (command === "list") {
    finishArgs(); printList(importPath ? loadImportedConfig(importPath) : loadConfig(null)); process.exit(0);
  }

  const allowHost = takeFlag("allow-host"); const noOpen = takeSwitch("no-open"); finishArgs();
  const config = importPath ? loadImportedConfig(importPath) : loadConfig(null);
  if (allowHost) config.allowedHosts.push(allowHost);
  // After a successful self-update: free the port, re-exec this same command (now resolving the
  // freshly installed package), and exit. The page polls /api/config until the new process answers.
  const restart = () => {
    server.closeAllConnections?.();
    server.close(() => {
      spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1).filter((a) => a !== "--no-open"), "--no-open"],
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
    process.stdout.write(`ai-maestro-web-ui listening on ${url} — ${config.mode} mode\n`);
    if (!noOpen && !process.env.CI && process.stdout.isTTY) openBrowser(url);
  });
  server.listen(port, "127.0.0.1");
} catch (error) {
  process.stderr.write(`ai-maestro-web-ui: ${error.message}\n`);
  process.exit(1);
}
