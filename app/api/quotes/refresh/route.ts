import { NextRequest, NextResponse } from "next/server";
import { updatePortfolioQuotes } from "@/lib/quotes/update";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!token) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request);

  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { includeExtended?: unknown }
    | null;
  const includeExtended =
    typeof body?.includeExtended === "boolean" ? body.includeExtended : true;
  let result: Awaited<ReturnType<typeof updatePortfolioQuotes>>;

  try {
    result = await updatePortfolioQuotes({ userId, includeExtended });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "quote refresh failed";
    console.error("[api/quotes/refresh] fatal quote refresh error", {
      userId,
      includeExtended,
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        message,
        source: "KIS_REST",
        updated_count: 0,
        last_updated: null,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ...result,
      last_updated: result.lastUpdated,
      source: result.source,
      updated_count: result.updatedCount,
    },
    {
      status: result.updated.length > 0 || result.failed.length === 0 ? 200 : 207,
    },
  );
}
