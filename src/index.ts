import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const API_URL = process.env.TOOLROUTER_API_URL ?? 'https://api.toolrouter.com';
let API_KEY = process.env.TOOLROUTER_API_KEY;

/** Path to the cached API key file. */
const KEY_DIR = join(homedir(), '.toolrouter');
const KEY_FILE = join(KEY_DIR, 'key');

/** Load a previously auto-provisioned key from disk. */
function loadCachedKey(): string | undefined {
  try {
    const key = readFileSync(KEY_FILE, 'utf-8').trim();
    return key.startsWith('tr_live_') ? key : undefined;
  } catch {
    return undefined;
  }
}

/** Auto-provision a new API key and cache it to disk. */
async function autoProvision(): Promise<string> {
  log('Auto-provisioning a free account...');
  const res = await fetch(`${API_URL}/v1/auth/provision`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Provisioning failed: HTTP ${res.status}`);
  }
  const data = await res.json() as {
    api_key: string;
    claim_url: string;
    onboarding?: {
      welcome: string;
      setup_instructions?: { suggested_text: string };
      feedback_loop?: string;
    };
  };
  // Cache the key for future runs
  try {
    mkdirSync(KEY_DIR, { recursive: true });
    writeFileSync(KEY_FILE, data.api_key, { mode: 0o600 });
  } catch {
    log('Warning: could not cache API key to ~/.toolrouter/key');
  }
  log(`Ready. Claim your account: ${data.claim_url}`);

  return data.api_key;
}

/** Ensure we have an API key — from env, cache, or auto-provision. */
async function ensureApiKey(): Promise<string> {
  if (!API_KEY) {
    API_KEY = loadCachedKey() ?? await autoProvision();
  }
  return API_KEY;
}

/** Log to stderr (stdout is reserved for MCP JSON-RPC). */
function log(message: string): void {
  process.stderr.write(`[toolrouter] ${message}\n`);
}

/** Write JSON output to file or stdout. */
function writeOutput(json: string, filePath?: string): void {
  if (filePath) {
    writeFileSync(resolve(filePath), json + '\n');
    console.error(`Result written to ${filePath}`);
  } else {
    console.log(json);
  }
}

// ─── REST API helpers (always remote) ──────────────────────────────────────

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`;
  return h;
}

/** Extract an error message from a failed API response body. */
async function extractApiError(res: globalThis.Response): Promise<string> {
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  const err = data.error as Record<string, unknown> | undefined;
  const msg = (err?.message ?? `HTTP ${res.status}`) as string;
  const hint = (err?.resolution_hint ?? '') as string;
  const claimUrl = (err?.claim_url ?? '') as string;
  let result = msg;
  if (claimUrl && !msg.includes(claimUrl)) result += ` — Claim your account at: ${claimUrl}`;
  else if (hint) result += ` — ${hint}`;
  return result;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: apiHeaders() });
  if (!res.ok) {
    throw new Error(await extractApiError(res));
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await extractApiError(res));
  }
  return res.json() as Promise<T>;
}

// ─── CLI commands (thin client → API gateway) ─────────────────────────────

async function cliTools(): Promise<void> {
  const data = await apiGet<{ tools: Array<{ name: string; displayName: string; description: string; skills: unknown[] }> }>('/v1/tools');
  for (const t of data.tools) {
    console.log(`  ${t.name}  ${t.displayName} (${t.skills.length} skills)`);
    console.log(`    ${t.description}\n`);
  }
  console.log(`\n  ${data.tools.length} tools available`);
}

