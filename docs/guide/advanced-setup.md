[← Back to README](../../README.md)

# Advanced / manual setup

The one-command setup (`npx @mychiefmind/ai-maestro-web-ui` in an empty folder) is the usual
way. These are the manual steps it replaces, and the options behind them.

## Manual dashboard

```sh
mkdir ~/my-dashboard && cd ~/my-dashboard
npm init -y && npm i @mychiefmind/ai-maestro @mychiefmind/ai-maestro-web-ui
npx maestro-hub dashboard init        # creates ./ai-maestro-dashboard.json
npx maestro-hub add ~/source/my-app   # or click Add board in the UI
npx maestro-hub
```

The header says **Dashboard** (hover it for the folder). The dashboard file only lists project
paths; each project's tickets, specs and usage stay in that project's own `maestro` folder. A
dashboard must not live inside a project, so `dashboard init` refuses a folder with `./maestro`.
From anywhere else, `npx maestro-hub dashboard --home ~/my-dashboard` starts it.

## Single project

```sh
cd ~/source/my-app            # a project with ./maestro
npm install --save-dev @mychiefmind/ai-maestro @mychiefmind/ai-maestro-web-ui   # or just use npx
npx ai-maestro-web-ui
```

Only that project is shown (the header says **Project**). There is no project management here:
no Add board, no Projects tab, and nothing is written besides the project's own board edits. The
project-management routes (`/api/config/boards…`, `/api/fs/dirs`) answer `403` with
"Project mode: start the dashboard to manage projects".

## Registering projects from the command line

Run these in the dashboard folder (or pass `--home <dir>`). The path may name either the project
root or its `maestro` capsule. In a project folder these commands refuse:

```sh
npx maestro-hub add ~/source/my-app
npx maestro-hub add "~/source/a project" --key a-project --label "A Project"
npx maestro-hub list
npx maestro-hub remove a-project
```

The dashboard file is `<dashboard folder>/ai-maestro-dashboard.json` and has one deliberately small format:

```json
[
  { "key": "my-app", "label": "My App", "path": "/Users/me/source/my-app/maestro" }
]
```

Paths are stored as canonical absolute capsule paths. Duplicate keys and paths are refused. Add
and remove take a registry lock, re-read under that lock, and atomically replace the registry;
the HTTP form additionally uses a content version and returns `409` on a stale edit. Removing a
key only changes this registry—it never deletes or edits project files. Deleting a project folder
never touches the dashboard file either; that project just shows as unavailable until removed.

An entry may also carry `"status": "active" | "parked"` (absent means active; older files stay
valid and are not rewritten). A parked project stays in the registry and in `/api/config`, but it
leaves the rail, `/api/boards`, `/api/operations`, and every portfolio aggregate, and addressing it
returns `404`. Park or unpark with `PATCH /api/config/boards/:key` and
`{ "status": "parked", "expectVersion": "…" }` (lock, compare-and-swap, atomic write; `409` on a
stale version, `400` on any other status); unparking removes the field again.

The **Projects** tab (also "Manage projects" in the rail) lists every registered project—active
first, then parked—with its key, path, status, and ticket counts, and lets you add, park, unpark,
or remove one. A stale edit is reported in the page and the list is refreshed. Project mode has no
Projects tab. In import mode the list is shown read-only.

## Importing an ai-maestro portfolio registry

To reuse an existing ai-maestro portfolio registry (`projects.json`) without copying it, import it
explicitly:

```sh
npx maestro-hub --import ./projects.json
npx maestro-hub list --import ./projects.json
```

Imported registries are read-only. Both `active` and `parked` status are retained; a parked entry
without a capsule remains visible as unavailable. Nested ai-maestro registries are supported.

## Safety

The server binds only to `127.0.0.1`. Requests are checked against the loopback host allowlist
(including `maestro.localhost`); add `--allow-host <name>` when a trusted local reverse proxy uses
another hostname. Every API request selects a project by registry key only—request input is never
interpreted as a filesystem path. Before every project use, the server rechecks that its canonical
directory has not been replaced by a symlink.

Registry errors fail closed: malformed input and capsules return `400`, stale versions return
`409`, duplicate keys/paths return `409`, missing keys return `404`, and lock timeouts return
`423`. A malformed registry also prevents startup. Recover by fixing or restoring
`ai-maestro-dashboard.json`; project capsules are independent and are never rewritten by registry
commands.
