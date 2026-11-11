import { requireAdminUser } from "@/src/lib/auth/admin";
import { getAdminManagementData } from "../actions";
import { AdminManagement } from "../AdminManagement";
import { AdminSectionLayout } from "../AdminSectionLayout";

export const dynamic = "force-dynamic";
export default async function AdminSessionsPage() {
  const [user, data] = await Promise.all([requireAdminUser(), getAdminManagementData()]);
  return <AdminSectionLayout activePath="/admin/sessions" title="Active sessions" description="Review platform sessions and revoke active access when needed." eyebrow="LIVE ACCESS"
    user={{ email: user.email, username: user.username, displayName: user.displayName, role: "ADMIN" }}>
    <AdminManagement initialData={data} section="sessions" />
  </AdminSectionLayout>;
}
