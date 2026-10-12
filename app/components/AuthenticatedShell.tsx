"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getPortalHeaderUser } from "@/app/actions";
import { PortalIcon } from "./PortalUI";
import { PortalHeader } from "./PortalHeader";
const adminNavigation = [
  {
    label: "ADMINISTRATION",
    links: [
      { href: "/admin", activePath: "/admin", label: "Admin Overview", icon: "app-window" },
      { href: "/admin/users", activePath: "/admin/users", label: "User Management", icon: "user-round" },
      { href: "/admin/roles", activePath: "/admin/roles", label: "Roles & Permissions", icon: "shield-check" },
      { href: "/admin/notifications", activePath: "/admin/notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    label: "PLATFORM MONITORING",
    links: [
      { href: "/admin/clients", activePath: "/admin/clients", label: "OAuth Clients", icon: "key-round" },
      { href: "/admin/sessions", activePath: "/admin/sessions", label: "Active Sessions", icon: "monitor" },
      { href: "/admin/events", activePath: "/admin/events", label: "Security Events", icon: "activity" },
    ],
  },

];

const navigation = [
  {
    label: "IDENTITY & SECURITY",
    links: [
      { href: "/dashboard", activePath: "/dashboard", label: "Overview", icon: "app-window" },
      { href: "/profile", activePath: "/profile", label: "Profile", icon: "user-round" },
      { href: "/security", activePath: "/security", label: "Security & 2FA", icon: "shield-check" },
      { href: "/passkeys", activePath: "/passkeys", label: "Passkeys", icon: "key-round" },
      { href: "/security#sessions", activePath: "/security", label: "Active Sessions", icon: "monitor" },
      { href: "/apps", activePath: "/apps", label: "Connected Apps", icon: "app-window" },
      { href: "/activity", activePath: "/activity", label: "Security Activity", icon: "activity" },
      { href: "/notifications", activePath: "/notifications", label: "Notifications", icon: "bell" },
      { href: "/security#settings", activePath: "/security", label: "Settings", icon: "settings" },
    ],
  },
  {
    label: "DEVELOPER PORTAL",
    links: [
      { href: "/developer", activePath: "/developer", label: "Overview", icon: "app-window" },
      { href: "/developer/applications", activePath: "/developer/applications", label: "Applications", icon: "app-window" },
      { href: "/developer/oauth-clients", activePath: "/developer/oauth-clients", label: "OAuth Clients", icon: "key-round" },
      { href: "/developer/api-keys", activePath: "/developer/api-keys", label: "API Keys", icon: "key-round" },
      { href: "/developer/docs", activePath: "/developer/docs", label: "Documentation", icon: "book-open" },
      { href: "/developer/logs", activePath: "/developer/logs", label: "Audit Logs", icon: "activity" },
      { href: "/developer/organizations", activePath: "/developer/organizations", label: "Organizations & Team", icon: "users" },
    ],
  },
];

export type PortalUser = {
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  role?: "ADMIN" | "USER";
};

type AuthenticatedShellProps = {
  activePath: string;
  activeLabel: string;
  children: ReactNode;
  user?: PortalUser | null;
};

export function AuthenticatedShell({ activePath, children, user = null }: AuthenticatedShellProps) {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<PortalUser | null>(user);
  const isAdminArea = activePath.startsWith("/admin");
  const sidebarNavigation = isAdminArea ? adminNavigation : navigation;

  useEffect(() => {
    if (user?.role) return;
    let cancelled = false;
    getPortalHeaderUser().then((resolved) => {
      if (!cancelled && resolved) setCurrentUser(resolved);
  });
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="portal">
      <PortalHeader initialUser={currentUser} />
      <div className="portal-frame">
        <aside aria-label={t(isAdminArea ? "Admin navigation" : "Main navigation")} className={`portal-sidebar${isAdminArea ? " portal-sidebar-admin" : ""}`}>
          {isAdminArea ? <div className="admin-sidebar-heading"><span className="admin-sidebar-mark">A</span><div><strong>Admin workspace</strong><small>Platform controls</small></div></div> : null}
          <div>
            {sidebarNavigation.map((group) => (
              <div className="portal-nav-group" key={group.label}>
                <p>{t(group.label)}</p>
                <nav>
                  {group.links.map((link) => (
                    <Link aria-current={(activePath === link.activePath || (link.activePath !== "/developer" && activePath.startsWith(link.activePath + "/"))) ? "page" : undefined}
                      className={(activePath === link.activePath || (link.activePath !== "/developer" && activePath.startsWith(link.activePath + "/"))) ? "portal-nav-link portal-nav-link-active" : "portal-nav-link"}
                      href={link.href} key={link.href}>
                      <span aria-hidden="true" className="portal-nav-icon"><PortalIcon name={link.icon} /></span>
                      {t(link.label)}
                    </Link>
                  ))}
                </nav>
              </div>
            ))}
          </div>
          <div className={`portal-enclave${isAdminArea ? " portal-enclave-admin" : ""}`}><span />{t(isAdminArea ? "Admin access enabled" : "Secure enclave active")}</div>
        </aside>
        <main className="portal-content">{children}</main>
      </div>
    </div>
  );
}
