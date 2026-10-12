import { getIssuer } from "@/src/lib/oauth/oidc";

export async function GET() {
  try {
    const issuer = getIssuer();
    return Response.json({
      issuer,
      authorization_endpoint: issuer + "/oauth/authorize",
      token_endpoint: issuer + "/api/oauth/token",
      userinfo_endpoint: issuer + "/api/oauth/userinfo",
      revocation_endpoint: issuer + "/api/oauth/revoke",
      introspection_endpoint: issuer + "/api/oauth/introspect",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ["openid", "profile", "email", "users:read", "users:write", "oauth:read", "oauth:write", "mcp:connect", "offline_access", "custom_data:read", "custom_data:write"],
      response_modes_supported: ["query"]
    }, { headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/json; charset=utf-8" } });
  } catch {
    return Response.json({ error: "server_configuration_error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
