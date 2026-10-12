const apiScopes = new Set(["users:read","users:write","oauth:read","oauth:write"]);
const identityScopes = new Set(["openid","profile","email","users:read","offline_access","custom_data:read","custom_data:write"]);

function isIdentityScope(scope: string) {
  return identityScopes.has(scope) || scope.startsWith("custom_data:read:");
}

export function resolveOAuthResource(requested: string, scopes: string[], issuer: string): string | null {
  const api = issuer + "/api/v1";
  const mcp = issuer + "/api/mcp";
  const userinfo = issuer + "/api/oauth/userinfo";
  const chosen = requested || (scopes.includes("mcp:connect") ? mcp : scopes.some(scope => apiScopes.has(scope)) ? api : issuer);
  if (![issuer, api, mcp, userinfo].includes(chosen)) return null;
  if (chosen === mcp) return scopes.includes("mcp:connect") && !scopes.includes("oauth:write") && !scopes.includes("users:write") ? chosen : null;
  if (chosen === api) return scopes.some(scope => apiScopes.has(scope)) && !scopes.includes("mcp:connect") ? chosen : null;
  return scopes.some(isIdentityScope) && !scopes.some(scope => ["mcp:connect","oauth:read","oauth:write","users:write"].includes(scope)) ? chosen : null;
}

export function resourceMatches(actual: string | null | undefined, expected: string) {
  return typeof actual === "string" && actual === expected;
}
