#!/usr/bin/env node
// Apifox mock helper. Two commands:
//
//   node apifox.mjs import <oas-file> --yes [--mock-base=<url>]
//       Import an OpenAPI 3.0 document, then resolve the apiId and mock URL of
//       every operation it declares — one call instead of import + lookup.
//   node apifox.mjs ids [--folder=<f>] [--path=<s>] [--mock-base=<url>]
//       Look up ids of endpoints that already exist. Read-only.
//
// Credentials are read at run time and never printed. No dependencies; Node 18+.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import process, { argv, env, exit } from 'node:process';

const API_VERSION = '2024-03-28';
const PROJECTS = 'https://api.apifox.com/v1/projects';
const IMPORT_OPTIONS = {
  endpointOverwriteBehavior: 'OVERWRITE_EXISTING',
  schemaOverwriteBehavior: 'OVERWRITE_EXISTING',
  updateFolderOfChangedEndpoint: true,
  prependBasePath: false,
};
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

const USAGE = `Usage:
  node apifox.mjs import <oas-file> --yes [--mock-base=<url>]
  node apifox.mjs ids [--folder=<folder>] [--path=<substring>] [--mock-base=<url>]

  --yes               Actually import; without it the command dry-runs
  --mock-base=<url>   Prefix for printed mock URLs; else APIFOX_MOCK_BASE
  --project-id=<id>   Apifox project id; else APIFOX_PROJECT_ID, else MCP config
  --folder=<folder>   ids: keep endpoints whose x-apifox-folder starts with this
  --path=<substring>  ids: keep paths containing this substring
  --help

Both commands print a "METHOD  path  apiId  mockUrl" table. The token is read
from APIFOX_ACCESS_TOKEN, else from the apifox-mcp entry in ~/.claude.json, and
is never printed.`;

const args = argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const arg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name) => args.includes(`--${name}`);
const fail = (msg) => {
  console.error(msg);
  exit(1);
};

const tempDirs = [];
// Also fires when stdout closes early (`| head`) and the process dies mid-print.
process.on('exit', () => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function credentials() {
  let mcp = {};
  try {
    const server = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')).mcpServers?.[
      'apifox-mcp'
    ];
    mcp = {
      token: server?.env?.APIFOX_ACCESS_TOKEN,
      projectId: (server?.args ?? [])
        .find((a) => typeof a === 'string' && a.startsWith('--project-id='))
        ?.split('=')[1],
    };
  } catch {
    // No Claude Code config here; the environment variables are the portable path.
  }
  const projectId = arg('project-id') ?? env.APIFOX_PROJECT_ID ?? mcp.projectId;
  const token = env.APIFOX_ACCESS_TOKEN ?? mcp.token;
  if (!projectId) fail('No project id. Pass --project-id=<id> or set APIFOX_PROJECT_ID.');
  if (!token) fail('No access token. Set APIFOX_ACCESS_TOKEN.');
  return { projectId, token };
}

async function post({ projectId, token }, endpoint, body) {
  const res = await fetch(`${PROJECTS}/${projectId}/${endpoint}?locale=zh-CN`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Apifox-Api-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) fail(`HTTP ${res.status} on ${endpoint}: ${text.slice(0, 500)}`);
  return text;
}

// Every real operation in a paths object, skipping path-level keys such as
// parameters, summary, description, servers and x-*.
function operations(paths) {
  return Object.entries(paths ?? {}).flatMap(([path, item]) =>
    Object.entries(item ?? {})
      .filter(([method]) => METHODS.has(method.toLowerCase()))
      .map(([method, op]) => ({ method: method.toUpperCase(), path, op })),
  );
}

// The export can exceed 700 KB: land it on disk, parse there, keep it off stdout.
async function endpoints(creds) {
  const dir = mkdtempSync(join(tmpdir(), 'apifox-export-'));
  tempDirs.push(dir);
  const dump = join(dir, 'export.json');
  writeFileSync(
    dump,
    await post(creds, 'export-openapi', {
      scope: { type: 'ALL' },
      options: { includeApifoxExtensionProperties: true, addFoldersToTags: true },
      oasVersion: '3.0',
      exportFormat: 'JSON',
    }),
  );
  const rows = operations(JSON.parse(readFileSync(dump, 'utf8')).paths).map(
    ({ method, path, op }) => ({
      method,
      path,
      folder: op['x-apifox-folder'] ?? '',
      apiId: /api-(\d+)-run/.exec(op['x-run-in-apifox'] ?? '')?.[1],
    }),
  );
  rmSync(dir, { recursive: true, force: true });
  return rows.filter((r) => r.apiId);
}

