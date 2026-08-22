const fs = require('fs');
let code = fs.readFileSync('hooks/useFinance.ts', 'utf8');

// Update useUrssaf
code = code.replace(
  'export function useUrssaf() {',
  'export function useUrssaf(mois?: string) {\n  const targetMois = mois || new Date().toISOString().slice(0, 7);'
).replace(
  'const currentMonth = new Date().toISOString().slice(0, 7);\n      const { startDate, endDate } = getMonthRange(currentMonth);',
  'const { startDate, endDate } = getMonthRange(targetMois);'
).replace(
  '  }, []);\n\n  return { masseSalariale, isLoading, error };',
  '  }, [targetMois]);\n\n  return { masseSalariale, isLoading, error };'
);

// Update useCaEvolution
code = code.replace(
  'export function useCaEvolution(months = 12) {',
  'export function useCaEvolution(months = 12, endMois?: string) {\n  const targetMois = endMois || new Date().toISOString().slice(0, 7);'
).replace(
  'const d = new Date();\n        d.setMonth(d.getMonth() - months + 1);\n        const startDate = d.toISOString().slice(0, 7) + "-01";\n\n        const { data: factures } = await supabase\n          .from("factures")\n          .select("montant_ht, date_emission")\n          .neq("statut", "annulee")\n          .gte("date_emission", startDate);',
  `const d = new Date(targetMois + "-01");
        d.setMonth(d.getMonth() - months + 1);
        const startDate = d.toISOString().slice(0, 7) + "-01";
        const endDateObj = new Date(targetMois + "-01");
        endDateObj.setMonth(endDateObj.getMonth() + 1);
        const endDate = endDateObj.toISOString().slice(0,7) + "-01";

        const { data: factures } = await supabase
          .from("factures")
          .select("montant_ht, date_emission")
          .neq("statut", "annulee")
          .gte("date_emission", startDate)
          .lt("date_emission", endDate);`
).replace(
  'const tempD = new Date();',
  'const tempD = new Date(targetMois + "-01");'
).replace(
  '  }, [months]);\n\n  return { data, isLoading };',
  '  }, [months, targetMois]);\n\n  return { data, isLoading };'
);

// Update useCoutRepartition
code = code.replace(
  'export function useCoutRepartition() {',
  'export function useCoutRepartition(mois?: string) {'
).replace(
  `        const { data: depenses } = await supabase
          .from("depenses_chantier")
          .select("nature, montant_ht");`,
  `        let query = supabase.from("depenses_chantier").select("nature, montant_ht");
        if (mois) {
          const { startDate, endDate } = getMonthRange(mois);
          query = query.gte("date", startDate).lte("date", endDate);
        }
        const { data: depenses } = await query;`
).replace(
  '  }, []);\n\n  return { data, isLoading };',
  '  }, [mois]);\n\n  return { data, isLoading };'
);

// Add useHistoriqueSaisies
const histoHook = \`
// --- Hook Historique Saisies ---

export function useHistoriqueSaisies() {
  const [pointages, setPointages] = useState<any[]>([]);
  const [depenses, setDepenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const [resP, resD] = await Promise.all([
      supabase.from("pointages").select("*, chantiers(nom), profiles:user_id(full_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("depenses_chantier").select("*, chantiers(nom), fournisseurs(nom)").order("created_at", { ascending: false }).limit(50)
    ]);

    if (resP.data) setPointages(resP.data);
    if (resD.data) setDepenses(resD.data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const supprimerPointage = async (id: string) => {
    await supabase.from("pointages").delete().eq("id", id);
    setPointages(prev => prev.filter(p => p.id !== id));
  };

  const supprimerDepense = async (id: string) => {
    await supabase.from("depenses_chantier").delete().eq("id", id);
    setDepenses(prev => prev.filter(d => d.id !== id));
  };

  return { pointages, depenses, isLoading, supprimerPointage, supprimerDepense, refresh: fetchData };
}
\`;
code += histoHook;

fs.writeFileSync('hooks/useFinance.ts', code);
