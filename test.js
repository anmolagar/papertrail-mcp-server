#!/usr/bin/env node
/**
 * Quick smoke tests for all modules.
 * Run: node test.js
 */

// Load config from Tradeline .env for integration test
process.chdir("/Users/anmol/Desktop/Work/Tradeline/api");
delete process.env.PAPERTRAIL_API_TOKEN;

const config = require("./src/config");
const { parseHumanTime, parseHerokuRouter, parseNestLog, stripAnsi } = require("./src/parsers");
const { filterNoise, isRealError } = require("./src/filters");
const { formatResults, formatHttpErrors, buildErrorSummary, formatEvent } = require("./src/formatters");
const pkg = require("./package.json");

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    fail++;
  }
}

// ── Test 1: Config ──
console.log("\n── Config ──");
assert("Token loaded from .env", typeof config.apiToken === "string" && config.apiToken.length > 0);
assert("API type is swo", config.apiType === "swo");
assert("API URL set", config.apiUrl.includes("solarwinds.com"));

// ── Test 2: Package version ──
console.log("\n── Package ──");
assert("Version is 1.0.1", pkg.version === "1.0.1");
assert("Name is papertrail-mcp-server", pkg.name === "papertrail-mcp-server");
assert("Has bin entry", typeof pkg.bin["papertrail-mcp-server"] === "string");
assert("Has repository URL", pkg.repository.url.includes("github.com"));

// ── Test 3: Parsers ──
console.log("\n── Parsers ──");
const now = Math.floor(Date.now() / 1000);
assert("30m ago", Math.abs(parseHumanTime("30m ago") - (now - 1800)) < 2);
assert("2h shorthand", Math.abs(parseHumanTime("2h") - (now - 7200)) < 2);
assert("1d ago", Math.abs(parseHumanTime("1d ago") - (now - 86400)) < 2);
assert("today", typeof parseHumanTime("today") === "number");
assert("yesterday", typeof parseHumanTime("yesterday") === "number");
assert("ISO date", parseHumanTime("2025-01-15") > 0);
assert("ISO datetime", parseHumanTime("2025-01-15T07:00:00Z") > 0);
assert("number passthrough", parseHumanTime(1234567890) === 1234567890);
assert("undefined passthrough", parseHumanTime(undefined) === undefined);
assert("empty string passthrough", parseHumanTime("") === undefined);

const nest = parseNestLog("[Nest] 17  - 01/15/2025, 2:40:00 AM   ERROR [CartService] TypeError: Cannot read");
assert("NestJS parse level", nest && nest.level === "ERROR");
assert("NestJS parse context", nest && nest.context === "CartService");
assert("NestJS parse body", nest && nest.body.includes("TypeError"));
assert("NestJS null on non-nest", parseNestLog("just a regular log") === null);

const router = parseHerokuRouter('at=error code=H12 desc="Request timeout" method=POST path="/api/orders" host=app.com status=503 service=30001ms');
assert("Router parse at", router && router.at === "error");
assert("Router parse code", router && router.code === "H12");
assert("Router parse desc", router && router.desc === "Request timeout");
assert("Router parse method", router && router.method === "POST");
assert("Router parse path", router && router.path === "/api/orders");
assert("Router parse status", router && router.status === 503);
assert("Router null on non-router", parseHerokuRouter("not a router log") === null);

assert("stripAnsi removes codes", stripAnsi("\x1B[33mhello\x1B[0m") === "hello");
assert("stripAnsi handles null", stripAnsi(null) === "");

// ── Test 4: Filters ──
console.log("\n── Filters ──");
const noiseHerokuMetrics = { message: "source=web.1 sample#memory_total=300MB sample#memory_rss=299MB" };
const noiseDdSynthetic = { message: "Datadog Synthetic test_id: abc-123" };
const noiseContextEcho = { message: "OrderService" };
const realError = { message: "[Nest] 17  - 01/15/2025, 2:40:00 AM   ERROR [Svc] boom" };
const stackTrace = { message: "    at Something.method (file.js:10:5)" };
const normalLog = { message: "[Nest] 17  - 01/15/2025, 2:40:00 AM   LOG [Svc] all good" };

