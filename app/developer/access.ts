"use server";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireCurrentUser } from "@/src/lib/auth/session";
import { db } from "@/src/prisma/db";

export async function getDeveloperOrganizations() {
  const user = await requireCurrentUser();
  const rows = await db.runtime().query(db.raw.sql`SELECT o.id, o.name, o.slug, COALESCE(string_agg(DISTINCT r.name, ', '), 'Member') AS role FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id LEFT JOIN public.membership_roles mr ON mr.membership_id=m.id LEFT JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=o.id WHERE m.user_id=${user.id}::uuid AND m.status='ACTIVE' AND o.status='ACTIVE' AND o.deleted_at IS NULL GROUP BY o.id ORDER BY o.name`.returnsRow({id:"pg/uuid@1",name:"pg/text@1",slug:"pg/text@1",role:"pg/text@1"}).build());
  return rows;
}

export async function requireDeveloperOrganization(organizationId?: string) {
  const user = await requireCurrentUser();
  const organizations = await getDeveloperOrganizations();
  // If a caller supplies an organization ID, never silently fall back to another
  // organization. That can make the UI act on a workspace different from the one selected.
  const organization = organizationId
    ? organizations.find((item) => item.id === organizationId)
    : organizations[0];
  if (!organization) {
    if (organizationId) throw new Error("ORGANIZATION_NOT_FOUND_OR_ACCESS_DENIED");
    redirect("/developer/organizations");
  }
  const rows = await db.runtime().query(db.raw.sql`SELECT bool_or(lower(r.name) IN ('owner','admin','developer')) AS allowed FROM public.organization_memberships m LEFT JOIN public.membership_roles mr ON mr.membership_id=m.id LEFT JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=m.organization_id WHERE m.user_id=${user.id}::uuid AND m.organization_id=${organization.id}::uuid AND m.status='ACTIVE'`.returnsRow({allowed:"pg/bool@1"}).build());
  if (!rows[0]?.allowed) redirect("/dashboard?error=developer_access_required");
  return {user, organization};
}

export async function createDeveloperOrganization(input: {name:string;slug:string}) {
  const user = await requireCurrentUser();
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const slug = typeof input?.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (name.length < 2 || name.length > 80) throw new Error("Organization name must be 2–80 characters.");
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(slug)) throw new Error("Use a 3–48 character slug with lowercase letters, numbers, and hyphens.");
  const org = randomUUID(), membership = randomUUID(), ownerRole = randomUUID();
  // Keep organization, owner membership/role, and audit event in one PostgreSQL
  // statement. If any insert fails, PostgreSQL rolls the entire statement back.
  const created = await db.runtime().query(db.raw.sql`WITH inserted_org AS (
    INSERT INTO public.organizations (id,name,slug,status,created_at,updated_at)
    VALUES (${org}::uuid,${name}::text,${slug}::text,'ACTIVE',now(),now())
    ON CONFLICT DO NOTHING RETURNING id
  ), inserted_membership AS (
    INSERT INTO public.organization_memberships (id,organization_id,user_id,status,joined_at,invited_at,created_at,updated_at)
    SELECT ${membership}::uuid,id,${user.id}::uuid,'ACTIVE',now(),now(),now(),now() FROM inserted_org
    RETURNING id,organization_id
  ), inserted_role AS (
    INSERT INTO public.roles (id,name,description,role_type,organization_id,is_system,created_at,updated_at)
    SELECT ${ownerRole}::uuid,'Owner','Full control of organization settings, members, and applications','ORGANIZATION',id,false,now(),now() FROM inserted_org
    RETURNING id,organization_id
  ), assigned_owner AS (
    INSERT INTO public.membership_roles (id,membership_id,role_id,assigned_by_id,assigned_at)
    SELECT ${randomUUID()}::uuid,m.id,r.id,${user.id}::uuid,now()
    FROM inserted_membership m JOIN inserted_role r ON r.organization_id=m.organization_id
    RETURNING id,membership_id
  ), audited AS (
    INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at)
    SELECT ${randomUUID()}::uuid,${user.id}::uuid,m.organization_id,'organization.created','organization',m.organization_id::text,jsonb_build_object('slug',${slug}::text),now()
    FROM inserted_membership m JOIN assigned_owner a ON a.membership_id=m.id
    RETURNING id
  )
  SELECT o.id FROM inserted_org o
    JOIN inserted_membership m ON m.organization_id=o.id
    JOIN inserted_role r ON r.organization_id=o.id
    JOIN assigned_owner a ON a.membership_id=m.id
    JOIN audited au ON true`.returnsRow({id:"pg/uuid@1"}).build());
  if (!created.length) throw new Error("That organization slug is already in use.");
  redirect("/developer");
}

