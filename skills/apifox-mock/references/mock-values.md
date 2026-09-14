# Mock value rules

Why a mock value is right or wrong. Ready-made rules for every common field are
in [examples.md](examples.md); read this when you have to design one yourself,
or when several fields must agree.

## Where rules live

`x-apifox-mock` goes on a **schema property** under `components.schemas`, never
on the operation. Because of that, editing only mock values produces
`endpointIgnored` + `schemaUpdated: 1` on import — that is success.

A rule is always a string, even when the property is a number or boolean:
`"0"`, `"false"`, `"CNY"`. Unquoted `0` or `false` is a JSON value, not a rule.

## Placeholders

[Mock.js](http://mockjs.com/examples.html) syntax. The ones that matter, and
their traps:

- `@integer(min,max)` / `@float(min,max,dmin,dmax)` — always pin the range; the
  default is enormous.
- `@pick([...])` — the only safe way to honour an `enum`. Quote the elements for
  a string enum, leave them bare for a numeric one; a type mismatch makes the
  frontend's lookup miss and the cell renders empty rather than failing loudly.
- `@boolean()` is not for `0`/`1` flag fields; use `@pick([0,1])`.
- `@string()` is rarely what a UI wants; use `@pick` or a prefixed code.
- Literals and placeholders compose: `SUP@integer(10000,99999)`,
  `@ctitle(3,6)有限公司`.

## Array length

Pin length on the array schema with equal `minItems` / `maxItems`, never with a
placeholder. A deterministic row count is what a paging envelope needs — every
total has to agree with the rows returned.

## Consistency without references

**Mock.js cannot reference another field.** Every rule is evaluated
independently, so any invariant between fields has to hold for *all* combinations
the ranges allow. Partition the ranges so the invariant cannot break:

```json
"totalCount":    { "type": "integer", "x-apifox-mock": "@integer(80,100)" }
"achievedCount": { "type": "integer", "x-apifox-mock": "@integer(60,80)" }
```

Any draw satisfies `achievedCount <= totalCount`, so `totalCount - achievedCount`
is never negative and a ratio never exceeds 100%. Overlapping ranges produce a
negative difference roughly half the time — the first thing a reviewer notices.

Apply the same reasoning to any derived display value: a rate, a remainder, a
percentage, a date span. Find the computation in the consuming code, then choose
ranges whose worst case is still legal.

## Dates

Never use a bare `@datetime()`. Its range spans 1970 to a future year, so it
emits both 1998 timestamps and dates that have not happened yet. Use a `@pick`
of fixed values in the recent past, generated from **today's date**:

- Match granularity to the field: `'2026'`, `'2026-08'`, `'2026-08-01'`,
  `'2026-08-01 09:12:30'`.
- Never mix eras across related fields: a year of `'2026'` must not sit beside a
  month list containing `'2025-11'`.
- List only months up to the current one when the data is historical.

## Determinism checklist

Before importing, walk the schema once:

- [ ] Every property has an `x-apifox-mock`, or is genuinely fine as a random default
- [ ] Every array that feeds a table has equal `minItems` / `maxItems`
- [ ] Paging totals agree with the pinned row count
- [ ] Every `enum` is mirrored by a `@pick` of the same type
- [ ] Every derived or computed display value is legal at both ends of its inputs
- [ ] No bare `@datetime()`; dates are in the past and share one era
- [ ] Ids and codes look like the real thing (prefix + digit range), not `@string`
