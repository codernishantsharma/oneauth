import { requireAdminUser } from "@/src/lib/auth/admin";
import { getAdminManagementData } from "../actions";
import { AdminSectionLayout } from "../AdminSectionLayout";
import { NotificationsManager } from "./NotificationsManager";

export const dynamic = "force-dynamic";
export default async function AdminNotificationsPage() {
  const [user, data] = await Promise.all([requireAdminUser(), getAdminManagementData()]);
  return <AdminSectionLayout activePath="/admin/notifications" title="Custom notifications" eyebrow="COMMUNICATIONS"
    description="Compose an in-app notification and send it to one or multiple user accounts."
    user={{ email: user.email, username: user.username, displayName: user.displayName, role: "ADMIN" }}>
    <NotificationsManager users={data.users} />
  </AdminSectionLayout>;
}
