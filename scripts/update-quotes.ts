import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnvFiles(): void {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = resolve(process.cwd(), fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();

      if (process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

async function main() {
  loadLocalEnvFiles();
  const { updatePortfolioQuotes } = await import("@/lib/quotes/update");
  const result = await updatePortfolioQuotes();

  console.log(
    JSON.stringify(
      {
        source: result.source,
        scanned: result.scanned,
        updated: result.updatedCount,
        krUpdated: result.krUpdated,
        usUpdated: result.usUpdated,
        supabaseUpdated: result.supabase.updated,
        supabaseFailed: result.supabase.failed,
        failedCount: result.failedCount,
        failed: result.failed,
        skippedCount: result.skippedCount,
        skipped: result.skipped,
        extended: result.extended,
        lastUpdated: result.lastUpdated,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
      },
      null,
      2,
    ),
  );

  // Per-symbol failures are reported in the failed list but do not fail the
  // whole scheduled job. Fatal setup/API errors still reach the catch block.
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
