[← Back to README](../../README.md)

# Development

```sh
npm ci
npx playwright install chromium
npm run build
npm test
npm start -- --no-open
```

`npm run build` creates `ui/dist`. The published package is designed to include that prebuilt UI,
so consumers do not need Vite or React at runtime.

`npm run test:upgrade` is a separate, network-using upgrade-safety suite (not part of `npm test`).
It builds temp projects on old kit versions (0.1.29, the newest 0.5.x, 0.6.0, 0.6.9) with seeded
boards and customisations, runs the real "Update" path (`POST /api/updates/run`) against them,
and checks that no user data is lost, the upgraded web UI serves the projects, and injected
step failures stop the run cleanly. It prints a per-version table. `UPGRADE_KIT_VERSIONS=0.6.9`
narrows it; `UPGRADE_KEEP=1` keeps the temp dir. It installs this checkout's `npm pack` instead
of `@latest` through the test-only `AI_MAESTRO_WEB_UI_TEST_UI_SPEC` env override, which is
honoured only when it is an absolute path to an existing `.tgz` file.
