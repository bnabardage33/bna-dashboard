// components/bardage/ModifierChantierBardageModal.tsx
"use client";

import { useState, useEffect } from "react";
import {
  X,
  Pencil,
  MapPin,
  Calendar,
  Building,
  User,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Layers3,
  Phone,
  FileText,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type ClientSimple = {
  id: string;
  nom: string;
  societe: string | null;
};

export type ChantierModifiable = {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  materiau_structurel?: string | null;
  moyen_acces?: string | null;
  zone_vent?: number | null;
  contact_chantier?: string | null;
  notes_terrain?: string | null;
  metier?: string | null;
  entreprise_id?: string | null;
  code_acces?: string | null;
  clients?: { nom: string; societe: string | null } | null;
};

export interface ModifierChantierBardageModalProps {
  chantier: ChantierModifiable | null;
  clients: ClientSimple[];
  ouvert: boolean;
  onFermer: () => void;
  onSucces: (chantierMisAJour: Partial<ChantierModifiable> & { id: string }) => void;
}

export default function ModifierChantierBardageModal({
  chantier,
  clients,
  ouvert,
  onFermer,
  onSucces,
}: ModifierChantierBardageModalProps) {
  const [nom, setNom] = useState("");
  const [clientId, setClientId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [statut, setStatut] = useState<"prevu" | "en_cours" | "termine">("prevu");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [materiauStructurel, setMateriauStructurel] = useState("Bois / Mélèze");
  const [moyenAcces, setMoyenAcces] = useState("echafaudage");
  const [zoneVent, setZoneVent] = useState("1");
  const [contactChantier, setContactChantier] = useState("");
  const [notesTerrain, setNotesTerrain] = useState("");

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Synchronisation des valeurs au chargement du chantier
  useEffect(() => {
    if (chantier) {
      setNom(chantier.nom || "");
      setClientId(chantier.client_id || "");
      setAdresse(chantier.adresse_chantier || "");
      const s = chantier.statut;
      setStatut(
        s === "en_cours" || s === "termine" ? (s as "en_cours" | "termine") : "prevu"
      );
      setDateDebut(
        chantier.date_debut ? chantier.date_debut.split("T")[0] : ""
      );
      setDateFin(chantier.date_fin ? chantier.date_fin.split("T")[0] : "");
      setMateriauStructurel(chantier.materiau_structurel || "Bois / Mélèze");
      setMoyenAcces(chantier.moyen_acces || "echafaudage");
      setZoneVent(
        chantier.zone_vent ? String(chantier.zone_vent) : "1"
      );
      setContactChantier(chantier.contact_chantier || "");
      setNotesTerrain(chantier.notes_terrain || "");
      setErreur(null);
    }
  }, [chantier]);

  if (!ouvert || !chantier) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chantier) return;

    if (!nom.trim()) {
      setErreur("Le nom du chantier est obligatoire.");
      return;
    }
    if (!clientId) {
      setErreur("Le client associé est obligatoire.");
      return;
    }

    setEnCours(true);
    setErreur(null);

    try {
      // 1. Résolution stricte du contexte entreprise
      const contexte = await resoudreContexteEntreprise(null);
      const entreprise_id = contexte.entreprise_id;

      if (!estUuid(entreprise_id)) {
        console.error(
          "Chantiers : modification refusée — contexte entreprise introuvable ou invalide."
        );
        setErreur("Impossible d'enregistrer : session sans entreprise identifiée.");
        setEnCours(false);
        return;
      }

      // 2. Sécurité multi-tenant : vérifier que le chantier n'appartient pas à un autre tenant
      if (chantier.entreprise_id && chantier.entreprise_id !== entreprise_id) {
        setErreur("Action non autorisée : ce chantier n'appartient pas à votre entreprise.");
        setEnCours(false);
        return;
      }

      // 3. Cloisonnement strict Bardage : interdiction absolue de toucher un chantier terrasse
      if (chantier.metier === "terrasse") {
        setErreur("Action non autorisée : les chantiers terrasse ne peuvent pas être modifiés ici.");
        setEnCours(false);
        return;
      }

      // 4. Payload ciblé sans altération des façades, calepinage, métrés ni factures
      const payload: Record<string, any> = {
        nom: nom.trim(),
        client_id: clientId,
        adresse_chantier: adresse.trim() || null,
        statut,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        contact_chantier: contactChantier.trim() || null,
        notes_terrain: notesTerrain.trim() || null,
        // Invariant métier : conservation explicite du métier bardage
        metier: "bardage",
      };

      if (materiauStructurel) {
        payload.materiau_structurel = materiauStructurel;
      }
      if (moyenAcces) {
        payload.moyen_acces = moyenAcces;
      }
      if (zoneVent) {
        payload.zone_vent = Number(zoneVent);
      }

      const { error } = await (supabase.from("chantiers") as any)
        .update(payload)
        .eq("id", chantier.id)
        .eq("entreprise_id", entreprise_id);

      if (error) {
        console.error("Erreur mise à jour chantier bardage:", error);
        setErreur("Erreur lors de la sauvegarde : " + error.message);
        setEnCours(false);
        return;
      }

      // 5. Retrouver le client sélectionné pour rafraîchir la carte localement
      const clientSelect = clients.find((c) => c.id === clientId);

      onSucces({
        id: chantier.id,
        ...payload,
        clients: clientSelect
          ? { nom: clientSelect.nom, societe: clientSelect.societe }
          : chantier.clients,
      });

      onFermer();
    } catch (err: any) {
      console.error("Exception modification chantier:", err);
      setErreur(err.message || "Une erreur inattendue est survenue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-modal-modifier-bardage"
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onFermer}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white text-[#23272B] shadow-[0_25px_60px_rgba(0,0,0,0.15)] animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête harmonisé BNA clair */}
        <div className="border-b border-[#F0F0F0] bg-[#F8F9FA] px-6 py-5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                <Pencil className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[2px] text-[#B85B2B]">
                  Édition Chantier · Bardage
                </p>
                <h2
                  id="titre-modal-modifier-bardage"
                  className="text-lg sm:text-xl font-bold tracking-tight text-[#23272B]"
                >
                  Modifier les Informations
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onFermer}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#23272B]"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Corps défilable */}
        <form
          id="form-modifier-chantier-bardage"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5"
        >
          {/* Message d'erreur éventuel */}
          {erreur && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{erreur}</span>
            </div>
          )}

          {/* Section 1 : Informations principales */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5">
              <Layers3 className="h-4 w-4 text-[#B85B2B]" />
              <span>Identification du Projet</span>
            </div>

            <div>
              <label
                htmlFor="mod-nom-du-chantier"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Nom du chantier <span className="text-[#B85B2B]">*</span>
              </label>
              <input
                id="mod-nom-du-chantier"
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex. Bardage Clin Bois — Villa Arcachon"
                required
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="mod-client-associe"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Client associé <span className="text-[#B85B2B]">*</span>
                </label>
                <select
                  id="mod-client-associe"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.societe ? `${c.societe} (${c.nom})` : c.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="mod-statut-chantier"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Statut du chantier
                </label>
                <select
                  id="mod-statut-chantier"
                  value={statut}
                  onChange={(e) =>
                    setStatut(e.target.value as "prevu" | "en_cours" | "termine")
                  }
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                >
                  <option value="prevu">Prévu (Non démarré)</option>
                  <option value="en_cours">En cours de réalisation</option>
                  <option value="termine">Terminé (Livré)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2 : Localisation & Planning */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5">
              <MapPin className="h-4 w-4 text-[#B85B2B]" />
              <span>Localisation & Calendrier</span>
            </div>

            <div>
              <label
                htmlFor="mod-adresse-du-site"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Adresse du site des travaux
              </label>
              <input
                id="mod-adresse-du-site"
                type="text"
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="Ex. 14 Route des Plages, 33120 Arcachon"
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
              />
              <p className="mt-1 text-[11px] text-[#777777]">
                L&apos;adresse alimente dynamiquement le calcul du lien GPS Itinéraire Google Maps.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="mod-date-debut-prevue"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Date début prévue
                </label>
                <input
                  id="mod-date-debut-prevue"
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="mod-date-fin-estimee"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Date fin estimée
                </label>
                <input
                  id="mod-date-fin-estimee"
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                />
              </div>
            </div>
          </div>

          {/* Section 3 : Spécifications techniques générales */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5">
              <ShieldCheck className="h-4 w-4 text-[#B85B2B]" />
              <span>Paramètres Métier Bardage</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="mod-materiau-predominant"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Famille / Revêtement
                </label>
                <select
                  id="mod-materiau-predominant"
                  value={materiauStructurel}
                  onChange={(e) => setMateriauStructurel(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                >
                  <option value="Bois / Mélèze">Bois Naturel / Mélèze</option>
                  <option value="Panneaux HPL Trespa">Panneaux HPL (Trespa / Fundermax)</option>
                  <option value="Composite Fibres-Ciment">Composite / Fibres-Ciment</option>
                  <option value="Cassettes Métalliques Alu">Cassettes Métalliques Alu</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="mod-moyen-acces"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Moyen d&apos;accès
                </label>
                <select
                  id="mod-moyen-acces"
                  value={moyenAcces}
                  onChange={(e) => setMoyenAcces(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                >
                  <option value="echafaudage">Échafaudage fixe</option>
                  <option value="nacelle">Nacelle élévatrice</option>
                  <option value="echelle">Échelle / PIRL</option>
                  <option value="plain_pied">Plain-pied</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="mod-zone-vent"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                >
                  Zone de vent
                </label>
                <select
                  id="mod-zone-vent"
                  value={zoneVent}
                  onChange={(e) => setZoneVent(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                >
                  <option value="1">Zone 1 (Normale)</option>
                  <option value="2">Zone 2 (Modérée)</option>
                  <option value="3">Zone 3 (Exposée)</option>
                  <option value="4">Zone 4 (Littoral)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4 : Contact & Notes */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#777777] border-b border-[#F0F0F0] pb-1.5">
              <Phone className="h-4 w-4 text-[#B85B2B]" />
              <span>Contact & Notes de Chantier</span>
            </div>

            <div>
              <label
                htmlFor="mod-contact-chantier"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Contact sur place (Nom / Téléphone)
              </label>
              <input
                id="mod-contact-chantier"
                type="text"
                value={contactChantier}
                onChange={(e) => setContactChantier(e.target.value)}
                placeholder="Ex. M. Dupont - 06 12 34 56 78"
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
              />
            </div>

            <div>
              <label
                htmlFor="mod-notes-terrain"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
              >
                Notes de terrain / Instructions d&apos;accès
              </label>
              <textarea
                id="mod-notes-terrain"
                rows={2}
                value={notesTerrain}
                onChange={(e) => setNotesTerrain(e.target.value)}
                placeholder="Ex. Portail à code, stocker les palettes côté Nord..."
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 resize-none"
              />
            </div>
          </div>
        </form>

        {/* Pied de modale sticky */}
        <div className="border-t border-[#F0F0F0] bg-[#F8F9FA] px-6 py-4 shrink-0 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onFermer}
            disabled={enCours}
            className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-xs font-bold text-[#23272B] hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="form-modifier-chantier-bardage"
            disabled={enCours}
            className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#D97732] active:scale-[0.98] disabled:opacity-50"
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
