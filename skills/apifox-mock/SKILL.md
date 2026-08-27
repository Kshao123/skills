---
name: apifox-mock
description: Create or update mock endpoints in an Apifox project from an OpenAPI 3.0 document, then resolve each endpoint's apiId and mock URL so client code can call it. Covers credential lookup, the import and export REST calls, Apifox vendor extensions, and x-apifox-mock (Mock.js) value rules that stay self-consistent. Use when the user asks to mock an API in Apifox, import OpenAPI into Apifox, point a service at an Apifox mock URL, look up an apiId or mock address, or stand in for a backend endpoint that does not exist yet.
license: MIT
compatibility: Requires Node.js 18+, curl, and network access to api.apifox.com. Reads the Apifox access token and project id from the local MCP configuration or the APIFOX_ACCESS_TOKEN environment variable.
allowed-tools: Read Write Grep Glob Bash(node:*) Bash(curl:*) Bash(cygpath:*)
metadata:
  author: Kshao123
  version: "1.1"
---

# Apifox Mock

Stand up a mock endpoint in Apifox from an OpenAPI 3.0 document and hand the
caller a working URL. Apifox has no "create a mock rule" API — a mock is a
property of an endpoint's schema. So the whole job is: write an OAS document,
import it, read back the `apiId` Apifox assigned, and compose `<base>/<apiId>`.
Everything after writing the document is one command:

```bash
node scripts/apifox.mjs import /tmp/apifox-oas.json --yes --mock-base="<base>"
```

HTTP layer, request bodies, and counters: [references/apifox-api.md](references/apifox-api.md).
`x-apifox-mock` value rules: [references/mock-values.md](references/mock-values.md).
Document to copy and fill in: [assets/openapi-skeleton.json](assets/openapi-skeleton.json).

## When to use

- The user asks to mock an endpoint, a page's endpoints, or a module in Apifox.
- A backend endpoint does not exist yet and client code needs something to call.
- An existing Apifox endpoint returns wrong mock values and needs re-importing.
- The user needs the `apiId` or mock address of an endpoint that already exists.

This skill does **not** decide the payload shape a given frontend framework
expects. Keep those conventions — response envelope, status codes, request body
shape — in a project slash command that loads this skill.

## What you need

| Requirement | How to get it |
| --- | --- |
| Node.js 18+ | For global `fetch`; the bundled script has no dependencies |
| Apifox project id | `APIFOX_PROJECT_ID`, `--project-id=` in the MCP config, or ask |
| Access token | See **Credentials** below |
| Mock base URL | `APIFOX_MOCK_BASE`, or grep the consuming repo, or ask — it is not derivable |
| Network | `api.apifox.com` must be reachable |

## Credentials

`scripts/apifox.mjs` reads them itself, in this order: `APIFOX_ACCESS_TOKEN` /
`APIFOX_PROJECT_ID` in the environment → the `apifox-mcp` entry in
`~/.claude.json` → nothing, and it exits telling you what is missing. Then ask the
user. The environment variables are the portable path; `~/.claude.json` is a
Claude Code convenience other agents do not have.

Never write the token into a repository file, never echo it, never pass it
anywhere it will be printed back. Do not export it in a shell of your own: every
Bash call is a fresh shell, so a read in one call is gone by the next — which is
why the script reads and spends it in one process.

## Pipeline

One command covers both Apifox calls. Script paths are relative to this skill's
directory.

1. **Write the OAS document** into the system temp directory: copy
   `assets/openapi-skeleton.json`, then replace the entity name, paths, folder, and
   schema properties. Never write it inside the repository — a stray file shows up
   in `git status`.

   Match the folder layout, path style, and schema naming the project already uses.
   If you do not know them yet, call the read-only MCP tool
   `mcp__apifox-mcp__read_project_oas_*` once. Its name ends in a per-session hash
   (`…_76tcbp` and `…_d8cqjl` have both been seen for one project) — match it with
   a wildcard, never hardcode a suffix. Skip the call when the user named the
   folder, or when you are re-importing an endpoint that already exists.

