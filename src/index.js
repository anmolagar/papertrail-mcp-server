#!/usr/bin/env node

/**
 * Papertrail MCP Server
 *
 * An MCP server that gives AI assistants access to your SolarWinds Papertrail
 * (or SWO) logs. Supports log search, live tail, error filtering, HTTP error
 * analysis, error summaries, and request tracing.
 *
 * Supports both:
 *  - SolarWinds Observability (SWO) API (default)
 *  - Classic Papertrail API (set PAPERTRAIL_API_TYPE=classic)
 *
 * Environment variables:
 *  - PAPERTRAIL_API_TOKEN (required) — API token
 *  - PAPERTRAIL_API_TYPE  (optional) — "swo" (default) or "classic"
 *  - PAPERTRAIL_API_URL   (optional) — custom API base URL
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const pkg = require("../package.json");

const config = require("./config");
const { swoRequest, classicRequest } = require("./api-client");
const {
  stripAnsi,
  parseNestLog,
  parseHerokuRouter,
  parseHumanTime,
} = require("./parsers");
const {
  filterNoise,
  isRealError,
} = require("./filters");
const {
  formatEvent,
  formatResults,
  buildErrorSummary,
  formatHttpErrors,
} = require("./formatters");
const { TOOLS } = require("./tools");

// ── Resolve API function based on config ────────────────────────────

function apiRequest(path, params) {
  if (config.apiType === "classic") {
    return classicRequest(path, params);
  }
  return swoRequest(path, params);
}

function buildLogPath() {
  return config.apiType === "classic" ? "/events/search.json" : "/logs";
}

function buildTimeParam(epochSeconds) {
  if (!epochSeconds) return undefined;
  if (config.apiType === "classic") return epochSeconds;
  return new Date(epochSeconds * 1000).toISOString();
}

// ── Tool handlers ───────────────────────────────────────────────────

async function handleSearchLogs(args) {
  const minEpoch = args.min_time || parseHumanTime(args.since);
  const maxEpoch = args.max_time || parseHumanTime(args.until);

  const params = {
    q: args.query,
    min_time: buildTimeParam(minEpoch),
    max_time: buildTimeParam(maxEpoch),
    system_id: args.system_id,
    group_id: args.group_id,
    limit: args.limit || 100,
  };

  const data = await apiRequest(buildLogPath(), params);
  const key = config.apiType === "classic" ? "events" : "logs";
  let logs = data[key] || [];
  if (!args.include_noise) logs = filterNoise(logs);
  return formatResults(logs);
}

async function handleTailLogs(args) {
  const params = {
    q: args.query,
    system_id: args.system_id,
    group_id: args.group_id,
    limit: args.limit || 100,
  };

  const data = await apiRequest(buildLogPath(), params);
  const key = config.apiType === "classic" ? "events" : "logs";
  let logs = data[key] || [];
  if (!args.include_noise) logs = filterNoise(logs);
  return formatResults(logs);
}

async function handleSearchErrors(args) {
  const minEpoch = args.min_time || parseHumanTime(args.since);
  const maxEpoch = args.max_time || parseHumanTime(args.until);

  const params = {
    q: args.query || undefined,
    min_time: buildTimeParam(minEpoch),
    max_time: buildTimeParam(maxEpoch),
    system_id: args.system_id,
    limit: args.limit || 2000,
  };

  const data = await apiRequest(buildLogPath(), params);
  const key = config.apiType === "classic" ? "events" : "logs";
  const allLogs = data[key] || [];

  const errors = allLogs.filter((evt) => {
    if (!isRealError(evt)) return false;
    return filterNoise([evt]).length > 0;
  });

  if (errors.length === 0) {
    return `No errors found in ${allLogs.length} log events searched.`;
  }

  return formatResults(errors);
}

async function handleSearchHttpErrors(args) {
  const minStatus = args.min_status || 400;
  const minEpoch = args.min_time || parseHumanTime(args.since);
  const maxEpoch = args.max_time || parseHumanTime(args.until);

  const params = {
    q: 'at=error OR "status=5" OR "status=4"',
    min_time: buildTimeParam(minEpoch),
    max_time: buildTimeParam(maxEpoch),
    limit: args.limit || 2000,
  };

  const data = await apiRequest(buildLogPath(), params);
  const key = config.apiType === "classic" ? "events" : "logs";
  const allLogs = data[key] || [];

  const httpErrors = [];
  for (const evt of allLogs) {
    const msg = evt.message || "";
    const router = parseHerokuRouter(msg);
    if (!router) continue;
    if (router.status && router.status < minStatus && router.at !== "error")
      continue;
    if (router.at !== "error" && (!router.status || router.status < minStatus))
      continue;
    if (
      args.path_filter &&
      router.path &&
      !router.path.includes(args.path_filter)
    )
      continue;

    httpErrors.push({
      time: evt.time || evt.generated_at,
      ...router,
    });
  }

  if (httpErrors.length === 0) {
    return `No HTTP errors (>= ${minStatus}) found in ${allLogs.length} events searched.`;
  }

  return formatHttpErrors(httpErrors);
}

async function handleErrorSummary(args) {
  const minEpoch = args.min_time || parseHumanTime(args.since);
  const maxEpoch = args.max_time || parseHumanTime(args.until);

  const params = {
    min_time: buildTimeParam(minEpoch),
    max_time: buildTimeParam(maxEpoch),
    system_id: args.system_id,
    limit: args.limit || 5000,
  };

  const data = await apiRequest(buildLogPath(), params);
  const key = config.apiType === "classic" ? "events" : "logs";
  const allLogs = data[key] || [];

  const errors = allLogs.filter((evt) => {
    if (!isRealError(evt)) return false;
    return filterNoise([evt]).length > 0;
  });

  if (errors.length === 0) {
    return `No errors found in ${allLogs.length} log events searched.`;
  }

  return buildErrorSummary(errors);
}

async function handleSearchByRequestId(args) {
  if (!args.request_id) {
    return "Error: request_id is required";
  }

  const params = {
    q: args.request_id,
    limit: args.limit || 200,
  };

  const data = await apiRequest(buildLogPath(), params);
  const key = config.apiType === "classic" ? "events" : "logs";
  let logs = data[key] || [];

  // Further filter to only lines that actually contain this request_id
  logs = logs.filter((evt) => {
    const msg = stripAnsi(evt.message || "");
    return msg.includes(args.request_id);
  });

  if (logs.length === 0) {
    return `No logs found for request_id: ${args.request_id}`;
  }

  return formatResults(logs);
}

// ── MCP Server ──────────────────────────────────────────────────────

async function main() {
  const server = new Server(
    { name: pkg.name, version: pkg.version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let result;
      switch (name) {
        case "search_logs":
          result = await handleSearchLogs(args);
          break;
        case "tail_logs":
          result = await handleTailLogs(args);
          break;
        case "search_errors":
          result = await handleSearchErrors(args);
          break;
        case "search_http_errors":
          result = await handleSearchHttpErrors(args);
          break;
        case "error_summary":
          result = await handleErrorSummary(args);
          break;
        case "search_by_request_id":
          result = await handleSearchByRequestId(args);
          break;
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
