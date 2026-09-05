import { supabase } from "@/lib/supabase";

export async function prochainNumero(
  table: "devis" | "factures" | "pv_receptions",
  prefix: string
) {
  const annee = new Date().getFullYear();
  const { data, error } = await supabase
    .from(table)
    .select("numero")
    .ilike("numero", `${prefix}-${annee}-%`);

  if (error) {
    console.error(error);
    return `${prefix}-${annee}-001`;
  }

  const nums = (data ?? []).map((d: any) => parseInt(d.numero.split("-")[2]) || 0);
  const suivant = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${annee}-${String(suivant).padStart(3, "0")}`;
}
