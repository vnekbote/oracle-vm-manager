import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { VmDashboard } from "@/components/vm/vm-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="shell-wide">
      <VmDashboard
        initialUser={{
          id: session.user.id,
          username: session.user.username,
          displayName: session.user.displayName,
          role: session.user.role,
          mustRotatePassword: session.user.mustRotatePassword,
        }}
        initialCsrfToken={session.csrfToken}
      />
    </main>
  );
}
