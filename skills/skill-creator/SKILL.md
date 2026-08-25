---
name: skill-creator
description: Author, review, and fix Agent Skills (SKILL.md files) in a skills.sh-compatible repository. Use when adding a new skill, editing skill frontmatter, splitting long instructions into references/, or when validation fails or `npx skills add` does not discover a skill.
license: MIT
compatibility: Requires Node.js 18+ to run scripts/validate-skills.mjs
metadata:
  author: Kshao123
  version: "1.0"
---

# Skill Creator

Create skills that agents actually load. A skill is a directory with a `SKILL.md`
file: YAML frontmatter that tells an agent *when* to load it, and a Markdown body
that tells the agent *what to do* once loaded.

Full field constraints and discovery rules: [references/authoring-rules.md](references/authoring-rules.md).
Starting point to copy: [assets/SKILL.template.md](assets/SKILL.template.md).

## Layout

```
skills/<skill-name>/
├── SKILL.md        # required: frontmatter + instructions
├── references/     # optional: detail the agent reads only when needed
├── scripts/        # optional: executable helpers
└── assets/         # optional: templates, schemas, sample data
```

The directory name and the frontmatter `name` must be identical.

## Workflow

1. **Pin down the trigger.** Write one sentence: "When the user is doing X, the
   agent should Y." If you cannot name the situation, the skill will never fire.
   Ask the user rather than guessing the scope.
2. **Check for overlap.** Read the existing skill names and descriptions
   (`ls skills/`). Extend a skill instead of adding a near-duplicate — two skills
   with overlapping descriptions make routing worse for every agent.
3. **Scaffold** `skills/<skill-name>/SKILL.md` from the template. Use a
   lowercase, hyphenated, verb-or-domain name (`release-notes`, `pdf-processing`).
4. **Write the frontmatter.** `name` and `description` are required; everything
   else is optional. Spend most of the effort on `description` — see below.
5. **Write the body** as instructions addressed to the agent, not as marketing
   copy. Concrete steps, real commands, expected output, known edge cases.
6. **Push detail down.** Keep `SKILL.md` skimmable (roughly under 200 lines) and
   move long tables, API dumps, and background into `references/*.md`, linked with
   relative paths. Agents read the body first and follow links only when needed.
7. **Validate and smoke-test** (both commands below). Fix every error and read
   every warning before you commit.

## Frontmatter

| Field | Required | Constraint |
| --- | --- | --- |
| `name` | yes | ≤64 chars, `[a-z0-9]` and single hyphens, must equal the directory name |
| `description` | yes | ≤1024 chars, non-empty, covers *what* and *when* |
| `license` | no | License name or bundled license file |
| `compatibility` | no | ≤500 chars, e.g. required runtimes, tools, network access |
| `metadata` | no | Map of string keys to string values; quote versions (`"1.0"`) |
| `allowed-tools` | no | Space-separated pre-approved tools, e.g. `Bash(git:*) Read` (experimental) |

Nothing else is part of the spec. Agent-specific keys work only in that agent.

## Writing the description

This is the only text an agent sees before deciding to load the skill. It must
carry both halves — capability and trigger — plus the keywords a user would
actually type.

```yaml
# Weak: no trigger, no keywords
description: Helps with PDFs.

# Strong
description: >
  Extracts text and tables from PDFs, fills forms, and merges files. Use when
  the user mentions PDFs, scanned documents, form filling, or document extraction.
```

## Body guidelines

- Address the agent directly: "Run `pnpm test`", not "the agent could run tests".
- Number steps that must happen in order; use checklists for verification.
- Show one worked example with real input and real expected output.
- Name the failure modes: what to do when a command errors, a file is missing, or
  the repository state differs from the assumption.
- State what the skill must *not* do (destructive commands, pushing, credentials).
- Do not restate general agent behaviour — only what is specific to this task.

## Validate

```bash
node scripts/validate-skills.mjs   # spec + discovery checks, no dependencies
npx -y skills add . --list         # what the skills.sh CLI actually sees
```

The second command is the real conformance test: if a skill does not appear
there, no agent can install it.

## Common failures

| Symptom | Cause |
| --- | --- |
| "No skills found" | `SKILL.md` missing, or frontmatter lacks `name`/`description` |
| Skill missing from `--list` | Nested deeper than `skills/<category>/<category>/<name>/` |
| Frontmatter ignored | Not the first line of the file, or invalid YAML |
| Name error in CI | `name` differs from the directory, or uses caps/underscores |
| Skill never activates | Description states capability but no trigger keywords |

## Definition of done

- [ ] `skills/<name>/SKILL.md` exists, `name` matches the directory
- [ ] Description names both the capability and the trigger
- [ ] Body has ordered steps, one example, and failure handling
- [ ] Relative links resolve; detail lives in `references/`
- [ ] `node scripts/validate-skills.mjs` passes with no errors
- [ ] Skill appears in `npx -y skills add . --list`
- [ ] Repository `README.md` skill table updated
