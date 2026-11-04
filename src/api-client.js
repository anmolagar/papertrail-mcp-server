/**
 * HTTP clients for SWO and Classic Papertrail APIs.
 */

const https = require("https");
const config = require("./config");

/** Default request timeout in milliseconds (30 seconds). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Make an HTTPS GET request and return parsed JSON.
 */
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: `${urlObj.pathname}${urlObj.search}`,
      method: "GET",
      headers: {
        ...headers,
        Accept: "application/json",
        "User-Agent": "papertrail-mcp-server",
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(
            new Error(
              `API error ${res.statusCode}: ${body.slice(0, 500)}`
            )
          );
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Invalid JSON response: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Build a URL with query parameters, filtering out undefined/null/empty values.
 */
function buildUrl(base, path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  }
  const queryStr = qs.toString();
  return `${base}${path}${queryStr ? "?" + queryStr : ""}`;
}

/**
 * SolarWinds Observability (SWO) API request.
 * Auth: Authorization: Bearer <token>
 * Logs endpoint: /v1/logs
 */
function swoRequest(path, params = {}) {
  // SWO silently ignores Classic param names, so map them
  const { q, min_time, max_time, limit, system_id, group_id } = params;
  const url = buildUrl(config.apiUrl, path, {
    filter: q,
    startTime: min_time,
    endTime: max_time,
    pageSize: limit,
    entityId: system_id,
    group: group_id,
  });
  return httpsGet(url, {
    Authorization: `Bearer ${config.apiToken}`,
  });
}

/**
 * Classic Papertrail API request.
 * Auth: X-Papertrail-Token header
 * Logs endpoint: /api/v1/events/search.json
 */
function classicRequest(path, params = {}) {
  const url = buildUrl(config.apiUrl, path, params);
  return httpsGet(url, {
    "X-Papertrail-Token": config.apiToken,
  });
}

module.exports = { swoRequest, classicRequest };
