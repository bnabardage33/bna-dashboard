import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardAccueilBna from "@/components/DashboardAccueilBna";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#120F0D]">
      <DashboardAccueilBna />
    </div>
  );
}
