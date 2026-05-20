# Papertrail MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI assistants access to your **SolarWinds Papertrail** logs. Works with both the **SolarWinds Observability (SWO)** API and the **classic Papertrail** API.

## Features

- **6 tools** for searching, tailing, and analyzing logs
- **Intelligent noise filtering** — strips Datadog Synthetic pings, Heroku memory metrics, and NestJS context echoes
- **NestJS log parsing** — extracts real `LOG`/`WARN`/`ERROR` levels from ANSI-formatted messages (Heroku ships everything as syslog `INFO`)
- **Heroku router parsing** — structures method, path, status, response time, and error codes
- **Human-readable time inputs** — `"30m ago"`, `"2h ago"`, `"today"`, `"yesterday"`, ISO dates
- **Request tracing** — follow a single HTTP request across the entire stack via Heroku `request_id`

## Installation

```bash
npm install -g papertrail-mcp-server
```

Or clone and link locally:

```bash
git clone https://github.com/anmolm96/papertrail-mcp-server.git
cd papertrail-mcp-server
npm install
npm link
```

## Configuration

The server reads `PAPERTRAIL_API_TOKEN` from (in priority order):
1. **Environment variable** passed via `env` in MCP config
2. **`.env` file** in the workspace root (auto-loaded, no dependencies needed)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PAPERTRAIL_API_TOKEN` | **Yes** | — | Your API token |
| `PAPERTRAIL_API_TYPE` | No | `swo` | `"swo"` for SolarWinds Observability, `"classic"` for classic Papertrail |
| `PAPERTRAIL_API_URL` | No | auto | Override the API base URL |

### Getting your API token

- **SWO**: Go to **Settings → API Tokens** in your [SolarWinds Observability console](https://my.na-01.cloud.solarwinds.com/)
- **Classic Papertrail**: Go to **Profile → API Token** at [papertrailapp.com](https://papertrailapp.com/)

## Usage with AI Assistants

### VS Code (GitHub Copilot)

**Easiest — if your `.env` already has `PAPERTRAIL_API_TOKEN`:**

```json
{
  "servers": {
    "papertrail": {
      "command": "npx",
      "args": ["-y", "papertrail-mcp-server"]
    }
  }
}
```

**With a secure prompt (token not stored in files):**

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "papertrail-token",
      "description": "Papertrail / SolarWinds Observability API token",
      "password": true
    }
  ],
  "servers": {
    "papertrail": {
      "command": "npx",
      "args": ["-y", "papertrail-mcp-server"],
      "env": {
        "PAPERTRAIL_API_TOKEN": "${input:papertrail-token}"
      }
    }
  }
}
```

**With an explicit token (private repos only):**

```json
{
  "servers": {
    "papertrail": {
      "command": "npx",
      "args": ["-y", "papertrail-mcp-server"],
      "env": {
        "PAPERTRAIL_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "papertrail": {
      "command": "npx",
      "args": ["-y", "papertrail-mcp-server"],
      "env": {
        "PAPERTRAIL_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "papertrail": {
      "command": "npx",
      "args": ["-y", "papertrail-mcp-server"],
      "env": {
        "PAPERTRAIL_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Classic Papertrail API

If you're using the classic Papertrail API (not SWO), add:

```json
"env": {
  "PAPERTRAIL_API_TOKEN": "your-token-here",
  "PAPERTRAIL_API_TYPE": "classic"
}
```

## Tools

### `search_logs`
General-purpose log search with query syntax support.

```
query: "OrderService"
since: "2h ago"
limit: 200
```

### `tail_logs`
Get the most recent log events (like `tail -f`).

```
limit: 50
```

### `search_errors`
Find real errors only — filters out INFO noise and returns NestJS ERROR/WARN, Heroku router errors, HTTP 4xx/5xx, stack traces, and exception patterns.

```
since: "1h ago"
query: "DocumentSignService"
```

### `search_http_errors`
Structured HTTP error search from Heroku router logs.

```
min_status: 500
since: "today"
path_filter: "/dashboard/products"
```

### `error_summary`
Aggregated error report grouped by type, endpoint, and service context.

```
since: "24h ago"
```

### `search_by_request_id`
Trace a single HTTP request through the entire stack.

```
request_id: "a0a1e4ea-2189-88c2-b3d4-..."
```

## Time Formats

All `since` and `until` parameters accept:

| Format | Example |
|---|---|
| Relative | `"30m ago"`, `"2h ago"`, `"1d ago"` |
| Shorthand | `"30m"`, `"2h"`, `"1d"` |
| Named | `"today"`, `"yesterday"` |
| ISO date | `"2025-01-15"` |
| ISO datetime | `"2025-01-15T07:00:00Z"` |

You can also use `min_time` / `max_time` with epoch seconds.

## Architecture

```
src/
  index.js        — MCP server entry point & tool handler dispatch
  config.js       — Environment variable parsing & validation
  api-client.js   — HTTP client for SWO & classic Papertrail APIs
  parsers.js      — NestJS log parser, Heroku router parser, time parser
  filters.js      — Noise filtering & error detection
  formatters.js   — Output formatting for AI consumption
  tools.js        — MCP tool definitions (schemas & descriptions)
```

## License

MIT
