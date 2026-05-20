export interface KisClientConfig {
  appKey: string;
  appSecret: string;
  baseUrl: string;
}

export interface KisRequestOptions {
  path: string;
  method?: "GET" | "POST";
  accessToken: string;
  trId: string;
  searchParams?: Record<string, string>;
  body?: unknown;
}

export class KisApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "KisApiError";
  }
}

function formatKisResponseBody(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return "empty body";
  }

  if (typeof payload === "string") {
    return payload.trim() || "empty body";
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new KisApiError(`${name} is not configured`);
  }

  return value;
}

export function getKisClientConfig(): KisClientConfig {
  return {
    appKey: requiredEnv("KIS_APP_KEY"),
    appSecret: requiredEnv("KIS_APP_SECRET"),
    baseUrl:
      process.env.KIS_BASE_URL?.trim().replace(/\/+$/, "") ||
      "https://openapi.koreainvestment.com:9443",
  };
}

export class KisClient {
  constructor(private readonly config: KisClientConfig = getKisClientConfig()) {}

  async request<T>(options: KisRequestOptions): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${options.path}`);

    if (options.searchParams) {
      Object.entries(options.searchParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      cache: "no-store",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${options.accessToken}`,
        appkey: this.config.appKey,
        appsecret: this.config.appSecret,
        tr_id: options.trId,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const responseText = await response.text();
    let payload: unknown = responseText;

    if (responseText.trim()) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = responseText;
      }
    }

    if (!response.ok) {
      throw new KisApiError(
        `KIS request failed (${response.status}): ${formatKisResponseBody(payload)}`,
        response.status,
        payload,
      );
    }

    if (
      payload &&
      typeof payload === "object" &&
      "rt_cd" in payload &&
      String((payload as { rt_cd?: unknown }).rt_cd) !== "0"
    ) {
      const message =
        typeof (payload as { msg1?: unknown }).msg1 === "string"
          ? (payload as { msg1: string }).msg1
          : "KIS API returned an error";
      throw new KisApiError(
        `${message}: ${formatKisResponseBody(payload)}`,
        response.status,
        payload,
      );
    }

    return payload as T;
  }
}
