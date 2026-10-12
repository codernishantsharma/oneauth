"use client";
import { useEffect, useState, useTransition } from "react";
import { AuthenticatedShell } from "../../components/AuthenticatedShell";
import { PageHeading, Panel, EmptyState } from "../../components/PortalUI";
import { createDeveloperApiKey, getDeveloperApiKeys, revokeDeveloperApiKey, type DeveloperApiKey } from "./actions";

const availableScopes = [
  ["users:read", "Read users", "View user profiles and account details."],
  ["users:write", "Manage users", "Create or update user records where permitted."],
  ["oauth:read", "Read OAuth clients", "View registered OAuth client details."],
  ["oauth:write", "Manage OAuth clients", "Create and manage OAuth client configuration."],
  ["mcp:connect", "Connect to MCP", "Allow access to Model Context Protocol tools."],
] as const;

export default function ApiKeysPage() {
  const [keys,setKeys]=useState<DeveloperApiKey[]>([]);
  const [name,setName]=useState("");
  const [scopes,setScopes]=useState<string[]>(["users:read"]);
  const [environment,setEnvironment]=useState<"DEVELOPMENT"|"PRODUCTION">("DEVELOPMENT");
  const [expiry,setExpiry]=useState("90");
  const [newKey,setNewKey]=useState("");
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  async function refresh(){try{setKeys(await getDeveloperApiKeys())}catch{setError("Could not load API keys. Select an organization with developer access.")}}
  useEffect(()=>{getDeveloperApiKeys().then(setKeys).catch(()=>setError("Could not load API keys. Select an organization with developer access."))},[]);
  function create(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError("");setNewKey("");startTransition(async()=>{try{const result=await createDeveloperApiKey({name,scopes,environment,expiresInDays:expiry==="never"?null:Number(expiry)});setNewKey(result.key);setName("");await refresh()}catch(cause){setError(cause instanceof Error?cause.message:"Could not create API key.")}})}
  function revoke(id:string){if(!window.confirm("Revoke this API key? Any integration using it will stop working."))return;setError("");startTransition(async()=>{try{await revokeDeveloperApiKey(id);await refresh()}catch(cause){setError(cause instanceof Error?cause.message:"Could not revoke API key.")}})}
  return <AuthenticatedShell activeLabel="API Keys" activePath="/developer/api-keys">
    <PageHeading eyebrow="API ACCESS" title="API keys" description="Create organization-scoped keys with explicit scopes, environment isolation, and expiry. Secrets are shown only once."/>
    <Panel title="Create an API key">
      <form className="developer-modal-form" onSubmit={create}>
        <label>Key name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required placeholder="Local development"/></label>
        <label>Environment<select className="developer-input" value={environment} onChange={e=>setEnvironment(e.target.value as "DEVELOPMENT"|"PRODUCTION")}><option value="DEVELOPMENT">Development</option><option value="PRODUCTION">Production</option></select></label>
        {environment==="PRODUCTION"?<p className="portal-muted">Production keys should be stored in a secret manager and never used in local development.</p>:null}
        <label>Expires<select className="developer-input" value={expiry} onChange={e=>setExpiry(e.target.value)}><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="180">In 180 days</option><option value="365">In 365 days</option><option value="never">Never (not recommended)</option></select></label>
        <fieldset className="api-scope-picker"><legend>Scopes</legend><p className="api-scope-hint">Choose only the permissions this key needs. You can select more than one.</p><div className="api-scope-grid">{availableScopes.map(([scope,label,description])=><label className={"api-scope-option"+(scopes.includes(scope)?" is-selected":"")} key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={e=>setScopes(old=>e.target.checked?[...old,scope]:old.filter(item=>item!==scope))}/><span className="api-scope-copy"><span className="api-scope-title">{label}</span><span className="api-scope-description">{description}</span><code>{scope}</code></span></label>)}</div><p className="api-scope-count">{scopes.length} of {availableScopes.length} permissions selected</p></fieldset>
        <button className="portal-button portal-button-primary" disabled={pending||!name.trim()||scopes.length===0}>{pending?"Creating…":"Create API key"}</button>
      </form>
      {newKey?<div className="portal-card"><h3>Copy your API key now</h3><p>This secret cannot be retrieved after you leave this screen.</p><code>{newKey}</code><button className="portal-button" onClick={()=>void navigator.clipboard.writeText(newKey)}>Copy key</button><button className="portal-button" onClick={()=>setNewKey("")}>I’ve saved it</button></div>:null}
      {error?<p className="portal-error" role="alert">{error}</p>:null}
    </Panel>
    <Panel title="Existing keys">{keys.length?<div className="developer-client-list">{keys.map(key=><article className="portal-card developer-client-card" key={key.id}><div className="developer-client-heading"><div><h3>{key.name}</h3><p><code>{key.prefix}…</code> · {key.environment==="PRODUCTION"?"Production":"Development"} · {key.scopes.join(", ")}</p><p>Created {new Date(key.createdAt).toLocaleDateString()} · {key.expiresAt?"Expires "+new Date(key.expiresAt).toLocaleDateString():"No expiry"}{key.lastUsedAt?" · Last used "+new Date(key.lastUsedAt).toLocaleDateString():" · Not used yet"}</p></div><span className={"portal-status "+(key.revokedAt?"":"portal-status-active")}>{key.revokedAt?"Revoked":"Active"}</span></div>{!key.revokedAt?<div className="developer-client-actions"><button className="portal-button" disabled={pending} onClick={()=>revoke(key.id)}>Revoke key</button></div>:null}</article>)}</div>:<EmptyState title="No API keys yet" description="Create a scoped key for a trusted integration."/>}</Panel>
  </AuthenticatedShell>;
}
