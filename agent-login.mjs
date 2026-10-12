#!/usr/bin/env node
/**
 * OneAuth OAuth login helper for the VortiqLabs Agent public desktop client.
 * Uses Authorization Code + PKCE (S256), a loopback HTTP callback, and Node built-ins only.
 * Access tokens are printed only to this local terminal. Never paste them into chat or commit them.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { URL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const DEFAULT_CLIENT_ID = "oa_jveGzDNEj0by9neUceFrElkYfvGZHq4f";
const DEFAULT_ISSUER = "https://turbo-train-696qp5w5x4grh45qx-3001.app.github.dev";
const DEFAULT_REDIRECT = "http://localhost:8765/callback";
const DEFAULT_SCOPES = "openid tunnel:manage";
const rl = createInterface({ input: stdin, output: stdout });

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
function randomToken(bytes = 32) {
  return b64url(randomBytes(bytes));
}
function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}
function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}
async function ask(label, fallback) {
  const answer = (await rl.question(`${label} [${fallback}]: `)).trim();
  return answer || fallback;
}

let server;
try {
  console.log("\nOneAuth login · VortiqLabs Agent");
  console.log("Uses OAuth Authorization Code + PKCE. No client secret is requested or stored.\n");

  const issuerInput = await ask("OneAuth issuer URL", DEFAULT_ISSUER);
  const issuerUrl = new URL(issuerInput);
  const issuer = issuerUrl.toString().replace(/\/$/, "");
  if (!["https:", "http:"].includes(issuerUrl.protocol) ||
      (issuerUrl.protocol !== "https:" && !isLoopback(issuerUrl.hostname)) ||
      issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash) {
    throw new Error("Issuer must be HTTPS, except for a local HTTP issuer during development.");
  }

  const clientId = await ask("OAuth client ID", DEFAULT_CLIENT_ID);
  const redirectUri = await ask("Registered loopback redirect URI", DEFAULT_REDIRECT);
  const callback = new URL(redirectUri);
  if (callback.protocol !== "http:" || !isLoopback(callback.hostname) ||
      callback.username || callback.password || callback.search || callback.hash) {
    throw new Error("Redirect URI must be an HTTP loopback URL, e.g. http://localhost:8765/callback.");
  }
  const port = Number(callback.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid callback port.");
  const callbackPath = callback.pathname || "/";
  const callbackHost = callback.hostname === "[::1]" ? "::1" : callback.hostname;
  const scopes = await ask("Scopes", DEFAULT_SCOPES);
  const scopeList = [...new Set(scopes.split(/\s+/).filter(Boolean))];
  if (!scopeList.includes("openid")) throw new Error("Include openid so OneAuth can resolve the identity resource.");
  if (!scopeList.includes("tunnel:manage")) {
    console.log("Note: tunnel:manage is not requested; this login won't authorize Agent tunnel provisioning.");
  }

  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = pkceChallenge(verifier);
  const authorizeUrl = new URL("/oauth/authorize", issuer);
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopeList.join(" "),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: issuer,
  }).toString();

  const callbackResult = new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const incoming = new URL(req.url ?? "/", redirectUri);
      if (incoming.pathname !== callbackPath) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found. You can close this tab.");
        return;
      }
      const returnedState = incoming.searchParams.get("state") ?? "";
      const returnedError = incoming.searchParams.get("error");
      const code = incoming.searchParams.get("code");
      const sameState = Buffer.from(returnedState).length === Buffer.from(state).length &&
        timingSafeEqual(Buffer.from(returnedState), Buffer.from(state));
      if (!sameState) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("OAuth state check failed. Close this tab and restart login.");
        reject(new Error("OAuth state mismatch; authorization response rejected."));
        server.close();
        return;
      }
      if (returnedError) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("OneAuth sign-in was not completed. You can close this tab and check the terminal.");
        reject(new Error(`Authorization failed: ${returnedError}${incoming.searchParams.get("error_description") ? " — " + incoming.searchParams.get("error_description") : ""}`));
        server.close();
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("No authorization code was returned. Close this tab and retry.");
        reject(new Error("No authorization code was returned."));
        server.close();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end("<!doctype html><title>OneAuth login complete</title><h2>Login complete</h2><p>You can close this tab and return to your terminal.</p>");
      resolve(code);
      server.close();
    });
    server.on("error", reject);
    // Bind to the same loopback hostname used in the registered redirect URI.
    // Binding only to 127.0.0.1 can fail when the browser resolves localhost to ::1.
    server.listen(port, callbackHost, () => {
      console.log("\n1. Open this URL in your browser and sign in:");
      console.log("\n" + authorizeUrl.toString() + "\n");
      console.log(`2. Waiting for callback on ${callbackHost}:${port}${callbackPath} ...\n`);
    });
  });

  const code = await callbackResult;
  const tokenResponse = await fetch(new URL("/api/oauth/token", issuer), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const tokenText = await tokenResponse.text();
  let tokenBody = {};
  try {
    tokenBody = tokenText ? JSON.parse(tokenText) : {};
  } catch {
    // Keep non-JSON proxy/hosting responses out of logs except for a short preview.
  }
  if (!tokenResponse.ok) {
    const contentType = tokenResponse.headers.get("content-type") ?? "unknown content type";
    const safeDescription = typeof tokenBody.error_description === "string"
      ? tokenBody.error_description.replace(/[\r\n\t]+/g, " ").slice(0, 240)
      : "";
    const rawPreview = !tokenBody.error && tokenText
      ? `; response preview: ${tokenText.replace(/[\r\n\t]+/g, " ").slice(0, 180)}`
      : "";
    throw new Error(`Token exchange failed (HTTP ${tokenResponse.status}, ${contentType}): ${tokenBody.error ?? "unknown_error"}${safeDescription ? " — " + safeDescription : ""}${rawPreview}`);
  }
  if (typeof tokenBody.access_token !== "string") throw new Error("OneAuth response did not contain an access token.");

  console.log("Login succeeded.");
  console.log("Token type:", tokenBody.token_type ?? "Bearer");
  console.log("Expires in:", tokenBody.expires_in ?? "unknown", "seconds");
  console.log("Granted scopes:", tokenBody.scope ?? scopeList.join(" "));
  console.log("\nAccess token (keep private; use locally for API tests):");
  console.log(tokenBody.access_token);
  if (tokenBody.refresh_token) {
    console.log("\nRefresh token (even more sensitive; store securely):");
    console.log(tokenBody.refresh_token);
  }
  console.log("\nFor a tunnel API test, use this token locally with:");
  console.log(`curl -i -X POST "${issuer}/api/agent/tunnel" -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Accept: application/json"`);
} catch (error) {
  console.error("\nLogin failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (server?.listening) server.close();
  rl.close();
}
