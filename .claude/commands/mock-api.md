---
description: Mock a hzero-front page's CRUD endpoints in Apifox and point its service file at the mock URLs. Use for a page whose backend APIs do not exist yet.
argument-hint: <page-dir> [extra endpoints or notes]
allowed-tools: Skill Read Write Edit Grep Glob Bash(node:*) Bash(curl:*)
disable-model-invocation: true
---

# Mock a page's API in Apifox

Target page: `$1`
Full request: `$ARGUMENTS`

If `$1` is empty, ask the user which page directory to mock and stop.

## Load the Apifox skill first

Load the `apifox-mock` skill now: call the Skill tool with `skill: apifox-mock`.
It owns every Apifox mechanic — credentials, the import and export calls, apiId
lookup, mock URL form, and `x-apifox-mock` syntax. Do not re-derive them here.
This file owns only the payload shape: which endpoints, which fields, which values.

If the Skill tool reports `apifox-mock` is unavailable, read
`.claude/skills/apifox-mock/SKILL.md`, then `~/.claude/skills/apifox-mock/SKILL.md`,
then `skills/apifox-mock/SKILL.md`. If none exists, stop and tell the user to run
`npx skills add Kshao123/skills --skill apifox-mock -a claude-code`.

## Input

- `$1` is a page directory, absolute or repo-relative.
- The default endpoint set is the full CRUD quartet the page's DataSet needs:
  query, create, update, destroy.
- Handle any extra endpoint the page calls the same way: detail, submit, summary,
  approval, count. `$ARGUMENTS` may name some explicitly.
- **Never mock an endpoint that returns a file stream** — export and download
  endpoints keep their real path.

## Hard constraints

- No request validation, no smoke requests, no test files, no generated test cases.
- The token never lands in a repository file and is never echoed.
- Every intermediate JSON goes to the system temp directory and is deleted at the
  end. A file written inside the repo shows up in `git status`.

## Read the page

Read all of these before writing anything:

| Source | What to take from it |
| --- | --- |
| `<pageDir>/index.tsx` | `columns`: `name`, `valueType`, and any `renderer` that computes a value from other fields |
| `<pageDir>/stores/*.ts` | `fields`, `queryFields`, `transport`, `primaryKey` |
| `src/services/<module>/<name>.ts` | Function names, the real URL constant, and each method |
| `src/utils/dataSets/fieldsPresets.ts` | What each preset expands into |
| Shared field factories | Fields the page inherits rather than declares |

Follow every import out of the page. A field defined by a shared factory still has
to appear in the mock response.

## Field mapping

DataSet declaration → mock response shape:

| DataSet | Mock response |
| --- | --- |
| `bind: '<obj>.<field>'` (`LovBindFieldsPreset`) | Return the **nested object only**. Never also flatten it |
| `RangePreset` → `xxxStart` / `xxxEnd` | GET query parameters, not response fields |
| `ignore: FieldIgnore.always` | Excluded from the request body |
| `BooleanTypePreset()` | Integer `0` / `1`, never `true` / `false` |
| `type: 'year'` | `'2026'` |
| `type: 'month'` | `'2026-08'` |
| `type: 'date'` / `'dateTime'` | `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:mm:ss'` |
| `lookupCode` / `lovCode` | The code string; never the meaning |
| `renderer` computed column | Not in the schema, but its upstream ranges must keep the result legal |

The nesting rule is the one that breaks pages silently: c7n reads only the bound
path, so a flattened duplicate is ignored — and because each rule is drawn
independently, the two copies disagree and the reviewer sees contradictory values.

Primary key: keep the `<entity>Id` name the service already uses, and return it even
when the DataSet declares no `primaryKey`. Update and destroy have nothing to send
without it.

## Apifox conventions

- Path = the service function name: `/getXxx`, `/createXxx`, `/updateXxx`,
  `/destroyXxx`.
- `tags` and `x-apifox-folder` both = `<module>/<page-dir>`.
- `x-apifox-status: developing`.
- Before inventing a folder or schema name, run the skill's read-only MCP step and
  match what the project already uses.

## Response shapes

Query returns the hzero paging envelope, every field pinned so the totals agree with
the rows:

| Field | Value |
| --- | --- |
| `content` | array, `minItems: 10`, `maxItems: 10` |
| `number` | `"0"` |
| `size` | `"10"` |
| `numberOfElements` | `"10"` |
| `totalElements` | `"10"` |
| `totalPages` | `"1"` |
| `empty` | `"false"` |

All seven are `required`. hzero hardcodes the dataKey and totalKey it reads
(`node_modules/hzero-front/lib/utils/c7nUiConfig.js`), so the envelope is not
negotiable.

- `create` → `200` with `{ <primaryKey> }` only.
- `update` / `destroy` → `204`, no body.
- The request body of create, update, and destroy is `type: array` — a c7n DataSet
  submits an array of records, even for one row.
- GET query parameters: `page` default `0`, `size` default `10`, `sort` default
  `createTime,DESC`, plus `advancedQueryString` and one parameter per `queryFields`
  entry.

## Mock values

Examples of the techniques, not a fixed vocabulary — pick what fits the page:

- Prefixed code: `SUP@integer(10000,99999)`
- Company name: `@ctitle(3,6)有限公司`
- Account: `@pick(['zhangsan','lisi','wangwu'])`
- Money: `@float(1000,9999999,2,2)`
- Remark: `@ctitle(4,10)`

Cross-field invariants have to hold by construction, because Mock.js cannot
reference another field. If a column shows "delayed batches" as
`total - onTime`, draw `onTime` from `@integer(60,80)` and `total` from
`@integer(80,100)` — overlapping ranges produce negative counts and rates above
100%.

Use the **current** year, and only months that belong to it.

## Template

Read the hzero list-page CRUD template, in this order:

1. `.claude/commands/mock-api/hzero-list-crud.openapi.json`
2. `Glob **/mock-api/hzero-list-crud.openapi.json`
3. Neither exists → build the document from `## Response shapes` and
   `## Mock values` above, and tell the user the template is missing.

Replace: the entity name (`Xxx` / `xxx`), the four paths, `tags`,
`x-apifox-folder`, `info.title`, and the properties of `XxxVO` and `XxxSaveDTO`.

Never change: the paging envelope, the array request bodies, or the 200/204 status
pairing.

Delete `_comment` and every `_note` before importing.

## Wire the service file

- Keep the real URL constant. Do not delete it.
- Add the mock base with a comment saying how to revert:
  `const MOCK_URL = 'https://m1.apifoxmock.com/m2/<projectId>-<mockId>-default';`
- In each mocked method set `url: \`${MOCK_URL}/<apiId>\`` and leave the original as
  `// url: XXX_URL,` on the line above, so reverting is uncommenting one line.
- Export and download methods keep the real path, which also keeps the real constant
  in use.
- Then lint only — never send a request:
  `node node_modules/eslint/bin/eslint.js <file>`

## Report

- A `method / path / apiId / mock URL` table.
- The Apifox folder the endpoints landed in, and the schemas created.
- Which ranges you narrowed, and which computed column forced it.
- What the API owner still has to confirm: nested vs flattened bind objects, lookup
  code values, primary key naming, and the real path each mock stands in for.
- Offer to do the sibling pages in the same module.

## Done when

- [ ] The import reported no `endpointFailed`
- [ ] Every endpoint has an `apiId` and a `<base>/<apiId>` URL
- [ ] Every DataSet field appears in the response, bound fields nested only once
- [ ] No computed column can go negative or exceed its bound
- [ ] The service file lints clean and every real URL is one uncomment away
- [ ] No token, and no temp file, anywhere under the repository
