[← Back to README](../../README.md)

# How it works

AI Maestro keeps each project's work in a `maestro/` folder inside that project: the board of
tickets, the plan, specs, reports and usage records. Cockpit Maestro is a window onto those
folders.

- **It runs only on your machine.** The server listens on `127.0.0.1` and nothing leaves it.
- **Your project data stays with AI Maestro.** Boards, plans and specs are read and written
  through AI Maestro's own API, with locking, so Cockpit Maestro and your agents can work on the
  same board safely.
- **It shows many projects at once.** Register as many projects as you like by path. Each one
  keeps its own `maestro/` folder.

![How it works: projects on disk connect through the AI Maestro API to the dashboard server, which serves your browser over loopback-only HTTP](https://raw.githubusercontent.com/my-chiefmind/ai-maestro-web-ui/main/assets/architecture.svg)

1. You run `npx @mychiefmind/ai-maestro-web-ui` inside a project (project mode: just that
   project) or in a cockpit folder (dashboard mode: many projects). An empty folder becomes a
   cockpit the first time.
2. In dashboard mode the server reads the project list from that folder's
   `ai-maestro-dashboard.json`. Project mode reads no list at all.
3. For each project it asks AI Maestro for the board, plan, reports and usage.
4. Your browser shows it. When you edit a ticket or plan, the change goes back through AI
   Maestro, which checks the file has not changed since you loaded it before saving.

## The address

The server binds `127.0.0.1` only, on port 3021 (or the next free port up to 3041). Open it at
`http://cockpit.localhost:3021`: Chrome, Edge and Firefox on Mac and Windows send any
`*.localhost` name to your own machine with no setup. `http://127.0.0.1:3021` always works too.

Requests are checked against a host allowlist to stop DNS-rebinding: `localhost`, `127.0.0.1`,
`[::1]` and `*.localhost` names (so `cockpit.localhost`) are accepted; every other name is
refused unless you start with `--allow-host <name>`.

### A custom name like cockpit.loc

Not supported by default; use `cockpit.localhost`. If a trusted local setup needs another name,
point it at your machine in the hosts file and allow it explicitly:

```text
127.0.0.1 cockpit.loc
```

- Mac: `/etc/hosts` (edit with `sudo`).
- Windows: `C:\Windows\System32\drivers\etc\hosts` (open Notepad as Administrator).

Then start with `--allow-host cockpit.loc`.
