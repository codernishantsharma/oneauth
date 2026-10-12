"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Permission = { scope: string; label: string; optional: boolean };
type AuthorizePayload = {
  client: { name: string; clientId: string };
  account: { email: string };
  permissions: Permission[];
  request: { clientId: string; redirectUri: string; state: string; challenge: string; nonce: string; resource: string; scopes: string; csrf: string };
};

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const query = useMemo(() => searchParams.toString(), [searchParams]);
  const [data, setData] = useState<AuthorizePayload | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/oauth/authorize?${query}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Unable to load the authorization request.");
        return payload as AuthorizePayload;
      })
      .then(payload => { setData(payload); setSelected(payload.permissions.filter(permission => permission.optional).map(permission => permission.scope)); })
      .catch(reason => { if (reason.name !== "AbortError") setError(reason.message || "Unable to load the authorization request."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query]);

  async function decide(decision: "approve" | "deny") {
    if (!data || submitting) return;
    setSubmitting(true); setError("");
    try {
      const form = new URLSearchParams({
        ...data.request,
        decision,
      });
      for (const scope of selected) form.append("field_scope", scope);
      const response = await fetch("/api/oauth/authorize", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "OneAuth could not process your decision.");
      if (typeof payload.redirect !== "string") throw new Error("OneAuth returned an invalid authorization response.");
      window.location.assign(payload.redirect);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "OneAuth could not process your decision.");
      setSubmitting(false);
    }
  }

  return <main className="oauth-shell">
    <div className="oauth-brand"><span className="oauth-mark">O</span><span>OneAuth <span className="oauth-brand-muted">· Secure authorization</span></span></div>
    <section className="oauth-card" aria-labelledby="oauth-title">
      {loading ? <div className="oauth-content"><div className="oauth-spinner" aria-label="Loading" /><p className="oauth-muted">Verifying authorization request…</p></div> : error && !data ? <div className="oauth-content"><p className="oauth-eyebrow">Permission request</p><h1 id="oauth-title">Unable to authorize</h1><p className="oauth-intro">{error}</p><a className="oauth-secondary-link" href="/">Return to OneAuth</a></div> : data ? <div className="oauth-content">
        <p className="oauth-eyebrow">Permission request</p>
        <h1 id="oauth-title">Authorize this application</h1>
        <p className="oauth-intro">Review what this application can access before continuing. You stay in control of your account.</p>
        <div className="oauth-app"><div className="oauth-app-icon" aria-hidden="true">{data.client.name.slice(0, 1).toUpperCase()}</div><div className="oauth-app-details"><div className="oauth-app-name">{data.client.name}</div><div className="oauth-client-id">Client ID · {data.client.clientId}</div></div></div>
        <p className="oauth-section-title">Requested permissions</p>
        <ul className="oauth-permissions">{data.permissions.map(permission => <li key={permission.scope}>
          {permission.optional ? <label className="oauth-optional"><input type="checkbox" checked={selected.includes(permission.scope)} onChange={event => setSelected(current => event.target.checked ? [...current, permission.scope] : current.filter(scope => scope !== permission.scope))} /><span>{permission.label}</span></label> : <><span className="oauth-check" aria-hidden="true">✓</span><span>{permission.label}</span></>}
        </li>)}</ul>
        {data.permissions.some(permission => permission.optional) && <p className="oauth-field-note">Uncheck any custom-data fields you do not want to share. Only selected fields will be granted.</p>}
        <div className="oauth-account">Signed in as <strong>{data.account.email}</strong></div>
        {error && <p className="oauth-error" role="alert">{error}</p>}
        <div className="oauth-actions"><button className="oauth-primary" disabled={submitting} onClick={() => decide("approve")}>{submitting ? "Processing…" : "Allow access"}</button><button className="oauth-secondary" disabled={submitting} onClick={() => decide("deny")}>Deny</button></div>
      </div> : null}
      <footer className="oauth-footer">Only grant access to applications you trust. You can revoke access in OneAuth settings.</footer>
    </section>
    <style jsx>{`
      .oauth-shell{width:min(100% - 32px,480px);margin:auto;padding:36px 0;color:#18181b}
      .oauth-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 22px;color:#52525b;font-size:14px;font-weight:650;letter-spacing:.02em}
      .oauth-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:11px;background:#18181b;color:white;font-weight:800}
      .oauth-brand-muted{font-weight:450;color:#a1a1aa}.oauth-card{overflow:hidden;border:1px solid #e4e4e7;border-radius:24px;background:white;box-shadow:0 24px 70px #18181b0d}
      .oauth-content{padding:30px}.oauth-eyebrow{margin:0 0 10px;color:#71717a;font-size:12px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}
      h1{margin:0;font-size:27px;line-height:1.2;letter-spacing:-.04em}.oauth-intro{margin:12px 0 22px;color:#52525b;font-size:14px;line-height:1.55}.oauth-muted{color:#71717a;text-align:center}
      .oauth-app{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e4e4e7;border-radius:16px;background:#fafafa;margin:0 0 22px}.oauth-app-icon{display:grid;place-items:center;flex:0 0 42px;height:42px;border-radius:13px;background:#e4e4e7;font-weight:800;font-size:18px}.oauth-app-details{min-width:0}.oauth-app-name{font-weight:700;overflow-wrap:anywhere}.oauth-client-id{margin-top:4px;color:#71717a;font-size:12px;overflow-wrap:anywhere}
      .oauth-section-title{margin:0 0 10px;font-size:13px;font-weight:750;color:#3f3f46}.oauth-permissions{list-style:none;display:grid;gap:9px;margin:0 0 20px;padding:0}.oauth-permissions li{display:flex;align-items:flex-start;gap:10px;padding:11px 12px;border:1px solid #e4e4e7;border-radius:12px;font-size:13px;line-height:1.45}.oauth-check{display:grid;place-items:center;flex:0 0 20px;height:20px;border-radius:7px;background:#e4e4e7;font-size:12px;font-weight:800}.oauth-optional{display:flex;align-items:flex-start;gap:9px;width:100%;cursor:pointer}.oauth-optional input{margin:3px 0 0;accent-color:#18181b}.oauth-field-note{margin:-8px 0 18px;color:#71717a;font-size:12px}
      .oauth-account{padding:12px 14px;border-radius:12px;background:#f4f4f5;font-size:13px;color:#52525b}.oauth-account strong{color:#18181b;overflow-wrap:anywhere}.oauth-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
      button{min-height:46px;padding:12px 16px;border:1px solid #18181b;border-radius:12px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:transform .12s,background .12s}button:active{transform:scale(.99)}button:disabled{opacity:.55;cursor:wait}.oauth-primary{background:#18181b;color:white}.oauth-primary:hover:not(:disabled){background:#3f3f46}.oauth-secondary{display:inline-flex;align-items:center;justify-content:center;background:white;color:#27272a}.oauth-secondary:hover:not(:disabled){background:#f4f4f5}.oauth-secondary-link{color:#27272a;font-size:14px}
      .oauth-footer{padding:16px 24px;border-top:1px solid #f0f0f1;color:#71717a;font-size:12px;text-align:center;line-height:1.5}.oauth-error{padding:10px 12px;border-radius:10px;background:#fef2f2;color:#991b1b;font-size:13px}.oauth-spinner{width:28px;height:28px;margin:10px auto;border:3px solid #e4e4e7;border-top-color:#18181b;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
      @media(max-width:420px){.oauth-content{padding:22px}h1{font-size:24px}.oauth-actions{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
    `}</style>
  </main>;
}

export default function AuthorizePage() {
  return <Suspense fallback={<main className="mx-auto w-full max-w-md p-8 text-center text-sm text-zinc-500">Loading authorization…</main>}><AuthorizeContent /></Suspense>;
}
