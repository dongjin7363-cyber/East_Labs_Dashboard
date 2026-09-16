import { acquireServerLease } from "@/lib/services/serverLease";
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
  updated_at: string;
}

const KIS_TOKEN_ID = "kis_access_token";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

export function parseTokenExpiry(payload: KisTokenResponse, now = Date.now()): number {
  const candidates: number[] = [];
  if (typeof payload.access_token_token_expired === "string") {
    const raw = payload.access_token_token_expired.trim();
    // KIS returns a Korean wall-clock timestamp without an offset.
    const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw.replace(" ", "T")}+09:00` : raw;
    const parsed = Date.parse(iso);
    if (Number.isFinite(parsed)) candidates.push(parsed);
  }
  if (typeof payload.expires_in === "number" && payload.expires_in > 0) {
    candidates.push(now + payload.expires_in * 1000);
  }
  // Never extend a cached token beyond the documented 24-hour lifetime.
  return Math.min(now + 24 * 60 * 60 * 1000, ...candidates);
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

  const issuedAt = Date.parse(row.updated_at);
  const expiresAt = Math.min(Date.parse(row.expires_at), issuedAt + 24 * 60 * 60 * 1000);

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
    .select("access_token, expires_at, updated_at")
    .eq("id", KIS_TOKEN_ID)
    .maybeSingle<KisTokenRow>();

  if (error) {
    throw new Error("KIS token store is unavailable; refusing unnecessary token issuance");
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

async function deleteStoredToken(reason: string, rejectedToken: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("kis_tokens")
    .delete()
    .eq("id", KIS_TOKEN_ID)
    .eq("access_token", rejectedToken);

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
    signal: AbortSignal.timeout(15_000),
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

let pendingToken: Promise<string> | null = null;

async function restoreOrIssueToken(): Promise<string> {
  const stored = await readStoredToken();
  if (isUsableToken(stored)) {
    tokenCache = stored;
    return stored.accessToken;
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const release = await acquireServerLease("kis-token-issuance", 60);
    if (release) {
      try {
        // A different instance may have issued a token while we waited.
        const latest = await readStoredToken();
        if (isUsableToken(latest)) {
          tokenCache = latest;
          return latest.accessToken;
        }
        const issued = await issueKisAccessToken();
        tokenCache = issued;
        if (!await saveToken(issued.accessToken, issued.expiresAt)) {
          throw new Error("KIS token could not be shared with other workers");
        }
        console.info("KIS token issued and saved");
        return issued.accessToken;
      } finally {
        await release();
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    const latest = await readStoredToken();
    if (isUsableToken(latest)) {
      tokenCache = latest;
      return latest.accessToken;
    }
  }
  throw new Error("KIS token issuance is already in progress; retry shortly");
}

export async function getKisAccessToken(): Promise<string> {
  if (isUsableToken(tokenCache)) return tokenCache.accessToken;
  if (!pendingToken) {
    pendingToken = restoreOrIssueToken().finally(() => { pendingToken = null; });
  }
  return pendingToken;
}

export async function invalidateKisAccessToken(reason: string, rejectedToken: string): Promise<void> {
  if (tokenCache?.accessToken === rejectedToken) tokenCache = null;
  await deleteStoredToken(reason, rejectedToken);
}
