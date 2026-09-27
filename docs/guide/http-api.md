[← Back to README](../../README.md)

# HTTP API

## Mutation contract

All project routes select a configured project by key; none accepts a filesystem path. Board,
plan, and spec writes are targeted operations with compare-and-swap versions. Read the resource,
send its returned `version` as `expectVersion`, and handle `409` by rebasing onto the fresh
resource included in the response. Creating a spec uses `sha256:absent` as its expected version.
There is no whole-board, whole-plan, or arbitrary-file PUT endpoint.

The plan endpoint accepts only the public targeted operations exposed by ai-maestro: goal and
scope changes, plan-item and gap changes, and initiative changes. Ticket archival and dropping
are separate operations so `data.json` and `archive.json` move together under the board lock.
Spec discovery delegates to ai-maestro's safe, non-recursive `listSpecs` API and returns only
direct regular Markdown specs with their content versions; unsafe names and symlinks are never
followed.
Invalid input returns `400`, missing resources `404`, stale versions `409`, and a held writer
lock `423` with safe holder details.

## Read-only project data

Three cockpit areas have no public ai-maestro API yet, so the server lists them itself, read-only,
under the registered project: the roster (`/api/boards/<key>/roster`) scans the project's
`.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.codex/agents/*.toml` and
`.agents/skills/*/SKILL.md`, merging same-named entries and tagging each with its targets; reports
(`/api/boards/<key>/reports[/<id>]`) and docs (`/api/boards/<key>/docs[/<id>]`) list and return
`.md` and `.html` files from `board/reports` and the capsule's `docs`. `/api/roster`,
`/api/reports` and `/api/docs` aggregate every readable project and isolate failures per project.
Entry ids are strict single segments, symlinked entries are skipped and refused, home-level
`~/.claude`, `~/.codex` and `~/.agents` are never scanned, and no response carries a filesystem path.
