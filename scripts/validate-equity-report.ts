import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEquityReport, validatePublication } from "../lib/equity-report/model";
const [file, mode, date] = process.argv.slice(2);
if (!file) throw new Error("Usage: npx tsx scripts/validate-equity-report.ts FILE [publish YYYY-MM-DD]");
const value: unknown = JSON.parse(readFileSync(file, "utf8"));
const report = parseEquityReport(value, path.basename(file));
if (mode === "publish") {
  if (!date) throw new Error("Publication date required");
  validatePublication(report, date);
} else if (mode) throw new Error("Unknown validation mode");
console.log(`VALID: ${report.report_type} ${report.published_date}, ${report.dashboard.length} assets`);
