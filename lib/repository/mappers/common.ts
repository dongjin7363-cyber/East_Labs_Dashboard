export function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function normalizeUppercaseText(value: unknown): string | undefined {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toUpperCase() : undefined;
}

export function toNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/,/g, "").trim(), 10);

    if (Number.isFinite(parsed)) {
      return Math.max(Math.round(parsed), 0);
    }
  }

  return fallback;
}

export function toRoundedInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());

    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return fallback;
}

export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,%\s]/g, "").trim());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function toPositiveFloat(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

export function normalizeIsoString(
  value: unknown,
  fallback = new Date().toISOString(),
): string {
  const normalized = normalizeOptionalText(value);
  return normalized ?? fallback;
}

export function normalizeYmd(value: unknown): string | undefined {
  const normalized = normalizeOptionalText(value);

  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
