"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  ArrowLeft,
  Camera,
  FileCheck,
  Wrench,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Save,
  Loader2,
  Printer,
  X,
  ShieldCheck,
  Receipt,
  UserPlus,
  Building2,
} from "lucide-react";
import Image from "next/image";
import SignaturePad from "@/components/SignaturePad";
import RapportSAVPDF from "@/components/RapportSAVPDF";
import type { TicketSav, EntrepriseSettings, MaterielPrevu } from "@/types/finance";
import type { Json, TablesInsert, TablesUpdate } from "@/types/supabase";
import {
  LIBELLES_GARANTIE,
  REFERENTIELS_NORMATIFS_SAV,
  SINISTRES_PAR_METIER,
  calculerStatutGarantie,
  parserHeuresEstimees,
  resoudreTypeGarantieParSinistre,
  type MetierSav,
  type OrigineSav,
  type TypeGarantieSav,
} from "@/lib/savGaranties";
import { CADENCES_DEFAUT, chargerCadencesTempsPose } from "@/lib/tempsPoseCalcul";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

interface ChantierSavOption {
  id: string;
  nom: string | null;
  client_id: string | null;
  adresse_chantier: string | null;
  metier: string;
  date_fin: string | null;
  clients: { id: string; nom: string; societe: string | null } | null;
}

interface ClientSavOption {
  id: string;
  nom: string;
  societe: string | null;
  adresse_facturation: string | null;
  tel: string | null;
}

interface PvReceptionSav {
  id: string;
  numero: string;
  date_reception: string;
  chantier_id: string | null;
}

