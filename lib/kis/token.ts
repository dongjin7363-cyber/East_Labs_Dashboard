import { getKisClientConfig, KisApiError } from "@/lib/kis/client";

interface KisTokenResponse {
  access_token?: string;
  access_token_token_expired?: string;
  expires_in?: number;
}

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

function parseTokenExpiry(payload: KisTokenResponse): number {
  if (
    typeof payload.access_token_token_expired === "string" &&
    payload.access_token_token_expired.trim()
  ) {
    const parsed = Date.parse(payload.access_token_token_expired);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)) {
    return Date.now() + payload.expires_in * 1000;
  }

  return Date.now() + 23 * 60 * 60 * 1000;
}

export async function getKisAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const config = getKisClientConfig();
  const response = await fetch(`${config.baseUrl}/oauth2/tokenP`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: config.appKey,
      appsecret: config.appSecret,
    }),
  });

  const payload = (await response.json().catch(() => null)) as KisTokenResponse | null;

  if (!response.ok || !payload?.access_token) {
    throw new KisApiError(
      `KIS token request failed (${response.status})`,
      response.status,
      payload,
    );
  }

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: parseTokenExpiry(payload),
  };

  return tokenCache.accessToken;
}
