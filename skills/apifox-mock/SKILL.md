---
name: apifox-mock
description: Create or update mock endpoints in an Apifox project from an OpenAPI 3.0 document, then resolve each endpoint's apiId and mock URL so client code can call it. Covers credential lookup, the import and export REST calls, Apifox vendor extensions, and x-apifox-mock (Mock.js) value rules that stay self-consistent. Use when the user asks to mock an API in Apifox, import OpenAPI into Apifox, point a service at an Apifox mock URL, look up an apiId or mock address, or stand in for a backend endpoint that does not exist yet.
license: MIT
compatibility: Requires Node.js 18+, curl, and network access to api.apifox.com. Reads the Apifox access token and project id from the local MCP configuration or the APIFOX_ACCESS_TOKEN environment variable.
allowed-tools: Read Write Grep Glob Bash(node:*) Bash(curl:*) Bash(cygpath:*)
metadata:
  author: Kshao123
  version: "1.2"
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

## Read only what you need

| Need | Open |
| --- | --- |
| A paged list / detail document to fill in | [assets/paged-list.openapi.json](assets/paged-list.openapi.json) |
| A minimal query + create document | [assets/openapi-skeleton.json](assets/openapi-skeleton.json) |
| Paging envelopes, field recipes, response snippets | [references/examples.md](references/examples.md) |
| Why a mock value is wrong; cross-field invariants; dates | [references/mock-values.md](references/mock-values.md) |
| The script failed, or you must call the REST API by hand | [references/apifox-api.md](references/apifox-api.md) |

For a routine mock, the two assets and `examples.md` are enough. Do not read the
other two references speculatively.

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
| Project id | `--project-id=`, `APIFOX_PROJECT_ID`, or the `apifox-mcp` entry in `~/.claude.json` — the script reads all three |
| Access token | `APIFOX_ACCESS_TOKEN`, else the same MCP entry; the script exits and names what is missing, then ask |
| Mock base URL | `APIFOX_MOCK_BASE`, or grep the consuming repo for `apifoxmock.com`, or ask — it is not derivable |

Never write the token into a repository file, never echo it, never `export` it
yourself: every Bash call is a fresh shell, which is why the script reads and
spends it in one process.

## Pipeline

Script paths are relative to this skill's directory.

1. **Write the OAS document** into the system temp directory: copy the asset that
   matches, then replace the `Example*` names, paths, folder, and schema
   properties. Leave `_comment` / `_note` keys alone — the script strips them.
   Never write it inside the repository.

   Match the folder layout and path style the project already uses. If you do
   not know them, run:

   ```bash
   node scripts/apifox.mjs folders
   ```

   It prints one line per folder with sample paths — a few hundred bytes. Prefer
   it over the MCP tool `mcp__apifox-mcp__read_project_oas_*`, which returns the
   whole project OAS. Skip both when the user named the folder or you are
   re-importing an existing endpoint.

2. **Import and resolve in one call.** `--yes` is the confirmation: the import
   overwrites endpoints in a project other people share.

   ```bash
   node scripts/apifox.mjs import /tmp/apifox-oas.json --yes --mock-base="<base>"
   ```

   It prints the import counters with their interpretation, then a
   `METHOD / path / apiId / <base>/<apiId>` row per operation, and exits
   non-zero if anything failed or an apiId stayed unresolved — a zero exit means
   every printed URL is usable. Drop `--yes` for a dry run only when the document
   was hand-built rather than filled in from an asset.

3. **Wire the client** with the printed URLs, **report**, then delete every temp
   file you created.

To look up ids of endpoints that already exist, without importing anything:

```bash
node scripts/apifox.mjs ids --path="<substring>" --mock-base="<base>"
```

## Mock value rules

The four that are not obvious; everything else is in `examples.md`:

- Every rule is a string, even for numbers and booleans: `"0"`, `"false"`.
- Pin array length with equal `minItems` / `maxItems`; pin every paging counter
  to match. Never use a placeholder for a count.
- Mock.js **cannot reference another field**. Keep derived values legal by
  partitioning ranges: total `@integer(80,100)`, part `@integer(60,80)`.
- Never use a bare `@datetime()` — it emits 1998 and future dates. `@pick` fixed
  past values generated from today's date.

## Constraints

- Never write the token, or any file containing it, into a repository.
- Keep every intermediate JSON in the system temp directory and delete it at the
  end.
- Never read the export dump into the conversation; the script filters it on disk.
- Never hardcode the MCP tool's hash suffix; match `read_project_oas_*`.
- Never mock an endpoint that returns a file stream (export and download
  endpoints).
- Do not send smoke requests against a new mock unless the user asks.
- The mock URL **must** use the `<base>/<apiId>` form. The path form
  (`<base>/getXxx`) returns HTTP 500.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Mock URL returns 500 | Recompose as `<base>/<apiId>` |
| `endpointFailed > 0` | Invalid OAS or a `$ref` to a missing schema; fix the document, do not retry |
| `endpointIgnored` with `schemaUpdated: 1` | Success — a mock-value-only edit; `x-apifox-mock` lives on schemas |
| `No apiId resolved for …` | Re-run `apifox.mjs ids --path=<substring>`; check the path spelling |
| 401 / 403 | Token missing, expired, or from another account; confirm the project id |
| `HTTP 4xx … version` | The script sends `X-Apifox-Api-Version`; a hand-rolled curl must too |
| Mock base unknown | Grep the consuming repo for `apifoxmock.com`, or ask |

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
