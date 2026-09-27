[← Back to README](../../README.md)

# Token usage

Usage reads come from ai-maestro's public aggregate API—this package never reads provider
credentials or calls billing services. `GET /api/boards/:key/usage`
returns one project's orchestration and application usage for every provider;
`GET /api/usage` returns the portfolio merge and lists unreadable projects separately. Both
responses include registry identity, freshness, token classes, attribution coverage,
provenance, unassigned usage, and the canonical upstream report. CSV uses the same figures:

```text
GET /api/boards/my-project/usage?format=csv&view=provider
GET /api/usage?format=csv&view=project
```

CSV views are `tickets`, the published single-project dimensions (`model`, `agent`, `runtime`,
`provider`, `stage`, `date`), and—in portfolio scope—`project` and `provenance`. Unknown query
parameters, formats, and views are rejected rather than ignored.

The Usage tab shows the portfolio (All projects) or the selected project. It shows token counts only—no prices or costs. Headline counters always show
the canonical complete-report totals; provider, model, runtime, provenance, project, ticket, date,
and token-class controls are visibility filters and do not relabel filtered figures as new totals.
The source guide keeps orchestration (agent work on tickets) separate from application calls,
whatever the provider. Filter state uses only `u_*` URL parameters, while JSON
exports download without storing report data in browser storage or history. CSV is served by the endpoints above for scripts; the UI client never sends query strings.
