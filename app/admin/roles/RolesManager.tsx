"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { assignAdminUserRole, createAdminRole, type AdminRoleUserItem, type AdminRoleItem } from "../actions";

type MenuPosition = { top: number; left: number; width: number };

export function RolesManager({ roles, users }: { roles: AdminRoleItem[]; users: AdminRoleUserItem[] }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [openRolesUserId, setOpenRolesUserId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [pendingAssignment, setPendingAssignment] = useState<{ user: AdminRoleUserItem; role: AdminRoleItem; assign: boolean } | null>(null);
  const router = useRouter();
  const filtered = useMemo(() => users.filter((user) => [user.displayName, user.username, user.userId].some((v) => v?.toLowerCase().includes(query.toLowerCase().trim()))), [users, query]);
  const openUser = users.find((user) => user.userId === openRolesUserId) ?? null;
  const openAssignableRoles = roles.filter((role) => role.roleType === "ORGANIZATION" && !role.isSystem);

  function run(action: () => Promise<unknown>, success: string) {
    setNotice("");
    startTransition(() => void action().then(() => { setNotice(success); router.refresh(); }).catch((error: unknown) =>
      setNotice(error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "Action failed.")));
  }
  function createRole() {
    run(async () => { await createAdminRole({ name, description }); setName(""); setDescription(""); }, "Role created.");
  }
  function toggle(user: AdminRoleUserItem, role: AdminRoleItem, assign: boolean) {
    setPendingAssignment({ user, role, assign });
  }
  function toggleDropdown(user: AdminRoleUserItem, button: HTMLButtonElement) {
    if (openRolesUserId === user.userId) {
      setOpenRolesUserId(null);
      setMenuPosition(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = Math.max(190, rect.width);
    const menuHeight = Math.min(openAssignableRoles.length * 43 + 12, window.innerHeight - 24);
    setMenuPosition({
      top: Math.max(12, rect.top - menuHeight - 8),
      left: Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)),
      width: menuWidth,
    });
    setOpenRolesUserId(user.userId);
  }
  function confirmAssignment() {
    if (!pendingAssignment || busy) return;
    const { user, role, assign } = pendingAssignment;
    setPendingAssignment(null);
    setOpenRolesUserId(null);
    setMenuPosition(null);
    run(() => assignAdminUserRole(user.userId, role.id, assign), `Role ${assign ? "assigned" : "removed"}.`);
  }

  return <div className="admin-management">
    {notice ? <div className="admin-notice" role="status">{notice}</div> : null}
    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">ROLE CATALOGUE</p><h2>Database roles</h2><p>Roles currently defined in OneAuth&apos;s roles table.</p></div><span className="admin-count">{roles.length} roles</span></div>
      <div className="admin-role-catalogue">{roles.map((role) => <article key={role.id} className="admin-role-card">
        <div><strong>{role.name}</strong><span className="admin-status">{role.roleType}</span></div>
        <p>{role.description || "No description provided."}</p>
        <small>{role.organizationName || (role.isSystem ? "System-wide role definition" : "No organization")}</small>
      </article>)}
      {!roles.length ? <p className="admin-table-footnote">No roles are defined in the database yet.</p> : null}</div>
    </section>

    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">CREATE ROLE</p><h2>New role</h2><p>Create a role definition without selecting an organization.</p></div></div>
      <div className="admin-profile-form">
        <label>Role name<input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Billing manager" /></label>
        <label className="admin-profile-form-wide">Description<input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" /></label>
        <div className="admin-profile-form-wide"><button className="admin-row-action" disabled={busy || !name.trim()} onClick={createRole} type="button">Create role</button></div>
      </div>
    </section>

    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">ASSIGNMENTS</p><h2>Membership roles</h2><p>Assign or remove roles directly on any active user account.</p></div></div>
      <label className="admin-table-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users by name, username, or ID…" /></label>
      <div className="admin-users-table-wrap"><table className="admin-users-table">
        <thead><tr><th>User</th><th>Account status</th><th>Assigned roles</th><th>Available roles</th></tr></thead>
        <tbody>{filtered.map((user) => {
          const assignableRoles = roles.filter((role) => role.roleType === "ORGANIZATION" && !role.isSystem);
          const assigned = user.roleIds ? user.roleIds.split(",") : [];
          return <tr key={user.userId}>
            <td><div className="admin-user-identity">{user.avatarUrl ? <Image className="admin-user-avatar" src={user.avatarUrl} alt="" width={38} height={38} unoptimized /> : <span className="admin-user-avatar admin-user-avatar-fallback">{(user.displayName || user.username || "?").slice(0, 1).toUpperCase()}</span>}<span><strong>{user.displayName || "Unnamed user"}</strong><span>@{user.username || "no-username"}</span></span></div></td>
            <td><span className="admin-status">{user.status}</span></td>
            <td>{user.roleNames || "No roles"}</td>
            <td><div className="oneauth-role-dropdown">
              <button aria-expanded={openRolesUserId === user.userId} aria-haspopup="true" className="oneauth-role-dropdown-trigger" disabled={busy || user.status !== "ACTIVE" || !assignableRoles.length} onClick={(event) => toggleDropdown(user, event.currentTarget)} type="button">
                Manage roles <span aria-hidden="true">{openRolesUserId === user.userId ? "⌃" : "⌄"}</span>
              </button>
              {!assignableRoles.length ? <span className="admin-table-footnote">No assignable roles</span> : null}
            </div></td>
          </tr>;
        })}
        {!filtered.length ? <tr><td colSpan={4}>No users match your search.</td></tr> : null}</tbody>
      </table></div>
      <p className="admin-table-footnote">Role assignments are stored per user in the database. System roles remain protected and cannot be assigned through this screen.</p>
    </section>
    {openUser && menuPosition && openRolesUserId ? createPortal(<div className="oneauth-role-dropdown-menu oneauth-role-dropdown-portal" role="group" aria-label={`Available roles for ${openUser.displayName || openUser.username || "user"}`} style={{ position: "fixed", top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}>
      {openAssignableRoles.map((role) => {
        const assigned = openUser.roleIds ? openUser.roleIds.split(",").includes(role.id) : false;
        return <label className="oneauth-role-dropdown-option" key={role.id}>
          <input type="checkbox" checked={assigned} disabled={busy} onChange={(event) => toggle(openUser, role, event.target.checked)} />
          <span>{role.name}</span>{assigned ? <small>Assigned</small> : null}
        </label>;
      })}
    </div>, document.body) : null}
    {pendingAssignment ? <div className="oneauth-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPendingAssignment(null); }}>
      <section aria-labelledby="role-confirm-title" aria-describedby="role-confirm-description" aria-modal="true" className="oneauth-dialog" role="dialog">
        <span className="oneauth-dialog-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></svg></span>
        <p className="portal-eyebrow">CONFIRM ROLE CHANGE</p>
        <h2 id="role-confirm-title">{pendingAssignment.assign ? "Assign role?" : "Remove role?"}</h2>
        <p id="role-confirm-description">You are about to {pendingAssignment.assign ? "assign" : "remove"} <strong>{pendingAssignment.role.name}</strong> {pendingAssignment.assign ? "to" : "from"} <strong>{pendingAssignment.user.displayName || pendingAssignment.user.username || "this user"}</strong>.</p>
        <div className="oneauth-dialog-actions">
          <button className="admin-row-action oneauth-dialog-secondary" disabled={busy} onClick={() => setPendingAssignment(null)} type="button">Cancel</button>
          <button className="admin-row-action oneauth-dialog-primary" disabled={busy} onClick={confirmAssignment} type="button">{busy ? "Working…" : pendingAssignment.assign ? "Assign role" : "Remove role"}</button>
        </div>
      </section>
    </div> : null}
  </div>;
}
