"use client";

import { useEffect, useState, useTransition } from "react";
import { AuthenticatedShell } from "../../components/AuthenticatedShell";
import { PageHeading, Panel, EmptyState } from "../../components/PortalUI";
import { createDeveloperOrganization, getDeveloperOrganizations, getDeveloperTeam, inviteDeveloperTeamMember, updateDeveloperTeamMember } from "../access";

type Organization = { id: string; name: string; slug: string; role: string };
type TeamMember = { membershipId: string; status: string; email: string | null; role: string };

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Admin" | "Developer" | "Member">("Developer");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  async function loadTeam(orgId: string) {
    if (!orgId) return;
    try { setMembers(await getDeveloperTeam(orgId) as TeamMember[]); }
    catch { setMembers([]); }
  }
  useEffect(() => {
    let active = true;
    getDeveloperOrganizations().then(async (items) => {
      if (!active) return;
      const list = items as Organization[];
      setOrganizations(list);
      if (list.length) {
        setSelectedOrg(list[0].id);
        try { const team = await getDeveloperTeam(list[0].id); if (active) setMembers(team as TeamMember[]); } catch { if (active) setMembers([]); }
      }
    }).catch(() => { if (active) setError("Could not load organizations."); });
    return () => { active = false; };
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    startTransition(async () => {
      try { await createDeveloperOrganization({ name, slug }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create organization."); }
    });
  }
  function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    startTransition(async () => {
      try { await inviteDeveloperTeamMember({ organizationId: selectedOrg, email, role }); setEmail(""); setNotice("Team member added."); await loadTeam(selectedOrg); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add team member."); }
    });
  }
  function changeMember(membershipId: string, nextRole: "Owner" | "Admin" | "Developer" | "Member" | "Suspended") {
    setError(""); setNotice("");
    startTransition(async () => {
      try { await updateDeveloperTeamMember({ organizationId: selectedOrg, membershipId, role: nextRole }); setNotice("Team access updated."); await loadTeam(selectedOrg); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update team access."); }
    });
  }

  return (
    <AuthenticatedShell activeLabel="Organizations & Team" activePath="/developer/organizations">
      <PageHeading eyebrow="WORKSPACES" title="Organizations & team" description="Organizations own applications. Roles control who can manage members and integrations." />
      <Panel title="Your organizations">
        {organizations.length ? <>
          <label className="developer-field-label">Active organization<select value={selectedOrg} onChange={(event) => { setSelectedOrg(event.target.value); void loadTeam(event.target.value); }} className="developer-input">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name} · {org.role}</option>)}</select></label>
          <div className="developer-client-list">{organizations.map((org) => <article className="portal-card developer-client-card" key={org.id}><div className="developer-client-heading"><div><h3>{org.name}</h3><p>{org.slug}</p></div><span className="portal-status portal-status-active">{org.role}</span></div></article>)}</div>
        </> : <EmptyState title="No organization yet" description="Create an organization to register applications under an organization owner instead of a personal account." />}
      </Panel>
      {selectedOrg ? <Panel title="Team members">
        <p className="portal-muted">Add an existing OneAuth account by its verified email. Invitations to accounts that do not exist are not sent yet.</p>
        <form className="developer-modal-form" onSubmit={invite}>
          <label>Verified account email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" /></label>
          <label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="Developer">Developer</option><option value="Admin">Admin</option><option value="Member">Member</option></select></label>
          <button className="portal-button portal-button-primary" disabled={pending}>{pending ? "Saving…" : "Add team member"}</button>
        </form>
        <div className="developer-client-list">{members.map((member) => <article className="portal-card developer-client-card" key={member.membershipId}>
          <div className="developer-client-heading"><div><h3>{member.email ?? "Account email unavailable"}</h3><p>{member.status}</p></div><span className="portal-status portal-status-active">{member.role}</span></div>
          {member.status !== "SUSPENDED" ? <div className="developer-client-actions"><select className="developer-input" aria-label={"Change role for " + (member.email ?? "member")} defaultValue={member.role.split(", ")[0]} onChange={(event) => changeMember(member.membershipId, event.target.value as "Owner" | "Admin" | "Developer" | "Member" | "Suspended")}><option value="Owner">Owner</option><option value="Admin">Admin</option><option value="Developer">Developer</option><option value="Member">Member</option><option value="Suspended">Suspend access</option></select></div> : <button className="portal-button" disabled={pending} onClick={() => changeMember(member.membershipId, "Member")}>Restore as member</button>}
        </article>)}</div>
      </Panel> : null}
      <Panel title="Create an organization">
        <form className="developer-modal-form" onSubmit={submit}>
          <label>Organization name<input value={name} maxLength={80} required onChange={(event) => { const value = event.target.value; setName(value); setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} placeholder="NishantApps" /></label>
          <label>Organization slug<input value={slug} pattern="[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?" required onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="nishantapps" /></label>
          <p className="portal-muted">You will receive the Owner role.</p>
          <button className="portal-button portal-button-primary" disabled={pending || !name.trim() || !slug.trim()}>{pending ? "Creating…" : "Create organization"}</button>
        </form>
      </Panel>
      {error ? <p className="portal-error" role="alert">{error}</p> : null}
      {notice ? <p className="portal-success" role="status">{notice}</p> : null}
    </AuthenticatedShell>
  );
}
