"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { getDeveloperClients, registerDeveloperClient, type DeveloperClient } from "../actions";
import { AuthenticatedShell } from "../../components/AuthenticatedShell";
import { EmptyState, MetricCard, PageHeading, Panel } from "../../components/PortalUI";

type ClientType = "WEB" | "SPA_PUBLIC" | "NATIVE" | "DESKTOP" | "CLI" | "SERVICE";
type Environment = "DEVELOPMENT" | "PRODUCTION";
const clientTypeLabels: Record<ClientType,string> = {
  WEB:"Web application (confidential)", SPA_PUBLIC:"Single-page app (public / PKCE)",
  NATIVE:"Native mobile app (PKCE)", DESKTOP:"Desktop app (PKCE)", CLI:"CLI / device-based app",
  SERVICE:"Server-to-server service"
};

export default function DeveloperPage() {
  const [clients,setClients]=useState<DeveloperClient[]>([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [clientType,setClientType]=useState<ClientType>("WEB");
  const [environment,setEnvironment]=useState<Environment>("DEVELOPMENT");
  const [redirectUris,setRedirectUris]=useState("https://example.com/auth/callback");
  const [error,setError]=useState("");
  const [newCredentials,setNewCredentials]=useState<{clientId:string;clientSecret:string|null;clientType:string;environment:Environment}|null>(null);
  const [scopes,setScopes] = useState<string[]>(["openid","profile","email"]);
  const [isPending,startTransition] = useTransition();

  async function refresh() {
    setLoading(true);
    try { setClients(await getDeveloperClients()); setError(""); }
    catch { setError("Could not load your applications. Please sign in again and retry."); }
    finally { setLoading(false); }
  }
  useEffect(()=>{
    let active=true;
    getDeveloperClients().then(items=>{if(active)setClients(items)})
      .catch(()=>{if(active)setError("Could not load your applications. Please sign in again and retry.")})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[]);

  function submit() {
    setError("");
    startTransition(async()=>{
      try {
        const result=await registerDeveloperClient({name,description,clientType,environment,scopes,redirectUris:redirectUris.split("\n").map(uri=>uri.trim()).filter(Boolean)});
        setNewCredentials(result);
        setShowForm(false);
        setName("");
        setDescription("");
        await refresh();
      } catch(cause) {
        setError(cause instanceof Error?cause.message.replaceAll("_"," "):"Could not register application.");
      }
    });
  }

  return <AuthenticatedShell activeLabel="Applications" activePath="/developer/applications">
    <PageHeading actions={<><a className="portal-button portal-button-secondary" href="/developer/oidc" target="_blank" rel="noreferrer">OIDC discovery</a><button className="portal-button portal-button-primary" onClick={()=>setShowForm(true)} type="button">Register application</button></>} description="Create and manage organization-owned applications with isolated development and production credentials." eyebrow="DEVELOPER PORTAL" title="Applications"/>
    <div className="portal-metrics-grid portal-developer-metrics">
      <MetricCard detail="Registered to your organization" icon="app-window" label="Applications" value={loading?"…":String(clients.length)}/>
      <MetricCard detail="Active OAuth clients" icon="key-round" label="OAuth clients" value={loading?"…":String(clients.filter(client=>client.isActive).length)}/>
      <MetricCard detail="OpenID Connect metadata" icon="shield-check" label="OIDC discovery" value="Configured by deployment"/>
    </div>
    <Panel title="Registered applications" action={<button className="portal-button portal-button-secondary portal-button-small" type="button" onClick={()=>void refresh()}>Refresh</button>} id="clients">
      {error?<p role="alert" className="portal-error">{error}</p>:null}
      {loading?<p className="portal-muted">Loading your applications…</p>:clients.length===0?<EmptyState title="No applications registered" description="Register your first OAuth application to get a client ID and configure its callback URLs."/>:
        <div className="developer-client-list">{clients.map(client=><article className="portal-card developer-client-card" key={client.id}>
          <div className="developer-client-heading"><div><h3><Link href={`/developer/applications/${client.id}`}>{client.name}</Link></h3><p>{client.description||"No description provided"}</p></div><span className={client.isActive?"portal-status portal-status-active":"portal-status"}>{client.isActive?"Active":"Disabled"}</span></div>
          <dl><div><dt>Client ID</dt><dd><code>{client.clientId}</code></dd></div><div><dt>Application type</dt><dd>{clientTypeLabels[client.clientType as ClientType]||client.clientType}</dd></div><div><dt>Environment</dt><dd>{client.environment==="PRODUCTION"?"Production":"Development"}</dd></div><div><dt>Scopes</dt><dd>{client.scopes.length?client.scopes.join(", "):"No scopes configured"}</dd></div><div><dt>Redirect URIs</dt><dd>{client.redirectUris.length?client.redirectUris.map(uri=><code className="developer-redirect-uri" key={uri}>{uri}</code>):"None configured"}</dd></div></dl>
        </article>)}</div>}
    </Panel>
    <div className="developer-content-grid">
      <Panel title="OpenID Connect discovery"><p className="portal-description">Discovery document endpoint</p><code className="developer-endpoint">/.well-known/openid-configuration</code><p className="portal-muted">The discovery document is available only after the deployment issuer and signing key are configured.</p></Panel>
      <Panel title="Recommended OAuth setup"><ol className="developer-steps"><li>Register a separate Development and Production client.</li><li>Use Authorization Code with PKCE (S256) for user sign-in.</li><li>Request only the scopes your app needs, such as <code>openid profile email</code>.</li><li>Validate issuer, audience, state, nonce, and token signatures.</li></ol></Panel>
    </div>
    {showForm?<div className="developer-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowForm(false)}}>
      <section className="developer-modal portal-card" role="dialog" aria-modal="true" aria-labelledby="register-app-title">
        <div className="developer-modal-heading"><div><p className="portal-eyebrow">OAUTH CLIENT REGISTRATION</p><h2 id="register-app-title">Register application</h2></div><button type="button" className="portal-icon-button" onClick={()=>setShowForm(false)} aria-label="Close">×</button></div>
        <label>Application name<input value={name} maxLength={100} onChange={event=>setName(event.target.value)} placeholder="My ChatGPT integration" required/></label>
        <label>Description <span className="portal-muted">(optional)</span><textarea value={description} maxLength={500} onChange={event=>setDescription(event.target.value)} placeholder="What will this application do?" rows={3}/></label>
        <label>Application type<select value={clientType} onChange={event=>setClientType(event.target.value as ClientType)}>{Object.entries(clientTypeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Environment<select value={environment} onChange={event=>setEnvironment(event.target.value as Environment)}><option value="DEVELOPMENT">Development</option><option value="PRODUCTION">Production</option></select></label>
        <label>Redirect URIs <span className="portal-muted">(one per line)</span><textarea value={redirectUris} onChange={event=>setRedirectUris(event.target.value)} rows={3} required/></label>
        <fieldset><legend>Allowed scopes</legend>{[["openid","OpenID Connect sign-in"],["profile","Basic profile, including profile picture"],["email","Email address"],["users:read","Read users"],["users:write","Write users"],["oauth:read","Read OAuth clients"],["oauth:write","Manage OAuth clients"],["mcp:connect","Connect to MCP"],["offline_access","Refresh tokens"],["custom_data:read","Read specifically granted custom-data fields"],["custom_data:write","Write this app's private custom data"]].map(([scope,label])=><label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={event=>setScopes(old=>event.target.checked?[...old,scope]:old.filter(item=>item!==scope))}/>{label}</label>)}</fieldset>
        <p className="portal-muted">Production callbacks must use HTTPS. HTTP localhost callbacks are permitted only for development clients. Public clients use PKCE and do not receive a client secret.</p>
        {error?<p className="portal-error" role="alert">{error}</p>:null}
        <div className="developer-modal-actions"><button className="portal-button portal-button-secondary" type="button" onClick={()=>setShowForm(false)}>Cancel</button><button className="portal-button portal-button-primary" type="button" disabled={isPending||!name.trim()||!redirectUris.trim()} onClick={submit}>{isPending?"Registering…":"Register application"}</button></div>
      </section>
    </div>:null}
    {newCredentials?<div className="developer-modal-backdrop"><section className="developer-modal portal-card" role="dialog" aria-modal="true" aria-labelledby="credentials-title">
      <p className="portal-eyebrow">APPLICATION CREATED</p><h2 id="credentials-title">Save your client credentials</h2>
      <p className="portal-muted">Environment: {newCredentials.environment==="PRODUCTION"?"Production":"Development"}. The client ID is shown again in your app list. If a client secret was issued, copy it now; it will not be shown again.</p>
      <label>Client ID<div className="developer-copy-field"><code>{newCredentials.clientId}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(newCredentials.clientId)}>Copy</button></div></label>
      {newCredentials.clientSecret?<label>Client secret<div className="developer-copy-field"><code>{newCredentials.clientSecret}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(newCredentials.clientSecret!)}>Copy</button></div></label>:<p className="portal-muted">Public client: no client secret. Use PKCE (S256).</p>}
      <div className="developer-modal-actions"><button className="portal-button portal-button-primary" type="button" onClick={()=>setNewCredentials(null)}>I&apos;ve saved these</button></div>
    </section></div>:null}
  </AuthenticatedShell>;
}
