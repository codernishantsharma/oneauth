"use client";

import Link from "next/link";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { PageHeading, Panel } from "../components/PortalUI";

export default function DeveloperOverviewPage() {
  return (
    <AuthenticatedShell activeLabel="Overview" activePath="/developer">
      <PageHeading eyebrow="DEVELOPER PORTAL" title="Developer overview" description="Manage organization-owned applications, OAuth clients, API credentials, and integration activity." />
      <div className="portal-metrics-grid portal-metrics-three developer-overview-metrics">
        <article className="portal-card developer-overview-metric"><span className="portal-muted">Workspace model</span><h2>Organizations</h2><p>Role-based access</p></article>
        <article className="portal-card developer-overview-metric"><span className="portal-muted">Environments</span><h2>Development + production</h2><p>Use distinct app registrations and callbacks.</p></article>
        <article className="portal-card developer-overview-metric"><span className="portal-muted">Integration roadmap</span><h2>OAuth + MCP</h2><p>Authorization server and MCP will be enabled after end-to-end security tests.</p></article>
      </div>
      <Panel title="Developer tools">
        <div className="developer-steps developer-overview-links">
          <p><Link href="/developer/applications">Applications <span>— create and configure apps</span><span aria-hidden="true"> →</span></Link></p>
          <p><Link href="/developer/oauth-clients">OAuth clients <span>— inspect client IDs and callbacks</span><span aria-hidden="true"> →</span></Link></p>
          <p><Link href="/developer/api-keys">API keys <span>— review organization credentials</span><span aria-hidden="true"> →</span></Link></p>
          <p><Link href="/developer/logs">Audit logs <span>— review organization activity</span><span aria-hidden="true"> →</span></Link></p>
          <p><Link href="/developer/organizations">Organizations &amp; team <span>— manage workspace access</span><span aria-hidden="true"> →</span></Link></p>
        </div>
      </Panel>
      <Panel title="Integration status"><p>Application registration is being connected to organization ownership. OAuth authorization/token endpoints and ChatGPT MCP access are not yet marked production-ready; they will be implemented and tested in the next phase.</p></Panel>
    </AuthenticatedShell>
  );
}
