"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import {
  disableTwoFactor,
  enableTwoFactor,
  getSecuritySettings,
  revokeSession as revokeSessionAction,
  rotateRecoveryCodes,
  startTwoFactorSetup,
  updateAccountPassword,
} from "./actions";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { EmptyState, PageHeading, Panel, PortalIcon } from "../components/PortalUI";

type SettingsData = Awaited<ReturnType<typeof getSecuritySettings>>;
type SetupData = Awaited<ReturnType<typeof startTwoFactorSetup>>;

function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    TOTP_ALREADY_ENABLED: "Two-factor authentication is already enabled.",
    TOTP_SETUP_EXPIRED: "The setup expired. Start again to get a new authenticator secret.",
    TOTP_CODE_INVALID: "That verification code is incorrect. Check your authenticator and try again.",
    TOTP_NOT_ENABLED: "Two-factor authentication is not enabled on this account.",
    CURRENT_PASSWORD_INCORRECT: "Your current password is incorrect.",
    NEW_PASSWORD_POLICY: "Use a new password between 12 and 128 characters.",
    SESSION_NOT_FOUND_OR_CURRENT: "That session is no longer active, or it is your current session.",
  };
  return messages[code] ?? "Something went wrong. Please try again.";
}

export default function SecurityPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getSecuritySettings());
    } catch {
      setNotice({ type: "error", text: "Could not load your security settings. Refresh and try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ type: "success", text: successMessage });
      await refresh();
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function beginSetup() {
    setBusy(true);
    setNotice(null);
    try {
      setSetup(await startTwoFactorSetup());
      setSetupCode("");
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const result = await enableTwoFactor(setupCode);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setSetupCode("");
      setNotice({ type: "success", text: "Two-factor authentication is enabled. Save these recovery codes now." });
      await refresh();
    } catch (error) {
      setNotice({ type: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function disableSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      await disableTwoFactor(disablePassword, disableCode);
      setDisablePassword("");
      setDisableCode("");
      setRecoveryCodes(null);
    }, "Two-factor authentication has been disabled.");
  }

  async function rotateCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const result = await rotateRecoveryCodes(recoveryPassword);
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryPassword("");
    }, "New recovery codes generated. Previous codes are no longer valid.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordForm.next !== passwordForm.confirm) {
      setNotice({ type: "error", text: "The new password and confirmation do not match." });
      return;
    }
    await runAction(async () => {
      await updateAccountPassword(passwordForm.current, passwordForm.next);
      setPasswordForm({ current: "", next: "", confirm: "" });
    }, "Password changed. Other active sessions have been revoked.");
  }

  async function revokeSession(id: string) {
    if (!window.confirm("Revoke this session? That device will need to sign in again.")) return;
    await runAction(async () => { await revokeSessionAction(id); }, "Session revoked.");
  }

  const overview = data?.overview;
  const score = overview ? Math.min(100, (overview.totpEnabled ? 45 : 0) + (overview.passkeyCount > 0 ? 35 : 0) + (overview.recoveryCodesRemaining > 0 ? 20 : 0)) : 0;

  return (
    <AuthenticatedShell activeLabel="Security & 2FA" activePath="/security">
      <PageHeading
        actions={<button className="portal-button portal-button-secondary" disabled={loading || busy} onClick={() => void refresh()} type="button"><PortalIcon name="shield-check" /> {t("Refresh status")}</button>}
        description="Manage your password, authenticator-based two-factor verification, passkeys, recovery codes, and signed-in devices."
        eyebrow="SECURITY & AUTHENTICATION"
        title="Security settings"
      />

      {notice ? <div className={`passkeys-notice passkeys-notice-${notice.type}`} role="status" aria-live="polite"><PortalIcon name={notice.type === "success" ? "check-circle" : "shield-check"} /><span>{t(notice.text)}</span><button type="button" aria-label={t("Dismiss message")} onClick={() => setNotice(null)}>×</button></div> : null}

      <section className="portal-card security-posture">
        <div
          aria-label={t(loading ? "Loading security posture" : `Security score: ${score} out of 100`)}
          className={`score-ring${loading ? " score-ring-empty" : ""}`}
          role="img"
          style={{ background: loading ? "#e9ebeb" : `conic-gradient(#ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e ${score}%, #e9ebeb ${score}% 100%)` }}
        >
          <div><b>{loading ? "…" : score}</b><span>{loading ? t("LOADING") : t("OF 100")}</span></div>
        </div>
        <div className="security-posture-copy">
          <p className="portal-eyebrow">{t("SECURITY STATUS")}</p>
          <h2>{loading ? t("Checking your account…") : score >= 80 ? t("Strong security setup") : score >= 45 ? t("Good start — add recovery") : t("Secure your account")}</h2>
          <p>{t("This indicator reflects configured protections in your OneAuth account. It updates when you change your settings.")}</p>
          <div className="security-checks">
            <span><i />{t(overview?.totpEnabled ? "Authenticator enabled" : "Authenticator not enabled")}</span>
            <span><i />{t(overview?.passkeyCount ? `${overview.passkeyCount} passkey(s) registered` : "No passkeys registered")}</span>
            <span><i />{t(overview?.recoveryCodesRemaining ? `${overview.recoveryCodesRemaining} recovery codes left` : "No recovery codes available")}</span>
          </div>
          <div aria-label={t("Security score breakdown")} className="security-score-breakdown">
            <div className="security-score-factor">
              <div className="security-score-factor-label"><span>{t("Two-factor authentication")}</span><b>{loading ? "—" : overview?.totpEnabled ? "45/45" : "0/45"}</b></div>
              <div aria-label={t("Two-factor score")} className="security-score-track security-score-track-totp" role="img"><span style={{ width: loading ? "0%" : overview?.totpEnabled ? "100%" : "0%" }} /></div>
            </div>
            <div className="security-score-factor">
              <div className="security-score-factor-label"><span>{t("Passkeys")}</span><b>{loading ? "—" : overview?.passkeyCount ? "35/35" : "0/35"}</b></div>
              <div aria-label={t("Passkey score")} className="security-score-track security-score-track-passkeys" role="img"><span style={{ width: loading ? "0%" : overview?.passkeyCount ? "100%" : "0%" }} /></div>
            </div>
            <div className="security-score-factor">
              <div className="security-score-factor-label"><span>{t("Recovery codes")}</span><b>{loading ? "—" : overview?.recoveryCodesRemaining ? "20/20" : "0/20"}</b></div>
              <div aria-label={t("Recovery code score")} className="security-score-track security-score-track-recovery" role="img"><span style={{ width: loading ? "0%" : overview?.recoveryCodesRemaining ? "100%" : "0%" }} /></div>
            </div>
          </div>
        </div>
      </section>

      <div className="portal-two-column">
        <Panel action={<span className="security-key-tag">{overview?.totpEnabled ? t("ENABLED") : t("OPTIONAL")}</span>} title="Two-factor authentication">
          <p className="panel-description">{t("Use an authenticator app for a time-based one-time password when signing in. OneAuth requires a valid code after your password.")}</p>
          {overview?.totpEnabled ? (
            <>
              <div className="factor-method"><span className="factor-icon"><PortalIcon name="shield-check" /></span><span><b>{t("Authenticator app")}</b><small>{t("Verification required at sign-in")}</small></span><span className="preference-enabled">{t("Active")}</span></div>
              <form className="security-form" onSubmit={disableSetup}>
                <label>{t("Current password")}<input autoComplete="current-password" onChange={(event) => setDisablePassword(event.target.value)} required type="password" value={disablePassword} /></label>
                <label>{t("Authenticator code")}<input autoComplete="one-time-code" inputMode="numeric" maxLength={8} onChange={(event) => setDisableCode(event.target.value)} required value={disableCode} /></label>
                <button className="portal-button portal-button-danger-quiet portal-button-full" disabled={busy} type="submit">{t("Disable two-factor authentication")}</button>
              </form>
            </>
          ) : setup ? (
            <form className="security-form" onSubmit={confirmSetup}>
              <p className="security-setup-instructions">{t("Scan this QR code with your authenticator app, or enter the setup key manually. Then enter the 6-digit code to confirm setup.")}</p>
              <div className="security-qr-setup">
                <div className="security-qr-code">
                  <QRCodeSVG
                    aria-label={t("Authenticator setup QR code")}
                    bgColor="#ffffff"
                    fgColor="#111111"
                    level="M"
                    marginSize={4}
                    size={208}
                    value={setup.otpauthUrl}
                  />
                </div>
                <p>{t("Scan with Google Authenticator, Microsoft Authenticator, or another compatible app.")}</p>
              </div>
              <label>{t("Manual setup key")}<code className="security-secret">{setup.secret}</code></label>
              <button className="portal-button portal-button-secondary portal-button-full" onClick={() => { void navigator.clipboard.writeText(setup.secret); setNotice({ type: "success", text: "Authenticator setup key copied to clipboard." }); }} type="button">{t("Copy setup key")}</button>
              <a className="portal-button portal-button-secondary portal-button-full" href={setup.otpauthUrl}>{t("Open in authenticator app")}</a>
              <label>{t("6-digit verification code")}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} minLength={6} onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required value={setupCode} /></label>
              <button className="portal-button portal-button-primary portal-button-full" disabled={busy || setupCode.length !== 6} type="submit">{t("Verify and enable")}</button>
              <button className="portal-button portal-button-secondary portal-button-full" onClick={() => setSetup(null)} type="button">{t("Cancel setup")}</button>
            </form>
          ) : (
            <>
              <EmptyState description={t("Add an authenticator app to require a second verification step at sign-in.")} title={t("Two-factor is off")} />
              <button className="portal-button portal-button-primary portal-button-full" disabled={busy || loading} onClick={() => void beginSetup()} type="button">{t("Set up authenticator")}</button>
            </>
          )}
        </Panel>

        <Panel title="Account password">
          <p className="panel-description">{t("Change your password. We will keep this session and revoke other active sessions.")}</p>
          <form className="security-form" onSubmit={changePassword}>
            <label>{t("Current password")}<input autoComplete="current-password" onChange={(event) => setPasswordForm((old) => ({ ...old, current: event.target.value }))} required type="password" value={passwordForm.current} /></label>
            <label>{t("New password")}<input autoComplete="new-password" minLength={12} maxLength={128} onChange={(event) => setPasswordForm((old) => ({ ...old, next: event.target.value }))} required type="password" value={passwordForm.next} /></label>
            <label>{t("Confirm new password")}<input autoComplete="new-password" minLength={12} maxLength={128} onChange={(event) => setPasswordForm((old) => ({ ...old, confirm: event.target.value }))} required type="password" value={passwordForm.confirm} /></label>
            <p className="security-form-hint">{t("Use 12–128 characters. Other signed-in devices will be signed out after a password change.")}</p>
            <button className="portal-button portal-button-primary portal-button-full" disabled={busy} type="submit">{t("Change password")}</button>
          </form>
        </Panel>
      </div>

      <Panel action={<Link className="portal-button portal-button-secondary portal-button-small" href="/passkeys"><PortalIcon name="key-round" /> {t("Manage passkeys")}</Link>} id="passkeys" title="Passkeys">
        {loading ? <p className="panel-description">{t("Loading passkeys…")}</p> : data?.passkeys.length ? (
          <div className="security-passkey-list">
            {data.passkeys.map((passkey) => <div className="security-passkey" key={passkey.id}><span className="security-key-icon"><PortalIcon name="key-round" /></span><span className="security-key-info"><b>{passkey.name}</b><small>{t(passkey.deviceType === "MULTI_DEVICE" ? "Synced passkey" : "Device-bound passkey")} · {t("Added")} {new Date(passkey.createdAt).toLocaleDateString()}</small></span><span className="security-key-tag">{passkey.backedUp ? t("BACKED UP") : t("PASSKEY")}</span></div>)}
          </div>
        ) : <EmptyState description={t("Add a passkey for phishing-resistant, passwordless sign-in.")} title={t("No passkeys registered")} />}
      </Panel>

      <Panel action={<div className="panel-action-group"><span className="security-key-tag">{overview?.activeSessions ?? "—"} {t("ACTIVE")}</span></div>} id="sessions" title="Active sessions">
        <p className="panel-description">{t("Review signed-in devices and revoke sessions you no longer recognize. Your current session cannot be revoked here.")}</p>
        {loading ? <p className="panel-description">{t("Loading sessions…")}</p> : data?.sessions.filter((session) => session.isActive && !session.revokedAt).length ? (
          <div className="security-session-list">
            {data.sessions.filter((session) => session.isActive && !session.revokedAt).map((session) => (
              <div className="security-session-row" key={session.id}>
                <span className="security-key-icon"><PortalIcon name="monitor" /></span>
                <span className="security-session-info"><b>{session.isCurrent ? t("This device · Current session") : t("Signed-in device")}</b><small>{session.ipAddress || t("IP unavailable")} · {session.userAgent ? session.userAgent.slice(0, 100) : t("Device details unavailable")}</small><small>{t("Last seen")} {new Date(session.lastSeenAt).toLocaleString()} · {t("Expires")} {new Date(session.expiresAt).toLocaleDateString()}</small></span>
                {session.isCurrent ? <span className="preference-enabled">{t("Current")}</span> : <button className="portal-button portal-button-danger-quiet portal-button-small" disabled={busy} onClick={() => void revokeSession(session.id)} type="button">{t("Revoke")}</button>}
              </div>
            ))}
          </div>
        ) : <EmptyState description={t("Signed-in sessions will appear here.")} title={t("No active sessions")} />}
      </Panel>

      <Panel id="recovery" title="Recovery & emergency codes">
        <p className="panel-description">{t("Recovery codes are one-time backups for signing in if you cannot access your authenticator. Each code is shown only when generated.")}</p>
        {overview?.totpEnabled ? (
          <>
            <div className="recovery-status"><div><small>{t("UNUSED CODES")}</small><b>{overview.recoveryCodesRemaining} <span>{t("remaining")}</span></b></div><div><small>{t("CODE TYPE")}</small><b>{t("One-time")}</b></div><div><small>{t("STORAGE")}</small><b>{t("Hashed")}</b></div></div>
            <form className="security-form security-recovery-form" onSubmit={rotateCodes}>
              <label>{t("Confirm with your password")}<input autoComplete="current-password" onChange={(event) => setRecoveryPassword(event.target.value)} required type="password" value={recoveryPassword} /></label>
              <button className="portal-button portal-button-secondary" disabled={busy} type="submit">{t("Generate new codes")}</button>
            </form>
          </>
        ) : <EmptyState description={t("Enable two-factor authentication to generate recovery codes.")} title={t("Recovery codes unavailable")} />}
        {recoveryCodes ? (
          <div className="security-recovery-codes" role="status">
            <div><strong>{t("Save these codes now")}</strong><p>{t("They will not be shown again. Generating a new set invalidates any previous codes.")}</p></div>
            <div className="security-recovery-grid">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
            <button className="portal-button portal-button-secondary" onClick={() => { void navigator.clipboard.writeText(recoveryCodes.join("\n")); setNotice({ type: "success", text: "Recovery codes copied to clipboard." }); }} type="button">{t("Copy recovery codes")}</button>
            <button className="portal-button portal-button-secondary" onClick={() => setRecoveryCodes(null)} type="button">{t("I have saved them")}</button>
          </div>
        ) : null}
      </Panel>
    </AuthenticatedShell>
  );
}
