import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function acquireServerLease(key: string, seconds = 300) {
  const client = createSupabaseAdminClient();
  const owner = randomUUID();
  const { data, error } = await client.rpc("try_acquire_dashboard_lease", {
    p_key: key, p_owner: owner, p_seconds: seconds,
  });
  if (error) throw new Error("Shared job lock is unavailable");
  if (!data) return null;
  return async () => {
    const { error: releaseError } = await client.rpc("release_dashboard_lease", {
      p_key: key, p_owner: owner,
    });
    if (releaseError) console.error("Shared job lock release failed");
  };
}
