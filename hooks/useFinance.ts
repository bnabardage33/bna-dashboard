"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  ChantierFinance,
  DepenseFinance,
  PointageFinance,
  FactureFinance,
  AchatFinance,
  RentabiliteResult,
  KpiMensuelResult,
  TvaResult,
  ChantierRow,
  AvancementRow,
  PointageRow,
  DepenseRow,
  FactureWithClient,
} from "@/types/finance";
import {
  calculerRentabiliteChantier,
  calculerKpiMensuel,
  calculerTva,
  calculerMontantTTCFacture,
  calculerMontantTTCCommande,
} from "@/lib/financeCalculs";

export type RentabiliteChantierExt = RentabiliteResult & {
  id: string;
  avancement: number;
  chantier_id: string;
  nom: string;
  client_nom: string;
  prix_vente_ht: number;
  statut: string;
};

type SupabaseResult<T> = { data: T[] | null; error: { message: string } | null };

async function safeFetch<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  onError: (err: Error) => void
): Promise<T[]> {
  try {
    const result = await query as SupabaseResult<T>;
    const { data, error } = result;
    if (error) {
      onError(new Error(error.message || String(error)));
      return [];
    }
    return data || [];
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return [];
  }
}

// --- Hook 1 : Rentabilité ---

export function useRentabiliteChantiers() {
  const [chantiers, setChantiers] = useState<ChantierRow[]>([]);
  const [depenses, setDepenses] = useState<DepenseFinance[]>([]);
  const [pointages, setPointages] = useState<PointageFinance[]>([]);
  const [avancements, setAvancements] = useState<AvancementRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const handleError = (err: Error) => {
        if (isMounted) setError(err);
      };

      const [chantiersData, depensesData, pointagesData, avancementsData] =
        await Promise.all([
          safeFetch<ChantierRow>(
            supabase
              .from("chantiers")
              .select("id, nom, client_nom, prix_vente_ht, statut"),
            handleError
          ),
          safeFetch<DepenseFinance>(
            supabase.from("depenses_chantier").select("*"),
            handleError
          ),
          safeFetch<PointageFinance>(
            supabase.from("pointages").select("*"),
            handleError
          ),
          safeFetch<AvancementRow>(
            supabase.from("avancements_chantier").select("*"),
            handleError
          ),
        ]);

      if (isMounted) {
        setChantiers(chantiersData);
        setDepenses(depensesData);
        setPointages(pointagesData);
        setAvancements(avancementsData);
        setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  const { rentabilites, alertes } = useMemo(() => {
    if (!chantiers.length) return { rentabilites: [], alertes: [] };

    const rentabilitesData: RentabiliteChantierExt[] = chantiers.map((c) => {
      const chantierBase: ChantierFinance = {
        id: c.id,
        nom: c.nom,
        prix_vente_ht: c.prix_vente_ht || 0,
        avancement: 50,
      };

      const result = calculerRentabiliteChantier(
        chantierBase,
        depenses,
        pointages,
        avancements
      );

      return {
        ...result,
        id: c.id,
        avancement: 50,
        chantier_id: c.id,
        nom: c.nom,
        client_nom: c.client_nom || "",
        prix_vente_ht: c.prix_vente_ht || 0,
        statut: c.statut || "",
      };
    });

    const alertesData = rentabilitesData.filter(
      (r) => r.alerte_depassement || r.taux_marge_pct < 15
    );

    return { rentabilites: rentabilitesData, alertes: alertesData };
  }, [chantiers, depenses, pointages, avancements]);

  return { rentabilites, alertes, isLoading, error };
}

// --- Hook 2 : KPI Mensuel ---

export function useKpiMensuel(mois?: string) {
  const defaultMois = new Date().toISOString().slice(0, 7);
  const targetMois = mois || defaultMois;

  const [factures, setFactures] = useState<FactureFinance[]>([]);
  const [achats, setAchats] = useState<AchatFinance[]>([]);
  const [depenses, setDepenses] = useState<DepenseFinance[]>([]);
  const [pointages, setPointages] = useState<PointageFinance[]>([]);
  const [chantiers, setChantiers] = useState<ChantierFinance[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const handleError = (err: Error) => {
        if (isMounted) setError(err);
      };

      const { startDate, endDate } = getMonthRange(targetMois);

      const [factData, achatsData, depData, pointData, chantData] =
        await Promise.all([
          safeFetch<FactureFinance>(
            supabase
              .from("factures")
              .select("*")
              .neq("statut", "annulee")
              .gte("date_emission", startDate)
              .lte("date_emission", endDate),
            handleError
          ),
          safeFetch<AchatFinance>(
            supabase
              .from("commandes")
              .select("*")
              .gte("date_livraison_prevue", startDate)
              .lte("date_livraison_prevue", endDate),
            handleError
          ),
          safeFetch<DepenseFinance>(
            supabase.from("depenses_chantier").select("*"),
            handleError
          ),
          safeFetch<PointageFinance>(
            supabase.from("pointages").select("*"),
            handleError
          ),
          safeFetch<ChantierRow>(
            supabase.from("chantiers").select("id, nom, prix_vente_ht"),
            handleError
          ),
        ]);

      if (isMounted) {
        setFactures(factData);
        setAchats(achatsData);
        setDepenses(depData);
        setPointages(pointData);
        setChantiers(
          chantData.map((c) => ({
            id: c.id,
            nom: c.nom,
            prix_vente_ht: c.prix_vente_ht || 0,
            avancement: 0,
          }))
        );
        setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [targetMois]);

  const kpis = useMemo(() => {
    return calculerKpiMensuel(
      factures,
      achats,
      depenses,
      pointages,
      chantiers,
      targetMois
    );
  }, [factures, achats, depenses, pointages, chantiers, targetMois]);

  return { kpis, isLoading, error };
}

// --- Hook 3 : TVA Mensuelle ---

export function useTvaMensuelle(mois?: string) {
  const defaultMois = new Date().toISOString().slice(0, 7);
  const targetMois = mois || defaultMois;

  const [factures, setFactures] = useState<FactureFinance[]>([]);
  const [achats, setAchats] = useState<AchatFinance[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const handleError = (err: Error) => {
        if (isMounted) setError(err);
      };

      const { startDate, endDate } = getMonthRange(targetMois);

      const [factData, achatsData] = await Promise.all([
        safeFetch<FactureFinance>(
          supabase
            .from("factures")
            .select("*")
            .neq("statut", "annulee")
            .gte("date_emission", startDate)
            .lte("date_emission", endDate),
          handleError
        ),
        safeFetch<AchatFinance>(
          supabase
            .from("commandes")
            .select("*")
            .gte("date_livraison_prevue", startDate)
            .lte("date_livraison_prevue", endDate),
          handleError
        ),
      ]);

      if (isMounted) {
        setFactures(factData);
        setAchats(achatsData);
        setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [targetMois]);

  const tva = useMemo(() => {
    return calculerTva(factures, achats, targetMois);
  }, [factures, achats, targetMois]);

  return { tva, isLoading, error };
}

// --- Hook 4 : Paramètre Finance ---

export function useParametreFinance(cle: string) {
  const [valeur, setValeur] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchParam = async () => {
      try {
        const { data, error } = await supabase
          .from("parametres_finance")
          .select("valeur")
          .eq("cle", cle)
          .maybeSingle();
        if (!error && data && isMounted) {
          setValeur(data.valeur);
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchParam();
    return () => {
      isMounted = false;
    };
  }, [cle]);

  const updateValeur = async (newVal: number) => {
    setValeur(newVal);
    await supabase
      .from("parametres_finance")
      .upsert({ cle, valeur: newVal }, { onConflict: "cle" });
  };

  return { valeur, updateValeur, isLoading };
}

// --- Hook 5 : Trésorerie ---

export type TresorerieFacture = FactureFinance & {
  client_nom?: string;
};
export type TresorerieAchat = AchatFinance & {
  fournisseur_nom?: string;
  statut?: string;
};

export function useTresorerie() {
  const [factures, setFactures] = useState<TresorerieFacture[]>([]);
  const [achats, setAchats] = useState<TresorerieAchat[]>([]);
  const [masseSalariale, setMasseSalariale] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const handleError = (err: Error) => {
        if (isMounted) setError(err);
      };

      const today = new Date();
      const in30Days = new Date();
      in30Days.setDate(today.getDate() + 30);

      const todayStr = today.toISOString();
      const in30DaysStr = in30Days.toISOString();

      const currentMonth = todayStr.slice(0, 7);
      const { startDate, endDate } = getMonthRange(currentMonth);

      const [factData, achatsData, pointData] = await Promise.all([
        safeFetch<FactureWithClient>(
          supabase
            .from("factures")
            .select("*, clients(nom)")
            .in("statut", ["emise", "envoyee", "payee"])
            .gte("echeance", todayStr)
            .lte("echeance", in30DaysStr),
          handleError
        ),
        safeFetch<TresorerieAchat>(
          supabase
            .from("commandes")
            .select("*")
            .not("statut", "in", '("paye","payee")')
            .gte("date_livraison_prevue", todayStr)
            .lte("date_livraison_prevue", in30DaysStr),
          handleError
        ),
        safeFetch<PointageFinance>(
          supabase.from("pointages").select("*"),
          handleError
        ),
      ]);

      if (isMounted) {
        setFactures(
          factData.map((f) => ({
            ...f,
            client_nom: f.clients?.nom || "Client inconnu",
          }))
        );
        setAchats(achatsData);
        const masse = pointData.reduce(
          (sum, p) => sum + p.heures * p.taux_horaire_charge,
          0
        );
        setMasseSalariale(masse);
        setIsLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  return { factures, achats, masseSalariale, isLoading, error };
}

// --- Hook 6 : URSSAF ---

export function useUrssaf(mois?: string) {
  const targetMois = mois || new Date().toISOString().slice(0, 7);
  const [masseSalariale, setMasseSalariale] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const handleError = (err: Error) => {
        if (isMounted) setError(err);
      };

      const { startDate, endDate } = getMonthRange(targetMois);

      const pointData = await safeFetch<PointageFinance>(
        supabase.from("pointages").select("*"),
        handleError
      );

      if (isMounted) {
        const masse = pointData.reduce(
          (sum, p) => sum + p.heures * p.taux_horaire_charge,
          0
        );
        setMasseSalariale(masse);
        setIsLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [targetMois]);

  return { masseSalariale, isLoading, error };
}

// --- Hooks pour Analyses & Graphiques ---

export function useCaEvolution(months = 12, endMois?: string) {
  const targetMois = endMois || new Date().toISOString().slice(0, 7);
  const [data, setData] = useState<{ month: string; ca: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchEvo = async () => {
      try {
        const d = new Date(targetMois + "-01");
        d.setMonth(d.getMonth() - months + 1);
        const startDate = d.toISOString().slice(0, 7) + "-01";
        const endDateObj = new Date(targetMois + "-01");
        endDateObj.setMonth(endDateObj.getMonth() + 1);
        const endDate = endDateObj.toISOString().slice(0, 7) + "-01";

        const factures = await safeFetch<FactureFinance>(
          supabase
            .from("factures")
            .select("*")
            .neq("statut", "annulee")
            .gte("date_emission", startDate)
            .lt("date_emission", endDate),
          (_err: Error) => {}
        );

        if (isMounted && factures) {
          const acc: Record<string, number> = {};

          for (let i = 0; i < months; i++) {
            const tempD = new Date(targetMois + "-01");
            tempD.setMonth(tempD.getMonth() - (months - 1) + i);
            const mKey = tempD.toISOString().slice(0, 7);
            acc[mKey] = 0;
          }

          factures.forEach((f) => {
            const m = f.date_emission.slice(0, 7);
            if (acc[m] !== undefined) {
              const totalHT = (f.lignes ?? []).reduce(
                (s, l) => s + l.qte * l.pu_ht,
                0
              );
              acc[m] += totalHT;
            }
          });

          const formattedData = Object.entries(acc).map(([k, v]) => {
            const dateObj = new Date(k + "-01");
            return {
              month: dateObj.toLocaleDateString("fr-FR", { month: "short" }),
              ca: v,
            };
          });

          setData(formattedData);
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchEvo();
    return () => {
      isMounted = false;
    };
  }, [months, targetMois]);

  return { data, isLoading };
}

export function useCoutRepartition(mois?: string) {
  const [data, setData] = useState<{ name: string; value: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchRep = async () => {
      try {
        const { startDate, endDate } = mois ? getMonthRange(mois) : { startDate: "", endDate: "" };
        const depenses = await safeFetch<DepenseFinance>(
          supabase
            .from("depenses_chantier")
            .select("*")
            .gte("date", startDate || "1970-01-01")
            .lte("date", endDate || "2100-01-01"),
          (_err: Error) => {}
        );

        if (isMounted && depenses) {
          const acc: Record<string, number> = {
            materiaux: 0,
            quincaillerie: 0,
            sous_traitance: 0,
            location: 0,
            frais: 0,
            autre: 0,
          };
          depenses.forEach((d) => {
            if (acc[d.nature] !== undefined) acc[d.nature] += d.montant_ht;
            else acc.autre += d.montant_ht;
          });

          const finalData = [
            { name: "Matériaux", value: acc.materiaux },
            { name: "Quincaillerie", value: acc.quincaillerie },
            { name: "Sous-traitance", value: acc.sous_traitance },
            { name: "Location", value: acc.location },
            { name: "Frais", value: acc.frais },
            { name: "Autre", value: acc.autre },
          ].filter((d) => d.value > 0);

          setData(finalData);
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchRep();
    return () => {
      isMounted = false;
    };
  }, [mois]);

  return { data, isLoading };
}

export function useTresoreriePrevision(days = 90) {
  const { factures, achats, masseSalariale, isLoading: tresLoading } = useTresorerie();
  const { valeur: soldeInitial, isLoading: paramLoading } = useParametreFinance("solde_bancaire");

  const [data, setData] = useState<{ date: string; solde: number }[]>([]);

  useEffect(() => {
    if (tresLoading || paramLoading) return;

    let currentSolde = soldeInitial ?? 0;
    const dailyUrssaf = (masseSalariale * 0.47) / 30;

    const today = new Date();
    const result: { date: string; solde: number }[] = [];

    const entreesParJour: Record<string, number> = {};
    const sortiesParJour: Record<string, number> = {};

    factures.forEach((f) => {
      if (f.echeance) {
        const d = f.echeance.slice(0, 10);
        entreesParJour[d] = (entreesParJour[d] || 0) + calculerMontantTTCFacture(f);
      }
    });

    achats.forEach((a) => {
      const d = a.date_livraison_prevue
        ? a.date_livraison_prevue.slice(0, 10)
        : new Date(new Date(a.created_at).getTime() + 30 * 86400000).toISOString().slice(0, 10);
      sortiesParJour[d] = (sortiesParJour[d] || 0) + calculerMontantTTCCommande(a);
    });

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);

      const entrees = entreesParJour[dateStr] || 0;
      const sorties = sortiesParJour[dateStr] || 0;

      currentSolde = currentSolde + entrees - sorties - dailyUrssaf;

      result.push({
        date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        solde: currentSolde,
      });
    }

    setData(result);
  }, [factures, achats, masseSalariale, soldeInitial, tresLoading, paramLoading, days]);

  return useMemo(() => ({ data, isLoading: tresLoading || paramLoading }), [data, tresLoading, paramLoading]);
}

// --- Hook Historique Saisies ---

export function useHistoriqueSaisies() {
  const [pointages, setPointages] = useState<PointageRow[]>([]);
  const [depenses, setDepenses] = useState<DepenseRow[]>([]);
  const [avancements, setAvancements] = useState<AvancementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const handleError = (_err: Error) => {};
    const [resP, resD, resA] = await Promise.all([
      safeFetch<PointageRow>(
        supabase
          .from("pointages")
          .select("*, chantiers(nom), profiles:user_id(full_name)")
          .order("created_at", { ascending: false })
          .limit(50),
        handleError
      ),
      safeFetch<DepenseRow>(
        supabase
          .from("depenses_chantier")
          .select("*, chantiers(nom), fournisseurs(nom)")
          .order("created_at", { ascending: false })
          .limit(50),
        handleError
      ),
      safeFetch<AvancementRow>(
        supabase
          .from("avancements_chantier")
          .select("*, chantiers(nom)")
          .order("created_at", { ascending: false })
          .limit(50),
        handleError
      ),
    ]);

    if (resP.length) setPointages(resP);
    if (resD.length) setDepenses(resD);
    if (resA.length) setAvancements(resA);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const supprimerPointage = async (id: string) => {
    const confirm = window.confirm("Supprimer ce pointage ?");
    if (!confirm) return;
    await supabase.from("pointages").delete().eq("id", id);
    setPointages((prev) => prev.filter((p) => p.id !== id));
  };

  const supprimerDepense = async (id: string) => {
    const confirm = window.confirm("Supprimer cette dépense ?");
    if (!confirm) return;
    await supabase.from("depenses_chantier").delete().eq("id", id);
    setDepenses((prev) => prev.filter((d) => d.id !== id));
  };

  const supprimerAvancement = async (id: string) => {
    const confirm = window.confirm("Supprimer cette saisie d'avancement ?");
    if (!confirm) return;
    await supabase.from("avancements_chantier").delete().eq("id", id);
    setAvancements((prev) => prev.filter((a) => a.id !== id));
  };

  return {
    pointages,
    depenses,
    avancements,
    isLoading,
    supprimerPointage,
    supprimerDepense,
    supprimerAvancement,
    refresh: fetchData,
  };
}

// --- Helper ---

const getMonthRange = (mois: string) => {
  const [year, month] = mois.split("-").map(Number);
  const startDate = `${mois}-01T00:00:00.000Z`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${mois}-${lastDay.toString().padStart(2, "0")}T23:59:59.999Z`;
  return { startDate, endDate };
};