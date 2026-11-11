"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { deletePasskey as deletePasskeyAction, getPasskeys, getPasskeyRegistrationOptions, verifyPasskeyRegistrationAction } from "./actions";
import { EmptyState, PageHeading, Panel, PortalIcon } from "../components/PortalUI";

type Passkey = {
  id: string;
  name: string;
  deviceType: "SINGLE_DEVICE" | "MULTI_DEVICE";
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const benefits = [
  { icon: "shield-check", title: "Phishing-resistant", description: "Passkeys are tied to the real website, helping protect you from fake sign-in pages." },
  { icon: "key-round", title: "No password to remember", description: "Use your device screen lock, fingerprint, or face recognition when supported." },
  { icon: "monitor", title: "Your device stays in control", description: "Authentication uses public-key cryptography instead of sharing a reusable password." },
];

const errorMessages: Record<string, string> = {
  INVALID_ORIGIN: "This request did not come from the OneAuth website. Refresh the page and try again.",
  CHALLENGE_EXPIRED: "The registration timed out. Start again to get a fresh security challenge.",
  REGISTRATION_VERIFICATION_FAILED: "The passkey could not be verified. Please try again.",
  PASSKEY_ALREADY_REGISTERED: "This passkey is already registered to an account.",
  PASSKEY_OPTIONS_UNAVAILABLE: "OneAuth couldn't start passkey registration. Check your connection and try again.",
  PASSKEY_REGISTRATION_FAILED: "The passkey could not be saved. Please try again.",
  PASSKEY_LIST_UNAVAILABLE: "Your passkeys could not be loaded.",
  PASSKEY_REMOVE_FAILED: "The passkey could not be removed.",
  PASSKEY_NOT_FOUND: "That passkey was already removed or no longer exists.",
};

function readableError(code: string | undefined, fallback: string) {
  return (code && errorMessages[code]) || fallback;
}

export default function PasskeysPage() {
  const { t } = useTranslation();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshPasskeys = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const payload = await getPasskeys();
      if ("error" in payload) throw new Error(payload.error);
      setPasskeys(payload.passkeys);
    } catch (error) {
      setNotice({ type: "error", text: readableError(error instanceof Error ? error.message : undefined, "Your passkeys could not be loaded.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refreshPasskeys(false));
  }, [refreshPasskeys]);

  async function addPasskey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registering) return;
    setNotice(null);
    setRegistering(true);
    try {
      const optionsResult = await getPasskeyRegistrationOptions();
      if ("error" in optionsResult) throw new Error(optionsResult.error);

      const credential = await startRegistration({ optionsJSON: optionsResult.options });
      const result = await verifyPasskeyRegistrationAction(credential, name);
      if ("error" in result) throw new Error(result.error);

      setName("");
      setNotice({ type: "success", text: "Passkey added successfully. You can manage it below." });
      await refreshPasskeys();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const wasCancelled = /cancel|abort|notallowed|not allowed/i.test(message);
      setNotice({
        type: wasCancelled ? "error" : "error",
        text: wasCancelled
          ? "Passkey setup was cancelled. Nothing was changed."
          : readableError(message, "Couldn't add that passkey. Make sure your browser and device support passkeys, then try again."),
      });
    } finally {
      setRegistering(false);
    }
  }

  async function deletePasskey(passkey: Passkey) {
    if (!window.confirm(`Remove “${passkey.name}” from your OneAuth account? This device may no longer be able to use it to sign in.`)) return;
    setNotice(null);
    setRemoving(passkey.id);
    try {
      const result = await deletePasskeyAction(passkey.id);
      if ("error" in result) throw new Error(result.error);
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
      setNotice({ type: "success", text: "Passkey removed from your account." });
    } catch (error) {
      setNotice({ type: "error", text: readableError(error instanceof Error ? error.message : undefined, "The passkey could not be removed.") });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <AuthenticatedShell activeLabel="Passkeys" activePath="/passkeys">
      <PageHeading
        actions={<Link className="portal-button portal-button-secondary" href="/security"><PortalIcon name="shield-check" /> Security settings</Link>}
        description="Manage the passwordless credentials that let you sign in securely with your devices."
        eyebrow="ACCOUNT SECURITY"
        title="Passkeys"
      />

      {notice && (
        <div className={`passkeys-notice passkeys-notice-${notice.type}`} role="status" aria-live="polite">
          <PortalIcon name={notice.type === "success" ? "check-circle" : "shield-check"} />
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <section className="portal-card passkeys-intro">
        <div className="passkeys-intro-icon"><PortalIcon name="key-round" /></div>
        <div className="passkeys-intro-copy">
          <p className="portal-eyebrow">{t("PASSWORDLESS SIGN-IN")}</p>
          <h2>{t("A safer way to sign in")}</h2>
          <p>{t("Passkeys use a cryptographic key pair. Your private key stays with your device or credential provider, and OneAuth verifies sign-ins with the public key.")}</p>
          <span className="passkeys-status passkeys-status-ready"><span />{t("Registration available")}</span>
        </div>
      </section>

      <Panel title="Your registered passkeys">
        {loading ? (
          <div className="passkeys-loading" role="status">Loading your passkeys…</div>
        ) : passkeys.length === 0 ? (
          <EmptyState
            title="No passkeys registered"
            description="Add a passkey for quicker sign-in using your device&apos;s screen lock, fingerprint, face recognition, or password manager."
          />
        ) : (
          <div className="passkeys-list">
            {passkeys.map((passkey) => (
              <article className="passkeys-item" key={passkey.id}>
                <span className="passkeys-item-icon"><PortalIcon name="key-round" /></span>
                <div className="passkeys-item-copy">
                  <h3>{passkey.name}</h3>
                  <p>{passkey.deviceType === "MULTI_DEVICE" ? "Synced passkey" : "Device-bound passkey"} · {passkey.backedUp ? "Backup eligible" : "Not backed up"}</p>
                  <p>Added {new Date(passkey.createdAt).toLocaleDateString()} {passkey.lastUsedAt ? `· Last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}` : "· Not used to sign in yet"}</p>
                </div>
                <button className="portal-button portal-button-secondary passkeys-remove" type="button" disabled={removing === passkey.id} onClick={() => void deletePasskey(passkey)}>
                  {removing === passkey.id ? "Removing…" : "Remove"}
                </button>
              </article>
            ))}
          </div>
        )}

        <form className="passkeys-register-form" onSubmit={addPasskey}>
          <div className="passkeys-form-copy">
            <h3>Add a passkey</h3>
            <p>Follow your browser or device prompt to save a new passkey.</p>
          </div>
          <label className="passkeys-name-field">
            <span>Passkey name <span className="passkeys-optional">(optional)</span></span>
            <input maxLength={64} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Personal laptop" autoComplete="off" />
          </label>
          <button className="portal-button portal-button-primary" type="submit" disabled={registering || loading}>
            <PortalIcon name="key-round" /> {registering ? "Waiting for your device…" : "Add passkey"}
          </button>
        </form>
        <p className="security-footnote">Only the public key and credential metadata are stored by OneAuth. Your passkey&apos;s private key is never sent to this server.</p>
      </Panel>

      <section className="passkeys-benefits-grid" aria-label={t("Passkey benefits")}>
        {benefits.map((benefit) => (
          <article className="portal-card passkeys-benefit-card" key={benefit.title}>
            <span className="passkeys-benefit-icon"><PortalIcon name={benefit.icon} /></span>
            <h2>{t(benefit.title)}</h2>
            <p>{t(benefit.description)}</p>
          </article>
        ))}
      </section>

      <Panel title="Before you get started">
        <ul className="passkeys-checklist">
          <li><PortalIcon name="check-circle" /> Make sure your device has a screen lock enabled.</li>
          <li><PortalIcon name="check-circle" /> Keep access to your account email for recovery.</li>
          <li><PortalIcon name="check-circle" /> Add a passkey on a device you control and trust.</li>
        </ul>
      </Panel>
    </AuthenticatedShell>
  );
}
