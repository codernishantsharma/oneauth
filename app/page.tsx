import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/session";
import { safeRedirectPath } from "@/src/lib/auth/redirect";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ redirect?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;
  const requested = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  const redirectTo = safeRedirectPath(requested) ?? "/dashboard";
  return <LoginForm redirectTo={redirectTo} />;
}
