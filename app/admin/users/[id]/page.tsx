import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/src/lib/auth/admin";
import { getAdminUserDetails } from "../../actions";
import { AdminSectionLayout } from "../../AdminSectionLayout";
import { UserAccount } from "./UserAccount";

export const dynamic = "force-dynamic";
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, admin] = await Promise.all([params, requireAdminUser()]);
  let user;
  try { user = await getAdminUserDetails(id); } catch { notFound(); }
  return <AdminSectionLayout activePath="/admin/users" title="User account" eyebrow="ACCOUNT DETAILS"
    description="Inspect profile fields, authentication posture, organization roles, and account lifecycle controls."
    user={{ email: admin.email, username: admin.username, displayName: admin.displayName, role: "ADMIN" }}>
    <p className="admin-back-link"><Link href="/admin/users">← Back to user management</Link></p>
    <UserAccount initialUser={user} />
  </AdminSectionLayout>;
}
