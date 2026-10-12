import { requireAdminUser } from "@/src/lib/auth/admin";
import { getAdminManagementData } from "../actions";
import { AdminSectionLayout } from "../AdminSectionLayout";
import { UserDirectory } from "./UserDirectory";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [user, data] = await Promise.all([requireAdminUser(), getAdminManagementData()]);
  return <AdminSectionLayout activePath="/admin/users" title="User management" eyebrow="ACCOUNT DIRECTORY"
    description="Inspect profiles, manage account status, select multiple accounts, and perform bulk actions."
    user={{ email: user.email, username: user.username, displayName: user.displayName, role: "ADMIN" }}>
    <UserDirectory initialUsers={data.users} />
  </AdminSectionLayout>;
}
