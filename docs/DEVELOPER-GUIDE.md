# OneAuth Developer Guide

This guide covers the OneAuth Developer Portal, application registration, OAuth 2.0 / OpenID Connect (OIDC), user claims, tokens, API keys, and troubleshooting.

> **Implementation status:** The repository contains authorization-code + PKCE, token, UserInfo, discovery, JWKS, revocation, and introspection routes. Always verify the live deployment and run tests before relying on a release in production. Selecting an API or MCP scope does not, by itself, prove every corresponding protected operation is deployed and ready.

## Contents

1. [Start locally](#1-start-locally)
2. [Configure OIDC](#2-configure-oidc)
3. [Register an application](#3-register-an-application)
4. [Client types and environments](#4-client-types-and-environments)
5. [Scopes](#5-scopes)
6. [Authorization Code + PKCE](#6-authorization-code--pkce)
7. [Exchange a code for tokens](#7-exchange-a-code-for-tokens)
8. [Fetch user information](#8-fetch-user-information)
9. [Validate an ID token](#9-validate-an-id-token)
10. [Refresh, introspect, and revoke](#10-refresh-introspect-and-revoke)
11. [API keys and organizations](#11-api-keys-and-organizations)
12. [Endpoint reference](#12-endpoint-reference)
13. [Troubleshooting](#13-troubleshooting)
14. [Security checklist](#14-security-checklist)

## 1. Start locally

From the auth/ directory:

    npm install
    cp .env.example .env
    # Fill in required database, Redis/rate-limit, email, and security values.
    npm run dev

The development server uses port 3001 by default. Open http://localhost:3001 and the Developer Portal at http://localhost:3001/developer.

A working database and applied migrations are required for app registration and OAuth flows. Check schema/migration status before testing.

For local browser testing, consistently use one origin. If registering a localhost callback, use that exact URI for authorization and token exchange. When testing through a Codespaces forwarded URL, use its exact HTTPS origin and ensure the port's access settings permit the browser/client to reach it.

## 2. Configure OIDC

Required OIDC settings:

- ONEAUTH_ISSUER_URL: canonical public origin, without a trailing slash.
- ONEAUTH_OIDC_PRIVATE_KEY: unencrypted PKCS#8 RSA private key PEM; store newlines as literal backslash-n in .env.
- ONEAUTH_OIDC_KEY_ID: stable key ID used by JWT headers and JWKS.
- NEXT_PUBLIC_APP_URL: public base URL for the app.
- ONEAUTH_ENCRYPTION_KEY: stable 32-byte hex key for encrypted TOTP secrets.
- DATABASE_URL and the other deployment-specific settings shown in .env.example.

Generate a development signing key from auth/:

    mkdir -p .secrets
    chmod 700 .secrets
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out .secrets/oneauth-oidc-private.pem
    chmod 600 .secrets/oneauth-oidc-private.pem
    openssl pkey -in .secrets/oneauth-oidc-private.pem -check -noout
    openssl rand -hex 8

Use the last command's output as ONEAUTH_OIDC_KEY_ID. Convert the private key to one line with escaped newlines:

    awk 'BEGIN { ORS="" } { if (NR > 1) printf "\\n"; printf "%s", $0 }' .secrets/oneauth-oidc-private.pem

Copy that output into the local .env as ONEAUTH_OIDC_PRIVATE_KEY. Keep the private key outside Git, logs, and public backups. Never reuse development signing keys in production. Keep ONEAUTH_ENCRYPTION_KEY stable; changing it can make encrypted TOTP secrets unreadable.

Verify discovery and public keys after starting the server:

    curl -fsS http://localhost:3001/.well-known/openid-configuration | jq .
    curl -fsS http://localhost:3001/.well-known/jwks.json | jq .

JWKS must publish public key material only.

## 3. Register an application

1. Sign in to OneAuth in the browser.
2. Open Developer Portal → Applications at /developer/applications.
3. Select Register application and enter a name and optional description.
4. Choose the client type and environment.
5. Enter the exact callback URI(s), one per line.
6. Select only the scopes required by your app.
7. Save the client ID and, for confidential clients, the client secret immediately. The secret is shown only once.

To change settings later, open the application from the list. Edit its name, description, or active status on the application settings page; use Manage redirect URIs to change callbacks. The scheme, host, port, path, and trailing slash must match the URI sent during OAuth.

Register separate Development and Production applications. Do not reuse credentials or callback URLs across environments.

## 4. Client types and environments

- Web application (confidential): server-side application that can protect a client secret.
- Single-page app (public / PKCE): browser app; no client secret. Use PKCE.
- Native mobile, Desktop, and CLI: public clients; no client secret. Use PKCE.
- Server-to-server service: confidential client; use only from a trusted backend.

Production redirect URIs must use HTTPS, except for loopback HTTP callbacks (localhost, 127.0.0.1, or ::1) on Native, Desktop, and CLI clients using Authorization Code + PKCE. Development clients may use loopback HTTP callbacks regardless of client type. Do not permit plain HTTP callbacks to arbitrary hosts in production. Never embed a confidential secret in frontend code, a mobile/desktop binary, or a public repository.

Supported token-endpoint client authentication depends on the registered client: none for public clients, client_secret_post, or client_secret_basic. Use the method configured for that client and advertised by discovery.

## 5. Scopes

The application must have the requested scopes registered. Request the smallest set of permissions needed.

| Scope | Purpose |
|---|---|
| openid | OIDC sign-in; enables an ID token |
| profile | Profile claims such as name and preferred_username, when available |
| email | Email claim and email_verified, when available |
| users:read | Read user data / compatible API permission |
| users:write | User write permission for compatible protected APIs |
| oauth:read | Read OAuth client data for compatible protected APIs |
| oauth:write | Manage OAuth client data for compatible protected APIs |
| mcp:connect | Request an MCP resource token, subject to MCP configuration and policy |
| offline_access | Request a refresh token |

A selectable scope does not guarantee every corresponding API operation exists or is authorized. The resource/audience must match the API. This implementation distinguishes the identity/UserInfo resource, /api/v1, and /api/mcp. Do not send a token issued for one audience to another.

## 6. Authorization Code + PKCE

Use Authorization Code with PKCE S256 for interactive sign-in. Each attempt needs a fresh random state, nonce, and verifier. Keep the verifier until code exchange completes.

Save the following as make-auth-url.mjs and run it with Node.js. Replace the issuer, client ID, and callback with values for your environment; the callback must be registered exactly.

    import { createHash, randomBytes } from "node:crypto";

    const issuer = "http://localhost:3001"; // Use canonical HTTPS issuer in production.
    const clientId = "YOUR_CLIENT_ID";
    const redirectUri = "http://localhost:3001/oauth-test/callback";

    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(24).toString("base64url");

    const url = new URL("/oauth/authorize", issuer);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

    console.log("Open this URL:", url.toString());
    console.log("Save CODE_VERIFIER securely:", verifier);
    console.log("Expected STATE:", state);
    console.log("Expected NONCE:", nonce);

Open the URL, sign in, review consent, and approve. Verify the returned state matches the state generated before proceeding. Denial returns an OAuth error instead of a code.

The repository's /oauth-test/callback page is for development diagnostics only. Do not use it in production or expose authorization codes on shared/public pages.

## 7. Exchange a code for tokens

Authorization codes expire after five minutes in the current implementation and can only be redeemed once. Use the exact verifier and redirect URI from the same authorization attempt.

Example for a public client, with values supplied through environment variables:

    const issuer = "http://localhost:3001";
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.CLIENT_ID,
      redirect_uri: process.env.REDIRECT_URI,
      code: process.env.CODE,
      code_verifier: process.env.CODE_VERIFIER,
    });

    const response = await fetch(`${issuer}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${result.error ?? ""}`);

Do not log the result object in a real application because it contains credentials. The response includes an access token (15-minute lifetime); an ID token is included when openid was granted. A refresh token is included when offline_access is granted and the flow/client supports it.

Confidential clients must authenticate with the method configured for them. Never expose their secret in browser code. Use TLS for remote requests and store tokens securely.

## 8. Fetch user information

Send the access token as a Bearer token to /api/oauth/userinfo:

    const response = await fetch(`${issuer}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const profile = await response.json();
    if (!response.ok) throw new Error(`UserInfo failed: ${response.status} ${profile.error ?? ""}`);
    console.log(profile);

Depending on granted scopes and stored profile data, claims can include:

- sub: OneAuth user identifier.
- name: display name, when available and profile was granted.
- preferred_username: username, when available and profile was granted.
- email and email_verified: when email was granted and an email record exists.

Claims can be omitted if the user has no corresponding data. With the `profile` scope, `picture` contains the user's profile-picture URL when set. Treat `email_verified: false` as an unverified email. Tokens with an incompatible audience or insufficient scope are rejected. Use an access token—not an ID token—for the UserInfo Bearer header.

### App-owned custom JSON data

Register `custom_data:write` for an app to write its own private fields. Send `PUT /api/oauth/custom-data` with a Bearer access token and a JSON body such as `{"data":{"theme":"dark","favoriteColor":"blue"}}`. Data is namespaced by the owning app and stored in the user's profile JSONB column; another app cannot read it by default.

For cross-app sharing, the requesting app must register `custom_data:read` and request an exact field scope in the authorization URL, for example `custom_data:read:owner_client_id:theme`. The consent screen names the requested field. After consent, request only that field with `GET /api/oauth/custom-data?owner_client_id=owner_client_id&field=theme`. The API checks the exact field scope and returns only `{field,value}`, never the entire JSON object. Use safe field keys (letters first, then letters/numbers/underscore/dot/hyphen); custom payloads are limited to 16 KB.

## 9. Validate an ID token

Never trust an ID token just because it can be decoded. Validate it with a maintained OIDC/JWT library:

1. Verify the signature using public keys from /.well-known/jwks.json.
2. Require RS256 as advertised by discovery.
3. Verify iss exactly matches the configured issuer.
4. Verify aud includes your registered client ID.
5. Validate exp and time claims.
6. Verify nonce matches the original authorization request.
7. Use sub as the stable subject identifier; do not use email as a stable ID.

The ID token audience is the client ID. The access token resource/audience is separate and determines which API can accept it.

## 10. Refresh, introspect, and revoke

### Refresh

Only use refresh if offline_access was granted and a refresh token was returned. Refresh tokens rotate; store the replacement and stop using the old token. Reuse detection can revoke the family, requiring sign-in again.

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.CLIENT_ID,
      refresh_token: process.env.REFRESH_TOKEN,
    });
    const response = await fetch(`${issuer}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Refresh failed");

Confidential clients must include their configured client authentication.

### Introspection

POST /api/oauth/introspect accepts form-encoded token and optional token_type_hint (access_token or refresh_token). The caller must authenticate as the client that owns the token. The response includes active: true and metadata for a valid token, or active: false for an inactive/unknown token.

### Revocation

POST /api/oauth/revoke accepts a form-encoded token and client authentication. A validly authenticated request returns HTTP 200 even if the token is unknown, avoiding disclosure of token existence. Access-token revocation applies to the matching client; revoking a refresh token revokes its refresh-token family.

## 11. API keys and organizations

Open Developer Portal → API keys at /developer/api-keys to create organization-scoped keys:

1. Give the key a descriptive name.
2. Select Development or Production.
3. Choose the minimum required scopes.
4. Choose an expiry (30, 90, 180, or 365 days; never-expiring is available but not recommended).
5. Copy the secret immediately; it cannot be retrieved after leaving the screen.
6. Revoke it from the same page when it is no longer needed.

Store production credentials in a secret manager. Never commit keys or paste them into logs or support chats. Confirm the authentication header expected by each protected API; do not assume API keys and OAuth Bearer tokens are interchangeable.

Developer portal access is organization-based. Select the correct organization and ensure your role permits developer access. Use the organization/team page to review access and the audit logs page to review supported organization activity.

## 12. Endpoint reference

Use discovery as the source of truth for deployed endpoint URLs. Do not hard-code a temporary Codespaces URL in a production integration.

| Endpoint | Method | Purpose |
|---|---|---|
| /.well-known/openid-configuration | GET | OIDC discovery; requires issuer and signing key |
| /.well-known/oauth-authorization-server | GET | OAuth authorization server metadata |
| /.well-known/jwks.json | GET | Public signing keys |
| /.well-known/oauth-protected-resource | GET | Protected-resource metadata |
| /oauth/authorize | GET, POST | Authorization and user consent |
| /api/oauth/token | POST | Code exchange or refresh |
| /api/oauth/userinfo | GET | Claims permitted by token scopes |
| /api/oauth/introspect | POST | Authenticated token introspection |
| /api/oauth/revoke | POST | Authenticated token revocation |
| /api/v1 | Depends on route | API resource audience; consult each API route |
| /api/mcp | MCP transport | MCP audience; configure and test separately |

Token/form endpoints expect application/x-www-form-urlencoded. Authorization Code requires PKCE S256. Check the deployed discovery document for supported methods.

## 13. Troubleshooting

### invalid_grant
Generate a new authorization URL and code. Use the verifier from that same URL generation, the same exact redirect URI, and the same client ID. Codes expire after five minutes and can only be redeemed once.

### Empty HTTP 401 with WWW-Authenticate: tunnel
This usually indicates that the Codespaces forwarding tunnel rejected the request before it reached the application. Test from inside the Codespace against http://127.0.0.1:3001 and check the forwarded port's access/visibility setting. A local OAuth JSON error proves the request reached the app handler; a tunnel 401 is a different problem.

### redirect URI mismatch
Register the exact URI including scheme, host, port, path, and trailing slash. Do not leave a placeholder callback such as https://example.com/auth/callback unless it is genuinely your callback.

### OIDC discovery returns 503
Check ONEAUTH_ISSUER_URL, ONEAUTH_OIDC_PRIVATE_KEY, and ONEAUTH_OIDC_KEY_ID. Validate that the PEM is a PKCS#8 RSA key and that escaped newlines are formatted correctly.

### UserInfo returns invalid_token or insufficient_scope
Check expiry, revocation, user/client/organization status, resource/audience, and granted scopes. Use the access token, not the ID token, for UserInfo.

### Consent says request expired
Reload the authorization URL and submit the new consent form once. Do not reuse a stale consent page after a failed POST; its CSRF token may have been cleared or expired.

## 14. Security checklist

- Use Authorization Code + PKCE S256 for interactive clients.
- Generate fresh unpredictable state, nonce, and verifier values per attempt.
- Verify state before exchanging a code.
- Validate ID-token signatures and claims; decoding alone is not validation.
- Use exact HTTPS redirect URIs in production.
- Separate Development and Production registrations, credentials, and callbacks.
- Keep secrets, signing keys, API keys, authorization codes, and tokens out of Git and logs.
- Request minimum scopes and use the correct resource/audience.
- Store credentials in a secret manager and rotate/revoke compromised credentials.
- Use TLS in production; do not expose development servers or test callbacks with real credentials.
- Before release, run npm test, npx tsc --noEmit, and npm run build.
