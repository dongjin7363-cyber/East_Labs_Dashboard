import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { parseEquityReport } from "./model";

const directory = path.join(process.cwd(), "data", "equity-reports");

export const getEquityReports = cache(async () => {
  const filenames = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  const reports = await Promise.all(filenames.map(async (filename) => {
    const value: unknown = JSON.parse(await readFile(path.join(directory, filename), "utf8"));
    return parseEquityReport(value, filename);
  }));
  return reports.sort((a, b) => b.published_date.localeCompare(a.published_date));
});