assert("Heroku metrics = noise", filterNoise([noiseHerokuMetrics]).length === 0);
assert("Datadog synthetic = noise", filterNoise([noiseDdSynthetic]).length === 0);
assert("Context echo = noise", filterNoise([noiseContextEcho]).length === 0);
assert("Real error kept", filterNoise([realError]).length === 1);
assert("isRealError(ERROR)", isRealError(realError) === true);
assert("isRealError(stack trace)", isRealError(stackTrace) === true);
assert("isRealError(LOG) = false", isRealError(normalLog) === false);
assert("isRealError(noise) = false", isRealError(noiseHerokuMetrics) === false);

// ── Test 5: Formatters ──
console.log("\n── Formatters ──");
const fmtNest = formatEvent({ message: "[Nest] 17  - 01/15/2025, 2:40:00 AM   ERROR [Svc] boom", time: "2025-01-15T09:40:00Z" });
assert("formatEvent NestJS", fmtNest.includes("[ERROR]") && fmtNest.includes("[Svc]"));

const fmtRouter = formatEvent({ message: 'at=info method=GET path="/test" status=200 service=50ms', time: "2025-01-15T09:40:00Z" });
assert("formatEvent router", fmtRouter.includes("[HTTP]") && fmtRouter.includes("/test"));

const fmtFallback = formatEvent({ message: "plain log", time: "2025-01-15T09:40:00Z", severity: "WARN" });
assert("formatEvent fallback", fmtFallback.includes("[WARN]"));

const manyLogs = Array.from({ length: 600 }, (_, i) => ({ message: "log " + i, time: "2025-01-15T00:00:00Z" }));
const truncated = formatResults(manyLogs);
assert("formatResults truncates at 500", truncated.includes("Showing first 500 of 600"));

const httpFmt = formatHttpErrors([{ time: "T", method: "GET", path: "/x", status: 500, service: "10ms" }]);
assert("formatHttpErrors", httpFmt.includes("1 HTTP error") && httpFmt.includes("/x"));

// ── Test 6: buildErrorSummary (the fixed bug) ──
console.log("\n── Error Summary (bug fix) ──");
const summaryInput = [
  { message: "[Nest] 17  - 01/15/2025, 2:40:00 AM   ERROR [CartService] TypeError: oops", time: "T1" },
  { message: "    at CartService.cleanup (file.js:204:90)", time: "T1" },
  { message: "    at process.tick (node:internal:104:5)", time: "T1" },
  { message: "[Nest] 17  - 01/15/2025, 2:50:00 AM   WARN [SmsService] bad phone", time: "T2" },
  { message: 'at=error code=H12 desc="Request timeout" method=GET path="/api/slow" status=503 service=30001ms', time: "T3" },
];
const summary = buildErrorSummary(summaryInput);
assert("Returns string (not undefined)", typeof summary === "string");
assert("Contains Error Summary header", summary.includes("Error Summary"));
assert("Contains CartService context", summary.includes("CartService"));
assert("Contains SmsService context", summary.includes("SmsService"));
assert("Contains H12 error type", summary.includes("H12"));
assert("Contains endpoint", summary.includes("/api/slow"));
assert("Stack traces skipped in count", summary.includes("5 total error events"));

// ── Test 7: Edge cases ──
console.log("\n── Edge Cases ──");
const emptyResult = formatResults([]);
assert("Empty formatResults", emptyResult.includes("Found 0 event(s)"));
const emptyHttp = formatHttpErrors([]);
assert("Empty formatHttpErrors", emptyHttp.includes("Found 0 HTTP error(s)"));

// Only stack traces
const stackOnly = buildErrorSummary([
  { message: "    at Foo.bar (x.js:1:1)", time: "T" },
  { message: "    at Baz.qux (y.js:2:2)", time: "T" },
]);
assert("Stack-only summary returns string", typeof stackOnly === "string");

// ── Summary ──
console.log(`\n═══════════════════════════════`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED");
}
