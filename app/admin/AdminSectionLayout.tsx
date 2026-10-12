import type { ReactNode } from "react";
import { AuthenticatedShell, type PortalUser } from "../components/AuthenticatedShell";
import { PageHeading } from "../components/PortalUI";

export function AdminSectionLayout({ user, activePath, title, description, eyebrow = "ONEAUTH ADMINISTRATION", children }: {
  user: PortalUser; activePath: string; title: string; description: string; eyebrow?: string; children: ReactNode;
}) {
  return <AuthenticatedShell activeLabel={title} activePath={activePath} user={user}>
    <PageHeading eyebrow={eyebrow} title={title} description={description} />
    {children}
  </AuthenticatedShell>;
}
