import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXTERNAL_MCP_RESOURCE_URL, resolveOAuthResource, resourceMatches } from "./resource.ts";

const issuer = "https://login.example.test";

test("the default external MCP audience is the canonical universal endpoint", () => {
  assert.equal(DEFAULT_EXTERNAL_MCP_RESOURCE_URL, "https://mcp.nishantapps.in/mcp");
});

test("default OAuth resource follows the requested scopes", () => {
  assert.equal(resolveOAuthResource("", ["mcp:connect"], issuer), issuer + "/api/mcp");
  assert.equal(resolveOAuthResource(DEFAULT_EXTERNAL_MCP_RESOURCE_URL, ["mcp:connect"], issuer), DEFAULT_EXTERNAL_MCP_RESOURCE_URL);
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


test("configured external MCP resource is allowed only when explicitly requested", () => {
  const previous = process.env.ONEAUTH_MCP_RESOURCE_URL;
  process.env.ONEAUTH_MCP_RESOURCE_URL = "https://mesh.example.test/mcp";
  try {
    assert.equal(resolveOAuthResource("", ["mcp:connect"], issuer), issuer + "/api/mcp");
    assert.equal(resolveOAuthResource("https://mesh.example.test/mcp", ["mcp:connect"], issuer), "https://mesh.example.test/mcp");
    assert.equal(resolveOAuthResource(DEFAULT_EXTERNAL_MCP_RESOURCE_URL, ["mcp:connect"], issuer), null);
    assert.equal(resolveOAuthResource("https://attacker.example/mcp", ["mcp:connect"], issuer), null);
    assert.equal(resolveOAuthResource("https://mesh.example.test/mcp", ["openid"], issuer), null);
  } finally {
    if (previous === undefined) delete process.env.ONEAUTH_MCP_RESOURCE_URL;
    else process.env.ONEAUTH_MCP_RESOURCE_URL = previous;
  }
});
