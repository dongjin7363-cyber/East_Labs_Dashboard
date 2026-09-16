type FxPayload = {
  rate: number;
  asOf: string;
};

function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export async function fetchUsdKrwRate(fresh = false): Promise<FxPayload> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 86400 } }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`OpenERAPI failed: ${response.status}`);
  }

  const data: unknown = await response.json();

  if (typeof data !== "object" || data === null || !("rates" in data)) {
    throw new Error("OpenERAPI payload invalid");
  }

  const rates = (data as { rates: Record<string, unknown> }).rates;
  const rate = rates?.KRW;

  if (!isValidRate(rate)) {
    throw new Error("OpenERAPI KRW rate invalid");
  }

  let asOf = new Date().toISOString().slice(0, 10);
  const updateUtc = (data as { time_last_update_utc?: unknown }).time_last_update_utc;

  if (typeof updateUtc === "string") {
    const parsed = new Date(updateUtc);
    if (!Number.isNaN(parsed.getTime())) {
      asOf = parsed.toISOString().slice(0, 10);
    }
  }

  return {
    rate,
    asOf,
  };
}

