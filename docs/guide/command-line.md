[← Back to README](../../README.md)

# Command line

The package installs two names for the same command: `ai-maestro-web-ui` and `maestro-hub`.
Before the package is installed, run it as `npx @mychiefmind/ai-maestro-web-ui`.

```sh
npx @mychiefmind/ai-maestro-web-ui   # start: set up a Maestro Hub in an empty folder, project mode in a project
npm start                            # in a Maestro Hub folder: start it again (runs the locally installed package)
npx maestro-hub dashboard init           # make this (non-project) folder a dashboard without starting it
npx maestro-hub dashboard --home <dir>   # start the dashboard kept in <dir>
npx maestro-hub add <path>               # dashboard: register a project folder (--key, --label, --home optional)
npx maestro-hub list                     # dashboard: show registered projects
npx maestro-hub remove <key>             # dashboard: unregister; project files are not touched
npx maestro-hub --no-open                # start without opening the browser
npx maestro-hub --import ./projects.json # read-only view of an existing ai-maestro portfolio registry
npx maestro-hub --allow-host <name>      # also accept this Host name (see How it works)
```

`start` is the default command. The start folder picks the mode:

- a folder with `ai-maestro-dashboard.json` (or `--home <dir>`) is a dashboard;
- otherwise a folder with `./maestro` is project mode;
- anything else becomes a new Maestro Hub: it gets `ai-maestro-dashboard.json`, a `package.json`
  with a `start` script (only if it has none), and one `npm install`.

A folder with both `./maestro` and `ai-maestro-dashboard.json` is refused: a dashboard must not
live inside a project.

Run from a terminal, `start` opens `http://maestro.localhost:<port>` in your browser. It does not
when `--no-open` is passed, stdout is not a terminal, `CI` is set, or `MAESTRO_NO_OPEN=1`.
`MAESTRO_SKIP_INSTALL=1` skips the one-time `npm install` of a new Maestro Hub.

It binds `127.0.0.1:3021`; if that port is busy it tries the next ports up to 3041, prints which one
it used, and fails only if all are busy.
