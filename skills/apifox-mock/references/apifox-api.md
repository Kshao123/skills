# Apifox REST API

Everything the [SKILL.md](../SKILL.md) pipeline does over HTTP. Two endpoints do
all the work: import writes, export reads.

## Authentication

Three headers on every call:

```
Authorization: Bearer <APIFOX_ACCESS_TOKEN>
X-Apifox-Api-Version: 2024-03-28
Content-Type: application/json
```

`X-Apifox-Api-Version` is not optional — without it the API answers with a version
error rather than a 401, which is easy to misread as an auth failure.

## Import

```
POST https://api.apifox.com/v1/projects/<projectId>/import-openapi?locale=zh-CN
```

The OAS document goes in as a **string**, not as a nested object:

```json
{
  "input": "{\"openapi\":\"3.0.1\", ... }",
  "options": {
    "endpointOverwriteBehavior": "OVERWRITE_EXISTING",
    "schemaOverwriteBehavior": "OVERWRITE_EXISTING",
    "updateFolderOfChangedEndpoint": true,
    "prependBasePath": false
  }
}
```

| Option | Effect |
| --- | --- |
| `endpointOverwriteBehavior` | `OVERWRITE_EXISTING` replaces a matching method+path instead of creating a duplicate |
| `schemaOverwriteBehavior` | Same for `components.schemas`; required for mock-rule edits to land |
| `updateFolderOfChangedEndpoint` | Moves an endpoint when its `x-apifox-folder` changes |
| `prependBasePath` | Keep `false`; `true` prefixes `servers[0].url` onto every path |

Build the body with `node` and post the file — never interpolate JSON into a
command line, where quoting will corrupt it:

```bash
node -e "
const fs=require('fs'),p=require('path'),d=process.argv[1];
const input=fs.readFileSync(p.join(d,'apifox-oas.json'),'utf8');
JSON.parse(input);
fs.writeFileSync(p.join(d,'apifox-import-body.json'),JSON.stringify({input,options:{
  endpointOverwriteBehavior:'OVERWRITE_EXISTING',
  schemaOverwriteBehavior:'OVERWRITE_EXISTING',
  updateFolderOfChangedEndpoint:true,
  prependBasePath:false
}}));" "$(cygpath -w /tmp)"

curl -s -X POST "https://api.apifox.com/v1/projects/$PID/import-openapi?locale=zh-CN" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Apifox-Api-Version: 2024-03-28" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/apifox-import-body.json
```

On Windows, Git Bash's `/tmp` is not the path `node` sees — `node` resolves `/tmp`
against the drive root. Pass the translated path in (`cygpath -w /tmp`) and let
`node` join it, as above. `scripts/apifox.mjs` does this internally, which is why
the pipeline prefers `node scripts/apifox.mjs import <file> --yes` over
hand-rolled one-liners.

## Import response

```json
{ "data": { "counters": { "endpointCreated": 2, "endpointUpdated": 0,
  "endpointIgnored": 0, "endpointFailed": 0, "schemaCreated": 1,
  "schemaUpdated": 0 } } }
```

| Counter | Meaning |
| --- | --- |
| `endpointCreated` | The method+path did not exist |
| `endpointUpdated` | An existing method+path was overwritten |
| `endpointIgnored` | The operation was byte-identical to what is stored |
| `endpointFailed` | Rejected; the message names the reason |

Two properties matter downstream:

- **`apiId` is stable across re-imports.** Overwriting an endpoint keeps its id, so
  a mock URL already wired into client code keeps working.
- **The response contains no ids.** It only counts. Resolving `apiId` needs a
  separate export call.

A mock-rule-only edit reports `endpointIgnored` alongside `schemaUpdated: 1`. That
is the expected result, not a no-op: `x-apifox-mock` lives on
`components.schemas`, so the operation really is unchanged.

## Resolving apiIds

```
POST https://api.apifox.com/v1/projects/<projectId>/export-openapi?locale=zh-CN
```

```json
{
  "scope": { "type": "ALL" },
  "options": { "includeApifoxExtensionProperties": true, "addFoldersToTags": true },
  "oasVersion": "3.0",
  "exportFormat": "JSON"
}
```

`includeApifoxExtensionProperties: true` is what carries the ids back —
without it there is nothing to parse.

**The response can exceed 700 KB.** Write it to a temp file and filter it with
`node`; never read it into the conversation. Each operation carries:

```json
"x-run-in-apifox": "https://app.apifox.com/web/project/<projectId>/apis/api-123456789-run"
```

Extract the id with `/api-(\d+)-run/`. Filter to the endpoints you care about by
`x-apifox-folder`. `node scripts/apifox.mjs import <file> --yes` already runs this
export after a successful import and prints the ids; `node scripts/apifox.mjs ids`
runs it alone. Both write the dump to a temp file, filter it, and delete it in one
process.

## Mock URL anatomy

```
https://m1.apifoxmock.com/m2/<projectId>-<mockId>-default/<apiId>
└──────────── mock base ───────────────────────────────┘
```

- `<mockId>` **cannot** be derived from the project id. Grep the consuming repo for
  an existing `apifoxmock.com` URL, or ask the user.
- The trailing `-default` is the mock environment. This skill assumes a single
  `default` environment; if the team adds another, the base changes and every
  wired service breaks.
- The canonical form is `<base>/<apiId>`. The path form (`<base>/getXxx`) returns
  HTTP 500.
- Some hand-written URLs carry `?apifoxApiId=<id>`. It is redundant when the id is
  already in the path — do not produce it.

## Reading a project's conventions

Before inventing folder names, path styles, or schema names, read what the project
already uses through the read-only MCP tool:

```
mcp__apifox-mcp__read_project_oas_*
```

The name ends in a per-session hash (`…_76tcbp` and `…_d8cqjl` have both been seen
for the same project). Always match it with a wildcard; never hardcode a suffix. If
the tool is missing, re-list the available tools rather than guessing the name.

## Vendor extensions

| Extension | Where | Purpose |
| --- | --- | --- |
| `x-apifox-folder` | operation | Target folder, `/`-separated; creates it if absent |
| `x-apifox-status` | operation | `designing`, `developing`, `released`, `deprecated` |
| `x-apifox-mock` | schema property | Mock.js rule or literal for this field |
| `deprecated` | operation | Plain OAS; keep `false` |
| `x-run-in-apifox` | operation, export only | Read-only; carries the `apiId` |

`tags` and `x-apifox-folder` are independent. Set both to the same value or the
endpoint lands in a folder while being tagged somewhere else.

