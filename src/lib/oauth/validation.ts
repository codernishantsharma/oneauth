export const OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "users:read",
  "users:write",
  "oauth:read",
  "oauth:write",
  "mcp:connect",
  "tunnel:manage",
  "offline_access",
  "custom_data:read",
  "custom_data:write",
] as const;

const allowedScopeSet = new Set<string>(OAUTH_SCOPES);
const customDataReadScope = /^custom_data:read:([A-Za-z0-9_-]{1,128}):([A-Za-z][A-Za-z0-9_.-]{0,63})$/;
export function isCustomDataReadScope(scope: string): boolean { return customDataReadScope.test(scope); }

/** HTTP loopback callbacks are permitted in development for any client, and in production only for native clients that cannot host HTTPS callbacks. */
export function allowsHttpLoopbackRedirect(environment: string, clientType: string): boolean {
  if (environment === "DEVELOPMENT") return true;
  return environment === "PRODUCTION" && ["NATIVE", "DESKTOP", "CLI"].includes(clientType);
}

export function parseRequestedScopes(
  rawScopes: string,
  clientScopes: readonly string[],
): string[] | null {
  const scopes = [...new Set(rawScopes.split(/\s+/).filter(Boolean))];
  if (scopes.length === 0 || scopes.length > 100) return null;
  for (const scope of scopes) {
    if (allowedScopeSet.has(scope)) {
      if (!clientScopes.includes(scope)) return null;
      continue;
    }
    if (!isCustomDataReadScope(scope) || !clientScopes.includes("custom_data:read")) return null;
  }
  return scopes;
}

export function isValidPkceChallenge(challenge: string, method: string): boolean {
  return method === "S256" && /^[A-Za-z0-9_-]{43,128}$/.test(challenge);
}

export function isValidOAuthState(state: string): boolean {
  return state.length > 0 && state.length <= 1024;
}

export function isValidOidcNonce(nonce: string): boolean {
  return nonce.length <= 256;
}

export function isSupportedClientAuthMethod(method: string): boolean {
  return method === "NONE" || method === "CLIENT_SECRET_BASIC" || method === "CLIENT_SECRET_POST";
}

export function isFormUrlEncodedContentType(value: string | null): boolean {
  if (!value) return false;
  const [mediaType, ...parameters] = value.split(";");
  if (mediaType.trim().toLowerCase() !== "application/x-www-form-urlencoded") return false;
  return parameters.every((parameter) => /^\s*charset\s*=\s*(?:utf-8|"utf-8")\s*$/i.test(parameter));
}

export function normalizeIssuer(value: string, production: boolean): string {
  const issuer = value.trim().replace(/\/+$/, "");
  if (!issuer) throw new Error("ONEAUTH_ISSUER_URL is required.");
  let url: URL;
  try { url = new URL(issuer); } catch { throw new Error("ONEAUTH_ISSUER_URL must be an absolute URL."); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !production && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))) {
    throw new Error("ONEAUTH_ISSUER_URL must use HTTPS except for local development.");
  }
  if (url.search || url.hash || url.username || url.password) throw new Error("ONEAUTH_ISSUER_URL must not contain credentials, query, or fragment.");
  return issuer;
}
