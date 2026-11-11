import { NextResponse } from "next/server";
import { beginPasskeyLogin } from "@/src/lib/auth/passkey-login";

export async function POST() {
  try {
    return NextResponse.json(await beginPasskeyLogin());
  } catch (error) {
    console.error("Unable to start passkey login:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "PASSKEY_LOGIN_UNAVAILABLE" }, { status: 500 });
  }
}
