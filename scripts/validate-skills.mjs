#!/usr/bin/env node
/**
 * Validate every SKILL.md in this repository.
 *
 * Rules come from two places:
 *   - Agent Skills spec:       https://agentskills.io/specification
 *   - skills.sh CLI discovery: https://github.com/vercel-labs/skills
 *
 * Zero dependencies on purpose: `node scripts/validate-skills.mjs` is all CI needs.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Containers the skills.sh CLI scans, in priority order. */
const CONTAINERS = ["skills", "skills/.curated", "skills/.experimental", "skills/.system"];
/** The CLI walks each container at most three levels deep. */
const MAX_DEPTH = 3;

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPEC_KEYS = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
/** Agent-specific extensions that are tolerated without a warning. */
const AGENT_KEYS = new Set(["version", "context", "model", "argument-hint", "user-invocable"]);

const rel = (p) => relative(ROOT, p).split(sep).join("/") || ".";

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Mirror the CLI's bounded walk: a shallower SKILL.md shadows anything nested below it. */
function discover() {
  const found = [];
  if (existsSync(join(ROOT, "SKILL.md"))) found.push(join(ROOT, "SKILL.md"));
  for (const container of CONTAINERS) {
    const base = join(ROOT, container);
    if (isDir(base)) walk(base, 1, found);
  }
  return found;
}

function walk(dir, depth, found) {
  if (existsSync(join(dir, "SKILL.md"))) {
    found.push(join(dir, "SKILL.md"));
    return;
  }
  if (depth >= MAX_DEPTH) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Dot containers are visited explicitly via CONTAINERS.
    if (depth === 1 && entry.name.startsWith(".")) continue;
    walk(join(dir, entry.name), depth + 1, found);
  }
}

function unquote(raw) {
  const v = raw.trim();
  const quoted = (q) => v.length > 1 && v.startsWith(q) && v.endsWith(q);
  return quoted('"') || quoted("'") ? v.slice(1, -1) : v;
}

/** Minimal YAML frontmatter reader: flat scalars, one nested level, block scalars. */
function parseFrontmatter(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { data: null, body: text, errors: ["missing YAML frontmatter (the file must start with `---`)"] };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { data: null, body: "", errors: ["unterminated YAML frontmatter (no closing `---`)"] };
  }

  const data = {};
  let lastKey = null;

  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const nested = /^(\s+)([^:#]+):\s*(.*)$/.exec(line);
    if (nested && lastKey) {
      if (typeof data[lastKey] !== "object" || data[lastKey] === null) data[lastKey] = {};
      data[lastKey][nested[2].trim()] = unquote(nested[3]);
      continue;
    }

    const match = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`cannot parse frontmatter line ${i + 1}: ${line.trim()}`);
      continue;
    }

    const [, key, rawValue] = match;
    if (/^[|>][-+]?$/.test(rawValue.trim())) {
      const folded = rawValue.trim().startsWith(">");
      const block = [];
      let j = i + 1;
      for (; j < end; j++) {
        if (!lines[j].trim()) {
          block.push("");
          continue;
        }
        if (!/^\s/.test(lines[j])) break;
        block.push(lines[j].trim());
      }
      i = j - 1;
      data[key] = folded ? block.join(" ").trim() : block.join("\n").trim();
    } else if (rawValue.trim() === "") {
      data[key] = {}; // parent of a nested block
    } else {
      data[key] = unquote(rawValue);
    }
    lastKey = key;
  }

  return { data, body: lines.slice(end + 1).join("\n"), errors };
}

