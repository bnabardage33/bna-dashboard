// components/terrasse/ModifierChantierTerrasseModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Pencil,
  MapPin,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Layers3,
  Phone,
  TreePine,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type ClientTerrasse = {
  id: string;
  nom: string;
  societe: string | null;
};

export type FicheTechniqueTerrasse = {
  id: string;
  nom?: string;
  essence_bois: string;
  type_sol?: string;
  systeme_terrasse?: string;
  longueur_m?: number;
  largeur_m?: number;
  resultats_techniques?: unknown;
};

export type ChantierTerrasseModifiable = {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  code_acces?: string | null;
  contact_chantier?: string | null;
  notes_terrain?: string | null;
  metier?: string | null;
  entreprise_id?: string | null;
  clients?: { nom: string; societe: string | null } | null;
  chantier_terrasses?: FicheTechniqueTerrasse | FicheTechniqueTerrasse[] | null;
};

export interface ModifierChantierTerrasseModalProps {
  chantier: any;
  clients?: ClientTerrasse[];
  ouvert: boolean;
  onFermer: () => void;
  onSucces: (chantierMisAJour: any) => void;
}

/**
 * Extrait en toute sécurité la fiche technique terrasse, que Supabase
 * renvoie un objet singulier (relation 1-1 avec contrainte UNIQUE),
 * un tableau, ou une valeur nulle.
 */
export function extraireFicheTerrasse(
  terrasses: FicheTechniqueTerrasse | FicheTechniqueTerrasse[] | null | undefined
): FicheTechniqueTerrasse | null {
  if (!terrasses) return null;
  if (Array.isArray(terrasses)) {
    return terrasses.length > 0 ? terrasses[0] : null;
  }
  if (typeof terrasses === "object" && "id" in terrasses) {
    return terrasses as FicheTechniqueTerrasse;
  }
  return null;
}

