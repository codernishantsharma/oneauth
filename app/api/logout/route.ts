import { NextResponse } from "next/server";

import { getUserFromSession, revokeSession } from "@/src/lib/auth/account-store";
import { writeSecurityEvent } from "@/src/lib/auth/security-events";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session";

export async function POST(request: Request) {
  const cookieValue = request.headers.get("cookie") ?? "";
  const sessionId = cookieValue
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (sessionId) {
    try {
      const rawSessionId = decodeURIComponent(sessionId);
      const user = await getUserFromSession(rawSessionId);
      await revokeSession(rawSessionId);
      if (user) {
        await writeSecurityEvent({ userId: user.id, eventType: "LOGOUT", headers: request.headers });
        await writeSecurityEvent({ userId: user.id, eventType: "SESSION_REVOKED", headers: request.headers, metadata: { reason: "LOGOUT" } });
      }
    } catch {
      // Clear the browser cookie even if the backing store is temporarily unavailable.
      console.error("OneAuth could not revoke the session during logout.");
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
