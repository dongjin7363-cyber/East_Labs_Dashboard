#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && value && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadEnv() {
  loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));
  loadEnvFile(path.join(PROJECT_ROOT, ".env"));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveSupabaseUrl() {
  return process.env.SUPABASE_URL || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function parseArgs(argv) {
  const args = {
    expectedPeriod: process.env.EXPORT_EXPECTED_PERIOD || null,
    minRows: Number.parseInt(process.env.EXPORT_MIN_ROWS || "1", 10),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--period") {
      args.expectedPeriod = argv[++i];
    } else if (arg === "--min-rows") {
      args.minRows = Number.parseInt(argv[++i], 10);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/check-export-latest.js [--period YYYY-MM] [--min-rows N]",
          "",
          "Environment:",
          "  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL",
          "  SUPABASE_SERVICE_ROLE_KEY",
          "  EXPORT_EXPECTED_PERIOD",
          "  EXPORT_MIN_ROWS",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.minRows) || args.minRows < 1) {
    throw new Error("--min-rows must be a positive integer");
  }

  return args;
}

function buildHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return {
    data: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

function parseExactCount(headers, fallbackLength) {
  const contentRange = headers.get("content-range");
  if (contentRange && contentRange.includes("/")) {
    const total = contentRange.split("/").pop();
    if (/^\d+$/.test(total)) {
      return Number.parseInt(total, 10);
    }
  }

  return fallbackLength;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = resolveSupabaseUrl().replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = buildHeaders(serviceRoleKey);

  const latestUrl = new URL(`${supabaseUrl}/rest/v1/export_data`);
  latestUrl.searchParams.set("select", "period");
  latestUrl.searchParams.set("order", "period.desc");
  latestUrl.searchParams.set("limit", "1");

  const latest = await fetchJson(latestUrl, headers);
  const latestPeriod = latest.data?.[0]?.period;
  if (!latestPeriod) {
    throw new Error("No export_data rows found in Supabase");
  }

  if (args.expectedPeriod && latestPeriod !== args.expectedPeriod) {
    throw new Error(
      `Latest Supabase export period is ${latestPeriod}, expected ${args.expectedPeriod}`,
    );
  }

  const countUrl = new URL(`${supabaseUrl}/rest/v1/export_data`);
  countUrl.searchParams.set("select", "period");
  countUrl.searchParams.set("period", `eq.${latestPeriod}`);
  countUrl.searchParams.set("limit", "1");

  const counted = await fetchJson(
    countUrl,
    buildHeaders(serviceRoleKey, { Prefer: "count=exact" }),
  );
  const rowCount = parseExactCount(counted.headers, counted.data?.length || 0);

  if (rowCount < args.minRows) {
    throw new Error(
      `Latest Supabase export period ${latestPeriod} has ${rowCount} rows, expected at least ${args.minRows}`,
    );
  }

  console.log(`Latest export period verified: ${latestPeriod} (${rowCount} rows)`);
}

main().catch((error) => {
  console.error(`[export:check-latest] ${error.message}`);
  process.exit(1);
});