export default function FicheSAV() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const isNew = id === "nouveau";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [chantiers, setChantiers] = useState<ChantierSavOption[]>([]);
  const [clients, setClients] = useState<ClientSavOption[]>([]);
  const [pvs, setPvs] = useState<PvReceptionSav[]>([]);
  const [entreprise, setEntreprise] = useState<EntrepriseSettings | null>(null);
  const [tauxHoraireVente, setTauxHoraireVente] = useState<number>(
    CADENCES_DEFAUT.taux_horaire_vente_ht
  );
  const [showPDF, setShowPDF] = useState(false);
  const [uploading, setUploading] = useState<{ avant: boolean; apres: boolean }>({
    avant: false,
    apres: false,
  });

  // Création rapide client externe
  const [creationClientRapide, setCreationClientRapide] = useState(false);
  const [nouveauClientNom, setNouveauClientNom] = useState("");
  const [nouveauClientTel, setNouveauClientTel] = useState("");
  const [nouveauClientAdresse, setNouveauClientAdresse] = useState("");

  const [ticket, setTicket] = useState({
    chantier_id: "" as string,
    client_id: "" as string,
    type_origine: "chantier_bna" as OrigineSav,
    metier: "bardage" as MetierSav,
    type_garantie: "decennale_10ans" as TypeGarantieSav,
    pv_reception_id: null as string | null,
    facturable: false,
    statut: "ouvert",
    sous_garantie: true,
    type_sinistre: "",
    localisation: "",
    description: "",
    cause_probable: "",
    respect_dtu: true,
    diagnostic_dtu: "",
    materiel_prevu: [] as MaterielPrevu[],
    date_intervention: "",
    temps_estime: "",
    intervenant: "",
    moyen_acces: "",
    photos: { client: null as string | null, avant: null as string | null, apres: null as string | null },
    signature_technicien: null as string | null,
    signature_client: null as string | null,
    chantiers: null as ChantierSavOption | null,
    clients: null as ClientSavOption | null,
    pv_receptions: null as PvReceptionSav | null,
  });

  useEffect(() => {
    supabase
      .from("entreprise_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) setEntreprise(data as unknown as EntrepriseSettings);
      });

    chargerCadencesTempsPose(supabase).then((c) => {
      if (c?.taux_horaire_vente_ht) setTauxHoraireVente(c.taux_horaire_vente_ht);
    });

    supabase
      .from("chantiers")
      .select("id, nom, client_id, adresse_chantier, metier, date_fin, clients(id, nom, societe)")
      .neq("statut", "corbeille")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setChantiers(data as unknown as ChantierSavOption[]);
      });

    supabase
      .from("clients")
      .select("id, nom, societe, adresse_facturation, tel")
      .order("nom")
      .then(({ data }) => {
        if (data) setClients(data as unknown as ClientSavOption[]);
      });

    supabase
      .from("pv_receptions")
      .select("id, numero, date_reception, chantier_id")
      .order("date_reception", { ascending: false })
      .then(({ data }) => {
        if (data) setPvs(data as unknown as PvReceptionSav[]);
      });

    if (!isNew) {
      supabase
        .from("tickets_sav")
        .select(
          "*, chantiers(id, nom, client_id, adresse_chantier, metier, date_fin, clients(id, nom, societe)), clients(id, nom, societe, adresse_facturation, tel), pv_receptions(id, numero, date_reception, chantier_id)"
        )
        .eq("id", id)
        .single()
        .then(({ data }) => {
          if (data) {
            setTicket({
              ...data,
              chantier_id: data.chantier_id || "",
              client_id: data.client_id || "",
              type_origine: (data.type_origine as OrigineSav) || "chantier_bna",
              metier: (data.metier as MetierSav) || "bardage",
              type_garantie: (data.type_garantie as TypeGarantieSav) || "decennale_10ans",
              pv_reception_id: data.pv_reception_id || null,
              facturable: Boolean(data.facturable),
              sous_garantie: data.sous_garantie ?? true,
              type_sinistre: data.type_sinistre || "",
              localisation: data.localisation || "",
              description: data.description || "",
              cause_probable: data.cause_probable || "",
              respect_dtu: data.respect_dtu ?? true,
              diagnostic_dtu: data.diagnostic_dtu || "",
              materiel_prevu: (data.materiel_prevu as unknown as MaterielPrevu[]) || [],
              date_intervention: data.date_intervention
                ? data.date_intervention.split("T")[0]
                : "",
              temps_estime: data.temps_estime || "",
              intervenant: data.intervenant || "",
              moyen_acces: data.moyen_acces || "",
              photos: (data.photos as unknown as typeof ticket.photos) || {
                client: null,
                avant: null,
                apres: null,
              },
            } as unknown as typeof ticket);
          }
          setLoading(false);
        });
    }
  }, [id, isNew]);

  const chantierSelectionne = useMemo(
    () => chantiers.find((c) => c.id === ticket.chantier_id) ?? ticket.chantiers ?? null,
    [chantiers, ticket.chantier_id, ticket.chantiers]
  );

  const pvAssocie = useMemo(() => {
    if (ticket.type_origine !== "chantier_bna" || !ticket.chantier_id) return null;
    return pvs.find((p) => p.chantier_id === ticket.chantier_id) ?? ticket.pv_receptions ?? null;
  }, [ticket.type_origine, ticket.chantier_id, pvs, ticket.pv_receptions]);

  const garantieCalculee = useMemo(() => {
    return calculerStatutGarantie({
      typeOrigine: ticket.type_origine,
      typeGarantie: ticket.type_garantie,
      dateReception: pvAssocie?.date_reception ?? chantierSelectionne?.date_fin ?? null,
    });
  }, [ticket.type_origine, ticket.type_garantie, pvAssocie, chantierSelectionne]);

  const refNormatif = REFERENTIELS_NORMATIFS_SAV[ticket.metier] ?? REFERENTIELS_NORMATIFS_SAV.bardage;
  const sinistresMetier = SINISTRES_PAR_METIER[ticket.metier] ?? SINISTRES_PAR_METIER.bardage;

  const compressImage = (file: File, maxDim = 1920, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Compression échouée"))),
            "image/jpeg",
            quality
          );
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "avant" | "apres"
  ) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    const file = rawFile.type.startsWith("image/")
      ? await compressImage(rawFile)
      : rawFile;

    setUploading((prev) => ({ ...prev, [type]: true }));
    const fileExt = rawFile.type.startsWith("image/") ? "jpg" : rawFile.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${ticket.chantier_id || ticket.client_id || "externe"}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("sav_photos")
      .upload(filePath, file);

    if (uploadError) {
      alert("Erreur lors de l'envoi de l'image.");
    } else {
      const { data } = supabase.storage.from("sav_photos").getPublicUrl(filePath);
      setTicket((prev) => ({
        ...prev,
        photos: { ...prev.photos, [type]: data.publicUrl },
      }));
    }
    setUploading((prev) => ({ ...prev, [type]: false }));
  };

  const creerClientExterneRapide = async () => {
    if (!nouveauClientNom.trim()) return alert("Nom du client requis.");
    const { entreprise_id } = await resoudreContexteEntreprise(null);
    if (!estUuid(entreprise_id)) return alert("Entreprise introuvable dans la session.");

    const { data, error } = await supabase
      .from("clients")
      .insert({
        entreprise_id,
        nom: nouveauClientNom.trim(),
        tel: nouveauClientTel.trim() || null,
        adresse_facturation: nouveauClientAdresse.trim() || null,
        type: "particulier",
      })
      .select("id, nom, societe, adresse_facturation, tel")
      .single();

    if (error || !data) {
      alert("Erreur création client : " + (error?.message || "Inconnue"));
      return;
    }
    const nouveau = data as unknown as ClientSavOption;
    setClients((prev) => [...prev, nouveau]);
    setTicket((prev) => ({ ...prev, client_id: nouveau.id }));
    setCreationClientRapide(false);
    setNouveauClientNom("");
    setNouveauClientTel("");
    setNouveauClientAdresse("");
  };

  const handleChantierChange = (chantierId: string) => {
    const ch = chantiers.find((c) => c.id === chantierId) ?? null;
    const metierCh = ((ch?.metier as MetierSav) || "bardage");
    const pv = pvs.find((p) => p.chantier_id === chantierId) ?? null;
    const calc = calculerStatutGarantie({
      typeOrigine: "chantier_bna",
      typeGarantie: ticket.type_garantie === "hors_garantie_externe" ? "decennale_10ans" : ticket.type_garantie,
      dateReception: pv?.date_reception ?? ch?.date_fin ?? null,
    });
    setTicket((prev) => ({
      ...prev,
      chantier_id: chantierId,
      client_id: ch?.client_id || prev.client_id,
      metier: metierCh,
      pv_reception_id: pv?.id ?? null,
      type_garantie: calc.typeGarantieEffectif,
      sous_garantie: calc.sousGarantie,
      facturable: calc.facturable,
    }));
  };

  const handleOrigineChange = (origine: OrigineSav) => {
    const calc = calculerStatutGarantie({
      typeOrigine: origine,
      typeGarantie:
        origine === "client_externe"
          ? "hors_garantie_externe"
          : ticket.type_garantie === "hors_garantie_externe"
            ? "decennale_10ans"
            : ticket.type_garantie,
      dateReception:
        origine === "chantier_bna"
          ? pvAssocie?.date_reception ?? chantierSelectionne?.date_fin ?? null
          : null,
    });

    setTicket((prev) => ({
      ...prev,
      type_origine: origine,
      chantier_id: origine === "client_externe" ? "" : prev.chantier_id,
      pv_reception_id: origine === "client_externe" ? null : prev.pv_reception_id,
      type_garantie: calc.typeGarantieEffectif,
      sous_garantie: calc.sousGarantie,
      facturable: calc.facturable,
    }));
  };

  const handleSinistreChange = (val: string) => {
    const regimeDefaut =
      ticket.type_origine === "client_externe"
        ? "hors_garantie_externe"
        : resoudreTypeGarantieParSinistre(ticket.metier, val);
    const calc = calculerStatutGarantie({
      typeOrigine: ticket.type_origine,
      typeGarantie: regimeDefaut,
      dateReception: pvAssocie?.date_reception ?? chantierSelectionne?.date_fin ?? null,
    });
    setTicket((prev) => ({
      ...prev,
      type_sinistre: val,
      type_garantie: calc.typeGarantieEffectif,
      sous_garantie: calc.sousGarantie,
      facturable: calc.facturable,
    }));
  };

  const handleGenerateDevis = async () => {
    const clientId =
      ticket.type_origine === "client_externe"
        ? ticket.client_id
        : chantierSelectionne?.client_id || chantierSelectionne?.clients?.id || ticket.client_id;

    if (!clientId) {
      return alert("Veuillez d'abord associer un client au ticket SAV.");
    }

    const { entreprise_id } = await resoudreContexteEntreprise(null);
    if (!estUuid(entreprise_id)) {
      return alert("Contexte entreprise introuvable dans votre session.");
    }

    setSaving(true);
    const { data: numeroRPC, error: rpcError } = await supabase.rpc(
      "generer_prochain_numero_sav"
    );
    if (rpcError || !numeroRPC) {
      setSaving(false);
      return alert("Erreur génération numéro SAV : " + (rpcError?.message || "RPC vide"));
    }

    const heures = parserHeuresEstimees(ticket.temps_estime);
    const lignes: Array<Record<string, unknown>> = [];

    if (Array.isArray(ticket.materiel_prevu) && ticket.materiel_prevu.length > 0) {
      for (const m of ticket.materiel_prevu) {
        lignes.push({
          designation: m.designation || "Fourniture SAV",
          qte: Number(m.quantite) || 1,
          unite: m.unite || "u",
          pu_ht: 0,
          type_cout: "matiere",
        });
      }
    } else if (ticket.description.trim()) {
      lignes.push({
        designation: `Fournitures intervention SAV — ${ticket.type_sinistre || refNormatif.libelleMetier}`,
        description: ticket.description.trim(),
        qte: 1,
        unite: "forfait",
        pu_ht: 0,
        type_cout: "matiere",
      });
    }

    lignes.push({
      designation: `Main-d'œuvre dépannage SAV ${refNormatif.libelleMetier} (${ticket.type_sinistre || "Intervention"})`,
      description: ticket.localisation || undefined,
      qte: heures,
      unite: "h",
      pu_ht: tauxHoraireVente,
      type_cout: "main_oeuvre",
    });

    const clientObj = clients.find((c) => c.id === clientId);
    const payload = {
      numero: numeroRPC,
      client_id: clientId,
      entreprise_id,
      chantier_id: ticket.type_origine === "chantier_bna" && ticket.chantier_id ? ticket.chantier_id : null,
      objet: `Intervention SAV ${refNormatif.libelleMetier} — ${chantierSelectionne?.nom || clientObj?.societe || clientObj?.nom || "Dépannage"}`,
      adresse_chantier: chantierSelectionne?.adresse_chantier || clientObj?.adresse_facturation || "",
      type_travaux: `SAV ${refNormatif.libelleMetier}`,
      validite_jours: 30,
      delai_jours: 15,
      acompte_pct: 30,
      tva_pct: 20,
      statut: "brouillon",
      lignes: lignes as unknown as Json,
    };

    const { error } = await supabase.from("devis").insert(payload).select().single();
    setSaving(false);

    if (error) {
      alert("Erreur lors de la création du devis : " + error.message);
    } else {
      alert(`Devis brouillon ${numeroRPC} créé avec succès !`);
      router.push("/bureau/devis-factures");
    }
  };

  const saveTicket = async (statutOverride?: string) => {
    if (ticket.type_origine === "chantier_bna" && !ticket.chantier_id) {
      return alert("Veuillez sélectionner un chantier BNA !");
    }
    if (ticket.type_origine === "client_externe" && !ticket.client_id) {
      return alert("Veuillez sélectionner ou créer un client externe !");
    }

    const { entreprise_id } = await resoudreContexteEntreprise(null);
    if (!estUuid(entreprise_id)) {
      return alert("Contexte entreprise introuvable dans votre session.");
    }

    setSaving(true);
    const {
      chantiers: _ch,
      clients: _cl,
      pv_receptions: _pv,
      ...ticketBase
    } = ticket;

    const payload = {
      ...ticketBase,
      entreprise_id,
      chantier_id:
        ticket.type_origine === "chantier_bna" && ticket.chantier_id
          ? ticket.chantier_id
          : null,
      client_id:
        ticket.client_id || chantierSelectionne?.client_id || null,
      pv_reception_id: pvAssocie?.id ?? ticket.pv_reception_id ?? null,
      statut: statutOverride ?? ticket.statut,
      date_intervention: ticket.date_intervention
        ? new Date(ticket.date_intervention).toISOString()
        : null,
    };

    if (isNew) {
      const { data, error } = await supabase
        .from("tickets_sav")
        .insert(payload as unknown as TablesInsert<"tickets_sav">)
        .select()
        .single();
      if (error) alert("Erreur : " + error.message);
      else if (data) router.replace(`/bureau/sav/${data.id}`);
    } else {
      const { error } = await supabase
        .from("tickets_sav")
        .update(payload as unknown as TablesUpdate<"tickets_sav">)
        .eq("id", id);
      if (error) alert("Erreur : " + error.message);
    }
    setSaving(false);
  };

  const handleCloture = async () => {
    if (!ticket.signature_technicien)
      return alert("Le visa du technicien est requis pour clôturer.");
    if (!ticket.signature_client)
      return alert("La signature du client est requise pour clôturer.");
    setTicket((prev) => ({ ...prev, statut: "cloture" }));
    await saveTicket("cloture");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F3F1] flex items-center justify-center p-12">
        <div className="h-9 w-9 animate-spin rounded-full border-3 border-[#B85B2B] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] px-4 py-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6 pb-28">
        {/* En-tête blanc */}
        <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/bureau/sav"
              className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-2.5 text-[#23272B] hover:border-[#B85B2B]"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#B85B2B]">
                SAV &amp; Garanties · {refNormatif.libelleMetier}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-[#23272B]">
                {isNew ? "Nouveau Ticket SAV" : "Fiche Intervention SAV"}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {!isNew && (
              <button
                type="button"
                onClick={() => setShowPDF(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-4 py-2.5 text-xs font-bold text-[#23272B] hover:border-[#B85B2B]"
              >
                <Printer size={16} /> Rapport PDF
              </button>
            )}
            <button
              type="button"
              onClick={() => saveTicket()}
              disabled={saving}
              className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] px-5 py-2.5 text-xs font-bold text-white shadow-xs"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Enregistrer
            </button>
          </div>
        </section>

        {/* Choix Origine + Chantier/Client + Garantie automatique */}
        <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleOrigineChange("chantier_bna")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition-all ${
                  ticket.type_origine === "chantier_bna"
                    ? "bg-white text-[#B85B2B] shadow-xs"
                    : "text-[#666666]"
                }`}
              >
                <Building2 size={14} /> Chantier BNA (Garantie / SAV)
              </button>
              <button
                type="button"
                onClick={() => handleOrigineChange("client_externe")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition-all ${
                  ticket.type_origine === "client_externe"
                    ? "bg-white text-[#B85B2B] shadow-xs"
                    : "text-[#666666]"
                }`}
              >
                <UserPlus size={14} /> Client Externe (Hors chantier BNA)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ticket.sous_garantie ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                  <ShieldCheck size={15} /> {garantieCalculee.libelleStatut}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
                  <AlertTriangle size={15} /> {garantieCalculee.libelleStatut}
                </span>
              )}
              {(ticket.facturable || !ticket.sous_garantie) && (
                <span className="inline-flex items-center gap-1 rounded-xl border border-[#B85B2B]/30 bg-[#B85B2B]/10 px-3 py-1.5 text-xs font-bold text-[#B85B2B]">
                  <Receipt size={14} /> Intervention facturable
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {ticket.type_origine === "chantier_bna" ? (
              <div className="md:col-span-2">
                <label className="font-bold uppercase text-[#666666] block mb-1">
                  Chantier BNA concerné
                </label>
                <select
                  className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2.5 text-sm text-[#23272B]"
                  value={ticket.chantier_id}
                  onChange={(e) => handleChantierChange(e.target.value)}
                >
                  <option value="">-- Sélectionner un chantier --</option>
                  {chantiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{(c.metier || "bardage").toUpperCase()}] {c.nom || c.clients?.nom || "Chantier"}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold uppercase text-[#666666]">
                    Client externe
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreationClientRapide((v) => !v)}
                    className="text-xs font-bold text-[#B85B2B] hover:underline"
                  >
                    {creationClientRapide ? "Annuler" : "+ Nouveau client rapide"}
                  </button>
                </div>

                {!creationClientRapide ? (
                  <select
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2.5 text-sm text-[#23272B]"
                    value={ticket.client_id}
                    onChange={(e) =>
                      setTicket((prev) => ({ ...prev, client_id: e.target.value }))
                    }
                  >
                    <option value="">-- Sélectionner un client --</option>
                    {clients.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.societe ? `${cl.societe} (${cl.nom})` : cl.nom}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-2.5">
                    <input
                      placeholder="Nom client *"
                      value={nouveauClientNom}
                      onChange={(e) => setNouveauClientNom(e.target.value)}
                      className="rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs"
                    />
                    <input
                      placeholder="Téléphone"
                      value={nouveauClientTel}
                      onChange={(e) => setNouveauClientTel(e.target.value)}
                      className="rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <input
                        placeholder="Adresse"
                        value={nouveauClientAdresse}
                        onChange={(e) => setNouveauClientAdresse(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={creerClientExterneRapide}
                        className="rounded-lg bg-[#B85B2B] px-3 py-1.5 text-xs font-bold text-white"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="font-bold uppercase text-[#666666] block mb-1">
                Corps d&apos;état / Métier
              </label>
              <select
                value={ticket.metier}
                disabled={ticket.type_origine === "chantier_bna" && Boolean(ticket.chantier_id)}
                onChange={(e) =>
                  setTicket((prev) => ({
                    ...prev,
                    metier: e.target.value as MetierSav,
                    type_sinistre: "",
                  }))
                }
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2.5 text-sm text-[#23272B] disabled:opacity-70"
              >
                <option value="bardage">Bardage</option>
                <option value="terrasse">Terrasse &amp; Mobile</option>
                <option value="cloture">Clôture</option>
              </select>
            </div>
          </div>

          {(!ticket.sous_garantie || ticket.facturable) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B85B2B]/25 bg-[#B85B2B]/5 px-4 py-3 text-xs">
              <span className="font-semibold text-[#23272B]">
                Intervention hors garantie / client externe : générez un devis pré-rempli (fournitures + temps estimé × {tauxHoraireVente} € HT/h).
              </span>
              <button
                type="button"
                onClick={handleGenerateDevis}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] px-4 py-2 font-bold text-white shadow-xs"
              >
                <Receipt size={15} /> Générer un devis d&apos;intervention
              </button>
            </div>
          )}
        </section>

        {/* Grille 4 tuiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* TUILE 1 : SINISTRE */}
          <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              <AlertTriangle size={17} /> 1. Fiche Sinistre ({refNormatif.libelleMetier})
            </h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#555555] block mb-1">
                  Type de problème
                </label>
                <select
                  className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-sm text-[#23272B]"
                  value={ticket.type_sinistre}
                  onChange={(e) => handleSinistreChange(e.target.value)}
                >
                  <option value="">-- Choisir --</option>
                  {sinistresMetier.map((opt) => (
                    <option key={opt.label} value={opt.label}>
                      {opt.label} ({LIBELLES_GARANTIE[opt.garantieDefaut]})
                    </option>
                  ))}
                </select>
              </div>

              {ticket.type_origine === "chantier_bna" && (
                <div>
                  <label className="font-semibold text-[#555555] block mb-1">
                    Régime de garantie légal
                  </label>
                  <select
                    value={ticket.type_garantie}
                    onChange={(e) => {
                      const val = e.target.value as TypeGarantieSav;
                      const calc = calculerStatutGarantie({
                        typeOrigine: "chantier_bna",
                        typeGarantie: val,
                        dateReception: pvAssocie?.date_reception ?? chantierSelectionne?.date_fin ?? null,
                      });
                      setTicket((prev) => ({
                        ...prev,
                        type_garantie: val,
                        sous_garantie: calc.sousGarantie,
                        facturable: calc.facturable,
                      }));
                    }}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-sm text-[#23272B]"
                  >
                    <option value="gpa_1an">GPA — Garantie de Parfait Achèvement (1 an)</option>
                    <option value="biennale_2ans">Biennale — Équipements &amp; Motorisations (2 ans)</option>
                    <option value="decennale_10ans">Décennale — Structure &amp; Étanchéité (10 ans)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="font-semibold text-[#555555] block mb-1">
                  Localisation précise
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm text-[#23272B]"
                  placeholder={refNormatif.placeholderLocalisation}
                  value={ticket.localisation}
                  onChange={(e) =>
                    setTicket((prev) => ({ ...prev, localisation: e.target.value }))
                  }
                />
              </div>
            </div>
          </section>

          {/* TUILE 2 : DIAGNOSTIC */}
          <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              <FileCheck size={17} /> {refNormatif.titreDiagnostic}
            </h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#555555] block mb-1">
                  Diagnostic &amp; Cause probable
                </label>
                <textarea
                  className="w-full rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm text-[#23272B] h-24 resize-none"
                  placeholder="Constat technique, origine du désordre..."
                  value={ticket.diagnostic_dtu}
                  onChange={(e) =>
                    setTicket((prev) => ({ ...prev, diagnostic_dtu: e.target.value }))
                  }
                />
              </div>

              <label className="flex items-center justify-between rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3 cursor-pointer">
                <span className="font-semibold text-[#23272B]">
                  {refNormatif.labelNorme}
                </span>
                <input
                  type="checkbox"
                  checked={ticket.respect_dtu}
                  onChange={(e) =>
                    setTicket((prev) => ({ ...prev, respect_dtu: e.target.checked }))
                  }
                  className="h-4 w-4 rounded text-[#B85B2B]"
                />
              </label>
            </div>
          </section>

          {/* TUILE 3 : MATÉRIEL */}
          <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              <Wrench size={17} /> 3. Matériel &amp; Fournitures à prévoir
            </h2>
            <textarea
              className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3 text-sm text-[#23272B] h-28 resize-none"
              placeholder={refNormatif.placeholderMateriel}
              value={ticket.description}
              onChange={(e) =>
                setTicket((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </section>

          {/* TUILE 4 : INTERVENTION */}
          <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              <Calendar size={17} /> 4. Planification Intervention
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-[#555555] block mb-1">Date prévue</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm text-[#23272B]"
                  value={ticket.date_intervention}
                  onChange={(e) =>
                    setTicket((prev) => ({ ...prev, date_intervention: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="font-semibold text-[#555555] block mb-1">Temps estimé</label>
                <input
                  type="text"
                  placeholder="Ex: 1h30"
                  className="w-full rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm text-[#23272B]"
                  value={ticket.temps_estime}
                  onChange={(e) =>
                    setTicket((prev) => ({ ...prev, temps_estime: e.target.value }))
                  }
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-[#555555] block mb-1">Équipe / Intervenant</label>
                <input
                  type="text"
                  placeholder="Ex: Gaël"
                  className="w-full rounded-xl border border-[#E5E5E5] px-3 py-2 text-sm text-[#23272B]"
                  value={ticket.intervenant}
                  onChange={(e) =>
                    setTicket((prev) => ({ ...prev, intervenant: e.target.value }))
                  }
                />
              </div>
            </div>
          </section>
        </div>

        {/* PHOTOS & SIGNATURES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5 space-y-3 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              <Camera size={17} /> Photos Avant / Après
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {(["avant", "apres"] as const).map((type) => (
                <label
                  key={type}
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DCDCDC] bg-[#F8F9FA] p-3 cursor-pointer hover:border-[#B85B2B]"
                >
                  {ticket.photos?.[type] ? (
                    <Image
                      src={ticket.photos[type]!}
                      alt={type}
                      width={120}
                      height={90}
                      className="h-24 w-full object-cover rounded-lg"
                    />
                  ) : (
                    <span className="font-semibold text-[#666666] py-6">
                      {uploading[type] ? "Envoi..." : `+ Photo ${type}`}
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, type)}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              <CheckCircle size={17} /> Clôture &amp; Signatures
            </h2>
            <div className="space-y-3">
              <SignaturePad
                label="Visa Technicien"
                value={ticket.signature_technicien}
                onChange={(sig) =>
                  setTicket((prev) => ({ ...prev, signature_technicien: sig }))
                }
              />
              <SignaturePad
                label="Signature Client"
                value={ticket.signature_client}
                onChange={(sig) =>
                  setTicket((prev) => ({ ...prev, signature_client: sig }))
                }
              />
              {!isNew && ticket.statut !== "cloture" && (
                <button
                  type="button"
                  onClick={handleCloture}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-bold text-white"
                >
                  Valider et clôturer l&apos;intervention SAV
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Modal Aperçu PDF */}
      {showPDF && (
        <div
          className="fixed inset-0 z-[210] pt-24 overflow-y-auto bg-black/75 p-4"
          onClick={() => setShowPDF(false)}
        >
          <div className="mx-auto max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white"
              >
                Imprimer / PDF
              </button>
              <button
                type="button"
                onClick={() => setShowPDF(false)}
                className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#23272B]"
              >
                <X size={16} />
              </button>
            </div>
            <RapportSAVPDF
              ticket={ticket as unknown as TicketSav}
              entreprise={entreprise}
            />
          </div>
        </div>
      )}
    </div>
  );
}
