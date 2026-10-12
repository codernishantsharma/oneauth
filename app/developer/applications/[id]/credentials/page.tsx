"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthenticatedShell } from "../../../../components/AuthenticatedShell";
import { PageHeading, Panel } from "../../../../components/PortalUI";
import { getDeveloperClients, type DeveloperClient } from "../../../actions";
import { rotateDeveloperClientSecret } from "../../../rotate-secret";

export default function ApplicationCredentialsPage() {
  const params = useParams<{ id: string }>();
  const [client, setClient] = useState<DeveloperClient | null>(null);
  const [error, setError] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [armed, setArmed] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    let active = true;
    getDeveloperClients()
      .then((items) => { if (active) setClient(items.find((item) => item.id === params.id) ?? null); })
      .catch(() => { if (active) setError("You may not have access to this application."); });
    return () => { active = false; };
  }, [params.id]);

  async function rotate() {
    if (!armed) { setArmed(true); return; }
    setRotating(true);
    setError("");
    try {
      const result = await rotateDeveloperClientSecret(params.id);
      setNewSecret(result.secret);
      setArmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Secret rotation failed.");
    } finally {
      setRotating(false);
    }
  }

  return <AuthenticatedShell activeLabel="Applications" activePath="/developer/applications">
    <PageHeading eyebrow="APPLICATION SECURITY" title="Credentials" description="Manage credentials for this OAuth client." />
    <Panel title="Client credentials">
      {error ? <p role="alert" className="portal-error">{error}</p> : null}
      {!client ? <p className="portal-muted">Loading credentials…</p> : <>
        <p>Client ID</p>
        <code>{client.clientId}</code>
        <p>Client type: {client.clientType}</p>
        {["WEB", "SERVICE"].includes(client.clientType) ? <>
          <p className="portal-muted">Rotating the secret immediately invalidates the previous secret. The new value is shown once—copy it and update your application configuration now.</p>
          <button type="button" className="portal-button" onClick={rotate} disabled={rotating}>
            {rotating ? "Rotating…" : armed ? "Confirm secret rotation" : "Rotate client secret"}
          </button>
          {armed ? <button type="button" className="portal-button portal-button-secondary" onClick={() => setArmed(false)} disabled={rotating}>Cancel</button> : null}
          {newSecret ? <div className="portal-card" role="status"><h3>New client secret</h3><code>{newSecret}</code><p><button type="button" className="portal-button" onClick={() => navigator.clipboard.writeText(newSecret).catch(() => setError("Clipboard access failed. Select and copy the secret manually."))}>Copy secret</button></p><p className="portal-muted">This secret will not be shown again after you leave this page.</p></div> : null}
        </> : <p className="portal-muted">This is a public client and correctly has no client secret. Use PKCE and never embed a secret in a browser or native application.</p>}
        <Link href={`/developer/applications/${client.id}`}>← Back to application</Link>
      </>}
    </Panel>
  </AuthenticatedShell>;
}
