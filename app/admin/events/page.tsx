import { requireAdminUser } from "@/src/lib/auth/admin";
import { getAdminManagementData } from "../actions";
import { AdminManagement } from "../AdminManagement";
import { AdminSectionLayout } from "../AdminSectionLayout";

export const dynamic = "force-dynamic";
export default async function AdminEventsPage() {
  const [user, data] = await Promise.all([requireAdminUser(), getAdminManagementData()]);
  return <AdminSectionLayout activePath="/admin/events" title="Security events" description="Search and filter the recent platform-wide authentication audit trail." eyebrow="AUDIT TRAIL"
    user={{ email: user.email, username: user.username, displayName: user.displayName, role: "ADMIN" }}>
    <AdminManagement initialData={data} section="events" />
  </AdminSectionLayout>;
}
