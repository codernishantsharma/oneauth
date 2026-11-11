"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { deleteAdminUser, setAdminUserStatus, updateAdminUserProfile, type AdminUserDetails } from "../../actions";

export function UserAccount({ initialUser }: { initialUser: AdminUserDetails }) {
  const [user, setUser] = useState(initialUser);
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [locale, setLocale] = useState(user.locale ?? "");
  const [timeZone, setTimeZone] = useState(user.timeZone ?? "");
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const router = useRouter();

  function run(action: () => Promise<unknown>, message: string) {
    setNotice("");
    startTransition(() => void action().then(() => { setNotice(message); router.refresh(); }).catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "Action failed.")));
  }

  function saveProfile() {
    run(async () => {
      await updateAdminUserProfile({ userId: user.id, displayName, username, avatarUrl, locale, timeZone });
      setUser({ ...user, displayName: displayName || null, username: username || null, avatarUrl: avatarUrl || null, locale: locale || null, timeZone: timeZone || null });
    }, "Profile updated.");
  }

  function changeStatus() {
    const next = user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (next === "SUSPENDED" && !window.confirm("Suspend this account and revoke all active sessions?")) return;
    run(async () => { await setAdminUserStatus(user.id, next); setUser({ ...user, status: next, activeSessions: next === "SUSPENDED" ? 0 : user.activeSessions }); }, `Account ${next.toLowerCase()}.`);
  }

  function deleteAccount() {
    if (!window.confirm("Soft-delete this account? Sessions, access tokens, refresh tokens, and OAuth consents will be revoked. This cannot be undone from this screen.")) return;
    run(async () => { await deleteAdminUser(user.id); router.push("/admin/users"); }, "Account deleted.");
  }

  return <div className="admin-management">
    {notice ? <div className="admin-notice" role="status">{notice}</div> : null}
    <section className="portal-card admin-profile-card">
      <div className="admin-profile-hero">
        {user.avatarUrl ? <Image className="admin-user-avatar admin-user-avatar-large" src={user.avatarUrl} alt="" width={66} height={66} unoptimized /> : <span className="admin-user-avatar admin-user-avatar-large admin-user-avatar-fallback">{(user.displayName || user.username || "?").slice(0, 1).toUpperCase()}</span>}
        <div><p className="portal-eyebrow">ACCOUNT PROFILE</p><h2>{user.displayName || "Unnamed user"}</h2><p>@{user.username || "no-username"} · {user.id}</p></div>
        <span className={`admin-status admin-status-${user.status.toLowerCase()}`}>{user.status}</span>
      </div>
      <div className="admin-profile-stats">
        <div><span>Email verification</span><strong>{user.emailVerified ? "Verified" : "Unverified"}</strong></div>
        <div><span>Passkeys</span><strong>{user.passkeyCount}</strong></div>
        <div><span>Authenticator 2FA</span><strong>{user.totpEnabled ? "Enabled" : "Disabled"}</strong></div>
        <div><span>Recovery codes left</span><strong>{user.recoveryCodesRemaining}</strong></div>
        <div><span>Active sessions</span><strong>{user.activeSessions}</strong></div>
        <div><span>Last login</span><strong>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never recorded"}</strong></div>
      </div>
    </section>

    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">EDITABLE FIELDS</p><h2>Profile details</h2><p>Email address is intentionally hidden and cannot be changed here.</p></div></div>
      <div className="admin-profile-form">
        <label>Display name<input maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label>Username<input maxLength={40} value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label className="admin-profile-form-wide">Avatar image URL<input type="url" placeholder="https://…" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} /></label>
        <label>Locale<input maxLength={20} placeholder="en" value={locale} onChange={(e) => setLocale(e.target.value)} /></label>
        <label>Time zone<input maxLength={80} placeholder="Asia/Kolkata" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} /></label>
        <div className="admin-profile-form-wide"><button className="admin-row-action" disabled={busy} onClick={saveProfile} type="button">Save profile changes</button></div>
      </div>
    </section>

    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">ACCOUNT CONTROLS</p><h2>Access and lifecycle</h2><p>Account status changes invalidate sessions when suspended.</p></div></div>
      <div className="admin-danger-actions">
        <div><strong>{user.status === "SUSPENDED" ? "Reactivate account" : "Suspend account"}</strong><p>{user.status === "SUSPENDED" ? "Allow the account to sign in again." : "Block sign-in and revoke active sessions."}</p></div>
        <button className="admin-row-action" disabled={busy || user.status === "DELETED"} onClick={changeStatus} type="button">{user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}</button>
      </div>
      <div className="admin-danger-actions admin-danger-zone">
        <div><strong>Delete account</strong><p>Soft-delete the account and revoke sessions, OAuth tokens, and consents. Database records are retained for integrity and audit.</p></div>
        <button className="admin-row-action admin-row-action-danger" disabled={busy || user.status === "DELETED"} onClick={deleteAccount} type="button">Delete account</button>
      </div>
    </section>

    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">ORGANIZATION ACCESS</p><h2>Memberships & roles</h2><p>Roles shown here are assigned within organizations.</p></div></div>
      {user.organizationMemberships.length ? <div className="admin-users-table-wrap"><table className="admin-users-table"><thead><tr><th>Organization</th><th>Membership</th><th>Roles</th></tr></thead><tbody>{user.organizationMemberships.map((membership, index) => <tr key={membership.name + index}><td>{membership.name}</td><td>{membership.status}</td><td>{membership.roles.length ? membership.roles.join(", ") : "No roles assigned"}</td></tr>)}</tbody></table></div> : <p className="admin-table-footnote">This user has no organization memberships.</p>}
      <p className="admin-table-footnote">Manage assignments on <a href="/admin/roles">Roles & permissions</a>. Email is never displayed.</p>
    </section>
  </div>;
}
