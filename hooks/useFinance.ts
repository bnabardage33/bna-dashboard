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
} from "@/types/finance";
import {
  calculerRentabiliteChantier,
  calculerKpiMensuel,
  calculerTva,
} from "@/lib/financeCalculs";

export type RentabiliteChantierExt = RentabiliteResult & {
  chantier_id: string;
  nom: string;
  client_nom: string;
  prix_vente_ht: number;
  statut: string;
};

// --- Helpers ---

const getMonthRange = (mois: string) => {
  const [year, month] = mois.split("-").map(Number);
  const startDate = `${mois}-01T00:00:00.000Z`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${mois}-${lastDay.toString().padStart(2, "0")}T23:59:59.999Z`;
  return { startDate, endDate };
};

async function safeFetch<T>(
  query: any,
  onError: (err: Error) => void
): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error) {
      onError(new Error(error.message || String(error)));
      return [];
    }
    return data || [];
  } catch (err: any) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return [];
  }
}

// --- Hook 1 : Rentabilité ---

export function useRentabiliteChantiers() {
  const [chantiers, setChantiers] = useState<any[]>([]);
  const [depenses, setDepenses] = useState<DepenseFinance[]>([]);
  const [pointages, setPointages] = useState<PointageFinance[]>([]);
  const [avancements, setAvancements] = useState<any[]>([]);
  
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

      const [chantiersData, depensesData, pointagesData, avancementsData] = await Promise.all([
        safeFetch<any>(
          supabase.from("chantiers").select("id, nom, client_nom, prix_vente_ht, statut"),
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
        safeFetch<any>(
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
        avancement: 50, // Par défaut
      };

      const result = calculerRentabiliteChantier(chantierBase, depenses, pointages, avancements);

      return {
        ...result,
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

      const [factData, achatsData, depData, pointData, chantData] = await Promise.all([
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
            .gte("date", startDate)
            .lte("date", endDate),
          handleError
        ),
        safeFetch<DepenseFinance>(
          supabase
            .from("depenses_chantier")
            .select("*")
            .gte("date", startDate)
            .lte("date", endDate),
          handleError
        ),
        safeFetch<PointageFinance>(
          supabase
            .from("pointages")
            .select("*")
            .gte("date", startDate)
            .lte("date", endDate),
          handleError
        ),
        safeFetch<any>(
          supabase.from("chantiers").select("id, nom, prix_vente_ht"),
          handleError
        ),
      ]);

      if (isMounted) {
        setFactures(factData);
        setAchats(achatsData);
        setDepenses(depData);
        setPointages(pointData);
        setChantiers(chantData.map((c: any) => ({
          id: c.id,
          nom: c.nom,
          prix_vente_ht: c.prix_vente_ht || 0,
          avancement: 0,
        })));
        setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [targetMois]);

  const kpis = useMemo(() => {
    return calculerKpiMensuel(factures, achats, depenses, pointages, chantiers, targetMois);
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
            .gte("date", startDate)
            .lte("date", endDate),
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
          .single();
        if (!error && data && isMounted) {
          setValeur(data.valeur);
        }
      } catch (err) {
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
  date_echeance?: string;
};
export type TresorerieAchat = AchatFinance & {
  fournisseur_nom?: string;
  date_echeance?: string;
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
        safeFetch<TresorerieFacture>(
          supabase
            .from("factures")
            .select("*, clients(nom)")
            .in("statut", ["emise", "envoyee"])
            .gte("date_echeance", todayStr)
            .lte("date_echeance", in30DaysStr),
          handleError
        ),
        safeFetch<TresorerieAchat>(
          supabase
            .from("commandes")
            .select("*")
            .not("statut", "in", '("paye","payee")')
            .gte("date", todayStr)
            .lte("date", in30DaysStr),
          handleError
        ),
        safeFetch<PointageFinance>(
          supabase
            .from("pointages")
            .select("*")
            .gte("date", startDate)
            .lte("date", endDate),
          handleError
        ),
      ]);

      if (isMounted) {
        setFactures(
          factData.map((f: any) => ({
            ...f,
            client_nom: f.clients?.nom || f.client_nom || "Client inconnu",
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

export function useUrssaf() {
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

      const currentMonth = new Date().toISOString().slice(0, 7);
      const { startDate, endDate } = getMonthRange(currentMonth);

      const pointData = await safeFetch<PointageFinance>(
        supabase
          .from("pointages")
          .select("*")
          .gte("date", startDate)
          .lte("date", endDate),
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
  }, []);

  return { masseSalariale, isLoading, error };
}
