import { getKisClientConfig, KisApiError } from "@/lib/kis/client";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

interface KisTokenResponse {
  access_token?: string;
  access_token_token_expired?: string;
  expires_in?: number;
}

interface KisTokenRow {
  access_token: string;
  expires_at: string;
}

const KIS_TOKEN_ID = "kis_access_token";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

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

function isUsableToken(
  token: { accessToken: string; expiresAt: number } | null,
): token is { accessToken: string; expiresAt: number } {
  return Boolean(
    token?.accessToken &&
      Number.isFinite(token.expiresAt) &&
      Date.now() < token.expiresAt - TOKEN_REFRESH_BUFFER_MS,
  );
}

function parseStoredToken(row: KisTokenRow | null): {
  accessToken: string;
  expiresAt: number;
} | null {
  if (!row?.access_token || !row.expires_at) {
    return null;
  }

  const expiresAt = Date.parse(row.expires_at);

  if (!Number.isFinite(expiresAt)) {
    return null;
  }

  return {
    accessToken: row.access_token,
    expiresAt,
  };
}

async function readStoredToken(): Promise<{
  accessToken: string;
  expiresAt: number;
} | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("kis_tokens")
    .select("access_token, expires_at")
    .eq("id", KIS_TOKEN_ID)
    .maybeSingle<KisTokenRow>();

  if (error) {
    console.warn("KIS token Supabase lookup failed; issuing a new token");
    return null;
  }

  return parseStoredToken(data);
}

async function saveToken(accessToken: string, expiresAt: number): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("kis_tokens").upsert(
    {
      id: KIS_TOKEN_ID,
      access_token: accessToken,
      expires_at: new Date(expiresAt).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn("KIS token Supabase save failed");
    return false;
  }

  return true;
}

async function deleteStoredToken(reason: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("kis_tokens")
    .delete()
    .eq("id", KIS_TOKEN_ID);

  if (error) {
    console.warn("[kis:token] Supabase token delete failed", {
      reason,
      error: error.message,
    });
    return;
  }

  console.warn("[kis:token] Stored KIS token invalidated", { reason });
}

async function issueKisAccessToken(): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
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

  return {
    accessToken: payload.access_token,
    expiresAt: parseTokenExpiry(payload),
  };
}

export async function getKisAccessToken(): Promise<string> {
  if (isUsableToken(tokenCache)) {
    return tokenCache.accessToken;
  }

  const storedToken = await readStoredToken();

  if (isUsableToken(storedToken)) {
    tokenCache = storedToken;
    console.info("KIS token reused from Supabase");
    return storedToken.accessToken;
  }

  tokenCache = await issueKisAccessToken();
  const saved = await saveToken(tokenCache.accessToken, tokenCache.expiresAt);
  console.info(saved ? "KIS token issued and saved" : "KIS token issued");

  return tokenCache.accessToken;
}

export async function invalidateKisAccessToken(reason: string): Promise<void> {
  tokenCache = null;
  await deleteStoredToken(reason);
}
