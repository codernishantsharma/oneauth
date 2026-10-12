"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSecurityLog } from "../security/actions";
import type { SecurityEventListItem } from "@/src/lib/auth/security-events";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { EmptyState, PageHeading, Panel } from "../components/PortalUI";

type EventFilter = "ALL" | "SIGN_IN" | "SESSIONS" | "PASSKEYS";

function eventPresentation(eventType: string) {
  switch (eventType) {
    case "LOGIN_SUCCESS":
      return { title: "Successful sign-in", detail: "Your account was accessed successfully.", symbol: "↗", tone: "success", category: "SIGN_IN" as const };
    case "LOGIN_FAILED":
      return { title: "Failed sign-in attempt", detail: "A sign-in attempt could not be completed.", symbol: "!", tone: "danger", category: "SIGN_IN" as const };
    case "LOGOUT":
      return { title: "Signed out", detail: "You signed out of your account.", symbol: "↙", tone: "neutral", category: "SESSIONS" as const };
    case "SESSION_CREATED":
      return { title: "Session created", detail: "A new authenticated session was started.", symbol: "+", tone: "neutral", category: "SESSIONS" as const };
    case "SESSION_REVOKED":
      return { title: "Session revoked", detail: "An authenticated session was ended or revoked.", symbol: "×", tone: "neutral", category: "SESSIONS" as const };
    case "PASSKEY_ADDED":
      return { title: "Passkey added", detail: "A passkey was registered for your account.", symbol: "⌁", tone: "success", category: "PASSKEYS" as const };
    case "PASSKEY_REMOVED":
      return { title: "Passkey removed", detail: "A passkey was removed from your account.", symbol: "−", tone: "neutral", category: "PASSKEYS" as const };
    default:
      return { title: eventType.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()), detail: "A security-related event was recorded.", symbol: "•", tone: "neutral", category: "ALL" as const };
  }
}

function readableAgent(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) return "Google Chrome";
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return "Safari";
  return userAgent;
}