export async function getDeveloperTeam(organizationId: string) {
  const { organization } = await requireDeveloperOrganization(organizationId);
  const rows = await db.runtime().query(db.raw.sql`SELECT m.id AS "membershipId",m.status,ea.normalized_email AS email,COALESCE(string_agg(DISTINCT r.name, ', '), 'Member') AS role FROM public.organization_memberships m LEFT JOIN public.email_addresses ea ON ea.user_id=m.user_id AND ea.is_primary=true JOIN public.users u ON u.id=m.user_id LEFT JOIN public.membership_roles mr ON mr.membership_id=m.id LEFT JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=m.organization_id WHERE m.organization_id=${organization.id}::uuid AND u.deleted_at IS NULL GROUP BY m.id,ea.normalized_email ORDER BY m.created_at ASC`.returnsRow({membershipId:"pg/uuid@1",status:"pg/text@1",email:"pg/text@1",role:"pg/text@1"}).build());
  return rows;
}

async function requireOrganizationManager(organizationId: string) {
  const context = await requireDeveloperOrganization(organizationId);
  const rows = await db.runtime().query(db.raw.sql`SELECT bool_or(lower(r.name) IN ('owner','admin')) AS allowed FROM public.organization_memberships m JOIN public.membership_roles mr ON mr.membership_id=m.id JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=m.organization_id WHERE m.user_id=${context.user.id}::uuid AND m.organization_id=${context.organization.id}::uuid AND m.status='ACTIVE'`.returnsRow({allowed:"pg/bool@1"}).build());
  if (!rows[0]?.allowed) throw new Error("Only organization owners and admins can manage team members.");
  return context;
}

