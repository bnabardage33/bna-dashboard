"use client";

import React, { useState, useEffect } from "react";
import { X, Layers3, Calendar, MapPin, User, Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function estUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

interface Client {
  id: string;
  nom: string;
  societe: string | null;
}

interface NouveauChantierTerrasseModalProps {
  ouvert: boolean;
  onFermer: () => void;
  onSucces: (nouveauId: string) => void;
}

export default function NouveauChantierTerrasseModal({
  ouvert,
  onFermer,
  onSucces,
}: NouveauChantierTerrasseModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Formulaire
  const [nom, setNom] = useState("");
  const [clientId, setClientId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [typeSol, setTypeSol] = useState("dalle_beton");
  const [essence, setEssence] = useState("pin_cl4");
  const [longueurM, setLongueurM] = useState("6.0");
  const [largeurM, setLargeurM] = useState("4.0");

  useEffect(() => {
    if (!ouvert) return;
    setErreur(null);
    async function chargerClients() {
      setLoadingClients(true);
      const { data, error } = await supabase
        .from("clients")
        .select("id, nom, societe")
        .order("nom");
      if (error) {
        console.error("Erreur chargement clients:", error);
      } else if (data) {
        setClients(data as Client[]);
        if (data.length > 0 && !clientId) {
          setClientId(data[0].id);
        }
      }
      setLoadingClients(false);
    }
    chargerClients();
  }, [ouvert]);

  if (!ouvert) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!clientId) {
      setErreur("Veuillez sélectionner un client pour ce chantier terrasse.");
      return;
    }

    setCreationEnCours(true);

    try {
      // 1. Résolution de l'entreprise tenant
      const { entreprise_id } = await resoudreContexteEntreprise(null);
      let tenantId = entreprise_id;

      if (!estUuid(tenantId)) {
        // Fallback session
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionTenant = (sessionData?.session?.user?.app_metadata as { entreprise_id?: string })?.entreprise_id;
        if (estUuid(sessionTenant ?? null)) {
          tenantId = sessionTenant ?? null;
        } else {
          // Fallback sur l'entreprise courante d'un client
          const { data: clientData } = await supabase
            .from("clients")
            .select("entreprise_id")
            .eq("id", clientId)
            .single();
          if (clientData?.entreprise_id) {
            tenantId = clientData.entreprise_id;
          }
        }
      }

      if (!estUuid(tenantId)) {
        setCreationEnCours(false);
        setErreur("Session sans entreprise identifiée. Veuillez vous reconnecter.");
        return;
      }

      const codeAcces = "BNA-T" + Math.random().toString(36).substring(2, 7).toUpperCase();

      // Initialisation des 6 phases DTU 51.4 dans la checklist
      const phasesInitiales = {
        metier: "terrasse",
        phases_dtu: {
          support: { statut: "a_faire", date: null, notes: "Préparation terrain / sol / géotextile" },
          implantation: { statut: "a_faire", date: null, notes: "Piquetage, équerrage, report des niveaux" },
          plots: { statut: "a_faire", date: null, notes: "Disposition et calage des plots réglables" },
          lambourdes: { statut: "a_faire", date: null, notes: "Solivage, bandes EPDM et cales d'isolation" },
          platelage: { statut: "a_faire", date: null, notes: "Fixation des lames de terrasse" },
          finitions: { statut: "a_faire", date: null, notes: "Rives, plinthes, marches et réception" },
        },
      };

      // 2. Insertion du chantier racine avec qualification explicite du métier terrasse
      const { data: nouveauChantier, error: errChantier } = await (supabase
        .from("chantiers") as any)
        .insert({
          nom: nom.trim() || "Chantier Terrasse",
          client_id: clientId,
          adresse_chantier: adresse.trim() || null,
          date_debut: dateDebut || null,
          date_fin: dateFin || null,
          statut: "prevu",
          code_acces: codeAcces,
          metier: "terrasse",
          checklist: phasesInitiales,
          entreprise_id: tenantId,
        })
        .select("id")
        .single();

      if (errChantier || !nouveauChantier) {
        throw new Error(errChantier?.message || "Erreur création chantier.");
      }

      const chantierId = nouveauChantier.id;

      // 3. Initialisation de la fiche technique terrasse via l'API dédiée
      const systemeTerrasse = essence === "composite" ? "composite_clips" : "bois_vis";
      const payloadTerrasse = {
        nom: "Terrasse principale",
        type_sol: typeSol,
        essence_bois: essence === "composite" ? "pin_cl4" : essence,
        systeme_terrasse: systemeTerrasse,
        longueur_m: Number(longueurM) || 6.0,
        largeur_m: Number(largeurM) || 4.0,
        hauteur_sol_cm: 15.0,
        pente_pct: 1.5,
        geotextile: typeSol !== "dalle_beton",
      };

      const resTerrasse = await fetch(`/api/chantiers/${chantierId}/terrasse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadTerrasse),
      });

      if (!resTerrasse.ok) {
        const errJson = await resTerrasse.json().catch(() => ({}));
        console.warn("Avertissement initialisation technique terrasse :", errJson);
      }

      setCreationEnCours(false);
      onSucces(chantierId);
    } catch (e: unknown) {
      setCreationEnCours(false);
      setErreur(e instanceof Error ? e.message : "Erreur inattendue");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white text-[#23272B] shadow-[0_25px_60px_rgba(0,0,0,0.15)]">
        {/* En-tête cuivré et élégant */}
        <div className="border-b border-[#F0F0F0] bg-[#F8F9FA] px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                <Layers3 className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[2.5px] text-[#B85B2B]">
                  Nouveau Projet
                </p>
                <h2 className="text-xl font-bold tracking-tight text-[#23272B]">
                  Créer un Chantier Terrasse
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

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {erreur && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {erreur}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]">
              Nom du chantier <span className="text-[#B85B2B]">*</span>
            </label>
            <input
              type="text"
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Terrasse Pinède — M. Dupont"
              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Client associé <span className="text-[#B85B2B]">*</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={loadingClients}
                  className="w-full appearance-none rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                >
                  {clients.length === 0 ? (
                    <option value="">Chargement des clients...</option>
                  ) : (
                    clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom} {c.societe ? `(${c.societe})` : ""}
                      </option>
                    ))
                  )}
                </select>
                <User className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Adresse de réalisation
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="Ex : 14 rue des Pins, 33000 Bordeaux"
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white pl-4 pr-9 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                />
                <MapPin className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Date début prévisionnelle
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white pl-4 pr-9 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                />
                <Calendar className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Date fin estimée
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white pl-4 pr-9 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                />
                <Calendar className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Spécificités Terrasse initiales */}
          <div className="rounded-2xl border border-[#E5E5E5] bg-[#FAFAFA] p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#B85B2B]">
              Configuration Initiale Terrasse (DTU 51.4)
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#777777]">Longueur (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={longueurM}
                  onChange={(e) => setLongueurM(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm font-bold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#777777]">Largeur (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={largeurM}
                  onChange={(e) => setLargeurM(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-sm font-bold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#777777]">Support sol</label>
                <select
                  value={typeSol}
                  onChange={(e) => setTypeSol(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                >
                  <option value="dalle_beton">Dalle béton</option>
                  <option value="sol_naturel">Terre / Gazon</option>
                  <option value="stabilise">Sol stabilisé</option>
                  <option value="plots_existants">Plots existants</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#777777]">Matériau</label>
                <select
                  value={essence}
                  onChange={(e) => setEssence(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                >
                  <option value="pin_cl4">Pin Cl. 4</option>
                  <option value="douglas">Douglas</option>
                  <option value="ipé">Ipé exotique</option>
                  <option value="cumaru">Cumaru</option>
                  <option value="composite">Composite</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              Surface estimée : <strong className="text-[#23272B]">{(Number(longueurM) * Number(largeurM) || 0).toFixed(1)} m²</strong>. Ces paramètres seront éditables avec précision dans le module Calepinage.
            </p>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onFermer}
              className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-semibold text-[#777777] transition-colors hover:bg-gray-50 hover:text-[#23272B]"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={creationEnCours}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#D97732] focus:outline-none focus:ring-2 focus:ring-[#B85B2B] disabled:opacity-50"
            >
              {creationEnCours ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Création en cours...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Créer et Ouvrir le Hub Terrasse
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
