/**
 * MCP tool definitions.
 *
 * Each tool is registered with the MCP server and exposed to AI assistants.
 */

const TOOLS = [
  {
    name: "search_logs",
    description:
      "Search Papertrail/SWO logs with a query string. " +
      "General-purpose raw search. Noise (Datadog Synthetic, Heroku metrics, NestJS context echoes) is filtered by default. " +
      "Supports Papertrail search syntax (AND, OR, quotes for phrases). " +
      "Times can be epoch seconds or human-readable strings like '2h ago', 'today', 'yesterday'.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query. Examples: 'OrderService', '\"connection refused\"', 'status=500'",
        },
        since: {
          type: "string",
          description:
            "Start time as human-readable string: '30m ago', '2h ago', '1d ago', 'today', 'yesterday', or ISO date like '2025-01-15'",
        },
        until: {
          type: "string",
          description: "End time (same formats as 'since')",
        },
        min_time: {
          type: "number",
          description: "Start time as epoch seconds UTC (alternative to 'since')",
        },
        max_time: {
          type: "number",
          description: "End time as epoch seconds UTC (alternative to 'until')",
        },
        system_id: {
          type: "string",
          description: "Limit to a specific system (ID or name)",
        },
        group_id: {
          type: "string",
          description: "Limit to a specific group (ID only)",
        },
        limit: {
          type: "number",
          description: "Max events to return (default 100, max 10000)",
        },
        include_noise: {
          type: "boolean",
          description:
            "Include normally-filtered noise: Datadog Synthetic logs, Heroku metrics, NestJS context echoes (default: false)",
        },
      },
    },
  },
  {
    name: "tail_logs",
    description:
      "Get the most recent log events (like tail -f). " +
      "Noise is filtered by default. Good for checking current app state.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional query to filter results",
        },
        system_id: {
          type: "string",
          description: "Limit to a specific system",
        },
        group_id: {
          type: "string",
          description: "Limit to a specific group",
        },
        limit: {
          type: "number",
          description: "Number of recent events (default 100, max 10000)",
        },
        include_noise: {
          type: "boolean",
          description: "Include noise logs (default: false)",
        },
      },
    },
  },
  {
    name: "search_errors",
    description:
      "Search for real errors only. Fetches logs then filters client-side for: " +
      "(1) NestJS ERROR/WARN level, (2) Heroku router errors (H12 timeouts, etc.), " +
      "(3) HTTP 4xx/5xx, (4) stack traces and exception patterns. " +
      "INFO-level and noise are excluded. Use this instead of search_logs when investigating errors.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Additional query to narrow results. Example: 'DocumentSignService' or 'OrderService'",
        },
        since: {
          type: "string",
          description: "Start time: '30m ago', '2h ago', '1d ago', 'today', 'yesterday', ISO date",
        },
        until: {
          type: "string",
          description: "End time (same formats as 'since')",
        },
        min_time: {
          type: "number",
          description: "Start time as epoch seconds UTC (alternative to 'since')",
        },
        max_time: {
          type: "number",
          description: "End time as epoch seconds UTC (alternative to 'until')",
        },
        system_id: {
          type: "string",
          description: "Limit to a specific system",
        },
        limit: {
          type: "number",
          description:
            "Max events to fetch before filtering (default 2000). More = slower but more thorough",
        },
      },
    },
  },
  {
    name: "search_http_errors",
    description:
      "Search specifically for HTTP errors from Heroku router logs. " +
      "Returns structured output: method, path, status, response time, error code. " +
      "Finds H12 timeouts, 5xx errors, 4xx client errors, etc.",
    inputSchema: {
      type: "object",
      properties: {
        min_status: {
          type: "number",
          description:
            "Minimum HTTP status to include (default 400). Use 500 for server errors only",
        },
        since: {
          type: "string",
          description: "Start time: '30m ago', '2h ago', '1d ago', 'today', 'yesterday', ISO date",
        },
        until: {
          type: "string",
          description: "End time (same formats as 'since')",
        },
        min_time: {
          type: "number",
          description: "Start time as epoch seconds (alternative to 'since')",
        },
        max_time: {
          type: "number",
          description: "End time as epoch seconds (alternative to 'until')",
        },
        path_filter: {
          type: "string",
          description:
            "Only include paths containing this substring (e.g. '/dashboard/products')",
        },
        limit: {
          type: "number",
          description: "Max events to fetch from API (default 2000)",
        },
      },
    },
  },
  {
    name: "error_summary",
    description:
      "Aggregated error summary: counts grouped by error type, endpoint, and service context. " +
      "Returns a compact report instead of raw logs. Best for getting an overview of what's broken. " +
      "Includes error type breakdown, top affected endpoints, service contexts, and last 10 unique errors.",
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          description: "Start time: '30m ago', '2h ago', '1d ago', 'today', 'yesterday', ISO date",
        },
        until: {
          type: "string",
          description: "End time (same formats as 'since')",
        },
        min_time: {
          type: "number",
          description: "Start time as epoch seconds (alternative to 'since')",
        },
        max_time: {
          type: "number",
          description: "End time as epoch seconds (alternative to 'until')",
        },
        system_id: {
          type: "string",
          description: "Limit to a specific system",
        },
        limit: {
          type: "number",
          description:
            "Max events to fetch before filtering (default 5000). More = broader coverage",
        },
      },
    },
  },
  {
    name: "search_by_request_id",
    description:
      "Trace a single HTTP request through the entire application stack by its Heroku request_id. " +
      "Returns all log lines for that request: router entry, middleware, guards, service calls, response. " +
      "The request_id is a UUID found in Heroku router logs (e.g. 'request_id=a0a1e4ea-2189-88c2-...').",
    inputSchema: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "The Heroku request_id UUID to trace",
        },
        limit: {
          type: "number",
          description: "Max events to search (default 200)",
        },
      },
      required: ["request_id"],
    },
  },
];

module.exports = { TOOLS };
