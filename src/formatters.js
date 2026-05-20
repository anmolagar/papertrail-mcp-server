/**
 * Output formatters.
 *
 * Transform raw log data into human-readable (and AI-readable) output.
 */

const { stripAnsi, parseNestLog, parseHerokuRouter } = require("./parsers");

/**
 * Format a single log event into a readable one-liner.
 * Uses parsed NestJS/Heroku structure when available.
 */
function formatEvent(evt) {
  const msg = stripAnsi(evt.message || "");
  const time = evt.time || evt.generated_at || "";
  const nest = parseNestLog(evt.message);
  const router = parseHerokuRouter(evt.message);

  if (nest) {
    return `[${time}] [${nest.level}] [${nest.context}] ${nest.body}`;
  }

  if (router) {
    const statusTag =
      router.status >= 500
        ? `**${router.status}**`
        : router.status >= 400
          ? `*${router.status}*`
          : `${router.status}`;
    const errorInfo =
      router.code ? ` [${router.code}: ${router.desc || ""}]` : "";
    return `[${time}] [HTTP] ${router.method} ${router.path} → ${statusTag} (${router.service})${errorInfo}`;
  }

  // Fallback: use severity from API response
  const severity = evt.severity || "INFO";
  return `[${time}] [${severity}] ${msg}`;
}

/**
 * Format an array of log events.
 * Auto-truncates at maxEvents with a guidance message.
 */
function formatResults(logs, { maxEvents = 500 } = {}) {
  const lines = [];
  lines.push(`Found ${logs.length} event(s)`);

  if (logs.length > maxEvents) {
    lines.push(
      `(Showing first ${maxEvents} of ${logs.length} — use a narrower time range or query)`
    );
    logs = logs.slice(0, maxEvents);
  }

  lines.push("");

  for (const evt of logs) {
    lines.push(formatEvent(evt));
  }

  return lines.join("\n");
}

/**
 * Format HTTP errors into a structured list.
 */
function formatHttpErrors(httpErrors) {
  const lines = [];
  lines.push(`Found ${httpErrors.length} HTTP error(s)\n`);

  for (const e of httpErrors) {
    const errorInfo = e.code ? ` [${e.code}: ${e.desc || ""}]` : "";
    lines.push(
      `[${e.time}] ${e.method} ${e.path} → ${e.status} (${e.service})${errorInfo}`
    );
  }

  return lines.join("\n");
}

/**
 * Build an aggregated error summary report.
 * Groups errors by type, endpoint, and service context.
 */
function buildErrorSummary(logs) {
  const byType = {};
  const byPath = {};
  const byContext = {};
  const timeline = [];

  for (const evt of logs) {
    const msg = evt.message || "";
    const time = evt.time || evt.generated_at || "";
    const nest = parseNestLog(msg);
    const router = parseHerokuRouter(msg);

    let type = "other";
    let path = null;
    let context = null;

    if (router) {
      if (router.code) {
        type = `Heroku ${router.code} (${router.desc || "unknown"})`;
      } else if (router.status >= 500) {
        type = `HTTP ${router.status}`;
      } else if (router.status >= 400) {
        type = `HTTP ${router.status}`;
      }
      path = router.path;
    } else if (nest) {
      type = `NestJS ${nest.level}`;
      context = nest.context;
    } else {
      const stripped = stripAnsi(msg);
      if (/^\s+at\s+/.test(stripped)) continue; // skip stack trace lines for counting
      type = "App Error";
    }

    byType[type] = (byType[type] || 0) + 1;
    if (path) {
      const cleanPath = path.split("?")[0];
      byPath[cleanPath] = (byPath[cleanPath] || 0) + 1;
    }
    if (context) {
      byContext[context] = (byContext[context] || 0) + 1;
    }
    timeline.push({ time, type, path, context });
  }

  const lines = [];
  lines.push(`## Error Summary (${logs.length} total error events)\n`);

  // By type
  lines.push("### By Error Type");
  const sortedTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    lines.push(`  ${count}x  ${type}`);
  }

  // By path (top 15)
  if (Object.keys(byPath).length > 0) {
    lines.push("\n### By Endpoint (top 15)");
    const sortedPaths = Object.entries(byPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [p, count] of sortedPaths) {
      lines.push(`  ${count}x  ${p}`);
    }
  }

  // By NestJS context (top 10)
  if (Object.keys(byContext).length > 0) {
    lines.push("\n### By Service Context");
    const sortedCtx = Object.entries(byContext)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [ctx, count] of sortedCtx) {
      lines.push(`  ${count}x  [${ctx}]`);
    }
  }

  // Recent errors (last 10 unique)
  lines.push("\n### Recent Errors (last 10 unique)");
  const seen = new Set();
  let shown = 0;
  for (let i = timeline.length - 1; i >= 0 && shown < 10; i--) {
    const t = timeline[i];
    const key = `${t.type}|${t.path || t.context || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const where = t.path || t.context || "";
    lines.push(`  [${t.time}] ${t.type} ${where}`);
    shown++;
  }

  return lines.join("\n");
}

module.exports = {
  formatEvent,
  formatResults,
  formatHttpErrors,
  buildErrorSummary,
};
