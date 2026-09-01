"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import CommandeModal from "@/components/CommandeModal";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ZoneCard, { Zone, LigneCommande, calculerZone } from "@/components/ZoneCard";
import VisualiseurDebitPlaques from "@/components/VisualiseurDebitPlaques";
import { calculerCalepinage, CalepinageInput, ResultatCalepinage } from "@/lib/calepinageCalcul";
import AvancementFacades from "@/components/AvancementFacadesWrapper";
import { Scissors } from "lucide-react";
import PhotosNotes from "@/components/PhotosNotes";
import { Materiau, Acces, LABELS_MATERIAU, LABELS_ACCES, evaluerAlerteChantier } from "@/lib/meteoAlerte";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import RapportsIntemperiesListe from "@/components/RapportsIntemperiesListe";
import { ChantiersCalepinageView, PointageEquipeView, TableauDeBordRentabiliteView } from "@/components/TempsHeuresViews";

type Chantier = {
  id: string;
  nom: string | null;
  client_id: string;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  checklist: Record<string, boolean>;
  adresse_chantier: string | null;
  materiau_structurel: Materiau;
  moyen_acces: Acces;
  zone_vent: number;
  clients: { nom: string } | null;
  code_acces: string | null;
  surface_m2?: number;
  quantite_coupes_ml?: number;
  singularites_nb?: number;
};

type Pointage = {
  id: string;
  user_id: string;
  date: string;
  heures: number;
  type_heure: string;
  profiles: { full_name: string } | null;
};

type DevisLie = {
  id: string;
  numero: string;
  objet: string | null;
  date_emission: string;
  statut: string;
  lignes: { designation: string; qte: number; pu_ht: number }[];
  tva_pct: number;
};

type FactureLiee = {
  id: string;
  numero: string;
  objet: string | null;
  date_emission: string;
  statut: string;
  type_facture: string;
  lignes: { designation: string; qte: number; pu_ht: number }[];
  tva_pct: number;
};

type CommandeLiee = {
  id: string;
  designation: string;
  quantite: number | null;
  unite: string | null;
  montant_ht: number | null;
  statut: string;
  date_livraison_prevue: string | null;
  fournisseurs: { nom: string } | null;
};

const TABS = ["Général", "Avancement", "Temps Heures", "Métrés & Technique", "Météo & Intempéries", "Photos & Notes", "Documents"] as const;

// Clé localStorage utilisée pour transmettre une commande pré-remplie
// depuis un métré vers le formulaire "Nouvelle commande" de la page Fournisseurs.
const CLE_PREFILL_COMMANDE = "bna_prefill_commande";