export default function ModifierChantierTerrasseModal({
  chantier,
  clients: clientsProps,
  ouvert,
  onFermer,
  onSucces,
}: ModifierChantierTerrasseModalProps) {
  const [clients, setClients] = useState<ClientTerrasse[]>(clientsProps || []);
  const [nom, setNom] = useState("");
  const [clientId, setClientId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [statut, setStatut] = useState<"prevu" | "en_cours" | "termine">("prevu");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [contactChantier, setContactChantier] = useState("");
  const [notesTerrain, setNotesTerrain] = useState("");

  // Caractéristiques spécifiques terrasse principale (DTU 51.4)
  const [essenceBois, setEssenceBois] = useState("pin_cl4");
  const [typeSol, setTypeSol] = useState("dalle_beton");

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Charger la liste des clients si non fournie en props
  useEffect(() => {
    if (!ouvert) return;
    if (clientsProps && clientsProps.length > 0) {
      setClients(clientsProps);
      return;
    }
    async function chargerClients() {
      const { data } = await supabase
        .from("clients")
        .select("id, nom, societe")
        .order("nom");
      if (data) setClients(data as ClientTerrasse[]);
    }
    chargerClients();
  }, [ouvert, clientsProps]);

  // Synchronisation des valeurs à l'ouverture pour le chantier sélectionné
  useEffect(() => {
    if (chantier) {
      setNom(chantier.nom || "");
      setClientId(chantier.client_id || "");
      setAdresse(chantier.adresse_chantier || "");
      const s = chantier.statut;
      setStatut(
        s === "en_cours" || s === "termine" ? (s as "en_cours" | "termine") : "prevu"
      );
      setDateDebut(chantier.date_debut ? chantier.date_debut.split("T")[0] : "");
      setDateFin(chantier.date_fin ? chantier.date_fin.split("T")[0] : "");
      setContactChantier(chantier.contact_chantier || "");
      setNotesTerrain(chantier.notes_terrain || "");

      // Fiche technique rattachée si présente (Objet singulier Supabase ou Tableau)
      const terr = extraireFicheTerrasse(chantier.chantier_terrasses);
      if (terr) {
        setEssenceBois(terr.essence_bois || "pin_cl4");
        setTypeSol(terr.type_sol || "dalle_beton");
      }
      setErreur(null);
    }
  }, [chantier]);

  if (!ouvert || !chantier) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chantier) return;

    if (!nom.trim()) {
      setErreur("Le nom du chantier terrasse est obligatoire.");
      return;
    }
    if (!clientId) {
      setErreur("Le client associé est obligatoire.");
      return;
    }

    setEnCours(true);
    setErreur(null);

    try {
      // 1. Résolution stricte du contexte entreprise (Isolation multi-tenant fail-closed)
      const contexte = await resoudreContexteEntreprise(null);
      const entreprise_id = contexte.entreprise_id;

      if (!estUuid(entreprise_id)) {
        console.error(
          "Chantiers Terrasse : modification refusée — contexte entreprise introuvable ou invalide."
        );
        setErreur("Impossible d'enregistrer : session sans entreprise identifiée.");
        setEnCours(false);
        return;
      }

      // 2. Sécurité multi-tenant : vérifier que le chantier appartient au tenant courant
      if (chantier.entreprise_id && chantier.entreprise_id !== entreprise_id) {
        setErreur("Action non autorisée : ce chantier n'appartient pas à votre entreprise.");
        setEnCours(false);
        return;
      }

      // 3. Cloisonnement strict Métier : interdiction absolue d'altérer un chantier Bardage
      if (chantier.metier === "bardage") {
        setErreur("Action non autorisée : les chantiers bardage ne peuvent pas être modifiés ici.");
        setEnCours(false);
        return;
      }

      // 4. Payload ciblé sur chantiers : conservation impérative de metier = 'terrasse'
      const payloadChantier = {
        nom: nom.trim(),
        client_id: clientId,
        adresse_chantier: adresse.trim() || null,
        statut,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        contact_chantier: contactChantier.trim() || null,
        notes_terrain: notesTerrain.trim() || null,
        metier: "terrasse",
      };

      const { error: errorChantier } = await (supabase
        .from("chantiers") as any)
        .update(payloadChantier)
        .eq("id", chantier.id)
        .eq("entreprise_id", entreprise_id);

      if (errorChantier) {
        console.error("Erreur mise à jour chantier terrasse:", errorChantier);
        setErreur("Erreur lors de la sauvegarde : " + errorChantier.message);
        setEnCours(false);
        return;
      }

      // 5. Mise à jour de la terrasse principale si fiche existante
      const terr = extraireFicheTerrasse(chantier.chantier_terrasses);
      const terrasseId = terr?.id;
      if (terrasseId) {
        await (supabase.from("chantier_terrasses") as any)
          .update({
            essence_bois: essenceBois,
            type_sol: typeSol,
          })
          .eq("id", terrasseId)
          .eq("chantier_id", chantier.id);
      }

      // 6. Retrouver le client sélectionné pour actualisation en temps réel de la carte
      const clientSelectionne = clients.find((c) => c.id === clientId);

      // 7. Reconstruction propre de la relation chantier_terrasses selon sa structure d'origine
      let nouveauChantierTerrasses: any = null;
      if (Array.isArray(chantier.chantier_terrasses)) {
        nouveauChantierTerrasses = chantier.chantier_terrasses.map((t: any, idx: number) =>
          idx === 0 ? { ...t, essence_bois: essenceBois, type_sol: typeSol } : t
        );
      } else if (chantier.chantier_terrasses && typeof chantier.chantier_terrasses === "object") {
        nouveauChantierTerrasses = {
          ...chantier.chantier_terrasses,
          essence_bois: essenceBois,
          type_sol: typeSol,
        };
      } else if (terr) {
        nouveauChantierTerrasses = {
          ...terr,
          essence_bois: essenceBois,
          type_sol: typeSol,
        };
      }

      onSucces({
        id: chantier.id,
        ...payloadChantier,
        clients: clientSelectionne
          ? { nom: clientSelectionne.nom, societe: clientSelectionne.societe }
          : chantier.clients,
        chantier_terrasses: nouveauChantierTerrasses,
      });

      onFermer();
    } catch (err: any) {
      console.error("Exception modification chantier terrasse:", err);
      setErreur(err.message || "Une erreur inattendue est survenue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-modal-modifier-terrasse"
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-4 md:p-6 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onFermer}
    >
      <div
        className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl min-w-0 max-h-[92vh] sm:max-h-[88vh] overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white text-[#23272B] shadow-[0_25px_60px_rgba(0,0,0,0.15)] animate-in zoom-in-95 duration-150 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête harmonisé BNA clair avec identité Terrasse */}
        <div className="border-b border-[#F0F0F0] bg-[#F8F9FA] px-4 py-3.5 sm:px-6 sm:py-4 shrink-0 min-w-0">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <span className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                <Pencil className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[1.5px] sm:tracking-[2px] text-[#B85B2B] truncate">
                  Édition Chantier · Terrasse DTU 51.4
                </p>
                <h2
                  id="titre-modal-modifier-terrasse"
                  className="text-base sm:text-xl font-bold tracking-tight text-[#23272B] truncate"
                >
                  Modifier les Informations
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onFermer}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#23272B]"
              aria-label="Fermer"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        {/* Corps défilable sans débordement horizontal */}
        <form
          id="form-modifier-chantier-terrasse"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-4 sm:space-y-5 min-w-0 overscroll-contain"
        >
          {erreur && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 sm:p-3.5 text-xs font-semibold text-red-700 flex items-center gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <span className="break-words min-w-0">{erreur}</span>
            </div>
          )}

          {/* Section 1 : Identification du Projet */}
          <div className="space-y-3 sm:space-y-4 min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5 min-w-0">
              <Layers3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#B85B2B] shrink-0" />
              <span className="truncate">Identification du Projet Terrasse</span>
            </div>

            <div className="min-w-0">
              <label
                htmlFor="mod-t-nom-chantier"
                className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Nom du chantier <span className="text-[#B85B2B]">*</span>
              </label>
              <input
                id="mod-t-nom-chantier"
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex. Terrasse Bois Pin CL4 — Villa Cap Ferret"
                required
                className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 min-w-0 [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:repeat(2,minmax(0,1fr))]">
              <div className="min-w-0">
                <label
                  htmlFor="mod-t-client"
                  className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Client associé <span className="text-[#B85B2B]">*</span>
                </label>
                <select
                  id="mod-t-client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border truncate"
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.societe ? `${c.societe} (${c.nom})` : c.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="mod-t-statut"
                  className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Statut du chantier
                </label>
                <select
                  id="mod-t-statut"
                  value={statut}
                  onChange={(e) =>
                    setStatut(e.target.value as "prevu" | "en_cours" | "termine")
                  }
                  className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border truncate"
                >
                  <option value="prevu">Prévu (Non démarré)</option>
                  <option value="en_cours">En cours de réalisation</option>
                  <option value="termine">Terminé (Livré)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2 : Localisation & Calendrier */}
          <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2 min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5 min-w-0">
              <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#B85B2B] shrink-0" />
              <span className="truncate">Localisation & Calendrier</span>
            </div>

            <div className="min-w-0">
              <label
                htmlFor="mod-t-adresse"
                className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Adresse du site des travaux
              </label>
              <input
                id="mod-t-adresse"
                type="text"
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="Ex. 18 Allée des Pins, 33950 Lège-Cap-Ferret"
                className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border"
              />
              <p className="mt-1 text-[11px] text-[#777777] truncate">
                L&apos;adresse alimente dynamiquement le calcul du guidage GPS Google Maps Directions API.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 min-w-0 [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:repeat(2,minmax(0,1fr))]">
              <div className="min-w-0">
                <label
                  htmlFor="mod-t-date-debut"
                  className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Date début prévue
                </label>
                <input
                  id="mod-t-date-debut"
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border"
                />
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="mod-t-date-fin"
                  className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Date fin estimée
                </label>
                <input
                  id="mod-t-date-fin"
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border"
                />
              </div>
            </div>
          </div>

          {/* Section 3 : Spécifications Matériaux & Sol (Terrasse DTU 51.4) */}
          <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2 min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5 min-w-0">
              <TreePine className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#B85B2B] shrink-0" />
              <span className="truncate">Paramètres Métier Terrasse (DTU 51.4)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 min-w-0 [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:repeat(2,minmax(0,1fr))]">
              <div className="min-w-0">
                <label
                  htmlFor="mod-t-essence"
                  className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Essence de bois
                </label>
                <select
                  id="mod-t-essence"
                  value={essenceBois}
                  onChange={(e) => setEssenceBois(e.target.value)}
                  className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border truncate"
                >
                  <option value="pin_cl4">Pin sylvestre traité Classe 4</option>
                  <option value="douglas">Douglas hors aubier (Cl. 3b)</option>
                  <option value="meleze">Mélèze de Sibérie / Europe</option>
                  <option value="ipe">Ipé véritable (Bois exotique)</option>
                  <option value="cumaru">Cumaru rouge / blond</option>
                  <option value="padouk">Padouk d&apos;Afrique</option>
                  <option value="composite">Bois Composite coextrudé</option>
                </select>
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="mod-t-sol"
                  className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Type de support de sol
                </label>
                <select
                  id="mod-t-sol"
                  value={typeSol}
                  onChange={(e) => setTypeSol(e.target.value)}
                  className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border truncate"
                >
                  <option value="dalle_beton">Dalle béton existante</option>
                  <option value="terre_stabilisee">Sol naturel stabilisé / Géotextile</option>
                  <option value="plots_reglables">Plots polypropylène réglables</option>
                  <option value="vis_fondation">Vis de fondation / Techno-pieux</option>
                  <option value="solivage_porteur">Double solivage porteur</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4 : Contact & Notes */}
          <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2 min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5 min-w-0">
              <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#B85B2B] shrink-0" />
              <span className="truncate">Contact & Notes de Chantier</span>
            </div>

            <div className="min-w-0">
              <label
                htmlFor="mod-t-contact"
                className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Contact sur place (Nom / Téléphone)
              </label>
              <input
                id="mod-t-contact"
                type="text"
                value={contactChantier}
                onChange={(e) => setContactChantier(e.target.value)}
                placeholder="Ex. Mme Martin - 06 98 76 54 32"
                className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 box-border"
              />
            </div>

            <div className="min-w-0">
              <label
                htmlFor="mod-t-notes"
                className="mb-1 sm:mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Notes de terrain / Accès terrasse
              </label>
              <textarea
                id="mod-t-notes"
                rows={2}
                value={notesTerrain}
                onChange={(e) => setNotesTerrain(e.target.value)}
                placeholder="Ex. Accès par portillon latéral, dénivelé de 15cm côté piscine..."
                className="w-full min-w-0 max-w-full rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 resize-none box-border"
              />
            </div>
          </div>
        </form>

        {/* Pied de modale : Responsive vertical sur mobile, horizontal sur desktop */}
        <div className="border-t border-[#F0F0F0] bg-[#F8F9FA] px-4 py-3 sm:px-6 sm:py-4 shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onFermer}
            disabled={enCours}
            className="w-full sm:w-auto h-10 sm:h-9 px-4 inline-flex items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-xs font-bold text-[#23272B] hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="form-modifier-chantier-terrasse"
            disabled={enCours}
            className="w-full sm:w-auto h-10 sm:h-9 px-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#B85B2B] text-xs font-bold text-white shadow-sm hover:bg-[#D97732] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {enCours ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Enregistrer les modifications</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
