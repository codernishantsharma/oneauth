import test from "node:test";
import assert from "node:assert/strict";
import { resolveOAuthResource, resourceMatches } from "./resource.ts";

const issuer = "https://login.example.test";

test("default OAuth resource follows the requested scopes", () => {
  assert.equal(resolveOAuthResource("", ["mcp:connect"], issuer), issuer + "/api/mcp");
  assert.equal(resolveOAuthResource("", ["oauth:read"], issuer), issuer + "/api/v1");
  assert.equal(resolveOAuthResource("", ["openid", "profile"], issuer), issuer);
});

test("resource audiences cannot be substituted across API boundaries", () => {
  assert.equal(resolveOAuthResource(issuer + "/api/mcp", ["mcp:connect"], issuer), issuer + "/api/mcp");
  assert.equal(resolveOAuthResource(issuer + "/api/v1", ["oauth:read"], issuer), issuer + "/api/v1");
  assert.equal(resolveOAuthResource(issuer + "/api/mcp", ["openid"], issuer), null);
  assert.equal(resolveOAuthResource(issuer + "/api/v1", ["mcp:connect"], issuer), null);
  assert.equal(resolveOAuthResource("https://attacker.example/api/mcp", ["mcp:connect"], issuer), null);
});

test("identity-only tokens are not issued for privileged API resources", () => {
  assert.equal(resolveOAuthResource(issuer + "/api/v1", ["openid", "profile"], issuer), null);
  assert.equal(resolveOAuthResource(issuer, ["openid", "oauth:write"], issuer), null);
  assert.equal(resourceMatches(issuer + "/api/mcp", issuer + "/api/mcp"), true);
  assert.equal(resourceMatches(issuer + "/api/mcp", issuer + "/api/v1"), false);
});
