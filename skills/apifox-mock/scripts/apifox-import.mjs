#!/usr/bin/env node
// Import an OpenAPI 3.0 document into an Apifox project.
// Dry-run by default; writing requires --yes.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { argv, env, exit } from 'node:process';

const API_VERSION = '2024-03-28';
const OPTIONS = {
  endpointOverwriteBehavior: 'OVERWRITE_EXISTING',
  schemaOverwriteBehavior: 'OVERWRITE_EXISTING',
  updateFolderOfChangedEndpoint: true,
  prependBasePath: false,
};

const USAGE = `Usage: node apifox-import.mjs <oas-file> [options]

  --dry-run            Print what would be sent and exit (default)
  --yes                Actually import; overwrites endpoints in a shared project
  --project-id=<id>    Apifox project id (else APIFOX_PROJECT_ID, else MCP config)
  --help

The access token is read from APIFOX_ACCESS_TOKEN, else from the apifox-mcp entry
in ~/.claude.json. It is never printed.`;

function arg(name) {
  const hit = argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function flag(name) {
  return argv.slice(2).includes(`--${name}`);
}

function fromMcpConfig() {
  try {
    const raw = readFileSync(`${homedir()}/.claude.json`, 'utf8');
    const server = JSON.parse(raw).mcpServers?.['apifox-mcp'];
    if (!server) return {};
    const pid = (server.args ?? [])
      .find((a) => typeof a === 'string' && a.startsWith('--project-id='))
      ?.split('=')[1];
    return { token: server.env?.APIFOX_ACCESS_TOKEN, projectId: pid };
  } catch {
    return {};
  }
}

const file = argv.slice(2).find((a) => !a.startsWith('--'));
if (flag('help') || !file) {
  console.log(USAGE);
  exit(flag('help') ? 0 : 1);
}

let input;
try {
  input = readFileSync(file, 'utf8');
  JSON.parse(input);
} catch (err) {
  console.error(`Cannot read or parse ${file}: ${err.message}`);
  exit(1);
}

const mcp = fromMcpConfig();
const projectId = arg('project-id') ?? env.APIFOX_PROJECT_ID ?? mcp.projectId;
const token = env.APIFOX_ACCESS_TOKEN ?? mcp.token;

if (!projectId) {
  console.error('No project id. Pass --project-id=<id> or set APIFOX_PROJECT_ID.');
  exit(1);
}
if (!token) {
  console.error('No access token. Set APIFOX_ACCESS_TOKEN.');
  exit(1);
}

const url = `https://api.apifox.com/v1/projects/${projectId}/import-openapi?locale=zh-CN`;
const body = JSON.stringify({ input, options: OPTIONS });
const operations = Object.entries(JSON.parse(input).paths ?? {}).flatMap(
  ([path, item]) =>
    Object.keys(item)
      .filter((k) => !k.startsWith('x-') && k !== 'parameters')
      .map((method) => `${method.toUpperCase()} ${path}`),
);

if (!flag('yes')) {
  console.log('DRY RUN — no request sent.\n');
  console.log(`POST    ${url}`);
  console.log('Headers Authorization, X-Apifox-Api-Version, Content-Type');
  console.log(`Body    ${body.length} bytes`);
  console.log(`Options ${JSON.stringify(OPTIONS)}`);
  console.log(`\nOperations (${operations.length}):`);
  operations.forEach((op) => console.log(`  ${op}`));
  console.log('\nRe-run with --yes to import.');
  exit(0);
}

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'X-Apifox-Api-Version': API_VERSION,
    'Content-Type': 'application/json',
  },
  body,
});

const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  exit(1);
}

let counters;
try {
  counters = JSON.parse(text).data?.counters;
} catch {
  /* fall through to the raw dump below */
}
if (!counters) {
  console.log(text.slice(0, 2000));
  exit(0);
}

console.log('Import counters:');
for (const [k, v] of Object.entries(counters)) console.log(`  ${k}: ${v}`);
if (counters.endpointFailed > 0) {
  console.error('\nendpointFailed > 0 — read the message above; do not retry blindly.');
  exit(1);
}
console.log('\nNext: node apifox-api-ids.mjs --folder="<folder>" --mock-base="<base>"');