2. **Import and resolve in one call.** `--yes` is the confirmation: the import
   overwrites endpoints in a project other people share.

   ```bash
   node scripts/apifox.mjs import /tmp/apifox-oas.json --yes --mock-base="<base>"
   ```

   It prints the import counters, interprets them, then prints a
   `METHOD / path / apiId / <base>/<apiId>` row for every operation in the
   document — the ids come from a second export call the script makes for you. It
   exits non-zero if an endpoint failed or an apiId stayed unresolved, so a zero
   exit means every URL it printed is usable. Drop `--yes` for a dry run first only
   when the document was hand-built rather than filled in from the skeleton.

3. **Wire the client** with the printed URLs, **report**, then delete every temp
   file you created.

To look up ids of endpoints that already exist, without importing anything:

```bash
node scripts/apifox.mjs ids --path="<substring>" --mock-base="<base>"
```

## Mock value rules

- Fixed values are plain strings: `"0"`, `"10"`, `"false"`.
- Random values use Mock.js placeholders: `@integer(a,b)`, `@float(a,b,2,2)`,
  `@ctitle(n,m)`, `@pick([...])`.
- Pin array length with `minItems` / `maxItems`, never with a placeholder.
- Rules hang off `components.schemas`, not off the operation.
- Mock.js **cannot reference another field**. Keep derived values legal by
  partitioning ranges instead.
- Never use a bare `@datetime(...)` — it emits 1998 and future dates. Use a
  `@pick([...])` of fixed past datetimes.

Full placeholder table and the consistency method:
[references/mock-values.md](references/mock-values.md).

## Interpreting the import response

The script does this for you and exits non-zero on `endpointFailed`. Two results
look wrong but are not:

- `endpointUpdated` — an existing method+path was overwritten, and **the apiId is
  unchanged**, so URLs already wired into client code keep working.
- `endpointIgnored` together with `schemaUpdated: 1` — the expected result of a
  mock-value-only edit, because `x-apifox-mock` lives on `components.schemas`
  rather than on the operation. That is success, not a no-op.

Counter-by-counter detail: [references/apifox-api.md](references/apifox-api.md).

## Constraints

- Never write the token, or any file containing it, into a repository.
- Keep every intermediate JSON in the system temp directory and delete it at the
  end.
- The export response can exceed 700 KB. Write it to disk and filter it with
  `node`; never read it into the conversation.
- Never hardcode the MCP tool's hash suffix.
- Never mock an endpoint that returns a file stream (export and download
  endpoints).
- Do not send smoke requests against a new mock unless the user asks.
- The mock URL **must** use the `<base>/<apiId>` form. The path form
  (`<base>/getXxx`) returns HTTP 500.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Mock URL returns 500 | Path form used instead of `<base>/<apiId>` | Recompose with the apiId |
| `endpointFailed > 0` | Invalid OAS, or a `$ref` to a missing schema | `JSON.parse` the file and resolve every `$ref` locally |
| `No apiId resolved for …` | The import did not land the operation the script expected | Re-run `apifox.mjs ids --path=<substring>`; check the path spelling in the document |
| 401 / 403 | Token missing, expired, or from another account | Re-read the token; confirm the project id |
| MCP tool not found | The hash suffix changed this session | Re-list tools and match `read_project_oas_*` |
| Mock base unknown | `<mockId>` cannot be derived from the project id | Grep existing mock URLs in the consuming repo, or ask |
| Temp file in `git status` | The OAS was written into the repo | Move it to the system temp directory |

Endpoint-by-endpoint detail: [references/apifox-api.md](references/apifox-api.md).

## Report

Give the user a `method / path / apiId / mock URL` table, the Apifox folder the
endpoints landed in, the schemas that were created, and every point the API owner
still has to confirm — field nesting, enumerated code values, primary key naming,
and the real path the mock is standing in for.

## Done when

- [ ] `apifox.mjs import … --yes` exited zero
- [ ] Every endpoint has a resolved `apiId` and a `<base>/<apiId>` URL
- [ ] Mock values are self-consistent — no negative or out-of-range derived value
- [ ] No token and no temp file anywhere under the repository
- [ ] `git status` shows only the source edits you intended



