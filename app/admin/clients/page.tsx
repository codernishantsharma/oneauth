import { requireAdminUser } from "@/src/lib/auth/admin";
import { getAdminManagementData } from "../actions";
import { AdminManagement } from "../AdminManagement";
import { AdminSectionLayout } from "../AdminSectionLayout";

export const dynamic = "force-dynamic";
export default async function AdminClientsPage() {
  const [user, data] = await Promise.all([requireAdminUser(), getAdminManagementData()]);
  return <AdminSectionLayout activePath="/admin/clients" title="OAuth clients" description="Inspect registered applications and control their platform access." eyebrow="APPLICATION ACCESS"
    user={{ email: user.email, username: user.username, displayName: user.displayName, role: "ADMIN" }}>
    <AdminManagement initialData={data} section="clients" />
  </AdminSectionLayout>;
}
