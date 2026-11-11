"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="portal-page-heading">
      <div>
        <p className="portal-eyebrow">{t(eyebrow)}</p>
        <h1>{t(title)}</h1>
        <p className="portal-description">{t(description)}</p>
      </div>
      {actions ? <div className="portal-heading-actions">{actions}</div> : null}
    </div>
  );
}

export function PortalIcon({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "shield-check":
      return <svg {...common}><path d="M12 3 19 6v5c0 4.5-2.9 7.8-7 10-4.1-2.2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "activity":
      return <svg {...common}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
    case "bell":
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
    case "mail":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
    case "image-plus":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21m11-13V2m-3 3h6" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" /></svg>;
    case "key-round":
      return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></svg>;
    case "app-window":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></svg>;
    case "monitor":
      return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></svg>;
    case "book-open":
      return <svg {...common}><path d="M12 7v14m0-14C9 4.5 5.5 4 3 5v14c3-1 6.5-.5 9 2m0-14c3-2.5 6.5-3 9-2v14c-3-1-6.5-.5-9 2" /></svg>;
    case "users":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.5a4 4 0 0 1 0 7.8m3 9.7v-2a4 4 0 0 0-3-3.87" /></svg>;
    case "user-round":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
    case "search":
      return <svg {...common}><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
    case "refresh-cw":
      return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></svg>;
    case "chevron-right":
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
    case "shield-off":
      return <svg {...common}><path d="M4.5 4.5 19.5 19.5M12 3 19 6v5c0 2.1-.7 4-1.8 5.6M6.2 6.2 5 6.7v4.3c0 4.5 2.9 7.8 7 10 .9-.5 1.8-1.1 2.5-1.7" /></svg>;
    case "alert-circle":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></svg>;
    case "copy":
      return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
  }
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  const { t } = useTranslation();

  return (
    <article className="portal-card portal-metric-card">
      <div className="portal-metric-label">
        <span>{t(label)}</span>
        <span aria-hidden="true" className="portal-metric-icon">
          <PortalIcon name={icon} />
        </span>
      </div>
      <p className="portal-metric-value">{value}</p>
      <p className="portal-metric-detail">{t(detail)}</p>
    </article>
  );
}

export function Panel({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const { t } = useTranslation();

  return (
    <section className="portal-card portal-panel" id={id}>
      <div className="portal-panel-heading">
        <h2>{t(title)}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="portal-empty-state">
      <span aria-hidden="true">—</span>
      <h3>{t(title)}</h3>
      <p>{t(description)}</p>
    </div>
  );
}
