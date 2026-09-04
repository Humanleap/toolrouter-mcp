# ToolRouter — the OpenRouter for tools

**The OpenRouter for tools. One MCP connection gives any AI agent 250+ hosted tools, pay per call.**

ToolRouter is the OpenRouter for tools. Connect once over MCP and your agent can discover and call 250+ hosted specialist tools: web search, scraping, image and video generation, SEO, finance, property, compliance and more. Free tools work immediately; paid tools are pay per call. Everything runs on the hosted gateway; nothing executes locally.

**The compact routing surface costs an agent about 9,000 tokens of context for the whole catalog, versus roughly 257,000 tokens if every skill were loaded as its own tool** (measured 2026-09-03; method and raw data at <https://toolrouter.com/blog/mcp-tool-schema-token-cost>).

## Connect in one line

Hosted endpoint: `https://api.toolrouter.com/mcp` (streamable HTTP). No API key needed — the server provisions a free account on first connect and returns a claim link.

### Claude Code

```bash
claude mcp add --transport http toolrouter https://api.toolrouter.com/mcp
```

### Claude (chat, Desktop, mobile)

Customize → Connectors → Add custom connector, name it `ToolRouter`, URL `https://api.toolrouter.com/mcp/anthropic`.

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "toolrouter": {
      "url": "https://api.toolrouter.com/mcp"
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
      "type": "http",
      "url": "https://api.toolrouter.com/mcp"
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "toolrouter": {
      "httpUrl": "https://api.toolrouter.com/mcp"
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
      "serverUrl": "https://api.toolrouter.com/mcp"
    }
  }
}
```

Any other MCP client that speaks streamable HTTP can use the same URL.

## Local bridge (npm)

`toolrouter-mcp` is a stdio bridge to the same hosted gateway, plus a CLI. Use it where a client cannot take a remote URL.

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

## Install the local bridge

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
- [Privacy Policy](https://toolrouter.com/privacy)
- [Terms](https://toolrouter.com/terms)

## Privacy Policy

https://toolrouter.com/privacy

## Support

support@toolrouter.com
