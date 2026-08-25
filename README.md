# skills

[![skills.sh](https://skills.sh/b/Kshao123/skills)](https://skills.sh/Kshao123/skills)

Reusable [Agent Skills](https://agentskills.io) — portable instruction packages
that teach coding agents a specific job. Every skill here follows the Agent Skills
specification, so it installs into Claude Code, Codex, Cursor, OpenCode, Gemini
CLI, Copilot, and the other 70+ agents supported by the
[`skills` CLI](https://github.com/vercel-labs/skills).

## Install

```bash
# Interactive: pick skills and target agents
npx skills add Kshao123/skills

# See what is available without installing
npx skills add Kshao123/skills --list

# Install one skill for one agent
npx skills add Kshao123/skills --skill skill-creator -a claude-code

# Everything, everywhere, no prompts
npx skills add Kshao123/skills --all
```

Skills land in `./<agent>/skills/` for the current project, or `~/<agent>/skills/`
with `-g`. Run a skill once without installing it:

```bash
npx skills use Kshao123/skills@skill-creator | claude
```

## Skills

| Skill | What it does |
| --- | --- |
| [`apifox-mock`](skills/apifox-mock/SKILL.md) | Create or update mock endpoints in an Apifox project from an OpenAPI 3.0 document, resolve each `apiId`, and compose the mock URL client code calls. |
| [`skill-creator`](skills/skill-creator/SKILL.md) | Author, review, and fix `SKILL.md` files — naming and frontmatter rules, progressive disclosure, validation, and why a skill fails to be discovered. |

## Layout

```
skills/<skill-name>/
├── SKILL.md        # required: YAML frontmatter (name, description) + instructions
├── references/     # optional: detail the agent reads on demand
├── scripts/        # optional: executable helpers
└── assets/         # optional: templates and data
scripts/validate-skills.mjs   # spec + discovery checks, zero dependencies
```

The `skills` CLI walks `skills/` up to three levels deep, so category folders
(`skills/<category>/<name>/SKILL.md`) also work. The frontmatter `name` must
always match its directory name.

## Slash commands

`.claude/commands/` holds project-specific commands that are maintained here but
not distributed by the `skills` CLI. A command carries the business conventions a
skill deliberately leaves out, and loads the skill for the mechanics.

```
.claude/commands/mock-api.md          # hzero-front / c7n mock rules; loads apifox-mock
.claude/commands/mock-api/            # companion data for that command
```

To use one in another project, copy both `mock-api.md` and the `mock-api/`
directory into that project's `.claude/commands/`, and install the skill there with
`npx skills add Kshao123/skills --skill apifox-mock -a claude-code`.

## Adding a skill

Ask your agent to use the `skill-creator` skill, or follow
[CONTRIBUTING.md](CONTRIBUTING.md). Before opening a PR:

```bash
node scripts/validate-skills.mjs   # or: npm run validate
npx -y skills add . --list         # what the CLI actually discovers
```

CI runs both on every push and pull request.

## Notes

skills.sh is a passive directory: it indexes public repositories that people
install through the CLI, so the badge above populates after the first installs.
There is nothing to submit.

## License

[MIT](LICENSE)