export default function SecurityActivityPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<SecurityEventListItem[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EventFilter>("ALL");
  const [search, setSearch] = useState("");

  const loadSecurityLog = useCallback(async () => {
    setIsLoadingEvents(true);
    setEventsError(null);
    try {
      setEvents(await getSecurityLog());
    } catch {
      setEventsError(t("Unable to load security events. Please try again."));
    } finally {
      setIsLoadingEvents(false);
    }
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(() => loadSecurityLog());
  }, [loadSecurityLog]);

  const counts = useMemo(() => ({
    ALL: events.length,
    SIGN_IN: events.filter((event) => event.eventType.startsWith("LOGIN_")).length,
    SESSIONS: events.filter((event) => ["LOGOUT", "SESSION_CREATED", "SESSION_REVOKED"].includes(event.eventType)).length,
    PASSKEYS: events.filter((event) => event.eventType.startsWith("PASSKEY_")).length,
  }), [events]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    const presentation = eventPresentation(event.eventType);
    const matchesFilter = filter === "ALL" || presentation.category === filter;
    const haystack = [presentation.title, presentation.detail, event.ipAddress, event.userAgent, ...Object.values(event.metadata ?? {}).map(String)].join(" ").toLowerCase();
    return matchesFilter && haystack.includes(search.trim().toLowerCase());
  }), [events, filter, search]);

  return (
    <AuthenticatedShell activeLabel="Security Activity" activePath="/activity">
      <PageHeading
        actions={
          <button className="portal-button portal-button-secondary" disabled={isLoadingEvents} onClick={() => void loadSecurityLog()} type="button">
            <span aria-hidden="true">{isLoadingEvents ? "…" : "↻"}</span>
            {isLoadingEvents ? t("Refreshing…") : t("Refresh activity")}
          </button>
        }
        description="A clear timeline of sign-ins, session changes, and security-sensitive actions on your account."
        eyebrow="ACCOUNT AUDIT TRAIL"
        title="Security activity"
      />

      <div className="activity-summary">
        <div className="activity-summary-icon" aria-hidden="true">◷</div>
        <div className="activity-summary-copy">
          <strong>{events.length} {events.length === 1 ? "event" : "events"} recorded</strong>
          <span>Your latest account activity, newest first</span>
        </div>
        <span className="activity-live-indicator"><i /> Account scoped</span>
      </div>

      <Panel id="security-log" title="Activity log">
        <div className="activity-toolbar">
          <label className="activity-search">
            <span aria-hidden="true">⌕</span>
            <input aria-label={t("Search security activity")} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search events, IP address, device…")} value={search} />
            {search ? <button aria-label={t("Clear search")} onClick={() => setSearch("")} type="button">×</button> : null}
          </label>
          <div aria-label={t("Filter activity")} className="activity-filters" role="group">
            {([
              ["ALL", "All activity"],
              ["SIGN_IN", "Sign-ins"],
              ["SESSIONS", "Sessions"],
              ["PASSKEYS", "Passkeys"],
            ] as const).map(([value, label]) => (
              <button aria-pressed={filter === value} className={filter === value ? "activity-filter activity-filter-active" : "activity-filter"} key={value} onClick={() => setFilter(value)} type="button">
                {t(label)} <span>{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>

        {eventsError ? (
          <div className="activity-message activity-message-error" role="alert">
            <strong>{t("Could not load activity")}</strong>
            <p>{eventsError}</p>
            <button className="portal-button portal-button-secondary" onClick={() => void loadSecurityLog()} type="button">{t("Try again")}</button>
          </div>
        ) : isLoadingEvents ? (
          <div aria-live="polite" className="activity-loading">
            <span className="activity-loading-dot" />
            <span>{t("Loading your security timeline…")}</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            description={search || filter !== "ALL" ? t("Try a different search or filter to find the event you're looking for.") : t("Sign-ins and security changes will appear here as they are recorded.")}
            title={search || filter !== "ALL" ? t("No matching activity") : t("No security events yet")}
          />
        ) : (
          <div aria-live="polite" className="activity-timeline">
            {filteredEvents.map((event) => {
              const presentation = eventPresentation(event.eventType);
              const date = new Date(event.occurredAt);
              const metadataEntries = Object.entries(event.metadata ?? {}).filter(([, value]) => value !== null && value !== "");
              return (
                <article className="activity-event" key={event.id}>
                  <div className={"activity-event-symbol activity-event-symbol-" + presentation.tone} aria-hidden="true">{presentation.symbol}</div>
                  <div className="activity-event-main">
                    <div className="activity-event-heading">
                      <div className="activity-event-title-wrap">
                        <h3>{t(presentation.title)}</h3>
                        <span className={"activity-event-tag activity-event-tag-" + presentation.tone}>{event.eventType.replaceAll("_", " ")}</span>
                      </div>
                      <time className="activity-event-time" dateTime={date.toISOString()} title={date.toLocaleString()}>
                        {date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        <span>{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                      </time>
                    </div>
                    <p className="activity-event-detail">{t(presentation.detail)}</p>
                    <div className="activity-event-meta">
                      {event.ipAddress ? <span><b aria-hidden="true">⌖</b> {event.ipAddress}</span> : null}
                      {event.userAgent ? <span title={event.userAgent}><b aria-hidden="true">▣</b> {readableAgent(event.userAgent)}</span> : null}
                      {metadataEntries.map(([key, value]) => (
                        <span className="activity-meta-chip" key={key}>{key.replaceAll("_", " ")}: {String(value)}</span>
                      ))}
                    </div>
                    {event.userAgent ? <details className="activity-device-details"><summary>{t("Device details")}</summary><code>{event.userAgent}</code></details> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!isLoadingEvents && !eventsError && filteredEvents.length > 0 ? (
          <p className="activity-list-footer">{t("Showing")} {filteredEvents.length} {t("of")} {events.length} {t("recent events · newest first")}</p>
        ) : null}
      </Panel>
    </AuthenticatedShell>
  );
}
