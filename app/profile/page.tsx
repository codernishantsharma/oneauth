import Link from "next/link";
import { AuthenticatedShell } from "@/app/components/AuthenticatedShell";
import { PageHeading, PortalIcon } from "@/app/components/PortalUI";
import { getMyProfile } from "./actions";
import { ProfileEditor } from "./ProfileEditor";

export default async function ProfilePage() {
  const profile = await getMyProfile();
  return <AuthenticatedShell activeLabel="Profile" activePath="/profile" user={{ email: profile.email, username: profile.username || null, displayName: profile.displayName || null }}>
    <PageHeading eyebrow="IDENTITY & SECURITY" title="Your profile" description="Keep your OneAuth identity accurate. Update your personal details and regional preferences in one place." actions={<Link className="portal-button portal-button-secondary" href="/dashboard"><PortalIcon name="app-window" /> Account overview</Link>} />
    <ProfileEditor profile={profile} />
  </AuthenticatedShell>;
}