export async function inviteDeveloperTeamMember(input: { organizationId: string; email: string; role: "Admin" | "Developer" | "Member" }) {
  const { user, organization } = await requireOrganizationManager(input.organizationId);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!["Admin", "Developer", "Member"].includes(input.role)) throw new Error("Choose a valid team role.");
  const users = await db.runtime().query(db.raw.sql`SELECT ea.user_id AS id FROM public.email_addresses ea JOIN public.users u ON u.id=ea.user_id WHERE ea.normalized_email=${email} AND ea.verified_at IS NOT NULL AND u.status='ACTIVE' AND u.deleted_at IS NULL LIMIT 1`.returnsRow({id:"pg/uuid@1"}).build());
  if (!users.length) throw new Error("No active account with a verified email was found. Ask them to create and verify their OneAuth account first.");
  const memberUserId = users[0].id;
  if (memberUserId === user.id) throw new Error("You are already a member of this organization.");
  const existing = await db.runtime().query(db.raw.sql`SELECT id,status FROM public.organization_memberships WHERE organization_id=${organization.id}::uuid AND user_id=${memberUserId}::uuid LIMIT 1`.returnsRow({id:"pg/uuid@1",status:"pg/text@1"}).build());
  if (existing.length && existing[0].status === "ACTIVE") throw new Error("That user is already a team member.");
  if (existing.length) {
    // Restore the membership first, then replace its role assignment below so a
    // suspended user's old privileges cannot survive a re-add operation.
    await db.runtime().query(db.raw.sql`UPDATE public.organization_memberships SET status='ACTIVE',joined_at=now(),updated_at=now() WHERE id=${existing[0].id}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  } else {
    await db.runtime().query(db.raw.sql`INSERT INTO public.organization_memberships (id,organization_id,user_id,status,joined_at,invited_at,created_at,updated_at) VALUES (${randomUUID()}::uuid,${organization.id}::uuid,${memberUserId}::uuid,'ACTIVE',now(),now(),now(),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  }
  const membership = await db.runtime().query(db.raw.sql`SELECT id FROM public.organization_memberships WHERE organization_id=${organization.id}::uuid AND user_id=${memberUserId}::uuid LIMIT 1`.returnsRow({id:"pg/uuid@1"}).build());
  const role = await db.runtime().query(db.raw.sql`SELECT id FROM public.roles WHERE organization_id=${organization.id}::uuid AND lower(name)=lower(${input.role}) LIMIT 1`.returnsRow({id:"pg/uuid@1"}).build());
  let roleId = role[0]?.id;
  if (!roleId) {
    roleId = randomUUID();
    await db.runtime().query(db.raw.sql`INSERT INTO public.roles (id,name,description,role_type,organization_id,is_system,created_at,updated_at) VALUES (${roleId}::uuid,${input.role},${input.role === "Admin" ? "Manage organization members and applications" : input.role === "Developer" ? "Manage applications and integration credentials" : "Organization member access"},'ORGANIZATION',${organization.id}::uuid,false,now(),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  }
  await db.runtime().query(db.raw.sql`DELETE FROM public.membership_roles WHERE membership_id=${membership[0].id}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  await db.runtime().query(db.raw.sql`INSERT INTO public.membership_roles (id,membership_id,role_id,assigned_by_id,assigned_at) VALUES (${randomUUID()}::uuid,${membership[0].id}::uuid,${roleId}::uuid,${user.id}::uuid,now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  await db.runtime().query(db.raw.sql`INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at) VALUES (${randomUUID()}::uuid,${user.id}::uuid,${organization.id}::uuid,'organization.member.added','organization_membership',${membership[0].id}::text,jsonb_build_object('email',${email},'role',${input.role}),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  return { success: true };
}

export async function updateDeveloperTeamMember(input: { organizationId: string; membershipId: string; role: "Owner" | "Admin" | "Developer" | "Member" | "Suspended" }) {
  const { user, organization } = await requireOrganizationManager(input.organizationId);
  if (!["Owner", "Admin", "Developer", "Member", "Suspended"].includes(input.role)) throw new Error("Choose a valid team role.");
  if (input.role === "Owner") {
    const actor = await db.runtime().query(db.raw.sql`SELECT bool_or(lower(r.name)='owner') AS is_owner FROM public.organization_memberships m JOIN public.membership_roles mr ON mr.membership_id=m.id JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=m.organization_id WHERE m.user_id=${user.id}::uuid AND m.organization_id=${organization.id}::uuid AND m.status='ACTIVE'`.returnsRow({is_owner:"pg/bool@1"}).build());
    if (!actor[0]?.is_owner) throw new Error("Only an organization owner can assign the Owner role.");
  }
  const rows = await db.runtime().query(db.raw.sql`SELECT m.id,m.user_id,m.status,COALESCE(string_agg(DISTINCT r.name, ', '), '') AS roles FROM public.organization_memberships m LEFT JOIN public.membership_roles mr ON mr.membership_id=m.id LEFT JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=m.organization_id WHERE m.id=${input.membershipId}::uuid AND m.organization_id=${organization.id}::uuid GROUP BY m.id`.returnsRow({id:"pg/uuid@1",user_id:"pg/uuid@1",status:"pg/text@1",roles:"pg/text@1"}).build());
  if (!rows.length) throw new Error("Team member not found.");
  const targetIsOwner = rows[0].roles.split(", ").some((role) => role.toLowerCase() === "owner");
  if (targetIsOwner && input.role !== "Owner") {
    const actor = await db.runtime().query(db.raw.sql`SELECT bool_or(lower(r.name)='owner') AS is_owner FROM public.organization_memberships m JOIN public.membership_roles mr ON mr.membership_id=m.id JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=m.organization_id WHERE m.user_id=${user.id}::uuid AND m.organization_id=${organization.id}::uuid AND m.status='ACTIVE'`.returnsRow({is_owner:"pg/bool@1"}).build());
    if (!actor[0]?.is_owner) throw new Error("Only an organization owner can change another owner's role.");
  }
  // Admins can manage team membership, but ownership transfers are owner-only.
  if (input.role === "Owner" && !targetIsOwner) {
    const actor = await db.runtime().query(db.raw.sql`SELECT bool_or(lower(r.name)='owner') AS is_owner FROM public.organization_memberships m JOIN public.membership_roles mr ON mr.membership_id=m.id JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=m.organization_id WHERE m.user_id=${user.id}::uuid AND m.organization_id=${organization.id}::uuid AND m.status='ACTIVE'`.returnsRow({is_owner:"pg/bool@1"}).build());
    if (!actor[0]?.is_owner) throw new Error("Only an organization owner can assign the Owner role.");
  }
  if (rows[0].user_id === user.id && input.role !== "Owner") throw new Error("You cannot change your own role or suspend yourself here.");
  if (rows[0].roles.split(", ").some((role) => role.toLowerCase() === "owner") && input.role !== "Owner") {
    const owners = await db.runtime().query(db.raw.sql`SELECT count(DISTINCT m.id)::int AS count FROM public.organization_memberships m JOIN public.membership_roles mr ON mr.membership_id=m.id JOIN public.roles r ON r.id=mr.role_id WHERE m.organization_id=${organization.id}::uuid AND m.status='ACTIVE' AND lower(r.name)='owner'`.returnsRow({count:"pg/int4@1"}).build());
    if ((owners[0]?.count ?? 0) <= 1) throw new Error("An organization must keep at least one active owner.");
  }
  if (input.role === "Suspended") {
    await db.runtime().query(db.raw.sql`UPDATE public.organization_memberships SET status='SUSPENDED',updated_at=now() WHERE id=${input.membershipId}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  } else {
    await db.runtime().query(db.raw.sql`UPDATE public.organization_memberships SET status='ACTIVE',updated_at=now() WHERE id=${input.membershipId}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    const role = await db.runtime().query(db.raw.sql`SELECT id FROM public.roles WHERE organization_id=${organization.id}::uuid AND lower(name)=lower(${input.role}) LIMIT 1`.returnsRow({id:"pg/uuid@1"}).build());
    let roleId = role[0]?.id;
    if (!roleId) {
      roleId = randomUUID();
      await db.runtime().query(db.raw.sql`INSERT INTO public.roles (id,name,description,role_type,organization_id,is_system,created_at,updated_at) VALUES (${roleId}::uuid,${input.role},'Organization team role','ORGANIZATION',${organization.id}::uuid,false,now(),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    }
    await db.runtime().query(db.raw.sql`DELETE FROM public.membership_roles WHERE membership_id=${input.membershipId}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    await db.runtime().query(db.raw.sql`INSERT INTO public.membership_roles (id,membership_id,role_id,assigned_by_id,assigned_at) VALUES (${randomUUID()}::uuid,${input.membershipId}::uuid,${roleId}::uuid,${user.id}::uuid,now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  }
  await db.runtime().query(db.raw.sql`INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at) VALUES (${randomUUID()}::uuid,${user.id}::uuid,${organization.id}::uuid,'organization.member.updated','organization_membership',${input.membershipId}::text,jsonb_build_object('role',${input.role}),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  return { success: true };
}
