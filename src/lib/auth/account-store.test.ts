import assert from "node:assert/strict";
import test from "node:test";

import { createAccount, verifyAccountToken, verifyCredentials } from "./account-store.ts";

test("signup verification keeps the account pending until the token is confirmed", async () => {
  const email = `verify-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const username = `pending-${Date.now()}`;
  const password = "Password123!";

  const account = await createAccount(
    {
      email,
      username,
      displayName: "Pending User",
      password,
    },
    { requireVerification: true },
  );

  assert.equal(account.status, "PENDING_VERIFICATION");
  assert.equal(await verifyCredentials(email, password), null);
  assert.ok(account.verificationToken, "expected a verification token to be generated");

  const verified = await verifyAccountToken(account.verificationToken!);
  assert.equal(verified.status, "ACTIVE");
  assert.equal((await verifyCredentials(email, password))?.email, email);
});
