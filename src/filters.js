/**
 * Log filters.
 *
 * Removes noise and identifies real errors from raw log streams.
 * Designed for Heroku + NestJS apps but works with any Papertrail logs.
 */

const { stripAnsi, parseNestLog, parseHerokuRouter } = require("./parsers");

/**
 * Check if a log line is a NestJS context-only echo.
 * NestJS emits paired lines: the actual message, then a bare line with just the
 * service/context name. The echo adds no information.
 */
function isContextEcho(rawMessage) {
  const nest = parseNestLog(rawMessage);
  if (nest && nest.body.trim() === nest.context) return true;
  // Bare PascalCase word on its own line (standalone context name)
  const msg = stripAnsi(rawMessage || "").trim();
  if (/^[A-Z][a-zA-Z]+$/.test(msg)) return true;
  return false;
}

/**
 * Check if a log is from Datadog Synthetics monitoring.
 */
function isDatadogSynthetic(rawMessage) {
  const msg = stripAnsi(rawMessage || "");
  return msg.includes("Datadog Synthetic") || msg.includes("test_id:");
}

/**
 * Check if a log is Heroku dyno metrics (memory/load samples).
 */
function isHerokuMetrics(rawMessage) {
  const msg = stripAnsi(rawMessage || "");
  return (
    msg.includes("sample#memory_total") ||
    msg.includes("sample#load_avg") ||
    msg.includes("sample#memory_rss")
  );
}

/**
 * Default noise predicate: returns true if event should be filtered out.
 */
function isNoise(evt) {
  const msg = evt.message || "";
  return isContextEcho(msg) || isDatadogSynthetic(msg) || isHerokuMetrics(msg);
}

/**
 * Filter noise from a logs array.
 * @param {Array} logs - Array of log event objects
 * @returns {Array} Filtered array with noise removed
 */
function filterNoise(logs) {
  return logs.filter((evt) => !isNoise(evt));
}

/**
 * Check if an event is a real error.
 *
 * Matches:
 *  - NestJS ERROR or WARN level
 *  - Heroku router at=error (H12 timeout, H13, etc.)
 *  - HTTP status >= 400
 *  - Stack trace lines
 *  - Common error patterns (Error:, Exception, ECONNREFUSED, etc.)
 */
function isRealError(evt) {
  const msg = evt.message || "";

  // NestJS error/warn
  const nest = parseNestLog(msg);
  if (nest && (nest.level === "ERROR" || nest.level === "WARN")) return true;

  // Heroku router error or HTTP 4xx/5xx
  const router = parseHerokuRouter(msg);
  if (router && router.at === "error") return true;
  if (router && router.status && router.status >= 400) return true;

  // Stack trace lines and error patterns
  const stripped = stripAnsi(msg);
  if (/^\s+at\s+/.test(stripped)) return true;
  if (/Error:|Exception|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(stripped))
    return true;

  return false;
}

module.exports = {
  isContextEcho,
  isDatadogSynthetic,
  isHerokuMetrics,
  isNoise,
  filterNoise,
  isRealError,
};
