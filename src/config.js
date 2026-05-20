/**
 * Configuration — reads environment variables and provides defaults.
 *
 * Loads .env from the current working directory (the workspace root when
 * launched by VS Code) so tokens don't need to be duplicated in mcp.json.
 */

const fs = require("fs");
const path = require("path");

// ── Minimal .env loader (no external dependency) ────────────────────

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't overwrite explicitly set env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const API_TOKEN = process.env.PAPERTRAIL_API_TOKEN;
const API_TYPE = (process.env.PAPERTRAIL_API_TYPE || "swo").toLowerCase();

const DEFAULT_URLS = {
  swo: "https://api.na-01.cloud.solarwinds.com/v1",
  classic: "https://papertrailapp.com/api/v1",
};

const API_URL = process.env.PAPERTRAIL_API_URL || DEFAULT_URLS[API_TYPE] || DEFAULT_URLS.swo;

if (!API_TOKEN) {
  process.stderr.write(
    "Error: PAPERTRAIL_API_TOKEN environment variable is required.\n" +
      "Set it to your Papertrail or SolarWinds Observability API token.\n"
  );
  process.exit(1);
}

if (API_TYPE !== "swo" && API_TYPE !== "classic") {
  process.stderr.write(
    `Error: PAPERTRAIL_API_TYPE must be "swo" or "classic" (got "${API_TYPE}").\n`
  );
  process.exit(1);
}

module.exports = {
  apiToken: API_TOKEN,
  apiType: API_TYPE,
  apiUrl: API_URL,
};