function printRows(rows, mockBase) {
  rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const width = Math.max(...rows.map((r) => r.path.length));
  for (const r of rows) {
    const url = mockBase ? `  ${mockBase}/${r.apiId}` : '';
    console.log(`${r.method.padEnd(6)} ${r.path.padEnd(width)}  ${r.apiId}${url}`);
  }
  if (!mockBase) console.log('\nPass --mock-base=<url> to print full mock URLs.');
}

async function runImport(file, mockBase) {
  if (!file) fail(`Missing <oas-file>.\n\n${USAGE}`);
  let input;
  let doc;
  try {
    input = readFileSync(file, 'utf8');
    doc = JSON.parse(input);
  } catch (err) {
    fail(`Cannot read or parse ${file}: ${err.message}`);
  }
  const ops = operations(doc.paths);
  if (ops.length === 0) fail(`${file} declares no operations under "paths".`);

  if (!flag('yes')) {
    console.log(`DRY RUN — nothing sent. ${input.length} bytes, ${ops.length} operations:`);
    for (const o of ops) console.log(`  ${o.method} ${o.path}`);
    console.log(`Options ${JSON.stringify(IMPORT_OPTIONS)}`);
    console.log('\nRe-run with --yes; that overwrites matching endpoints in a shared project.');
    return;
  }

  const creds = credentials();
  const raw = await post(creds, 'import-openapi', { input, options: IMPORT_OPTIONS });
  const counters = JSON.parse(raw).data?.counters;
  if (!counters) fail(`Unexpected import response: ${raw.slice(0, 500)}`);
  console.log(
    Object.entries(counters)
      .map(([k, v]) => `${k}=${v}`)
      .join('  '),
  );
  if (counters.endpointFailed > 0) {
    fail('endpointFailed > 0 — fix the document (usually an unresolved $ref); do not retry blindly.');
  }
  if (counters.endpointIgnored > 0 && counters.schemaUpdated > 0) {
    console.log('Mock-rule-only edit: operations unchanged, schemas updated. That is success.');
  }

  const wanted = new Set(ops.map((o) => `${o.method} ${o.path}`));
  const mine = (rows) => rows.filter((r) => wanted.has(`${r.method} ${r.path}`));
  let rows = mine(await endpoints(creds));
  if (rows.length < wanted.size) {
    await new Promise((r) => setTimeout(r, 2000)); // Apifox indexes an import asynchronously
    rows = mine(await endpoints(creds));
  }
  console.log();
  if (rows.length > 0) printRows(rows, mockBase);
  const missing = [...wanted].filter((k) => !rows.some((r) => `${r.method} ${r.path}` === k));
  if (missing.length > 0) {
    fail(`\nNo apiId resolved for: ${missing.join(', ')}\nRetry: node apifox.mjs ids --path=<substring>`);
  }
}

async function runIds(mockBase) {
  const folder = arg('folder');
  const pathFilter = arg('path');
  const rows = (await endpoints(credentials())).filter(
    (r) => (!folder || r.folder.startsWith(folder)) && (!pathFilter || r.path.includes(pathFilter)),
  );
  if (rows.length === 0) {
    fail('No endpoints matched. Check --folder / --path, or re-run the import.');
  }
  printRows(rows, mockBase);
}

const command = positional[0];
const mockBase = (arg('mock-base') ?? env.APIFOX_MOCK_BASE ?? '').replace(/\/+$/, '');

if (flag('help') || !command) {
  console.log(USAGE);
  exit(flag('help') ? 0 : 1);
} else if (command === 'import') {
  await runImport(positional[1], mockBase);
} else if (command === 'ids') {
  await runIds(mockBase);
} else {
  fail(`Unknown command "${command}".\n\n${USAGE}`);
}
