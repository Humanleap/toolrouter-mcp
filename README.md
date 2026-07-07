# toolrouter-mcp

MCP server + CLI for [ToolRouter](https://toolrouter.com). One package, every tool — discover, search, and call AI tools from any agent or terminal.

ToolRouter gives your AI agent **one connection to 226 tools and 1,208 skills** — web search, image and video generation, SEO and GEO, web scraping, lead finding, competitor research, document analysis, security scanning, and much more — across Claude, ChatGPT, Cursor, Windsurf, Codex, Gemini CLI, VS Code, Cline, and OpenClaw. Everything runs on the hosted gateway; nothing executes locally.

```bash
# Claude Code — one line, no API key needed (auto-provisions on first use)
claude mcp add toolrouter -- npx -y toolrouter-mcp
```

## Three ways to use it

### 1. MCP Server (for AI agents)

Run with no arguments to start an MCP stdio server. No API key needed — auto-provisions on first use:

```bash
npx -y toolrouter-mcp
```

### 2. CLI (for terminal workflows)

```bash
npx -y toolrouter-mcp tools                    # list all tools
npx -y toolrouter-mcp search "web scraping"    # search by keyword
npx -y toolrouter-mcp call seo analyze_page --url https://example.com
npx -y toolrouter-mcp help
```

### 3. REST API (direct HTTP)

```bash
# Get an API key (or use one from ~/.toolrouter/key after MCP setup)
curl -X POST https://api.toolrouter.com/v1/auth/provision

curl -H "Authorization: Bearer $TOOLROUTER_API_KEY" \
  -d '{"tool":"seo","skill":"analyze_page","input":{"url":"https://example.com"}}' \
  https://api.toolrouter.com/v1/tools/call
```

## Install as MCP Server

### Claude Code

```bash
claude mcp add toolrouter -- npx -y toolrouter-mcp
```

### Codex CLI

```bash
codex mcp add toolrouter -- npx -y toolrouter-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "toolrouter": {
      "command": "npx",
      "args": ["-y", "toolrouter-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "toolrouter": {
      "command": "npx",
      "args": ["-y", "toolrouter-mcp"]
    }
  }
}
```

### OpenClaw

Add to `openclaw.json`:

```json
{
  "mcpServers": {
    "toolrouter": {
      "command": "npx",
      "args": ["-y", "toolrouter-mcp"]
    }
  }
}
```

### Cline

Open MCP settings and add:

```json
{
  "mcpServers": {
    "toolrouter": {
      "command": "npx",
      "args": ["-y", "toolrouter-mcp"]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "toolrouter": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "toolrouter-mcp"]
    }
  }
}
```

### Gemini CLI

Add to your Gemini CLI settings:

```json
{
  "mcpServers": {
    "toolrouter": {
      "command": "npx",
      "args": ["-y", "toolrouter-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "toolrouter": {
      "command": "npx",
      "args": ["-y", "toolrouter-mcp"]
    }
  }
}
```

## API Key

No setup needed — `toolrouter-mcp` auto-provisions a free API key on first use and caches it to `~/.toolrouter/key`. Free tools work immediately. For paid tools, visit the claim URL printed on first run to add credits.

To use an existing key instead: set `TOOLROUTER_API_KEY=tr_live_xxx` as an environment variable.

## How It Works

This package serves two purposes from one binary:

- **MCP mode** (no args): Starts an MCP stdio server that proxies `tools/list` and `tools/call` to the ToolRouter API via Streamable HTTP.
- **CLI mode** (`tools`/`search`/`call`/`help`): Thin HTTP client that sends requests to the ToolRouter API and prints results. No local tool execution.

Both modes go through `https://api.toolrouter.com` — all processing happens on ToolRouter's infrastructure.

## MCP Meta-Tools

When connected via MCP, your agent gets meta-tools for tool discovery, execution, async jobs, and full account management:

**Discovery & execution:**

| Tool | Description |
|------|-------------|
| `discover` | Find tools by keyword, category, or `*` for all |
| `use_tool` | Execute a tool skill |
| `job_get` | Poll an async job's status and result |
| `job_list` | List recent async jobs |
| `job_cancel` | Cancel a running async job |

**Credits & billing:**

| Tool | Description |
|------|-------------|
| `credits_balance` | Get available credit balance |
| `credits_usage` | Usage breakdown and recent call history |
| `top_up_credits` | Add credits |
| `subscription_manage` | View or change your subscription |
| `invoice_list` | List invoices |

**API keys:**

| Tool | Description |
|------|-------------|
| `key_create` | Create a new API key |
| `key_list` | List API keys |
| `key_delete` | Permanently disable an API key |

**Credentials (BYOK):**

| Tool | Description |
|------|-------------|
| `credential_save` | Save your own provider API key |
| `credential_list` | List saved credentials |
| `credential_delete` | Remove a saved credential |
| `credential_default` | Set the default credential for a provider |

**Connectors & account:**

| Tool | Description |
|------|-------------|
| `connector_add` | Connect a SaaS account via OAuth |
| `connector_list` | List connected accounts |
| `account_preferences` | View and update account settings |
| `feedback_review` | Rate a tool |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TOOLROUTER_API_KEY` | Yes (for tool calls) | — | Your API key |
| `TOOLROUTER_API_URL` | No | `https://api.toolrouter.com` | Custom API endpoint |

## CLI Reference

| Command | Auth Required | Description |
|---------|---------------|-------------|
| `tools` | No | List all available tools |
| `search <query>` | No | Search tools by keyword |
| `call <tool> <skill> [opts]` | Yes | Call a tool skill |
| `help` | No | Show usage help |

### Input methods for `call`

```bash
# Flag-based (most common)
npx -y toolrouter-mcp call humanleap/seo analyze_page --url https://example.com

# JSON string
npx -y toolrouter-mcp call humanleap/web-search search --input '{"query":"MCP tools"}'
```

## Requirements

- Node.js 22+

## Links

- [Website](https://toolrouter.com)
- [Connect / Setup Guide](https://toolrouter.com/connect)
- [Browse Tools](https://toolrouter.com/tools)
- [Documentation](https://toolrouter.com/docs)
- [REST API](https://api.toolrouter.com/v1/tools)
