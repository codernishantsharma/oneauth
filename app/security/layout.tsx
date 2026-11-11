import type { ReactNode } from "react";

import { requireCurrentUser } from "@/src/lib/auth/session";

export default async function SecurityLayout({ children }: { children: ReactNode }) {
  await requireCurrentUser();
  return children;
}
