# Copy-paste examples

Ready-made schema fragments. Copy the one you need into the document, rename the
`Example*` identifiers, and move on — do not re-derive these shapes. Dates below
are relative to 2026-09; regenerate them from today's date.

## Paging envelope

Spring Data `Page` shape (`content` + counters), the most common one. Every
counter is a pinned literal so it agrees with the pinned row count:

```json
"schema": {
  "type": "object",
  "properties": {
    "content": {
      "type": "array",
      "items": { "$ref": "#/components/schemas/ExampleVO" },
      "minItems": 10,
      "maxItems": 10
    },
    "number":           { "type": "integer", "x-apifox-mock": "0" },
    "size":             { "type": "integer", "x-apifox-mock": "10" },
    "numberOfElements": { "type": "integer", "x-apifox-mock": "10" },
    "totalElements":    { "type": "integer", "x-apifox-mock": "10" },
    "totalPages":       { "type": "integer", "x-apifox-mock": "1" },
    "empty":            { "type": "boolean", "x-apifox-mock": "false" }
  },
  "required": ["content", "number", "size", "numberOfElements", "totalElements", "totalPages", "empty"]
}
```

Consistent sets. Pick one row; never mix columns across rows:

| Scenario | `minItems`/`maxItems` | `number` | `size` | `numberOfElements` | `totalElements` | `totalPages` | `empty` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| One page, 10 rows | 10 | `"0"` | `"10"` | `"10"` | `"10"` | `"1"` | `"false"` |
| Page 1 of 4, pager visible | 10 | `"0"` | `"10"` | `"10"` | `"35"` | `"4"` | `"false"` |
| Empty state | 0 | `"0"` | `"10"` | `"0"` | `"0"` | `"0"` | `"true"` |

Other envelopes, same discipline (pin every counter):

```json
"list-total":   { "list": [10 rows], "total": "10", "pageNum": "1", "pageSize": "10" }
"rows-total":   { "rows": [10 rows], "total": "10" }
"wrapped":      { "code": "200", "message": "success", "data": { …any envelope above… } }
```

Write `[10 rows]` as the `content` array above. Which envelope a project uses is a
project convention — take it from the consuming code or from a project command,
not from here.

Query parameters that go with a paged GET:

```json
"parameters": [
  { "name": "page", "in": "query", "required": false, "schema": { "type": "integer", "default": 0 } },
  { "name": "size", "in": "query", "required": false, "schema": { "type": "integer", "default": 10 } },
  { "name": "sort", "in": "query", "required": false, "schema": { "type": "string" } }
]
```

Add one more parameter per filter field the UI sends.

## Field recipes

Every rule is a string. Ranges are already narrowed so derived values stay legal.

| Field kind | `type` | `x-apifox-mock` |
| --- | --- | --- |
| Primary key | `integer` or `string` | `@integer(100000,999999)` |
| Prefixed business code | `string` | `PO@integer(10000,99999)` |
| Company name | `string` | `@ctitle(3,6)有限公司` |
| Person name | `string` | `@cname()` |
| Login account | `string` | `@pick(['zhangsan','lisi','wangwu','zhaoliu'])` |
| Mobile phone | `string` | `13@integer(100000000,999999999)` |
| Email | `string` | `@pick(['a','b','c'])@integer(1,99)@example.com` |
| Money, 2 decimals | `number` | `@float(1000,9999999,2,2)` |
| Percentage 0–100 | `number` | `@float(0,100,1,1)` |
| Quantity | `integer` | `@integer(1,999)` |
| Total / part pair | `integer` | total `@integer(80,100)`, part `@integer(60,80)` |
| 0/1 flag | `integer`, `enum: [0,1]` | `@pick([0,1])` |
| true/false flag | `boolean` | `@boolean()` |
| Status code (string) | `string`, `enum: ["1","2","3"]` | `@pick(['1','2','3'])` |
| Status code (word) | `string`, `enum: [...]` | `@pick(['NEW','APPROVED','REJECTED'])` |
| Year | `string` | `2026` |
| Month | `string` | `@pick(['2026-06','2026-07','2026-08','2026-09'])` |
| Date | `string` | `@pick(['2026-09-01','2026-08-18','2026-07-30'])` |
| Datetime | `string` | `@pick(['2026-09-01 09:12:30','2026-08-18 10:05:44','2026-07-30 16:41:02'])` |
| Remark / short text | `string` | `@ctitle(4,10)` |
| Long text | `string` | `@cparagraph(1,2)` |
| Address | `string` | `@county(true)@ctitle(2,4)路@integer(1,200)号` |
| Nullable field | any | `@pick([null,'ABC'])` |

Nested object — bound sub-fields go inside, never also flattened:

```json
"supplier": {
  "type": "object",
  "properties": {
    "supplierCode": { "type": "string", "x-apifox-mock": "SUP@integer(10000,99999)" },
    "supplierName": { "type": "string", "x-apifox-mock": "@ctitle(3,6)有限公司" }
  },
  "required": ["supplierCode", "supplierName"]
}
```

Fixed-length child list (line items under a header):

```json
"lines": {
  "type": "array",
  "items": { "$ref": "#/components/schemas/ExampleLineVO" },
  "minItems": 3,
  "maxItems": 3
}
```

## Operation responses

Detail (single row):

```json
"responses": { "200": { "description": "OK", "content": { "application/json": {
  "schema": { "$ref": "#/components/schemas/ExampleVO" } } } } }
```

Create — return the new key only:

```json
"responses": { "200": { "description": "created", "content": { "application/json": {
  "schema": {
    "type": "object",
    "properties": { "exampleId": { "type": "integer", "x-apifox-mock": "@integer(100000,999999)" } },
    "required": ["exampleId"]
  } } } } }
```

Update / delete — no body:

```json
"responses": { "204": { "description": "updated" } }
```

Request body, single record vs. array of records:

```json
"requestBody": { "required": true, "content": { "application/json": {
  "schema": { "$ref": "#/components/schemas/ExampleSaveDTO" } } } }

"requestBody": { "required": true, "content": { "application/json": {
  "schema": { "type": "array", "items": { "$ref": "#/components/schemas/ExampleSaveDTO" } } } } }
```

Request schemas carry no `x-apifox-mock` — only responses are mocked.
