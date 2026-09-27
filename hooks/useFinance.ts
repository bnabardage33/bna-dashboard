"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
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

// O3-B10 : le claim `app_metadata.entreprise_id` doit être un UUID avant d'être
// recopié dans une colonne `uuid`. Sans cette garde, un claim corrompu
// produirait une erreur PostgreSQL opaque ; avec elle, l'échec est explicite et
// sans écriture.
//
// Le retour est un PRÉDICAT DE TYPE (`value is string`) : c'est ce qui permet à
// TypeScript de rétrécir `string | null` en `string` après l'appel, et donc
// d'exiger `entreprise_id: string` dans le payload SANS assertion `as`.
// C'est exactement ce qui manquait au correctif d'origine : le cast
// `as TablesInsert<"parametres_finance">` neutralisait au compilateur le champ
// requis, et le `tsc` ne pouvait donc pas voir l'omission.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * O3-B10 — issue d'une écriture à `parametres_finance`.
 *
 * L'union discriminée oblige l'appelant à traiter l'échec : `updateValeur`
 * renvoyait `void`, donc `TresorerieWidget` refermait l'édition et affichait la
 * nouvelle valeur sans savoir si l'écriture avait eu lieu. Un montant financier
 * non persisté était ainsi présenté comme enregistré.
 */
export type ResultatEcriture = { ok: true } | { ok: false; erreur: string };

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
        // O3-B10 — LA LECTURE EST LAISSÉE INCHANGÉE, délibérément.
        //
        // Elle ne porte pas de `.eq("entreprise_id", …)`, mais elle n'en a pas
        // besoin : le client est navigateur, donc la session porte le claim, et
        // `parametres_finance_ent_select` filtre par
        // `using (entreprise_id = entreprise_courante())`. Vérifié en PROD :
        // une requête avec la clé `anon` rend 0 ligne.
        //
        // C'est ce qui rend `maybeSingle()` sûr malgré l'unicité
        // `(entreprise_id, cle)` : sous RLS, un tenant ne voit qu'une ligne
        // pour une `cle` donnée. Ajouter un filtre ici exigerait de résoudre
        // le tenant dans le chemin de lecture, ce qui n'est pas nécessaire à
        // la cohérence du flux et élargirait le périmètre au-delà du défaut.
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

  const updateValeur = async (newVal: number): Promise<ResultatEcriture> => {
    // O3-B10 — `parametres_finance` est un SINGLETON par tenant : pas de
    // `chantier_id`, donc AUCUN trigger `tg_set_entreprise_par_chantier()`
    // ne peut dériver `entreprise_id`. Aucun trigger de la part4 §7 ne la
    // couvre. Le tenant ne peut donc venir que du claim
    // `app_metadata.entreprise_id`, résolu par le résolveur EXISTANT — la même
    // source que `entreprise_courante()` côté PostgREST, donc exactement la
    // valeur qu'attend la policy `parametres_finance_ent_insert`.
    //
    // Ce module est `"use client"` : le résolveur y fonctionne tel quel, sans
    // adaptation (contrairement au cas serveur de `documents_compta`).
    const { entreprise_id } = await resoudreContexteEntreprise(null);

    // Fail-closed : sans contexte entreprise exploitable, AUCUNE écriture.
    if (!estUuid(entreprise_id)) {
      return {
        ok: false,
        erreur:
          "Enregistrement impossible : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez.",
      };
    }

    // Cible de conflit : la contrainte d'unicité réelle est
    // `unique (entreprise_id, cle)` (migration part1 §271). `onConflict: "cle"`
    // ne correspondait à aucun index — la migration avait SUPPRIMÉ
    // l'ancienne contrainte sur `cle` (part1 §258-268) — donc PostgreSQL ne
    // pouvait pas inférer la cible et l'appel échouait.
    //
    // La RLS n'est PAS contournée : le client reste le client navigateur, et
    // `parametres_finance_ent_insert` impose
    // `with check (entreprise_id = entreprise_courante())`.
    const { error } = await supabase
      .from("parametres_finance")
      .upsert(
        { cle, valeur: newVal, entreprise_id },
        { onConflict: "entreprise_id,cle" }
      );

    // L'erreur PostgREST ne lève pas : elle est renvoyée dans `{ error }`.
    // Sans ce test, un refus d'écriture était INDISCERNABLE d'un succès — c'est
    // ce qui rendait l'upsert « inopérant » sans le moindre feedback.
    if (error) {
      return {
        ok: false,
        erreur: "Enregistrement du solde impossible : " + error.message,
      };
    }

    // L'état n'est mis à jour qu'APRÈS écriture confirmée. L'ancienne mise à
    // jour optimiste (`setValeur` AVANT l'await) affichait le nouveau montant
    // même quand l'écriture avait échoué, et disparaissait au rechargement :
    // une fausse confirmation sur une valeur financière.
    setValeur(newVal);
    return { ok: true };
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