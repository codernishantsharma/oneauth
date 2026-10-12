"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import { AuthenticatedShell } from "../../../components/AuthenticatedShell";
import { PageHeading, Panel } from "../../../components/PortalUI";
import { getDeveloperClients, updateDeveloperClient, type DeveloperClient } from "../../actions";
import { updateDeveloperClientScopes } from "../../scope-actions";

const availableScopes = [
  ["openid","OpenID Connect sign-in"],["profile","Basic profile"],["email","Email address"],
  ["users:read","Read users"],["users:write","Write users"],["oauth:read","Read OAuth clients"],
  ["oauth:write","Manage OAuth clients"],["mcp:connect","Connect to MCP"],["offline_access","Refresh tokens"],["custom_data:read","Read specifically granted custom-data fields"],["custom_data:write","Write this app's private custom data"]
];

export default function ApplicationDetailsPage() {
  const params=useParams<{id:string}>();
  const [client,setClient]=useState<DeveloperClient|null>(null);
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [selectedScopes,setSelectedScopes]=useState<string[]>([]);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const [pending,startTransition]=useTransition();

  useEffect(()=>{
    let active=true;
    getDeveloperClients().then(items=>{
      if(!active)return;
      const found=items.find(item=>item.id===params.id)??null;
      setClient(found);
      if(found){setName(found.name);setDescription(found.description??"");setSelectedScopes(found.scopes);}
    }).catch(()=>{if(active)setError("You may not have access to this application.")});
    return ()=>{active=false};
  },[params.id]);

  function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!client)return;
    setError("");setSaved(false);
    startTransition(async()=>{
      try{
        await updateDeveloperClient({id:client.id,name,description,isActive:client.isActive});
        const rows=await getDeveloperClients();
        const refreshed=rows.find(item=>item.id===client.id)??null;
        setClient(refreshed);
        if(refreshed)setSelectedScopes(refreshed.scopes);
        setSaved(true);
      }catch(cause){setError(cause instanceof Error?cause.message:"Could not save application settings.")}
    });
  }

  function saveScopes(){
    if(!client)return;
    setError("");setSaved(false);
    startTransition(async()=>{
      try{
        await updateDeveloperClientScopes({id:client.id,scopes:selectedScopes});
        const rows=await getDeveloperClients();
        const refreshed=rows.find(item=>item.id===client.id)??null;
        setClient(refreshed);
        if(refreshed)setSelectedScopes(refreshed.scopes);
        setSaved(true);
      }catch(cause){setError(cause instanceof Error?cause.message:"Could not update allowed scopes.")}
    });
  }

  function toggleActive(){
    if(!client)return;
    setError("");
    startTransition(async()=>{
      try{
        await updateDeveloperClient({id:client.id,name:client.name,description:client.description??"",isActive:!client.isActive});
        setClient({...client,isActive:!client.isActive});
        setSaved(true);
      }catch(cause){setError(cause instanceof Error?cause.message:"Could not update application status.")}
    });
  }

  return <AuthenticatedShell activeLabel="Applications" activePath="/developer/applications">
    <PageHeading eyebrow="APPLICATION" title={client?.name??"Application details"} description="Edit metadata, allowed scopes, and the application's active state."/>
    {error?<p role="alert" className="portal-error">{error}</p>:null}
    {!client?<Panel title="Application settings"><p className="portal-muted">Loading application or application not found.</p></Panel>:<>
      <Panel title="Application settings">
        <form className="developer-modal-form" onSubmit={save}>
          <label>Application name<input value={name} maxLength={100} required onChange={e=>setName(e.target.value)}/></label>
          <label>Description<textarea value={description} maxLength={500} rows={3} onChange={e=>setDescription(e.target.value)}/></label>
          <p>Client ID: <code>{client.clientId}</code></p><p>Type: {client.clientType}</p><p>Environment: {client.environment}</p>
          {saved?<p className="portal-status portal-status-active">Changes saved</p>:null}
          <div className="developer-modal-actions"><button className="portal-button portal-button-primary" disabled={pending}>{pending?"Saving…":"Save changes"}</button><button type="button" className="portal-button portal-button-secondary" disabled={pending} onClick={toggleActive}>{client.isActive?"Disable application":"Enable application"}</button></div>
        </form>
      </Panel>
      <Panel title="Allowed scopes">
        <p className="portal-muted">Only scopes selected here can be requested during authorization. Existing grants are not silently expanded by changing this list.</p>
        <fieldset>{availableScopes.map(([scope,label])=><label key={scope}><input type="checkbox" checked={selectedScopes.includes(scope)} onChange={event=>setSelectedScopes(old=>event.target.checked?[...old,scope]:old.filter(item=>item!==scope))}/>{label}</label>)}</fieldset>
        <button type="button" className="portal-button portal-button-primary" disabled={pending||selectedScopes.length===0} onClick={saveScopes}>{pending?"Saving…":"Save allowed scopes"}</button>
      </Panel>
      <Panel title="Configuration"><div className="developer-steps"><p><Link href={`/developer/applications/${client.id}/credentials`}>Credentials →</Link></p><p><Link href={`/developer/applications/${client.id}/redirect-uris`}>Manage redirect URIs →</Link></p></div></Panel>
    </>}
  </AuthenticatedShell>;
}
