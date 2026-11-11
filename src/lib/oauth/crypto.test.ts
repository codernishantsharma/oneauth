import test from "node:test";
import assert from "node:assert/strict";
import { createPkceChallenge, hashOpaqueToken, randomOpaqueToken, safeEqual } from "./crypto.ts";

test("PKCE S256 matches the RFC 7636 test vector", () => {
  assert.equal(createPkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("opaque tokens are high entropy and are stored as one-way hashes", () => {
  const first = randomOpaqueToken("test_");
  const second = randomOpaqueToken("test_");
  assert.match(first, /^test_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.notEqual(hashOpaqueToken(first), first);
  assert.equal(hashOpaqueToken(first), hashOpaqueToken(first));
  assert.notEqual(hashOpaqueToken(first), hashOpaqueToken(second));
});

test("constant-time equality rejects mismatched values and lengths", () => {
  assert.equal(safeEqual("same-value", "same-value"), true);
  assert.equal(safeEqual("same-value", "different"), false);
  assert.equal(safeEqual("short", "longer"), false);
});
