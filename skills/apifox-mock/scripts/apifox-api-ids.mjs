#!/usr/bin/env node
// Resolve the apiId (and optionally the mock URL) of endpoints in an Apifox
// project. Read-only: it exports and filters, it never writes.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import process, { argv, env, exit } from 'node:process';

const API_VERSION = '2024-03-28';

const USAGE = `Usage: node apifox-api-ids.mjs [options]

  --folder=<folder>    Only endpoints whose x-apifox-folder starts with this
  --path=<substring>   Only paths containing this substring
  --mock-base=<url>    Prefix for the printed mock URL, e.g.
                       https://m1.apifoxmock.com/m2/<projectId>-<mockId>-default
  --project-id=<id>    Apifox project id (else APIFOX_PROJECT_ID, else MCP config)
  --help

The access token is read from APIFOX_ACCESS_TOKEN, else from the apifox-mcp entry
in ~/.claude.json. It is never printed. The export can exceed 700 KB, so it is
written to a temp file, filtered, and deleted before exit.`;

function arg(name) {
  const hit = argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function fromMcpConfig() {
  try {
    const server = JSON.parse(
      readFileSync(`${homedir()}/.claude.json`, 'utf8'),
    ).mcpServers?.['apifox-mcp'];
    if (!server) return {};
    const pid = (server.args ?? [])
      .find((a) => typeof a === 'string' && a.startsWith('--project-id='))
      ?.split('=')[1];
    return { token: server.env?.APIFOX_ACCESS_TOKEN, projectId: pid };
  } catch {
    return {};
  }
}

if (argv.slice(2).includes('--help')) {
  console.log(USAGE);
  exit(0);
}

const mcp = fromMcpConfig();
const projectId = arg('project-id') ?? env.APIFOX_PROJECT_ID ?? mcp.projectId;
const token = env.APIFOX_ACCESS_TOKEN ?? mcp.token;
const folder = arg('folder');
const pathFilter = arg('path');
const mockBase = (arg('mock-base') ?? '').replace(/\/+$/, '');

if (!projectId) {
  console.error('No project id. Pass --project-id=<id> or set APIFOX_PROJECT_ID.');
  exit(1);
}
if (!token) {
  console.error('No access token. Set APIFOX_ACCESS_TOKEN.');
  exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'apifox-export-'));
const dump = join(dir, 'export.json');
const cleanup = () => rmSync(dir, { recursive: true, force: true });
// Also runs when stdout is closed early (`| head`) and the process dies mid-print.
process.on('exit', cleanup);

try {
  const res = await fetch(
    `https://api.apifox.com/v1/projects/${projectId}/export-openapi?locale=zh-CN`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Apifox-Api-Version': API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: { type: 'ALL' },
        options: { includeApifoxExtensionProperties: true, addFoldersToTags: true },
        oasVersion: '3.0',
        exportFormat: 'JSON',
      }),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    exit(1);
  }
  writeFileSync(dump, text);

  const paths = JSON.parse(readFileSync(dump, 'utf8')).paths ?? {};
  const rows = [];

  for (const [path, item] of Object.entries(paths)) {
    if (pathFilter && !path.includes(pathFilter)) continue;
    for (const [method, op] of Object.entries(item)) {
      if (method.startsWith('x-') || method === 'parameters') continue;
      const opFolder = op['x-apifox-folder'] ?? '';
      if (folder && !opFolder.startsWith(folder)) continue;
      const apiId = /api-(\d+)-run/.exec(op['x-run-in-apifox'] ?? '')?.[1];
      if (!apiId) continue;
      rows.push({ method: method.toUpperCase(), path, apiId, folder: opFolder });
    }
  }

  if (rows.length === 0) {
    console.error('No endpoints matched. Check --folder / --path, or re-run the import.');
    exit(1);
  }

  rows.sort((a, b) => a.path.localeCompare(b.path));
  const width = Math.max(...rows.map((r) => r.path.length));
  for (const r of rows) {
    const url = mockBase ? `  ${mockBase}/${r.apiId}` : '';
    console.log(`${r.method.padEnd(6)} ${r.path.padEnd(width)}  ${r.apiId}${url}`);
  }
  if (!mockBase) {
    console.log('\nPass --mock-base=<url> to print full mock URLs.');
  }
} finally {
  cleanup();
}
