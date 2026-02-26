export function formatCommaInt(rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const normalized = digits.replace(/^0+(?=\d)/, "");
  const safe = normalized || "0";

  return safe.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function parseCommaInt(displayString: string): number | null {
  const digits = displayString.replace(/,/g, "").trim();

  if (!/^\d+$/.test(digits)) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function sanitizeNumberRaw(
  input: string,
  options?: {
    allowDecimal?: boolean;
    maxDecimals?: number;
  },
): string {
  const allowDecimal = options?.allowDecimal ?? false;
  const maxDecimals = options?.maxDecimals;
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  if (!allowDecimal) {
    return trimmed.replace(/\D/g, "");
  }

  const withoutCommas = trimmed.replace(/,/g, "");
  const dotIndex = withoutCommas.indexOf(".");

  if (dotIndex < 0) {
    return withoutCommas.replace(/\D/g, "");
  }

  const intPartRaw = withoutCommas.slice(0, dotIndex).replace(/\D/g, "");
  const decimalRaw = withoutCommas
    .slice(dotIndex + 1)
    .replace(/\D/g, "")
    .slice(0, typeof maxDecimals === "number" ? Math.max(maxDecimals, 0) : undefined);

  const intPart = intPartRaw || "0";

  if (withoutCommas.endsWith(".") && decimalRaw.length === 0) {
    return `${intPart}.`;
  }

  if (decimalRaw.length === 0) {
    return intPart;
  }

  return `${intPart}.${decimalRaw}`;
}

export function formatCommaNumberRaw(
  raw: string,
  options?: {
    allowDecimal?: boolean;
    maxDecimals?: number;
  },
): string {
  const allowDecimal = options?.allowDecimal ?? false;

  if (!allowDecimal) {
    return formatCommaInt(raw);
  }

  const sanitized = sanitizeNumberRaw(raw, options);

  if (!sanitized) {
    return "";
  }

  const hasDot = sanitized.includes(".");
  const [intPartRaw, decimalRaw = ""] = sanitized.split(".");
  const intFormatted = formatCommaInt(intPartRaw || "0");

  if (!hasDot) {
    return intFormatted;
  }

  return `${intFormatted}.${decimalRaw}`;
}