function ChantierDetailContent() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id;
  const id = Array.isArray(rawId) ? rawId[0] : (rawId ?? "");

  const [chantier, setChantier] = useState<Chantier | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [devisLies, setDevisLies] = useState<DevisLie[]>([]);
  const [facturesLiees, setFacturesLiees] = useState<FactureLiee[]>([]);
  const [commandesLiees, setCommandesLiees] = useState<CommandeLiee[]>([]);
  const [pvsLies, setPvsLies] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [loadingPointages, setLoadingPointages] = useState(false);
  const [ouvriers, setOuvriers] = useState<{id: string, full_name: string}[]>([]);
  
  const [nouveauPointage, setNouveauPointage] = useState({
    date: new Date().toISOString().slice(0, 10),
    user_id: "",
    heures: 7,
    type_heure: "normale"
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Général");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loadingMeteo, setLoadingMeteo] = useState(false);
  const [detailMeteoOuvert, setDetailMeteoOuvert] = useState(false);
  const [calepinageOuvert, setCalepinageOuvert] = useState<{zone: Zone, resultat: ResultatCalepinage} | null>(null);
  const [consignesSecurite, setConsignesSecurite] = useState<string | null>(null);
  const [isGeneratingSecurite, setIsGeneratingSecurite] = useState(false);


  async function genererSecuriteIA() {
    setIsGeneratingSecurite(true);
    // On force le cast pour éviter les erreurs TS sur les index
    const materiauClé = (chantier?.materiau_structurel as any) || "lames_bois";
    const accesClé = (chantier?.moyen_acces as any) || "pied_oeuvre";
    
    const contexte = `Chantier: ${chantier?.nom}\nMatériau: ${LABELS_MATERIAU[materiauClé as keyof typeof LABELS_MATERIAU] || "Bois"}\nMoyen d'accès: ${LABELS_ACCES[accesClé as keyof typeof LABELS_ACCES] || "Pied d'oeuvre"}\nZone vent: ${chantier?.zone_vent}`;
    
    try {
      const res = await fetch("/api/ia-securite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contexte }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const data = await res.json();
      setConsignesSecurite(data.texte);
    } catch (err) {
      alert("Impossible de générer les consignes.");
    } finally {
      setIsGeneratingSecurite(false);
    }
  }

  const fetchChantier = useCallback(async () => {
    const { data, error } = await supabase
      .from("chantiers")
      .select("*, clients(nom)")
      .eq("id", id)
      .single();
    if (error) console.error(error);
    else setChantier(data as Chantier);
  }, [id]);

  const fetchZones = useCallback(async () => {
    const { data, error } = await supabase
      .from("chantier_zones")
      .select("*")
      .eq("chantier_id", id)
      .order("created_at", { ascending: true });
    if (error) console.error(error);
    else setZones((data as Zone[]).map((z) => ({ ...z, ouvertures: z.ouvertures || [] })));
  }, [id]);

  const fetchDocuments = useCallback(async () => {
    setLoadingDocs(true);
    const [coRes, devisRes, facturesRes, pvsRes] = await Promise.all([
      supabase
        .from("commandes")
        .select("*, fournisseurs(nom)")
        .eq("chantier_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("devis")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("factures")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("pv_receptions")
        .select("*")
        .eq("chantier_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (coRes.data) setCommandesLiees(coRes.data as unknown as CommandeLiee[]);
    if (pvsRes.data) setPvsLies(pvsRes.data);
    if (devisRes.data && chantier?.client_id) {
      setDevisLies(
        (devisRes.data as DevisLie[]).filter(
          (d) => (d as any).client_id === chantier.client_id
        )
      );
    }
    if (facturesRes.data && chantier?.client_id) {
      setFacturesLiees(
        (facturesRes.data as FactureLiee[]).filter(
          (f) => (f as any).client_id === chantier.client_id
        )
      );
    }
    setLoadingDocs(false);
  }, [id, chantier?.client_id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchChantier(), fetchZones()]).finally(() => setLoading(false));
  }, [fetchChantier, fetchZones]);

  useEffect(() => {
    if (tab === "Documents" && chantier) {
      fetchDocuments();
    }
    if (tab === "Météo & Intempéries" && chantier) {
      const adresse = chantier.adresse_chantier || chantier.nom || "Ajaccio, Corse";
      setLoadingMeteo(true);
      fetchMeteo(adresse)
        .then((m) => setMeteo(m))
        .catch((e) => console.error("Erreur météo chantier:", e))
        .finally(() => setLoadingMeteo(false));
    }
  }, [tab, chantier, fetchDocuments]);

  useEffect(() => {
    // Sync les totaux de zones vers le chantier
    if (!chantier || loading) return;
    
    // Calcul des totaux actuels
    const currentTotaux = zones.reduce(
      (acc, z) => {
        const c = calculerZone(z);
        return {
          nette: acc.nette + c.surfaceNette,
          totalCoupesML: acc.totalCoupesML + (c.totalCoupesML || 0),
          ouvertures: acc.ouvertures + c.nombreOuvertures,
        };
      },
      { nette: 0, totalCoupesML: 0, ouvertures: 0 }
    );

    const surface_m2 = parseFloat(currentTotaux.nette.toFixed(2));
    const quantite_coupes_ml = parseFloat(currentTotaux.totalCoupesML.toFixed(2));
    const singularites_nb = currentTotaux.ouvertures;

    const needsUpdate = 
      (chantier.surface_m2 ?? 0) !== surface_m2 || 
      (chantier.quantite_coupes_ml ?? 0) !== quantite_coupes_ml ||
      (chantier.singularites_nb ?? 0) !== singularites_nb;

    if (needsUpdate) {
      // Mise à jour optimiste (immédiate) pour la réactivité entre onglets
      setChantier(prev => prev ? { ...prev, surface_m2, quantite_coupes_ml, singularites_nb } : null);

      supabase
        .from("chantiers")
        .update({ surface_m2, quantite_coupes_ml, singularites_nb })
        .eq("id", chantier.id)
        .then(({ error }) => {
          if (error) {
            console.error("Erreur sync calepinage -> chantier:", error);
          }
        });
    }
  }, [zones, chantier?.id]);

  async function changerStatut(statut: string) {
    if (!chantier) return;
    const { error } = await supabase.from("chantiers").update({ statut }).eq("id", id);
    if (!error) setChantier({ ...chantier, statut });
  }

  async function toggleTache(tache: string) {
    if (!chantier) return;
    const newChecklist = { ...chantier.checklist, [tache]: !chantier.checklist[tache] };
    const { error } = await supabase
      .from("chantiers")
      .update({ checklist: newChecklist })
      .eq("id", id);
    if (!error) setChantier({ ...chantier, checklist: newChecklist });
  }

  async function changerMateriau(materiau_structurel: Materiau) {
    if (!chantier) return;
    const { error } = await supabase
      .from("chantiers")
      .update({ materiau_structurel })
      .eq("id", id);
    if (!error) setChantier({ ...chantier, materiau_structurel });
  }

  async function changerAcces(moyen_acces: Acces) {
    if (!chantier) return;
    const { error } = await supabase.from("chantiers").update({ moyen_acces }).eq("id", id);
    if (!error) setChantier({ ...chantier, moyen_acces });
  }

  async function changerAdresse(adresse_chantier: string) {
    if (!chantier) return;
    const { error } = await supabase
      .from("chantiers")
      .update({ adresse_chantier })
      .eq("id", id);
    if (!error) setChantier({ ...chantier, adresse_chantier });
  }

  async function changerZoneVent(zone_vent: number) {
    if (!chantier) return;
    const { error } = await supabase.from("chantiers").update({ zone_vent }).eq("id", id);
    if (!error) setChantier({ ...chantier, zone_vent });
  }

  async function ajouterZone() {
    const { data, error } = await supabase
      .from("chantier_zones")
      .insert({
        chantier_id: id,
        type: "facade",
        nom: `Zone ${zones.length + 1}`,
        largeur: 0,
        hauteur_mur: 0,
        materiau: "lames",
        ouvertures: [],
        famille_pose: null,
        angle: false,
      })
      .select()
      .single();
    if (error) {
      console.error(error);
      return;
    }
    setZones((z) => [...z, { ...(data as Zone), ouvertures: [] }]);
  }

  async function updateZone(zone: Zone) {
    setZones((zs) => zs.map((z) => (z.id === zone.id ? zone : z)));
    const { error } = await supabase
      .from("chantier_zones")
      .update({
        type: zone.type,
        nom: zone.nom,
        largeur: zone.largeur,
        hauteur_mur: zone.hauteur_mur,
        hauteur_faite: zone.hauteur_faite,
        materiau: zone.materiau,
        ouvertures: zone.ouvertures,
        famille_pose: zone.famille_pose,
        angle: zone.angle,
        largeur_lame_mm: zone.largeur_lame_mm,
        plaque_longueur_mm: zone.plaque_longueur_mm,
        plaque_largeur_mm: zone.plaque_largeur_mm,
        sens_pose: zone.sens_pose,
      })
      .eq("id", zone.id);
    if (error) console.error(error);
  }

  async function supprimerZone(zoneId: string) {
    const { error } = await supabase.from("chantier_zones").delete().eq("id", zoneId);
    if (!error) setZones((zs) => zs.filter((z) => z.id !== zoneId));
  }

  const [commandeModalData, setCommandeModalData] = useState<{ isOpen: boolean; lignes: LigneCommande[]; zoneNom: string; chantierNom: string }>({
    isOpen: false,
    lignes: [],
    zoneNom: "",
    chantierNom: "",
  });

  // Transmet les lignes calculées depuis une zone vers la modale de chiffrage/commande
  function handleCreerCommande(lignes: LigneCommande[], zoneNom: string) {
    if (!chantier) return;
    setCommandeModalData({
      isOpen: true,
      lignes,
      zoneNom,
      chantierNom: chantier.nom || chantier.clients?.nom || "Chantier en cours"
    });
  }

  const totaux = zones.reduce(
    (acc, z) => {
      const c = calculerZone(z);
      return {
        bruteFacade: acc.bruteFacade + c.bruteFacade,
        brutePignon: acc.brutePignon + c.brutePignon,
        ouvertures: acc.ouvertures + c.totalOuvertures,
        nette: acc.nette + c.surfaceNette,
        aCommander: acc.aCommander + c.surfaceACommander,
        totalCoupesML: acc.totalCoupesML + (c.totalCoupesML || 0),
      };
    },
    { bruteFacade: 0, brutePignon: 0, ouvertures: 0, nette: 0, aCommander: 0, totalCoupesML: 0 }
  );

  if (loading) return <p className="text-sm text-gray-400">Chargement…</p>;
  if (!chantier) return <p className="text-sm text-red-400">Chantier introuvable.</p>;

  return (
    <div className="space-y-4 pt-44">
      <Link href="/terrain/chantier" className="text-sm text-gray-400 hover:text-white">
        ← Chantiers
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">
            {chantier.nom || chantier.clients?.nom || "Chantier"}
          </h1>
          <p className="text-sm text-gray-400">
            {chantier.clients?.nom} · {chantier.date_debut || "?"} → {chantier.date_fin || "?"}
          </p>
        </div>

        {chantier.code_acces && (
          <button
            onClick={() => {
              const link = `${window.location.origin}/espace-client/${chantier.code_acces}`;
              navigator.clipboard.writeText(link);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-red-600/20 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-red-600/30 transition-all border border-white/10"
          >
            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
            {copiedLink ? "Lien copié" : "Lien Espace Client"}
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap transition-all ${
              tab === t
                ? "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                : "bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full px-4 py-2 border border-white/5 transition-all"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Général" && (
        <div className="space-y-4">

          {/* Bloc Sécurité IA */}
          <div className="rounded-xl border border-white/10 bg-gradient-to-br from-[#1A1D24] to-[#0B0F19] p-4 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gray-400" />
                PPSPS Express (Consignes de Sécurité IA)
              </h3>
              {!consignesSecurite && (
                <button
                  onClick={genererSecuriteIA}
                  disabled={isGeneratingSecurite}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {isGeneratingSecurite ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {isGeneratingSecurite ? "Génération..." : "Générer"}
                </button>
              )}
            </div>
            {consignesSecurite ? (
              <div className="mt-4 space-y-2 text-sm text-gray-300 bg-transparent/50 p-4 rounded-lg border border-white/10 whitespace-pre-wrap">
                {consignesSecurite}
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setConsignesSecurite(null)} className="text-xs text-gray-500 hover:text-gray-300 underline">
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                L'IA analyse le matériel (nacelle, échafaudage) et le matériau (HPL, bois) pour générer les 5 règles d'or de sécurité du jour.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Client</p>
            <p className="text-white">{chantier.clients?.nom}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Adresse du chantier
            </p>
            <input
              defaultValue={chantier.adresse_chantier ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (chantier.adresse_chantier ?? "")) {
                  changerAdresse(e.target.value);
                }
              }}
              placeholder="Ex. 12 rue des Vignes, 33000 Bordeaux"
              className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white"
            />
            {chantier.adresse_chantier && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  chantier.adresse_chantier
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-gray-300 hover:text-gray-400"
              >
                📍 Ouvrir dans Maps / Waze
              </a>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Statut</p>
            <select
              value={chantier.statut}
              onChange={(e) => changerStatut(e.target.value)}
              className="mt-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white"
            >
              <option value="prevu">Prévu</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
            </select>
          </div>

          <div className="grid gap-3 rounded-xl border border-white/10 bg-[#1A1D24] p-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500">
                Matériau structurel
              </label>
              <select
                value={chantier.materiau_structurel}
                onChange={(e) => changerMateriau(e.target.value as Materiau)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white"
              >
                {Object.entries(LABELS_MATERIAU).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500">
                Moyen d&apos;accès
              </label>
              <select
                value={chantier.moyen_acces}
                onChange={(e) => changerAcces(e.target.value as Acces)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white"
              >
                {Object.entries(LABELS_ACCES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-gray-500">
                Zone de vent
              </label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => changerZoneVent(1)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                    chantier.zone_vent < 3
                      ? "bg-red-600 text-white"
                      : "border border-white/10 text-gray-300"
                  }`}
                >
                  Zone 1/2
                </button>
                <button
                  type="button"
                  onClick={() => changerZoneVent(3)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                    chantier.zone_vent >= 3
                      ? "bg-red-600 text-white"
                      : "border border-white/10 text-gray-300"
                  }`}
                >
                  Zone 3/4
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Sert au calcul météo/sécurité uniquement (n&apos;influence plus l&apos;entraxe de pose — voir guide 2026.1)
              </p>
            </div>
            <p className="text-xs text-gray-500 sm:col-span-2">
              Utilisés pour calculer l&apos;alerte météo/sécurité dans l&apos;onglet Météo &amp;
              Alertes.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Checklist</p>
            <div className="mt-2 space-y-2">
              {["tasseaux", "pare_pluie", "pose", "finition"].map((tache) => (
                <label key={tache} className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={!!chantier.checklist?.[tache]}
                    onChange={() => toggleTache(tache)}
                  />
                  {tache.replace("_", " ")}
                </label>
              ))}
            </div>
          </div>

          {/* Clôture & PV de Réception */}
          <div className="rounded-xl border border-red-500/30 bg-red-950/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-400">
                🏁 Fin de Chantier &amp; PV de Réception
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Rédiger le procès-verbal, consigner les réserves éventuelles, faire signer le client et déclencher la garantie décennale.
              </p>
            </div>

            <Link
              href={`/bureau/fin-chantier?chantierId=${id}`}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-red-900/200 transition-colors"
            >
              Établir le PV de Réception →
            </Link>
          </div>
        </div>
      )}

      {tab === "Avancement" && <AvancementFacades chantierId={id} />}

      {tab === "Temps Heures" && (
        <div className="space-y-6">
          <ChantiersCalepinageView 
            initialSurface={chantier.surface_m2 || 0} 
            initialCoupes={chantier.quantite_coupes_ml || 0} 
            initialSingularites={chantier.singularites_nb || 0} 
          />
          <PointageEquipeView 
            chantierId={chantier.id}
            chantierNom={chantier.nom || chantier.clients?.nom || "Chantier en cours"}
          />
          <TableauDeBordRentabiliteView 
            chantierId={chantier.id}
            chantierNom={chantier.nom || chantier.clients?.nom || "Chantier en cours"}
          />
        </div>
      )}

      {tab === "Métrés & Technique" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-[#1A1D24] p-4 sm:grid-cols-5">
            <Resume label="Brut façades" value={totaux.bruteFacade} />
            <Resume label="Brut pignons" value={totaux.brutePignon} />
            <Resume label="Ouvertures" value={totaux.ouvertures} />
            <Resume label="Total net" value={totaux.nette} />
            <Resume label="À commander" value={totaux.aCommander} highlight />
          </div>

          <div className="space-y-4">
            {zones.map((zone) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                zoneVent={chantier.zone_vent}
                onChange={updateZone}
                onDelete={supprimerZone}
                onCreerCommande={handleCreerCommande}
              />
            ))}
          </div>

          <button
            onClick={ajouterZone}
            className="w-full rounded-xl border border-dashed border-white/10 py-3 text-sm font-medium text-gray-400 hover:border-red-600/40 hover:text-red-400"
          >
            + Ajouter une zone
          </button>
        </div>
      )}

      {tab === "Météo & Intempéries" && (
        <div className="space-y-6">
          {/* Météo en direct pour le chantier */}
          <div className="space-y-4 rounded-xl border border-white/10 bg-[#1A1D24] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-300">
                  🌤️ Météo en direct · {chantier.adresse_chantier || chantier.nom || "Ajaccio"}
                </h3>
                <p className="text-xs text-gray-500">
                  Relevé en temps réel · Matériau : {LABELS_MATERIAU[chantier.materiau_structurel]} · Accès : {LABELS_ACCES[chantier.moyen_acces]}
                </p>
              </div>

              {meteo && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                    meteo.alerte.niveau === "rouge"
                      ? "bg-red-900/200/20 text-red-400"
                      : meteo.alerte.niveau === "orange"
                      ? "bg-red-600/20 text-gray-400"
                      : meteo.alerte.niveau === "jaune"
                      ? "bg-red-600/20 text-gray-400"
                      : "bg-red-600/20 text-gray-400"
                  }`}
                >
                  {meteo.alerte.niveau === "rouge" ? "🔴 " : meteo.alerte.niveau === "orange" ? "🟠 " : meteo.alerte.niveau === "jaune" ? "🟡 " : "🟢 "}
                  {meteo.alerte.niveau.toUpperCase()}
                </span>
              )}
            </div>

            {loadingMeteo ? (
              <p className="text-sm text-gray-400">Chargement de la météo en direct…</p>
            ) : meteo ? (
              <>
                <div
                  className={`rounded-lg border p-3 ${
                    meteo.alerte.niveau === "rouge"
                      ? "border-red-500/40 bg-red-900/200/10 text-red-300"
                      : meteo.alerte.niveau === "orange"
                      ? "border-white/10 bg-red-600/10 text-gray-400"
                      : meteo.alerte.niveau === "jaune"
                      ? "border-white/10 bg-red-600/10 text-gray-400"
                      : "border-white/10 bg-red-600/10 text-gray-400"
                  }`}
                >
                  <p className="text-xs font-semibold">{meteo.alerte.motif}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-transparent/60 p-3">
                    <p className="text-xs text-gray-500">Matin</p>
                    <p className="text-lg font-bold text-white">{meteo.matin.temp}°C</p>
                    <p className="text-[11px] text-gray-400">Rafales {meteo.matin.rafales} km/h</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-transparent/60 p-3">
                    <p className="text-xs text-gray-500">Après-midi</p>
                    <p className="text-lg font-bold text-white">{meteo.apresMidi.temp}°C</p>
                    <p className="text-[11px] text-gray-400">Rafales {meteo.apresMidi.rafales} km/h</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-transparent/60 p-3">
                    <p className="text-xs text-gray-500">Rafales Max</p>
                    <p className="text-lg font-bold text-gray-300">
                      {Math.max(meteo.matin.rafales, meteo.apresMidi.rafales)} km/h
                    </p>
                    <p className="text-[11px] text-gray-400">Sur la journée</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-transparent/60 p-3">
                    <p className="text-xs text-gray-500">Précipitations</p>
                    <p className="text-lg font-bold text-gray-400">
                      {meteo.heures.reduce((s, h) => s + h.pluie, 0).toFixed(1)} mm
                    </p>
                    <p className="text-[11px] text-gray-400">Cumul journalier</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailMeteoOuvert((v) => !v)}
                  className="text-xs font-medium text-gray-400 hover:text-gray-200"
                >
                  {detailMeteoOuvert ? "▲ Masquer le détail heure par heure" : "▼ Afficher le détail heure par heure"}
                </button>

                {detailMeteoOuvert && (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {meteo.heures.map((h) => (
                      <div
                        key={h.heure}
                        className="rounded-lg border border-white/10 bg-transparent/60 p-2 text-center"
                      >
                        <p className="text-[10px] text-gray-500">{h.heure}</p>
                        <p className="text-xs font-bold text-white">{h.temp}°C</p>
                        <p className="text-[10px] text-gray-400">{h.vent}·{h.rafales} km/h</p>
                        {h.pluie > 0 && <p className="text-[10px] text-gray-300">{h.pluie} mm</p>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400">
                Impossible de charger la météo en direct pour cette adresse.
              </p>
            )}
          </div>

          {/* Liste et génération des Rapports Intempéries */}
          <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
            <RapportsIntemperiesListe chantierId={id} />
          </div>
        </div>
      )}

      {tab === "Photos & Notes" && <PhotosNotes chantierId={id} />}

      {tab === "Documents" && (
        <div className="space-y-6">
          {/* Synthèse financière du chantier */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Total Devisé HT</p>
              <p className="mt-1 text-xl font-bold text-white">
                {devisLies
                  .reduce(
                    (s, d) => s + (d.lignes || []).reduce((acc, l) => acc + l.qte * l.pu_ht, 0),
                    0
                  )
                  .toFixed(2)}{" "}
                €
              </p>
              <p className="text-xs text-gray-500">{devisLies.length} devis rattaché(s)</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Total Facturé TTC</p>
              <p className="mt-1 text-xl font-bold text-gray-400">
                {facturesLiees
                  .reduce((s, f) => {
                    const ht = (f.lignes || []).reduce((acc, l) => acc + l.qte * l.pu_ht, 0);
                    return s + ht * (1 + (f.tva_pct || 10) / 100);
                  }, 0)
                  .toFixed(2)}{" "}
                €
              </p>
              <p className="text-xs text-gray-500">{facturesLiees.length} facture(s)</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Achats Matériaux HT</p>
              <p className="mt-1 text-xl font-bold text-gray-300">
                {commandesLiees
                  .reduce((s, c) => s + (c.montant_ht || 0), 0)
                  .toFixed(2)}{" "}
                €
              </p>
              <p className="text-xs text-gray-500">{commandesLiees.length} commande(s) fournisseur</p>
            </div>
          </div>

          {loadingDocs ? (
            <p className="text-sm text-gray-400">Chargement des documents…</p>
          ) : (
            <div className="space-y-6">
              {/* Devis */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                    Devis Client
                  </h3>
                  <Link
                    href="/bureau/devis-factures"
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    + Nouveau devis →
                  </Link>
                </div>
                {devisLies.length === 0 ? (
                  <p className="text-xs text-gray-500">Aucun devis lié pour ce client.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1A1D24]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400">
                          <th className="p-3">Numéro</th>
                          <th className="p-3">Objet</th>
                          <th className="p-3">Date</th>
                          <th className="p-3 text-right">Total HT</th>
                          <th className="p-3">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 text-gray-200">
                        {devisLies.map((d) => {
                          const ht = (d.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                          return (
                            <tr key={d.id}>
                              <td className="p-3 font-semibold text-white">{d.numero}</td>
                              <td className="p-3 text-gray-300">{d.objet || "—"}</td>
                              <td className="p-3 text-gray-400">
                                {new Date(d.date_emission).toLocaleDateString("fr-FR")}
                              </td>
                              <td className="p-3 text-right font-medium">{ht.toFixed(2)} €</td>
                              <td className="p-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                    d.statut === "accepte"
                                      ? "bg-red-600/20 text-gray-400"
                                      : d.statut === "refuse"
                                      ? "bg-red-900/200/20 text-red-400"
                                      : "bg-[#1A1D24] text-gray-300"
                                  }`}
                                >
                                  {d.statut}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Factures */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                    Factures & Acomptes
                  </h3>
                  <Link
                    href="/bureau/factures"
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    + Nouvelle facture →
                  </Link>
                </div>
                {facturesLiees.length === 0 ? (
                  <p className="text-xs text-gray-500">Aucune facture pour ce client.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1A1D24]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400">
                          <th className="p-3">Numéro</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Objet</th>
                          <th className="p-3">Date</th>
                          <th className="p-3 text-right">Total TTC</th>
                          <th className="p-3">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 text-gray-200">
                        {facturesLiees.map((f) => {
                          const ht = (f.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                          const ttc = ht * (1 + (f.tva_pct || 10) / 100);
                          return (
                            <tr key={f.id}>
                              <td className="p-3 font-semibold text-white">{f.numero}</td>
                              <td className="p-3">
                                <span className="rounded bg-[#1A1D24] px-1.5 py-0.5 text-[10px] uppercase text-gray-300">
                                  {f.type_facture || "totale"}
                                </span>
                              </td>
                              <td className="p-3 text-gray-300">{f.objet || "—"}</td>
                              <td className="p-3 text-gray-400">
                                {new Date(f.date_emission).toLocaleDateString("fr-FR")}
                              </td>
                              <td className="p-3 text-right font-medium text-gray-400">
                                {ttc.toFixed(2)} €
                              </td>
                              <td className="p-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                    f.statut === "payee"
                                      ? "bg-red-600/20 text-gray-400"
                                      : f.statut === "envoyee"
                                      ? "bg-red-600/20 text-gray-400"
                                      : "bg-[#1A1D24] text-gray-300"
                                  }`}
                                >
                                  {f.statut}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {/* Procès-Verbaux de Réception (Fin de chantier) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                    Procès-Verbaux de Réception (Fin de chantier)
                  </h3>
                  <Link
                    href={`/bureau/fin-chantier?chantierId=${id}`}
                    className="text-xs font-semibold text-red-400 hover:text-red-300"
                  >
                    + Rédiger un PV de réception →
                  </Link>
                </div>

                {pvsLies.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4 text-xs text-gray-400 flex items-center justify-between">
                    <span>Aucun PV de réception émis pour ce chantier.</span>
                    <Link
                      href={`/bureau/fin-chantier?chantierId=${id}`}
                      className="font-semibold text-red-400 hover:text-red-300"
                    >
                      Établir le PV →
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1A1D24]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400">
                          <th className="p-3">Numéro</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Statut</th>
                          <th className="p-3 text-center">Réserves</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 text-gray-200">
                        {pvsLies.map((p) => {
                          const nbRes = (p.reserves || []).length;
                          const nbLevees = (p.reserves || []).filter((r: any) => r.levee).length;
                          return (
                            <tr key={p.id}>
                              <td className="p-3 font-semibold text-white font-mono">{p.numero}</td>
                              <td className="p-3 text-gray-400">
                                {new Date(p.date_reception).toLocaleDateString("fr-FR")}
                              </td>
                              <td className="p-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                    p.statut === "sans_reserve"
                                      ? "bg-red-600/20 text-gray-400"
                                      : p.statut === "reserves_levees"
                                      ? "bg-red-600/20 text-gray-300"
                                      : "bg-red-600/20 text-gray-400"
                                  }`}
                                >
                                  {p.statut === "sans_reserve"
                                    ? "Sans réserve"
                                    : p.statut === "reserves_levees"
                                    ? "Réserves levées"
                                    : "Avec réserves"}
                                </span>
                              </td>
                              <td className="p-3 text-center text-gray-400">
                                {nbRes === 0 ? "—" : `${nbLevees}/${nbRes} levée(s)`}
                              </td>
                              <td className="p-3 text-right">
                                <Link
                                  href={`/bureau/fin-chantier`}
                                  className="rounded bg-[#1A1D24] px-2.5 py-1 text-xs text-gray-200 hover:bg-[#1A1D24]"
                                >
                                  Gérer / PDF →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Rapports Intempéries */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                  Rapports Intempéries
                </h3>
                <RapportsIntemperiesListe chantierId={id} />
              </div>
              {/* Commandes Fournisseurs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
                    Commandes Fournisseurs & Matériaux
                  </h3>
                  <Link
                    href="/bureau/fournisseurs"
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    + Gérer les achats →
                  </Link>
                </div>
                {commandesLiees.length === 0 ? (
                  <p className="text-xs text-gray-500">Aucune commande fournisseur pour ce chantier.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1A1D24]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400">
                          <th className="p-3">Fournisseur</th>
                          <th className="p-3">Désignation</th>
                          <th className="p-3">Quantité</th>
                          <th className="p-3 text-right">Montant HT</th>
                          <th className="p-3">Livraison</th>
                          <th className="p-3">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10 text-gray-200">
                        {commandesLiees.map((c) => (
                          <tr key={c.id}>
                            <td className="p-3 font-semibold text-white">
                              {c.fournisseurs?.nom || "Fournisseur"}
                            </td>
                            <td className="p-3 text-gray-300">{c.designation}</td>
                            <td className="p-3 text-gray-400">
                              {c.quantite ? `${c.quantite} ${c.unite || ""}` : "—"}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {c.montant_ht ? `${c.montant_ht.toFixed(2)} €` : "—"}
                            </td>
                            <td className="p-3 text-gray-400">
                              {c.date_livraison_prevue
                                ? new Date(c.date_livraison_prevue).toLocaleDateString("fr-FR")
                                : "—"}
                            </td>
                            <td className="p-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  c.statut === "livree"
                                    ? "bg-red-600/20 text-gray-400"
                                    : c.statut === "commandee"
                                    ? "bg-red-600/20 text-gray-300"
                                    : "bg-[#1A1D24] text-gray-300"
                                }`}
                              >
                                {c.statut}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CHIFFRAGE / COMMANDE */}
      <CommandeModal
        isOpen={commandeModalData.isOpen}
        onClose={() => setCommandeModalData({ ...commandeModalData, isOpen: false })}
        lignesInitiales={commandeModalData.lignes}
        chantierId={chantier?.id || ""}
        chantierNom={commandeModalData.chantierNom || chantier?.nom || "Chantier en cours"}
        zoneNom={commandeModalData.zoneNom}
      />
    </div>
  );
}

function Resume({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-red-400" : "text-white"}`}>
        {value.toFixed(1)} m²
      </p>
    </div>
  );
}

export default function ChantierDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-400">Chargement du chantier…</div>}>
      <ChantierDetailContent />
    </Suspense>
  );
}
