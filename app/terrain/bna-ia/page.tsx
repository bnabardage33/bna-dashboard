import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BnaIaCentreControle from "@/components/bna-ia/BnaIaCentreControle";

export const dynamic = "force-dynamic";

export default async function BnaIaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <BnaIaCentreControle />;
}
