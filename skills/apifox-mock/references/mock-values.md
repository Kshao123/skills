# Mock value rules

How to make an Apifox mock return values a frontend can actually render. The
mechanics are [Mock.js](http://mockjs.com/examples.html); the discipline is making
several independent random fields stay consistent with each other.

## Where rules live

`x-apifox-mock` goes on a **schema property**, never on the operation:

```json
"components": {
  "schemas": {
    "ExampleVO": {
      "type": "object",
      "properties": {
        "quantity": { "type": "integer", "x-apifox-mock": "@integer(1,99)" }
      }
    }
  }
}
```

Because the rule lives on the schema, editing only mock values produces
`endpointIgnored` + `schemaUpdated: 1` on import. That is success.

## Literals

A fixed value is a plain string, whatever the declared type:

```json
"number":        { "type": "integer", "x-apifox-mock": "0" }
"empty":         { "type": "boolean", "x-apifox-mock": "false" }
"currencyCode":  { "type": "string",  "x-apifox-mock": "CNY" }
```

Do not write `0` or `false` unquoted — the value is a rule expression, not a JSON
value.

## Placeholders

| Placeholder | Produces | Note |
| --- | --- | --- |
| `@integer(min,max)` | Integer in range, inclusive | Pin ranges; the default range is huge |
| `@float(min,max,dmin,dmax)` | Decimal | `@float(1000,9999999,2,2)` = money with exactly 2 decimals |
| `@pick([a,b,c])` | One list element | The only safe way to honour an `enum` |
| `@ctitle(min,max)` | Chinese words | For names and remarks |
| `@cname()` | Chinese personal name | |
| `@string(min,max)` | Random ASCII | Rarely what a UI wants; prefer `@pick` |
| `@boolean()` | `true` / `false` | Not for `0`/`1` flag fields |

Literals and placeholders compose, which is how prefixed codes work:

```json
"supplierCode": { "type": "string", "x-apifox-mock": "SUP@integer(10000,99999)" }
"companyName":  { "type": "string", "x-apifox-mock": "@ctitle(3,6)有限公司" }
```

## Array length

Pin length on the array schema, not with a placeholder:

```json
"content": {
  "type": "array",
  "items": { "$ref": "#/components/schemas/ExampleVO" },
  "minItems": 10,
  "maxItems": 10
}
```

Equal `minItems` and `maxItems` give a deterministic row count, which is what a
paging envelope needs — the total fields have to agree with the rows returned.

## Consistency without references

**Mock.js cannot reference another field.** There is no expression for "this field
minus that one". Every rule is evaluated independently, so any invariant between
fields has to hold for *all* combinations the ranges allow.

Partition the ranges so the invariant cannot break:

```json
"totalCount":    { "type": "integer", "x-apifox-mock": "@integer(80,100)" }
"achievedCount": { "type": "integer", "x-apifox-mock": "@integer(60,80)" }
```

Any draw satisfies `achievedCount <= totalCount`, so a UI column computing
`totalCount - achievedCount` is never negative and a ratio never exceeds 100%.
Overlapping ranges — `@integer(1,100)` for both — produce a negative difference
roughly half the time, and that is what the reviewer will notice first.

Apply the same reasoning to any derived display value: a rate, a remainder, a
percentage, a date span. Find the computation in the consuming code, then choose
ranges whose worst case is still legal.

## Dates

Never use a bare `@datetime()`. Its range spans 1970 to a future year, so it emits
both 1998 timestamps and dates that have not happened yet — either one looks like a
bug in the page. Use a `@pick` of fixed values in the recent past:

```json
"createTime": {
  "type": "string",
  "x-apifox-mock": "@pick(['2026-08-01 09:12:30','2026-07-18 10:05:44','2026-06-30 16:41:02'])"
}
```

Derive the years and months from **today's date when you generate the document** —
do not copy the ones above. Rules:

- Keep granularity consistent with the field: `'2026'` for a year field,
  `'2026-08'` for a month field, `'2026-08-01'` for a date, full
  `'YYYY-MM-DD HH:mm:ss'` for a datetime.
- Never mix eras across related fields: a year field of `'2026'` must not sit
  beside a month field listing `'2025-11'`.
- Only list months up to the current one when the data is meant to be historical.

## Enums

Declare the `enum` and mirror it in `@pick`, with matching types:

```json
"statusCode": {
  "type": "string",
  "enum": ["1", "2", "3"],
  "x-apifox-mock": "@pick(['1','2','3'])"
}
"activeFlag": {
  "type": "integer",
  "enum": [0, 1],
  "x-apifox-mock": "@pick([0,1])"
}
```

Quote the list elements for a string enum and leave them bare for a numeric one. A
mismatch produces values the frontend's lookup cannot resolve, and the cell renders
empty rather than failing loudly.

## Determinism checklist

Before importing, walk the schema once:

- [ ] Every property has an `x-apifox-mock`, or is genuinely fine as a random default
- [ ] Every array that feeds a table has equal `minItems` / `maxItems`
- [ ] Paging totals agree with the pinned row count
- [ ] Every `enum` is mirrored by a `@pick` of the same type
- [ ] Every derived or computed display value is legal at both ends of its inputs
- [ ] No bare `@datetime()`; dates are in the past and share one era
- [ ] Ids and codes look like the real thing (prefix + digit range), not `@string`

