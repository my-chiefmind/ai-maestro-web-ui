<p align="center"><img src="https://raw.githubusercontent.com/my-chiefmind/ai-maestro-web-ui/main/ui/public/logo.png" alt="Cockpit Maestro" width="160" /></p>

# Cockpit Maestro

**Cockpit Maestro** (`@mychiefmind/ai-maestro-web-ui`) is one place, on your own machine, to see
and edit the boards, plans, reports and token usage of all your
[AI Maestro](https://www.npmjs.com/package/@mychiefmind/ai-maestro) projects.

![Board view of one project, dark theme](https://raw.githubusercontent.com/my-chiefmind/ai-maestro-web-ui/main/assets/board.png)

## Install and run

In any empty folder:

```sh
npx @mychiefmind/ai-maestro-web-ui
```

It sets the folder up as your cockpit, installs it there once, and opens
`http://cockpit.localhost:3021` in your browser.

## Run again

```sh
npm start
```

## Add a project

- Click **Add board** and pick the project folder (the one that contains `./maestro`).
- Or, inside an AI Maestro project, run the same `npx @mychiefmind/ai-maestro-web-ui` command to see just that project.

## Documentation

- [How it works](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/how-it-works.md): the architecture, the address, and custom host names
- [Tour](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/tour.md): every view, with screenshots
- [Command line](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/command-line.md): every command and flag
- [Requirements](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/requirements.md)
- [Advanced / manual setup](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/advanced-setup.md): manual dashboards, `--home`, `add`, import, safety
- [HTTP API](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/http-api.md): the mutation contract and read-only data
- [Token usage](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/token-usage.md)
- [Development](https://github.com/my-chiefmind/ai-maestro-web-ui/blob/main/docs/guide/development.md)

## License

MIT
