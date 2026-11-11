"use server";

import { requireCurrentUser } from "@/src/lib/auth/session";
import { listSecurityEventsForUser } from "@/src/lib/auth/security-events";
import {
  beginTotpEnrollment,
  changeAccountPassword,
  confirmTotpEnrollment,
  disableTotp,
  getSecurityOverview,
  getRecoveryCodeCount,
  listAccountSessions,
  regenerateRecoveryCodes,
  revokeAccountSession,
} from "@/src/lib/auth/security-settings";
import { listPasskeys } from "@/src/lib/auth/passkeys";

export async function getSecurityLog() {
  const user = await requireCurrentUser();
  return listSecurityEventsForUser(user.id, 50);
}

export async function getSecuritySettings() {
  const [overview, sessions, passkeys] = await Promise.all([
    getSecurityOverview(),
    listAccountSessions(),
    listPasskeys(),
  ]);
  if ("error" in passkeys) throw new Error(passkeys.error);
  return { overview, sessions, passkeys: passkeys.passkeys };
}

export async function startTwoFactorSetup() {
  return beginTotpEnrollment();
}

export async function enableTwoFactor(code: string) {
  return confirmTotpEnrollment(code);
}

export async function disableTwoFactor(password: string, code: string) {
  return disableTotp(password, code);
}

export async function rotateRecoveryCodes(password: string) {
  return regenerateRecoveryCodes(password);
}

export async function getRemainingRecoveryCodes() {
  return getRecoveryCodeCount();
}

export async function updateAccountPassword(currentPassword: string, newPassword: string) {
  return changeAccountPassword(currentPassword, newPassword);
}

export async function revokeSession(sessionId: string) {
  return revokeAccountSession(sessionId);
}
