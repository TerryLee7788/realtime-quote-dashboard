import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/current-user";
import { Topbar } from "@/components/Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen flex-col">
      <Topbar name={session.name} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
