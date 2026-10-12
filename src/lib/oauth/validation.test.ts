import test from "node:test";
import assert from "node:assert/strict";
import {
  OAUTH_SCOPES,
  isValidOAuthState,
  isValidOidcNonce,
  isValidPkceChallenge,
  isSupportedClientAuthMethod,
  isFormUrlEncodedContentType,
  parseRequestedScopes,
  normalizeIssuer,
  allowsHttpLoopbackRedirect,
} from "./validation.ts";

test("HTTP loopback redirects are allowed for development clients and production native clients only", () => {
  assert.equal(allowsHttpLoopbackRedirect("DEVELOPMENT", "WEB"), true);
  assert.equal(allowsHttpLoopbackRedirect("DEVELOPMENT", "DESKTOP"), true);
  assert.equal(allowsHttpLoopbackRedirect("PRODUCTION", "NATIVE"), true);
  assert.equal(allowsHttpLoopbackRedirect("PRODUCTION", "DESKTOP"), true);
  assert.equal(allowsHttpLoopbackRedirect("PRODUCTION", "CLI"), true);
  assert.equal(allowsHttpLoopbackRedirect("PRODUCTION", "WEB"), false);
  assert.equal(allowsHttpLoopbackRedirect("PRODUCTION", "SPA_PUBLIC"), false);
  assert.equal(allowsHttpLoopbackRedirect("STAGING", "DESKTOP"), false);
});

test("authorization code flow accepts only PKCE S256 challenges", () => {
  const validChallenge = "A".repeat(43);
  assert.equal(isValidPkceChallenge(validChallenge, "S256"), true);
  assert.equal(isValidPkceChallenge("short", "S256"), false);
  assert.equal(isValidPkceChallenge("A".repeat(43), "plain"), false);
  assert.equal(isValidPkceChallenge("A".repeat(129), "S256"), false);
  assert.equal(isValidPkceChallenge("A".repeat(42) + "=", "S256"), false);
});

test("requested scopes must be supported and registered for the client", () => {
  assert.deepEqual(parseRequestedScopes("openid profile", OAUTH_SCOPES), ["openid", "profile"]);
  assert.deepEqual(parseRequestedScopes("openid openid profile", OAUTH_SCOPES), ["openid", "profile"]);
  assert.equal(parseRequestedScopes("", OAUTH_SCOPES), null);
  assert.equal(parseRequestedScopes("openid unknown", OAUTH_SCOPES), null);
  assert.equal(parseRequestedScopes("openid oauth:write", ["openid", "profile"]), null);
  assert.deepEqual(parseRequestedScopes("openid custom_data:read:client_123:theme", ["openid", "custom_data:read"]), ["openid", "custom_data:read:client_123:theme"]);
  assert.equal(parseRequestedScopes("custom_data:read:client_123:theme", ["openid"]), null);
  assert.equal(parseRequestedScopes("custom_data:read:client_123:bad field", ["custom_data:read"]), null);
});

test("state and nonce lengths are bounded", () => {
  assert.equal(isValidOAuthState("state"), true);
  assert.equal(isValidOAuthState(""), false);
  assert.equal(isValidOAuthState("s".repeat(1025)), false);
  assert.equal(isValidOidcNonce(""), true);
  assert.equal(isValidOidcNonce("n".repeat(256)), true);
  assert.equal(isValidOidcNonce("n".repeat(257)), false);
});

test("unsupported private-key JWT authentication is not accepted as a configured method", () => {
  assert.equal(isSupportedClientAuthMethod("NONE"), true);
  assert.equal(isSupportedClientAuthMethod("CLIENT_SECRET_BASIC"), true);
  assert.equal(isSupportedClientAuthMethod("CLIENT_SECRET_POST"), true);
  assert.equal(isSupportedClientAuthMethod("PRIVATE_KEY_JWT"), false);
  assert.equal(isSupportedClientAuthMethod("anything"), false);
});

test("form endpoints accept only the expected URL-encoded media type", () => {
  assert.equal(isFormUrlEncodedContentType("application/x-www-form-urlencoded"), true);
  assert.equal(isFormUrlEncodedContentType("Application/X-WWW-Form-Urlencoded; charset=UTF-8"), true);
  assert.equal(isFormUrlEncodedContentType("application/x-www-form-urlencoded-malicious"), false);
  assert.equal(isFormUrlEncodedContentType("text/plain"), false);
  assert.equal(isFormUrlEncodedContentType(null), false);
  assert.equal(isFormUrlEncodedContentType("application/x-www-form-urlencoded; charset=utf-8; boundary=x"), false);
});


test("issuer URLs are normalized and reject insecure or ambiguous production values", () => {
  assert.equal(normalizeIssuer(" https://auth.example.com/// ", true), "https://auth.example.com");
  assert.equal(normalizeIssuer("http://localhost:3001/", false), "http://localhost:3001");
  assert.throws(() => normalizeIssuer("http://auth.example.com", true));
  assert.throws(() => normalizeIssuer("https://user:pass@auth.example.com", true));
  assert.throws(() => normalizeIssuer("https://auth.example.com?tenant=1", true));
  assert.throws(() => normalizeIssuer("not a URL", false));
});
