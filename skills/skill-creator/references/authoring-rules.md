# Authoring rules

Condensed from the [Agent Skills specification](https://agentskills.io/specification)
and the [skills.sh CLI](https://github.com/vercel-labs/skills) discovery behaviour.

## Frontmatter fields

`SKILL.md` must open with a YAML frontmatter block delimited by `---` on the very
first line.

### `name` (required)

- 1–64 characters.
- Lowercase letters, digits, and hyphens only.
- Must not start or end with a hyphen; no consecutive hyphens.
- Must match the parent directory name.

```yaml
name: pdf-processing     # valid
name: code-review        # valid
name: PDF-Processing     # invalid: uppercase
name: -pdf               # invalid: leading hyphen
name: pdf--processing    # invalid: consecutive hyphens
name: pdf_processing     # invalid: underscore
```

### `description` (required)

- 1–1024 characters, non-empty.
- Must describe both what the skill does and when to use it.
- Include the keywords a user would type; this text is the routing signal.

### `license` (optional)

License name, or a reference to a bundled license file. Keep it short:

```yaml
license: MIT
license: Proprietary. LICENSE.txt has complete terms
```

### `compatibility` (optional)

1–500 characters. Include it only when the skill has real environment
requirements — target product, system packages, network access:

```yaml
compatibility: Requires git, docker, jq, and access to the internet
compatibility: Designed for Claude Code (or similar products)
```

### `metadata` (optional)

A map from string keys to string values, for properties outside the spec. Quote
values that YAML would otherwise coerce:

```yaml
metadata:
  author: example-org
  version: "1.0"
```

### `allowed-tools` (optional, experimental)

A space-separated string of pre-approved tools. Support varies by agent:

```yaml
allowed-tools: Bash(git:*) Bash(jq:*) Read
```

## Optional directories

| Directory | Purpose |
| --- | --- |
| `scripts/` | Executable helpers. Self-contained or with documented dependencies, clear error messages. |
| `references/` | Documentation the agent reads on demand (`REFERENCE.md`, `api.md`, …). |
| `assets/` | Templates, images, schemas, lookup tables. |

Reference other files with paths relative to the skill root, e.g.
`references/authoring-rules.md` or `scripts/extract.py`.

## Progressive disclosure

Three levels, loaded only as far as needed:

1. **Metadata** — `name` and `description`, always in the agent's context.
2. **Instructions** — the `SKILL.md` body, loaded when the skill activates.
3. **Resources** — `references/`, `scripts/`, `assets/`, opened on demand.

Keeping `SKILL.md` short is therefore a correctness concern, not just style.

## How the CLI finds skills

`npx skills add <owner>/<repo>` scans known container directories and walks each
one up to three levels deep, so all of these are discovered:

```
SKILL.md                                        # repository root
skills/<name>/SKILL.md                          # flat layout
skills/<category>/<name>/SKILL.md               # catalog layout
skills/<category>/<category>/<name>/SKILL.md    # deepest supported layout
```

A `SKILL.md` at a shallower level shadows anything nested below it. Besides
`skills/`, the CLI also scans `skills/.curated/`, `skills/.experimental/`,
`skills/.system/`, and per-agent directories such as `.claude/skills/` and
`.agents/skills/`. Anything deeper than the three-level walk requires
`--full-depth` and will be missed by normal installs.

## Distribution notes

- Installs target `./<agent>/skills/` by default, or `~/<agent>/skills/` with `-g`.
- skills.sh is a passive directory: it indexes public repositories that people
  install through the CLI. There is no submission form — publish the repo, share
  the install command.
- Marking a skill internal hides it from discovery unless
  `INSTALL_INTERNAL_SKILLS=1` is set:

```yaml
metadata:
  internal: true
```
