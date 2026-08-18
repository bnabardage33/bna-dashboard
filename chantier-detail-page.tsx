"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ZoneCard, { Zone, LigneCommande, calculerZone } from "@/components/ZoneCard";
import PhotosNotes from "@/components/PhotosNotes";
import { Materiau, Acces, LABELS_MATERIAU, LABELS_ACCES } from "@/lib/meteoAlerte";

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
};

const TABS = ["Général", "Métrés & Technique", "Photos & Notes", "Documents"] as const;

// Clé localStorage utilisée pour transmettre une commande pré-remplie
// depuis un métré vers le formulaire "Nouvelle commande" de la page Fournisseurs.
export const CLE_PREFILL_COMMANDE = "bna_prefill_commande";

export default function ChantierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [chantier, setChantier] = useState<Chantier | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Général");

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

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchChantier(), fetchZones()]).finally(() => setLoading(false));
  }, [fetchChantier, fetchZones]);

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

  // Transmet les lignes calculées depuis une zone vers le formulaire "Nouvelle commande"
  // de la page Fournisseurs (via localStorage, le temps de la navigation), puis y redirige.
  function handleCreerCommande(lignes: LigneCommande[], zoneNom: string) {
    if (!chantier) return;
    const payload = {
      chantierId: chantier.id,
      chantierNom: chantier.nom || chantier.clients?.nom || "",
      zoneNom,
      lignes,
    };
    localStorage.setItem(CLE_PREFILL_COMMANDE, JSON.stringify(payload));
    router.push("/bureau/fournisseurs");
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
      };
    },
    { bruteFacade: 0, brutePignon: 0, ouvertures: 0, nette: 0, aCommander: 0 }
  );

  if (loading) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (!chantier) return <p className="text-sm text-red-400">Chantier introuvable.</p>;

  return (
    <div className="space-y-4">
      <Link href="/terrain/chantier" className="text-sm text-slate-400 hover:text-white">
        ← Chantiers
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-white">
          {chantier.nom || chantier.clients?.nom || "Chantier"}
        </h1>
        <p className="text-sm text-slate-400">
          {chantier.clients?.nom} · {chantier.date_debut || "?"} → {chantier.date_fin || "?"}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-700">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-red-500 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Général" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Client</p>
            <p className="text-white">{chantier.clients?.nom}</p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
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
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            {chantier.adresse_chantier && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  chantier.adresse_chantier
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-sky-400 hover:text-sky-300"
              >
                📍 Ouvrir dans Maps / Waze
              </a>
            )}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Statut</p>
            <select
              value={chantier.statut}
              onChange={(e) => changerStatut(e.target.value)}
              className="mt-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="prevu">Prévu</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
            </select>
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Matériau structurel
              </label>
              <select
                value={chantier.materiau_structurel}
                onChange={(e) => changerMateriau(e.target.value as Materiau)}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                {Object.entries(LABELS_MATERIAU).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Moyen d&apos;accès
              </label>
              <select
                value={chantier.moyen_acces}
                onChange={(e) => changerAcces(e.target.value as Acces)}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                {Object.entries(LABELS_ACCES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Zone de vent
              </label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => changerZoneVent(1)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                    chantier.zone_vent < 3
                      ? "bg-red-600 text-white"
                      : "border border-slate-600 text-slate-300"
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
                      : "border border-slate-600 text-slate-300"
                  }`}
                >
                  Zone 3/4
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Sert au calcul météo/sécurité uniquement (n&apos;influence plus l&apos;entraxe de pose — voir guide 2026.1)
              </p>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Utilisés pour calculer l&apos;alerte météo/sécurité dans l&apos;onglet Météo &amp;
              Alertes.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Checklist</p>
            <div className="mt-2 space-y-2">
              {["tasseaux", "pare_pluie", "pose", "finition"].map((tache) => (
                <label key={tache} className="flex items-center gap-2 text-sm text-slate-300">
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
        </div>
      )}

      {tab === "Métrés & Technique" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 sm:grid-cols-5">
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
            className="w-full rounded-xl border border-dashed border-slate-600 py-3 text-sm font-medium text-slate-400 hover:border-red-600/40 hover:text-red-400"
          >
            + Ajouter une zone
          </button>
        </div>
      )}

      {tab === "Photos & Notes" && <PhotosNotes chantierId={id} />}

      {tab === "Documents" && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-sm text-slate-400">
            Devis et factures liés à ce chantier — à connecter une fois le module Devis &
            Factures repris.
          </p>
        </div>
      )}
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
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-red-400" : "text-white"}`}>
        {value.toFixed(1)} m²
      </p>
    </div>
  );
}
