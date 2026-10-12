"use server";

import { headers } from "next/headers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  createPasskeyRegistrationOptions,
  listPasskeys,
  removePasskey,
  verifyPasskeyRegistration,
} from "@/src/lib/auth/passkeys";

/** Return registration options for the currently authenticated account. */
export async function getPasskeyRegistrationOptions() {
  return createPasskeyRegistrationOptions();
}

/** List credentials belonging to the currently authenticated account. */
export async function getPasskeys() {
  return listPasskeys();
}

/** Verify and save a browser-generated WebAuthn registration response. */
export async function verifyPasskeyRegistrationAction(
  response: RegistrationResponseJSON,
  name: string,
) {
  const requestHeaders = await headers();
  return verifyPasskeyRegistration(requestHeaders, response, name);
}

/** Remove a credential owned by the currently authenticated account. */
export async function deletePasskey(id: string) {
  const requestHeaders = await headers();
  return removePasskey(requestHeaders, id);
}
