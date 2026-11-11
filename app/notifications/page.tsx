import { requireCurrentUser } from "@/src/lib/auth/session";
import { getMyNotifications } from "./actions";
import { NotificationList } from "./NotificationList";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { PageHeading } from "../components/PortalUI";

export const dynamic = "force-dynamic";
export default async function NotificationsPage() {
  const [user, notifications] = await Promise.all([requireCurrentUser(), getMyNotifications()]);
  return <AuthenticatedShell activeLabel="Notifications" activePath="/notifications"
    user={{ email: user.email, username: user.username, displayName: user.displayName }}>
    <PageHeading eyebrow="ACCOUNT INBOX" title="Notifications" description="View messages and security alerts related to your OneAuth account." />
    <NotificationList initialNotifications={notifications} />
  </AuthenticatedShell>;
}
