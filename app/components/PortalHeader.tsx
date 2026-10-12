"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { getPortalHeaderUser } from "@/app/actions";
import type { PortalUser } from "./AuthenticatedShell";
import { LanguagePicker } from "./LanguagePicker";

type PortalHeaderProps = { initialUser?: PortalUser | null };

export function PortalHeader({ initialUser = null }: PortalHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(initialUser);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (initialUser?.role) return;
    let cancelled = false;
    getPortalHeaderUser().then((currentUser) => {
      if (!cancelled && currentUser) setUser(currentUser);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [initialUser]);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  const displayName = user?.displayName || user?.username || user?.email || t("Account");
  return (
    <header className="portal-header">
      <Link aria-label={t("OneAuth overview")} className="portal-brand" href="/dashboard">
        <img
          alt=""
          aria-hidden="true"
          className="portal-brand-favicon"
          height={32}
          src="/favicon.ico"
          width={32}
        />
        <span>OneAuth</span>
        <span className="portal-brand-tag">{t("IDENTITY PLATFORM")}</span>
      </Link>
      <label className="portal-search">
        <span aria-hidden="true">⌕</span>
        <input aria-label={t("Search OneAuth")} placeholder={t("Search settings, passkeys, OAuth apps, logs...")} type="search" />
        <kbd>⌘ K</kbd>
      </label>
      <LanguagePicker className="portal-language-picker" />
      <div className="portal-header-actions">
        {user?.role === "ADMIN" ? <Link className="portal-mode portal-admin-mode" href="/admin">{t("Admin")}</Link> : null}
        {user?.avatarUrl && !avatarFailed ? <img className="portal-avatar portal-avatar-image" src={user.avatarUrl} alt="Your profile picture" onError={() => setAvatarFailed(true)} /> : <span aria-hidden="true" className="portal-avatar">{displayName.slice(0, 1).toUpperCase()}</span>}
        <span className="portal-user-name">
          {displayName}
          <small>{user?.email ?? t("Identity portal")}</small>
        </span>
        <button className="portal-button portal-button-secondary" disabled={isLoggingOut} onClick={handleLogout} type="button">
          {isLoggingOut ? t("Signing out…") : t("Sign out")}
        </button>
      </div>
    </header>
  );
}
