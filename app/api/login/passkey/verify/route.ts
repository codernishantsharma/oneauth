import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishPasskeyLogin } from "@/src/lib/auth/passkey-login";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { challengeToken?: unknown; response?: unknown };
    if (typeof body.challengeToken !== "string" || !body.response || typeof body.response !== "object") {
      return NextResponse.json({ error: "PASSKEY_RESPONSE_INVALID" }, { status: 400 });
    }
    const result = await finishPasskeyLogin(request, body.challengeToken, body.response as AuthenticationResponseJSON);
    if ("response" in result) return result.response;
    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    console.error("Passkey login failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "PASSKEY_LOGIN_FAILED" }, { status: 500 });
  }
}
