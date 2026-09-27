[← Back to README](../../README.md)

# Command line

The package installs two names for the same command: `ai-maestro-web-ui` and `cockpit`.
Before the package is installed, run it as `npx @mychiefmind/ai-maestro-web-ui`.

```sh
npx @mychiefmind/ai-maestro-web-ui   # start: set up a cockpit in an empty folder, project mode in a project
npm start                            # in a cockpit folder: start it again (runs the locally installed package)
npx cockpit dashboard init           # make this (non-project) folder a dashboard without starting it
npx cockpit dashboard --home <dir>   # start the dashboard kept in <dir>
npx cockpit add <path>               # dashboard: register a project folder (--key, --label, --home optional)
npx cockpit list                     # dashboard: show registered projects
npx cockpit remove <key>             # dashboard: unregister; project files are not touched
npx cockpit --no-open                # start without opening the browser
npx cockpit --import ./projects.json # read-only view of an existing ai-maestro portfolio registry
npx cockpit --allow-host <name>      # also accept this Host name (see How it works)
```

`start` is the default command. The start folder picks the mode:

- a folder with `ai-maestro-dashboard.json` (or `--home <dir>`) is a dashboard;
- otherwise a folder with `./maestro` is project mode;
- anything else becomes a new cockpit: it gets `ai-maestro-dashboard.json`, a `package.json`
  with a `start` script (only if it has none), and one `npm install`.

A folder with both `./maestro` and `ai-maestro-dashboard.json` is refused: a dashboard must not
live inside a project.

Run from a terminal, `start` opens `http://cockpit.localhost:<port>` in your browser. It does not
when `--no-open` is passed, stdout is not a terminal, `CI` is set, or `COCKPIT_NO_OPEN=1`.
`COCKPIT_SKIP_INSTALL=1` skips the one-time `npm install` of a new cockpit.

It binds `127.0.0.1:3021`; if that port is busy it tries the next ports up to 3041, prints which one
it used, and fails only if all are busy.
