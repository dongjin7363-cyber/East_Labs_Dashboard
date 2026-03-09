import { NextResponse } from "next/server";

function getSafeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/portfolio";
  }

  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(nextPath, requestUrl.origin);

  const passthroughKeys = [
    "code",
    "error",
    "error_code",
    "error_description",
    "error_description_code",
  ];

  for (const key of passthroughKeys) {
    const value = requestUrl.searchParams.get(key);

    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(redirectUrl);
}
