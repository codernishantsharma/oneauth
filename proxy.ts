import { NextRequest, NextResponse } from "next/server";
const SESSION_COOKIE_NAME = "oneauth_session";

const protectedRoots = [
  "/dashboard", "/profile", "/security", "/passkeys", "/apps", "/activity",
  "/notifications", "/developer", "/admin",
];

function isProtectedPath(pathname: string) {
  return protectedRoots.some((root) => pathname === root || pathname.startsWith(root + "/"));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-oneauth-pathname", pathname + request.nextUrl.search);

  if (!isProtectedPath(pathname) || request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const loginUrl = new URL("/", request.url);
  loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
