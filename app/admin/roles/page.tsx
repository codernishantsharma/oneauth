import { requireAdminUser } from "@/src/lib/auth/admin";
import { getAdminRoleData } from "../actions";
import { AdminSectionLayout } from "../AdminSectionLayout";
import { RolesManager } from "./RolesManager";

export const dynamic = "force-dynamic";
export default async function AdminRolesPage() {
  const [user, data] = await Promise.all([requireAdminUser(), getAdminRoleData()]);
  return <AdminSectionLayout activePath="/admin/roles" title="Roles & permissions" eyebrow="ACCESS CONTROL"
    description="Inspect database roles, create reusable role definitions, and assign them directly to users."
    user={{ email: user.email, username: user.username, displayName: user.displayName, role: "ADMIN" }}>
    <RolesManager roles={data.roles} users={data.users} />
  </AdminSectionLayout>;
}
