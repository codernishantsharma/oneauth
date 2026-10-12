import type { ReactNode } from "react";

import { requireCurrentUser } from "@/src/lib/auth/session";
import "./developer.css";

export default async function DeveloperLayout({ children }: { children: ReactNode }) {
  await requireCurrentUser();

  return <div className="developer-portal-scope">{children}</div>;
}