async function cliCall(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.error('Usage: toolrouter-mcp call <tool> <skill> [--input \'{"key":"value"}\'] [--key value] [-o file.json]');
    process.exit(1);
  }

  await ensureApiKey();

  const tool = args[0];
  const skill = args[1];

  // Parse -o / --output flag before passing to input parser
  let outputFile: string | undefined;
  const filteredArgs = args.slice(2).filter((arg, i, arr) => {
    if (arg === '-o' || arg === '--output') {
      outputFile = arr[i + 1];
      return false;
    }
    // Skip the value following -o/--output
    if (i > 0 && (arr[i - 1] === '-o' || arr[i - 1] === '--output')) return false;
    return true;
  });

  const input = parseCliInput(filteredArgs);

  // Use raw fetch to detect 202 async responses
  const res = await fetch(`${API_URL}/v1/tools/call`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ tool, skill, input }),
  });

  if (!res.ok && res.status !== 202) {
    const errMsg = await extractApiError(res);
    console.error(`error: ${errMsg}`);
    process.exit(1);
  }

  const body = await res.json() as Record<string, unknown>;

  // Async job — auto-poll until completion
  if (res.status === 202 && body.job_id) {
    const jobId = body.job_id as string;
    console.error(`Job submitted: ${jobId}`);
    console.error('Waiting for result...');

    const pollInterval = 10_000;
    const maxWait = 600_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const job = await apiGet<Record<string, unknown>>(`/v1/jobs/${jobId}`);
      const status = job.status as string;
      const elapsed = Math.round((Date.now() - start) / 1000);

      if (status === 'completed') {
        writeOutput(JSON.stringify(job, null, 2), outputFile);
        process.exit(0);
      }

      if (status === 'failed' || status === 'cancelled') {
        console.error(`Job ${status}: ${(job.error as string) ?? 'unknown error'}`);
        writeOutput(JSON.stringify(job, null, 2), outputFile);
        process.exit(1);
      }

      const progress = job.progress as string | undefined;
      console.error(`  [${elapsed}s] ${status}${progress ? ` — ${progress}` : ''}`);
    }

    console.error(`Job timed out after ${maxWait / 1000}s. Poll manually: GET /v1/jobs/${jobId}`);
    process.exit(1);
  }

  // Sync result
  writeOutput(JSON.stringify(body, null, 2), outputFile);
  const status = (body.status as string) ?? '';
  process.exit(status === 'success' ? 0 : 1);
}

async function cliInfo(args: string[]): Promise<void> {
  const toolName = args[0];
  if (!toolName) {
    console.error('Usage: toolrouter-mcp info <tool>');
    console.error('Example: toolrouter-mcp info seo');
    process.exit(1);
  }

  interface SkillInfo {
    name: string;
    displayName: string;
    description: string;
    inputSchema?: {
      properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
      required?: string[];
    };
    examples?: Array<{ description: string; input: Record<string, unknown> }>;
    annotations?: { execution?: { estimatedSeconds?: number } };
  }
  interface ToolInfo {
    name: string;
    displayName: string;
    description: string;
    categories: string[];
    skills: SkillInfo[];
  }

  const tool = await apiGet<ToolInfo>(`/v1/tools/${encodeURIComponent(toolName)}`);
  console.log();
  console.log(`  ${tool.displayName} (${tool.name})`);
  console.log(`  ${tool.description}`);
  console.log(`  Categories: ${tool.categories.join(', ')}`);
  console.log();
  console.log(`  Skills (${tool.skills.length}):`);
  console.log();

  for (const skill of tool.skills) {
    const isAsync = (skill.annotations?.execution?.estimatedSeconds ?? 0) >= 30;
    const asyncTag = isAsync ? ' [async]' : '';
    console.log(`    ${skill.name}${asyncTag}`);
    console.log(`      ${skill.description}`);

    // Parameters
    if (skill.inputSchema?.properties) {
      const props = skill.inputSchema.properties;
      const required = new Set(skill.inputSchema.required ?? []);
      const paramNames = Object.keys(props);
      if (paramNames.length > 0) {
        console.log('      Parameters:');
        for (const pName of paramNames) {
          const p = props[pName];
          const req = required.has(pName) ? '*' : ' ';
          const typeStr = p.type ? `<${p.type}>` : '';
          const enumStr = p.enum ? ` (${p.enum.join('|')})` : '';
          console.log(`        ${req} ${pName} ${typeStr}${enumStr}`);
          if (p.description) console.log(`          ${p.description}`);
        }
      }
    }

    // Examples
    if (skill.examples && skill.examples.length > 0) {
      console.log('      Examples:');
      for (const ex of skill.examples) {
        console.log(`        # ${ex.description}`);
        console.log(`        $ toolrouter-mcp call ${tool.name} ${skill.name} --input '${JSON.stringify(ex.input)}'`);
      }
    }
    console.log();
  }
}

