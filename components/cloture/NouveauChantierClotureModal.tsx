"use client";

import React, { useEffect, useState } from "react";
import { Fence, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { creerChecklistChantierInitiale } from "@/lib/metiers/registry";
import type {
  FenceMaterial,
  FenceShape,
  FenceGroundType,
} from "@/lib/cloture/calepinageCloture";

interface ClientOption {
  id: string;
  nom: string;
  societe: string | null;
}

interface NouveauChantierClotureModalProps {
  ouvert: boolean;
  onFermer: () => void;
  onCree: (chantierId: string) => void;
}

export default function NouveauChantierClotureModal({
  ouvert,
  onFermer,
  onCree,
}: NouveauChantierClotureModalProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [nom, setNom] = useState("");
  const [adresse, setAdresse] = useState("");
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().split("T")[0]);
  const [forme, setForme] = useState<FenceShape>("DROITE");
  const [materiau, setMateriau] = useState<FenceMaterial>("COMPOSITE");
  const [longueurA, setLongueurA] = useState("12");
  const [longueurB, setLongueurB] = useState("8");
  const [hauteurUtile, setHauteurUtile] = useState("1.80");
  const [typePoseSol, setTypePoseSol] = useState<FenceGroundType>("DIRECT_SOL");
  const [soubassement, setSoubassement] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    supabase
      .from("clients")
      .select("id, nom, societe")
      .order("nom")
      .then(({ data }) => {
        if (data) setClients(data as ClientOption[]);
      });
  }, [ouvert]);

  if (!ouvert) return null;

  async function creerChantier(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !nom.trim()) return;
    setSaving(true);
    try {
      const ctx = await resoudreContexteEntreprise(null);
      if (!ctx.entreprise_id) {
        alert("Contexte entreprise introuvable.");
        return;
      }
      const codeAcces = `CLO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const { data: chantier, error: errChantier } = await supabase
        .from("chantiers")
        .insert({
          entreprise_id: ctx.entreprise_id,
          client_id: clientId,
          nom: nom.trim(),
          adresse_chantier: adresse.trim() || null,
          date_debut: dateDebut || null,
          statut: "prevu",
          metier: "cloture",
          code_acces: codeAcces,
          checklist: creerChecklistChantierInitiale("CLOTURE"),
        })
        .select("id")
        .single();

      if (errChantier || !chantier) {
        alert("Erreur création chantier : " + (errChantier?.message || "Inconnue"));
        return;
      }

      const lenA = Math.max(0.5, parseFloat(longueurA.replace(",", ".")) || 12);
      const lenB = Math.max(0.5, parseFloat(longueurB.replace(",", ".")) || 8);
      const hU = Math.max(0.4, parseFloat(hauteurUtile.replace(",", ".")) || 1.8);

      const { data: cloture, error: errCloture } = await supabase
        .from("chantier_clotures")
        .insert({
          chantier_id: chantier.id,
          entreprise_id: ctx.entreprise_id,
          nom: nom.trim(),
          forme,
          materiau,
          hauteur_utile_m: hU,
          longueur_lame_brute_m: materiau === "BOIS" ? 2.0 : 1.8,
          hauteur_lame_m: materiau === "BOIS" ? 0.145 : 0.15,
          extremites: "LIBRE",
          type_pose_sol: typePoseSol,
          presence_soubassement: soubassement,
          hauteur_soubassement_m: 0.25,
          gestion_pente: "PLAT",
        })
        .select("id")
        .single();

      if (errCloture || !cloture) {
        alert("Chantier créé mais erreur config clôture : " + (errCloture?.message || ""));
      } else {
        const segments =
          forme === "DROITE"
            ? [{ code_segment: "A", ordre: 1, longueur_m: lenA }]
            : forme === "EN_L"
              ? [
                  { code_segment: "A", ordre: 1, longueur_m: lenA },
                  { code_segment: "B", ordre: 2, longueur_m: lenB },
                ]
              : forme === "EN_U"
                ? [
                    { code_segment: "A", ordre: 1, longueur_m: lenA },
                    { code_segment: "B", ordre: 2, longueur_m: lenB },
                    { code_segment: "C", ordre: 3, longueur_m: lenA },
                  ]
                : [
                    { code_segment: "A", ordre: 1, longueur_m: lenA },
                    { code_segment: "B", ordre: 2, longueur_m: lenB },
                    { code_segment: "C", ordre: 3, longueur_m: lenA },
                    { code_segment: "D", ordre: 4, longueur_m: lenB },
                  ];

        await supabase.from("chantier_cloture_troncons").insert(
          segments.map((s) => ({
            cloture_id: cloture.id,
            chantier_id: chantier.id,
            entreprise_id: ctx.entreprise_id!,
            code_segment: s.code_segment,
            ordre: s.ordre,
            longueur_m: s.longueur_m,
          }))
        );
      }

      onFermer();
      onCree(chantier.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-28 bg-black/60 backdrop-blur-xs"
      onClick={onFermer}
    >
      <form
        onSubmit={creerChantier}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl bg-[#1B1511] border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D96B27]/10 text-[#D96B27]">
              <Fence className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F5EFEA]">
                Nouveau Chantier Clôture
              </h2>
              <p className="text-[11px] text-[#8E7F74]">
                Configuration initiale &amp; calepinage métier dédié
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFermer}
            className="rounded-lg p-1.5 text-[#8E7F74] hover:text-[#F5EFEA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#B8A99E]">Client *</label>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 text-[#F5EFEA]"
            >
              <option value="">-- Sélectionner un client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.societe ? `${c.societe} (${c.nom})` : c.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#B8A99E]">Nom du chantier *</label>
              <input
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex: Clôture composite Jardin Sud"
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#B8A99E]">Date de début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#B8A99E]">Adresse du chantier</label>
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="Adresse complète"
              className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-[#B8A99E]">Forme</label>
              <select
                value={forme}
                onChange={(e) => setForme(e.target.value as FenceShape)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              >
                <option value="DROITE">1 Côté (Droite)</option>
                <option value="EN_L">2 Côtés (En L)</option>
                <option value="EN_U">3 Côtés (En U)</option>
                <option value="4_COTES">4 Côtés (Complet)</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#B8A99E]">Matériau</label>
              <select
                value={materiau}
                onChange={(e) => setMateriau(e.target.value as FenceMaterial)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              >
                <option value="COMPOSITE">Composite</option>
                <option value="BOIS">Bois</option>
                <option value="ALU">Aluminium</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#B8A99E]">Pose au sol</label>
              <select
                value={typePoseSol}
                onChange={(e) => setTypePoseSol(e.target.value as FenceGroundType)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              >
                <option value="DIRECT_SOL">Scellement sol</option>
                <option value="SUR_MURET">Platines sur muret</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-[#B8A99E]">Longueur A (m)</label>
              <input
                value={longueurA}
                onChange={(e) => setLongueurA(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              />
            </div>
            {forme !== "DROITE" && (
              <div>
                <label className="font-semibold text-[#B8A99E]">Longueur B (m)</label>
                <input
                  value={longueurB}
                  onChange={(e) => setLongueurB(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
                />
              </div>
            )}
            <div>
              <label className="font-semibold text-[#B8A99E]">Hauteur utile (m)</label>
              <input
                value={hauteurUtile}
                onChange={(e) => setHauteurUtile(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 cursor-pointer font-semibold text-[#F5EFEA]">
            <input
              type="checkbox"
              checked={soubassement}
              onChange={(e) => setSoubassement(e.target.checked)}
              className="rounded border-white/15 text-[#D96B27]"
            />
            <span>Inclure plaques de soubassement béton (250 mm)</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onFermer}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-[#B8A99E]"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#D96B27] hover:bg-[#E07A38] px-4 py-2 text-xs font-bold text-white"
          >
            {saving ? "Création..." : "Créer le chantier Clôture"}
          </button>
        </div>
      </form>
    </div>
  );
}
