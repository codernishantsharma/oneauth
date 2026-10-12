import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomOpaqueToken(prefix = "") {
  return prefix + randomBytes(32).toString("base64url");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createPkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
