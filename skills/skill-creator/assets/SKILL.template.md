---
name: skill-name
description: What this skill does, and when an agent should use it. Mention the concrete triggers and keywords a user would type. Use when <situation>.
license: MIT
metadata:
  author: Kshao123
  version: "1.0"
---

# Skill Name

One or two sentences on what this skill accomplishes and the assumptions it makes.

## When to use

- <trigger situation 1>
- <trigger situation 2>

Do not use this for <adjacent case>; use <other skill> instead.

## Steps

1. <first action, with the exact command or file to touch>
2. <second action>
3. Verify: <command> should output <expected result>.

## Example

Input: <what the user asks>

```bash
<command that gets run>
```

Expected output: <what success looks like>

## Edge cases

- <failure mode> → <what to do instead>
- <missing prerequisite> → <how to detect and report it>

## Constraints

- Never <destructive or out-of-scope action>.
- Ask the user before <irreversible or outward-facing step>.

## Done when

- [ ] <observable outcome 1>
- [ ] <observable outcome 2>