/** Relative paths referenced from the body must exist inside the skill directory. */
function checkReferences(body, dir, warnings) {
  const targets = new Set();
  for (const [, link] of body.matchAll(/]\(([^)\s]+)\)/g)) targets.add(link);
  for (const [, path] of body.matchAll(/`((?:scripts|references|assets)\/[^`\s]+)`/g)) targets.add(path);

  for (const target of targets) {
    if (/^(?:[a-z]+:|\/|#)/i.test(target)) continue;
    if (/[*?<>{}]/.test(target)) continue; // globs and placeholders, not real paths
    const file = target.split("#")[0].split("?")[0];
    if (!file || file.endsWith("/")) continue;
    if (!existsSync(join(dir, file))) warnings.push(`references a missing file: ${file}`);
  }
}

function validate(file) {
  const errors = [];
  const warnings = [];
  const raw = readFileSync(file, "utf8");
  const { data, body, errors: parseErrors } = parseFrontmatter(raw);
  errors.push(...parseErrors);
  if (!data) return { name: null, errors, warnings };

  const dir = dirname(file);
  const { name, description } = data;

  if (typeof name !== "string" || !name.trim()) {
    errors.push("`name` is required");
  } else {
    if (name.length > 64) errors.push(`\`name\` is ${name.length} characters (max 64)`);
    if (!NAME_RE.test(name)) {
      errors.push(
        `\`name\` must be lowercase letters, digits and single hyphens, with no leading, trailing or repeated hyphens: ${JSON.stringify(name)}`,
      );
    }
    if (dir !== ROOT && name !== basename(dir)) {
      errors.push(`\`name\` (${name}) must match the skill directory name (${basename(dir)})`);
    }
  }

  if (typeof description !== "string" || !description.trim()) {
    errors.push("`description` is required and must be a non-empty string");
  } else {
    if (description.length > 1024) errors.push(`\`description\` is ${description.length} characters (max 1024)`);
    if (description.length < 40) warnings.push("`description` is very short — state what the skill does *and* when to use it");
    if (!/\buse (?:this skill )?(?:when|for)\b/i.test(description)) {
      warnings.push('`description` does not say when to use the skill (e.g. "Use when …") — agents route on this text');
    }
  }

  if ("license" in data && (typeof data.license !== "string" || !data.license.trim())) {
    errors.push("`license` must be a non-empty string");
  }
  if ("compatibility" in data) {
    if (typeof data.compatibility !== "string" || !data.compatibility.trim()) {
      errors.push("`compatibility` must be a non-empty string");
    } else if (data.compatibility.length > 500) {
      errors.push(`\`compatibility\` is ${data.compatibility.length} characters (max 500)`);
    }
  }
  if ("allowed-tools" in data && typeof data["allowed-tools"] !== "string") {
    errors.push("`allowed-tools` must be a space-separated string, e.g. `Bash(git:*) Read`");
  }
  if ("metadata" in data) {
    const meta = data.metadata;
    if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
      errors.push("`metadata` must be a map of string keys to string values");
    } else {
      for (const [key, value] of Object.entries(meta)) {
        if (typeof value !== "string") errors.push(`\`metadata.${key}\` must be a string`);
      }
    }
  }

  for (const key of Object.keys(data)) {
    if (!SPEC_KEYS.has(key) && !AGENT_KEYS.has(key)) {
      warnings.push(`unknown frontmatter key \`${key}\` — not part of the Agent Skills spec`);
    }
  }

  if (!body.trim()) errors.push("no instructions after the frontmatter");
  const lineCount = raw.split(/\r?\n/).length;
  if (lineCount > 500) {
    warnings.push(`SKILL.md is ${lineCount} lines — move detail into references/ and keep the entry point skimmable`);
  }
  checkReferences(body, dir, warnings);

  return { name: typeof name === "string" ? name : null, errors, warnings };
}

const files = discover().sort();

if (files.length === 0) {
  console.error('FAIL no SKILL.md found — the skills CLI would report "No skills found"');
  console.error("     expected layout: skills/<skill-name>/SKILL.md");
  process.exit(1);
}

let errorCount = 0;
let warningCount = 0;
const seen = new Map();

for (const file of files) {
  const { name, errors, warnings } = validate(file);
  if (name) {
    if (seen.has(name)) errors.push(`duplicate skill name \`${name}\` (already declared in ${seen.get(name)})`);
    else seen.set(name, rel(file));
  }

  console.log(`${errors.length ? "FAIL" : "ok  "} ${rel(file)}${name ? `  (${name})` : ""}`);
  for (const message of errors) console.log(`       error:   ${message}`);
  for (const message of warnings) console.log(`       warning: ${message}`);

  errorCount += errors.length;
  warningCount += warnings.length;
}

console.log(`\n${files.length} skill(s), ${errorCount} error(s), ${warningCount} warning(s)`);
process.exit(errorCount > 0 ? 1 : 0);



