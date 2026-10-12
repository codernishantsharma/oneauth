import { getPublicJwks } from "@/src/lib/oauth/oidc";

export async function GET() {
  try {
    return Response.json(await getPublicJwks(), { headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/jwk-set+json" } });
  } catch {
    return Response.json({ error: "jwks_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
