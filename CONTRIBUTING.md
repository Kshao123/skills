# Contributing

## Prerequisites

Node.js 18 or newer. There are no dependencies to install.

## Add a skill

1. Create `skills/<skill-name>/SKILL.md`. The directory name is the skill name:
   lowercase letters, digits, and single hyphens (`release-notes`, not
   `Release_Notes`). Copy
   [`skills/skill-creator/assets/SKILL.template.md`](skills/skill-creator/assets/SKILL.template.md)
   as a starting point.

2. Write the frontmatter. `name` and `description` are required:

   ```yaml
   ---
   name: release-notes
   description: Generate release notes from git history following our changelog
     conventions. Use when preparing a release, tagging a version, or when the
     user asks for a changelog.
   ---
   ```

   `description` is the routing signal — it must say what the skill does *and*
   when to use it, in the words a user would type. Optional fields: `license`,
   `compatibility` (≤500 chars), `metadata` (string→string map), `allowed-tools`.
   Full constraints:
   [`references/authoring-rules.md`](skills/skill-creator/references/authoring-rules.md).

3. Write the body as instructions to the agent: ordered steps, real commands, one
   worked example, edge cases, and what it must not do. Keep `SKILL.md` under
   roughly 200 lines and move detail into `references/*.md` — agents load the body
   eagerly and follow links only when needed.

4. Put executable helpers in `scripts/`, templates and data in `assets/`.

5. Validate:

   ```bash
   node scripts/validate-skills.mjs   # spec + discovery checks
   npx -y skills add . --list         # confirms the CLI sees your skill
   ```

6. Add a row to the skills table in [README.md](README.md).

## Pull request checklist

- [ ] `name` matches the directory name and follows the naming rules
- [ ] Description covers capability *and* trigger keywords
- [ ] Body has ordered steps, an example, and failure handling
- [ ] Relative links resolve; no secrets, tokens, or absolute local paths
- [ ] `node scripts/validate-skills.mjs` reports 0 errors
- [ ] Skill appears in `npx -y skills add . --list`
- [ ] README skill table updated

## Review criteria

Skills are rejected when they duplicate an existing skill's trigger, restate
generic agent behaviour, or bundle scripts that run destructive commands without
an explicit confirmation step. Prefer extending an existing skill over adding an
overlapping one — competing descriptions degrade routing for every agent.

## License

Contributions are released under the [MIT License](LICENSE).