async function cliSearch(args: string[]): Promise<void> {
  const query = args.join(' ');
  if (!query) {
    console.error('Usage: toolrouter-mcp search <query>');
    process.exit(1);
  }
  const data = await apiGet<{ tools: Array<{ name: string; displayName: string; description: string; skills: unknown[] }> }>(`/v1/tools/search?q=${encodeURIComponent(query)}`);
  for (const t of data.tools) {
    console.log(`  ${t.name}  ${t.displayName} (${t.skills.length} skills)`);
    console.log(`    ${t.description}\n`);
  }
  console.log(`  ${data.tools.length} results`);
}

function parseCliInput(args: string[]): Record<string, unknown> {
  // --input '{"json":"string"}'
  const inputIdx = args.indexOf('--input');
  if (inputIdx >= 0 && args[inputIdx + 1]) {
    return JSON.parse(args[inputIdx + 1]);
  }

  // Flag-based: --url https://example.com --limit 10
  const input: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && arg !== '--input') {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        // Try to parse as JSON for numbers/booleans
        try { input[key] = JSON.parse(next); } catch { input[key] = next; }
        i++;
      } else {
        input[key] = true;
      }
    }
  }
  return input;
}

function cliLogin(args: string[]): void {
  const key = args[0];
  if (!key || !key.startsWith('tr_live_')) {
    console.error('Usage: toolrouter-mcp login <tr_live_xxx>');
    console.error('Get your API key from https://toolrouter.com/connect');
    process.exit(1);
  }
  try {
    mkdirSync(KEY_DIR, { recursive: true });
    writeFileSync(KEY_FILE, key, { mode: 0o600 });
    console.log('API key saved. CLI and MCP will use this key.');
  } catch (err) {
    console.error(`Failed to save key: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function cliLogout(): void {
  try {
    unlinkSync(KEY_FILE);
    console.log('Logged out. Cached key removed.');
  } catch {
    console.log('No cached key found.');
  }
}

function cliWhoami(): void {
  const key = process.env.TOOLROUTER_API_KEY || loadCachedKey();
  if (!key) {
    console.log('Not logged in. Run a command to auto-provision, or: toolrouter-mcp login <key>');
    return;
  }
  const source = process.env.TOOLROUTER_API_KEY ? 'env (TOOLROUTER_API_KEY)' : `~/.toolrouter/key`;
  const preview = `${key.slice(0, 12)}...${key.slice(-4)}`;
  console.log(`Key: ${preview} (from ${source})`);
}

async function cliStatus(): Promise<void> {
  const key = process.env.TOOLROUTER_API_KEY || loadCachedKey();
  const keySource = process.env.TOOLROUTER_API_KEY ? 'env' : key ? '~/.toolrouter/key' : 'none';

  // Fetch tool count and health in parallel
  let toolCount = 0;
  let skillCount = 0;
  let healthy = false;
  try {
    const data = await apiGet<{ tools: Array<{ skills: unknown[] }> }>('/v1/tools');
    toolCount = data.tools.length;
    skillCount = data.tools.reduce((sum, t) => sum + t.skills.length, 0);
    healthy = true;
  } catch {
    // API unreachable
  }

  const isJson = process.argv.includes('--format') && process.argv[process.argv.indexOf('--format') + 1] === 'json';

  if (isJson) {
    console.log(JSON.stringify({
      gateway: API_URL,
      healthy,
      authenticated: !!key,
      key_source: keySource,
      tools: toolCount,
      skills: skillCount,
    }, null, 2));
    return;
  }

  console.log();
  console.log('  ToolRouter');
  console.log('  ' + '─'.repeat(13));
  console.log(`    Gateway: ${API_URL}`);
  console.log(`    Status:  ${healthy ? 'connected' : 'unreachable'}`);
  console.log(`    Auth:    ${key ? `configured (${keySource})` : 'not configured'}`);
  if (key) {
    console.log(`    Key:     ${key.slice(0, 12)}...${key.slice(-4)}`);
  }
  console.log(`    Tools:   ${toolCount}`);
  console.log(`    Skills:  ${skillCount}`);
  console.log();
}

function printUsage(): void {
  console.log(`toolrouter-mcp — thin client for ToolRouter API

Usage:
  toolrouter-mcp                              Start MCP stdio server (for agents)
  toolrouter-mcp --status                     Check connection, auth, and tool count
  toolrouter-mcp call <tool> <skill> [opts]   Call a tool via the API
  toolrouter-mcp tools                        List available tools
  toolrouter-mcp info <tool>                  Show tool skills, params, and examples
  toolrouter-mcp search <query>               Search for tools
  toolrouter-mcp login <tr_live_xxx>          Save an API key (from toolrouter.com)
  toolrouter-mcp logout                       Remove cached API key
  toolrouter-mcp whoami                       Show current API key
  toolrouter-mcp help                         Show this help

No API key needed — auto-provisions on first use. Use 'login' to connect
an existing toolrouter.com account. CLI and MCP share the same key.

Input methods:
  --input '{"key":"value"}'                   JSON string
  --key value                                 Flag-based params

Environment:
  TOOLROUTER_API_KEY    API key (overrides cached key)
  TOOLROUTER_API_URL    API URL (default: https://api.toolrouter.com)

Examples:
  toolrouter-mcp --status
  toolrouter-mcp info seo                                          # See skills & params
  toolrouter-mcp call seo analyze_page --url https://example.com
  toolrouter-mcp call web-search search --input '{"query":"MCP tools"}'
  toolrouter-mcp tools
  toolrouter-mcp search "web scraping"
  toolrouter-mcp login tr_live_xxx
`);
}

// ─── Entrypoint ───────────────────────────────────────────────────────────

const command = process.argv[2];

if (command === 'call' || command === 'tools' || command === 'search' || command === 'info' || command === 'login' || command === 'logout' || command === 'whoami' || command === 'help' || command === '--help' || command === '-h' || command === '--status' || command === 'status') {
  // CLI mode — thin client, everything goes through the API
  (async () => {
    try {
      switch (command) {
        case 'call':
          await cliCall(process.argv.slice(3));
          break;
        case 'tools':
          await cliTools();
          break;
        case 'search':
          await cliSearch(process.argv.slice(3));
          break;
        case 'info':
          await cliInfo(process.argv.slice(3));
          break;
        case '--status':
        case 'status':
          await cliStatus();
          break;
        case 'login':
          cliLogin(process.argv.slice(3));
          break;
        case 'logout':
          cliLogout();
          break;
        case 'whoami':
          cliWhoami();
          break;
        default:
          printUsage();
      }
    } catch (err) {
      console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  })();
} else {
  // MCP mode — stdio proxy to API gateway (default, no args)
  (async () => {
    const apiKey = await ensureApiKey();

    const remoteTransport = new StreamableHTTPClientTransport(
      new URL(`${API_URL}/mcp`),
      { requestInit: { headers: { 'Authorization': `Bearer ${apiKey}` } } },
    );

    const remote = new Client({ name: 'toolrouter-proxy', version: '0.1.0' });
    await remote.connect(remoteTransport);
    log(`Connected to ${API_URL}`);

    const server = new Server(
      { name: 'toolrouter', version: '0.1.0' },
      { capabilities: { tools: {}, resources: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const result = await remote.listTools();
      return result;
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const result = await remote.callTool({
        name: request.params.name,
        arguments: request.params.arguments,
      });
      return result;
    });

    // Proxy resource requests to the remote gateway (for MCP Apps)
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const result = await remote.listResources();
      return result;
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const result = await remote.readResource({ uri: request.params.uri });
      return result;
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    log('Ready');

    process.on('SIGINT', async () => {
      await remote.close();
      await server.close();
      process.exit(0);
    });
  })().catch((err) => {
    log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
