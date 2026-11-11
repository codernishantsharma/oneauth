import { getIssuer, getOidcKey } from "@/src/lib/oauth/oidc";

export async function GET() {
  try {
    const issuer = getIssuer();
    await getOidcKey();
    return Response.json({
      issuer,
      authorization_endpoint: issuer + "/oauth/authorize",
      token_endpoint: issuer + "/api/oauth/token",
      userinfo_endpoint: issuer + "/api/oauth/userinfo",
      revocation_endpoint: issuer + "/api/oauth/revoke",
      introspection_endpoint: issuer + "/api/oauth/introspect",
      jwks_uri: issuer + "/.well-known/jwks.json",
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ["openid", "profile", "email", "users:read", "users:write", "oauth:read", "oauth:write", "mcp:connect", "offline_access", "custom_data:read", "custom_data:write"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
      claims_supported: ["sub", "iss", "aud", "exp", "iat", "nonce", "email", "email_verified", "name", "preferred_username", "picture"]
    }, { headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/json; charset=utf-8" } });
  } catch {
    return Response.json({ error: "openid_configuration_unavailable", error_description: "Configure ONEAUTH_ISSUER_URL, ONEAUTH_OIDC_PRIVATE_KEY, and ONEAUTH_OIDC_KEY_ID." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
