/**
 * Log message parsers.
 *
 * Extracts structured data from raw log messages:
 *  - NestJS log format (level, context, body)
 *  - Heroku router format (method, path, status, timing)
 *  - Human-readable time strings to epoch seconds
 */

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(str) {
  return (str || "").replace(/\x1B\[[0-9;]*m/g, "");
}

/**
 * Parse NestJS log level and context from message text.
 *
 * NestJS format after ANSI strip:
 *   "[Nest] PID  - MM/DD/YYYY, HH:MM:SS AM    LEVEL [Context] message body"
 *
 * @param {string} rawMessage - Raw log message (may contain ANSI codes)
 * @returns {{ level: string, context: string, body: string } | null}
 */
function parseNestLog(rawMessage) {
  const msg = stripAnsi(rawMessage || "");
  const match = msg.match(
    /\[Nest\]\s+\d+\s+-\s+.+?\s+(LOG|WARN|ERROR|DEBUG|VERBOSE)\s+\[([^\]]+)\]\s*(.*)/
  );
  if (!match) return null;
  return { level: match[1], context: match[2], body: match[3] };
}

/**
 * Parse Heroku router log line into structured fields.
 *
 * Router format:
 *   "at=info method=GET path="/foo" host=... status=200 service=50ms ..."
 *
 * @param {string} rawMessage - Raw log message
 * @returns {{ at, code, desc, method, path, status, service, connect, bytes, fwd } | null}
 */
function parseHerokuRouter(rawMessage) {
  const msg = stripAnsi(rawMessage || "");
  if (!msg.includes("method=") || !msg.includes("path=")) return null;

  const get = (key) => {
    const m = msg.match(new RegExp(`${key}=(?:"([^"]*)"|([^\\s]*))`));
    return m ? m[1] || m[2] : null;
  };

  return {
    at: get("at"),
    code: get("code"),
    desc: get("desc"),
    method: get("method"),
    path: get("path"),
    status: get("status") ? parseInt(get("status"), 10) : null,
    service: get("service"),
    connect: get("connect"),
    bytes: get("bytes"),
    fwd: get("fwd"),
  };
}

/**
 * Parse a human-readable time string into epoch seconds.
 *
 * Supported formats:
 *   "30m ago", "2h ago", "1d ago"     — relative
 *   "30m", "2h", "1d"                 — also treated as relative (ago)
 *   "today", "yesterday"              — midnight UTC
 *   "2025-01-15"                      — ISO date
 *   "2025-01-15T07:00:00Z"            — ISO datetime
 *   1779177600                         — passthrough epoch seconds
 *
 * @param {string|number|undefined} input
 * @returns {number|undefined} Epoch seconds or undefined
 */
function parseHumanTime(input) {
  if (input === undefined || input === null || input === "") return undefined;

  // Already a number — passthrough
  if (typeof input === "number") return input;

  const str = String(input).trim().toLowerCase();

  // Relative: "30m ago", "2h ago", "1d ago", "30m", "2h", "1d"
  const relMatch = str.match(/^(\d+)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)\s*(ago)?$/);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2][0]; // m, h, or d
    const multipliers = { m: 60, h: 3600, d: 86400 };
    return Math.floor(Date.now() / 1000) - n * (multipliers[unit] || 3600);
  }

  // "today" / "yesterday"
  if (str === "today") {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }
  if (str === "yesterday") {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000) - 86400;
  }

  // ISO date or datetime
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Math.floor(parsed.getTime() / 1000);
  }

  return undefined;
}

module.exports = {
  stripAnsi,
  parseNestLog,
  parseHerokuRouter,
  parseHumanTime,
};
