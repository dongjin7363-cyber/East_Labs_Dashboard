export interface BackupPayload {
  version: number;
  exportedAt: string;
  origin: string;
  data: Record<string, string>;
}

function formatFilenameTimestamp(date: Date): string {
  const yyyy = `${date.getFullYear()}`;
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const min = `${date.getMinutes()}`.padStart(2, "0");

  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

export function collectPrefixedStorageData(prefix = "pf_"): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const data: Record<string, string> = {};

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (!key || !key.startsWith(prefix)) {
      continue;
    }

    const value = window.localStorage.getItem(key);

    if (value === null) {
      continue;
    }

    data[key] = value;
  }

  return data;
}

export function buildBackupPayload(data: Record<string, string>): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: typeof window !== "undefined" ? window.location.origin : "",
    data,
  };
}

function downloadJsonFile(filename: string, payload: BackupPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(objectUrl);
}

export function exportPfBackup(): {
  ok: boolean;
  filename?: string;
  count: number;
} {
  const data = collectPrefixedStorageData("pf_");
  const keys = Object.keys(data);

  if (keys.length === 0) {
    return {
      ok: false,
      count: 0,
    };
  }

  const filename = `personal-finance-backup-${formatFilenameTimestamp(new Date())}.json`;
  const payload = buildBackupPayload(data);

  downloadJsonFile(filename, payload);

  return {
    ok: true,
    filename,
    count: keys.length,
  };
}
