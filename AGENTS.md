# AGENTS.md

Guidance for coding agents working in this repository.

## What this repository is

A collection of Agent Skills published to the [skills.sh](https://skills.sh)
ecosystem. It contains no application code — the deliverable is `SKILL.md` files
and their supporting `references/`, `scripts/`, and `assets/` directories.

## Rules

- Skills live in `skills/<skill-name>/SKILL.md`. The frontmatter `name` must equal
  the directory name: lowercase letters, digits, single hyphens, ≤64 characters.
- `name` and `description` are the only required frontmatter fields. Optional and
  spec-allowed: `license`, `compatibility`, `metadata`, `allowed-tools`. Do not
  invent frontmatter keys — unknown keys are ignored by most agents and the
  validator warns about them.
- Keep `SKILL.md` skimmable (roughly under 200 lines). Move long detail into
  `references/*.md` and link it with relative paths.
- Write skill bodies as instructions addressed to the agent, in English, with
  concrete commands and expected output.
- Do not add runtime dependencies. The validator is plain Node.js with no
  packages, and CI must stay that way.
- When adding or changing a skill, update the skills table in `README.md`.
- Slash commands live in `.claude/commands/<name>.md`, with companion data in a
  same-named subdirectory (`.claude/commands/<name>/`). They are not discovered by
  `scripts/validate-skills.mjs`, which only walks `skills/` for `SKILL.md`.
- Split along reuse: mechanics that work in any project belong in a skill;
  framework- or project-specific conventions belong in a command that loads it.

## Verify before finishing

```bash
node scripts/validate-skills.mjs   # must report 0 errors
npx -y skills add . --list         # the skill must appear here
```

Both commands run in CI (`.github/workflows/validate.yml`). Never finish a change
without running them locally.

## Authoring reference

The `skill-creator` skill in this repository documents the full workflow, field
constraints, and discovery rules:

- [`skills/skill-creator/SKILL.md`](skills/skill-creator/SKILL.md)
- [`skills/skill-creator/references/authoring-rules.md`](skills/skill-creator/references/authoring-rules.md)
