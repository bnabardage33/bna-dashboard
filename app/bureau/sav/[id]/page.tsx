"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  ArrowLeft, Camera, FileCheck, Wrench, Calendar, CheckCircle,
  AlertTriangle, Save, Loader2
} from "lucide-react";
import Image from "next/image";
import SignaturePad from "@/components/SignaturePad";
import RapportSAVPDF from "@/components/RapportSAVPDF";
import { Printer, X } from "lucide-react";
import type { TicketSav, EntrepriseSettings, MaterielPrevu } from "@/types/finance";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";

// O3-B9 : le claim `app_metadata.entreprise_id` doit être un UUID avant d'être
// recopié dans une colonne `uuid`. Sans cette garde, un claim corrompu produirait
// une erreur PostgreSQL opaque ; avec elle, l'échec est explicite et sans écriture.
//
// Le retour est un PRÉDICAT DE TYPE (`value is string`) : c'est ce qui permet à
// TypeScript de rétrécir `string | null` en `string` après l'appel, et donc
// d'exiger `entreprise_id: string` dans l'objet inséré SANS assertion `as`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export default function FicheSAV() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const isNew = id === "nouveau";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [chantiers, setChantiers] = useState<{ id: string; nom: string | null; client_id: string | null; adresse_chantier: string | null; clients: { id: string; nom: string; societe: string | null } | null }[]>([]);
  const [entreprise, setEntreprise] = useState<EntrepriseSettings | null>(null);
  const [showPDF, setShowPDF] = useState(false);

  const [uploading, setUploading] = useState<{avant: boolean, apres: boolean}>({avant: false, apres: false});

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
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Compression echouee'))),
            'image/jpeg',
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

  
  const [ticket, setTicket] = useState({
    chantier_id: "",
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
    photos: { client: null, avant: null, apres: null },
    signature_technicien: null as string | null,
    signature_client: null as string | null,
    chantiers: null as {
      nom: string | null;
      client_id: string | null;
      adresse_chantier: string | null;
      clients: { id: string; nom: string; societe: string | null } | null;
    } | null
  });

  useEffect(() => {
    supabase.from("entreprise_settings").select("*").eq("id", 1).single().then(({ data }) => { if (data) setEntreprise(data as unknown as EntrepriseSettings) });
    supabase.from("chantiers").select("id, nom, client_id, adresse_chantier, clients(id, nom, societe)").order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setChantiers(data); });

    if (!isNew) {
      supabase.from("tickets_sav").select("*, chantiers(nom, client_id, adresse_chantier, clients(id, nom, societe))").eq("id", id).single().then(({ data }) => {
        if (data) {
          setTicket({
            ...data,
            date_intervention: data.date_intervention ? data.date_intervention.split('T')[0] : "",
          } as unknown as typeof ticket);
        }
        setLoading(false);
      });
    }
  }, [id, isNew]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avant' | 'apres') => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    const file = rawFile.type.startsWith('image/')
      ? await compressImage(rawFile)
      : rawFile;

    setUploading(prev => ({ ...prev, [type]: true }));
    const fileExt = rawFile.type.startsWith('image/') ? 'jpg' : rawFile.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${ticket.chantier_id || 'unassigned'}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('sav_photos').upload(filePath, file);

    if (uploadError) {
      alert("Erreur lors de l'envoi de l'image.");
      console.error(uploadError);
    } else {
      const { data } = supabase.storage.from('sav_photos').getPublicUrl(filePath);
      setTicket(prev => ({
        ...prev,
        photos: { ...prev.photos, [type]: data.publicUrl }
      }));
    }
    setUploading(prev => ({ ...prev, [type]: false }));
  };

  
  const handleGenerateDevis = async () => {
    if (!ticket.chantiers) return alert("Veuillez sélectionner et enregistrer le chantier d'abord.");
    
    const client_id = ticket.chantiers?.client_id || ticket.chantiers?.clients?.id;
    if (!client_id) return alert("Client introuvable sur ce chantier.");

    
    
    const prixStr = window.prompt("Quel est le montant HT à facturer pour cette intervention SAV ?\n(La marge de 37% doit être incluse dans votre prix)");
    if (prixStr === null) return; // Annulation
    const prix = parseFloat(prixStr.replace(',', '.'));
    if (isNaN(prix)) return alert("Montant invalide, veuillez entrer un nombre (ex: 150.50).");

    setSaving(true);

    // Numéro SAV séquentiel et atomique via RPC PostgreSQL (anti-doublon)
    const { data: numeroRPC, error: rpcError } = await supabase.rpc('generer_prochain_numero_sav');
    if (rpcError || !numeroRPC) {
      setSaving(false);
      alert("Erreur lors de la génération du numéro SAV : " + (rpcError?.message || "RPC vide"));
      return;
    }
    const numero = numeroRPC;
    
    const lignes = [
      {
        designation: "Intervention SAV Hors Garantie (" + (ticket.type_sinistre || "Divers") + ")",
        description: ticket.description || "Travaux de reprise et main d'oeuvre",
        qte: 1,
        unite: "Forfait",
        pu_ht: prix
      }
    ];

    // O3-B9 : `devis` est une table RACINE — elle n'est dans AUCUNE liste de
    // triggers de la migration part4 §7 (ni `par_chantier`, ni `par_devis`).
    // Le `chantier_id` ci-dessous n'aide donc pas : `entreprise_id` est NOT NULL
    // sans défaut et rien ne peut le poser côté base. On le résout donc depuis le
    // claim `app_metadata.entreprise_id`, même source que `entreprise_courante()`.
    // On passe `null` au résolveur (et non `ticket.chantier_id`) parce que la
    // branche « chantier présent » ne poserait RIEN : elle réserve le remplissage
    // au trigger, qui n'existe pas sur `devis`.
    const { entreprise_id } = await resoudreContexteEntreprise(null);

    // Fail-closed : sans contexte entreprise, AUCUNE écriture. Le numéro SAV
    // vient d'être consommé par la RPC ci-dessus ; on rend explicitement l'échec
    // plutôt que de laisser croire à une création.
    if (!estUuid(entreprise_id)) {
      setSaving(false);
      alert(
        "Impossible de créer le devis : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
      );
      return;
    }

    const payload = {
      numero,
      client_id,
      entreprise_id,
      chantier_id: ticket.chantier_id,
      objet: "Intervention SAV - " + (ticket.chantiers?.nom || ""),
      adresse_chantier: ticket.chantiers?.adresse_chantier || "",
      type_travaux: "SAV",
      validite_jours: 30,
      delai_jours: 15,
      acompte_pct: 30,
      tva_pct: 20,
      statut: "brouillon",
      lignes
    };

    // O3-B9 : plus aucune assertion `as`. `entreprise_id` est rétréci en `string`
    // par `estUuid`, donc le type `Insert` de `devis` est réellement satisfait —
    // et une future régression de scopage redevient une ERREUR DE COMPILATION
    // au lieu d'être masquée par un cast.
    const { data, error } = await supabase.from("devis").insert(payload).select().single();
    setSaving(false);

    if (error) {
      console.error(error);
      alert("Erreur lors de la création du devis.");
    } else {
      alert("Devis brouillon " + numero + " créé avec succès ! Retrouvez-le dans l'onglet Devis.");
      router.push("/bureau/devis-factures");
    }
  };


  const saveTicket = async () => {
    if (!ticket.chantier_id) return alert("Veuillez sélectionner un chantier !");
    setSaving(true);
    
    const { chantiers: _chantiers, ...ticketSansJointure } = ticket;
    const payload = {
      ...ticketSansJointure,
      date_intervention: ticket.date_intervention ? new Date(ticket.date_intervention).toISOString() : null,
    };

    if (isNew) {
      const { data, error } = await supabase.from("tickets_sav").insert(payload as unknown as TablesInsert<"tickets_sav">).select().single();
      if (!error && data) router.replace(`/bureau/sav/${data.id}`);
    } else {
      await supabase.from("tickets_sav").update(payload as unknown as TablesUpdate<"tickets_sav">).eq("id", id);
    }
    setSaving(false);
  };

  const handleCloture = async () => {
    if (!ticket.signature_technicien) return alert("Le visa du technicien est requis pour clôturer.");
    if (!ticket.signature_client) return alert("La signature du client est requise pour clôturer.");
    setTicket(prev => ({ ...prev, statut: "cloture" }));

    const { chantiers: _chantiersCloture, ...ticketSansJointureCloture } = ticket;
    
    const payload = {
      ...ticketSansJointureCloture,
      statut: "cloture",
      date_intervention: ticket.date_intervention ? new Date(ticket.date_intervention).toISOString() : null,
    };
    
    await supabase.from("tickets_sav").update(payload as unknown as TablesUpdate<"tickets_sav">).eq("id", id);
  };

  if (loading) return <div className="p-12 text-center text-gray-400">Chargement de la fiche...</div>;

  return (
    <div className="p-4 sm:p-8 space-y-6 pb-32">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/bureau/sav" className="p-2 bg-[#1A1D24] rounded-xl hover:bg-[#1A1D24] text-gray-300">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            {isNew ? "Nouveau Ticket SAV" : "Fiche Intervention SAV"}
          </h1>
        </div>
        <button 
          onClick={saveTicket}
          disabled={saving}
          className="bg-red-600 text-white hover:bg-red-700 w-full sm:w-auto rounded-xl py-3 px-5 font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-all"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Enregistrer
        </button>
      </div>

      <div className="bg-[#1A1D24] p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 w-full">
          <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Chantier concerné</label>
          <select 
            className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-red-600"
            value={ticket.chantier_id}
            onChange={(e) => setTicket({...ticket, chantier_id: e.target.value})}
          >
            <option value="">-- Sélectionner un chantier --</option>
            {chantiers.map(c => (
              <option key={c.id} value={c.id}>{c.nom || c.clients?.nom}</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-48">
          <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Couverture</label>
          <button
            onClick={() => setTicket({...ticket, sous_garantie: !ticket.sous_garantie})}
            className={`w-full py-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              ticket.sous_garantie 
                ? "bg-white/5 text-gray-400 border border-white/10" 
                : "bg-red-950/30 text-red-400 border border-red-500/30"
            }`}
          >
            {ticket.sous_garantie ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            {ticket.sous_garantie ? "Sous Garantie" : "Hors Garantie"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* TUILE 1 : FICHE SINISTRE */}
        <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <AlertTriangle size={18} /> 1. Fiche Sinistre
          </h2>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Type de problème</label>
              <select 
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={ticket.type_sinistre}
                onChange={(e) => setTicket({...ticket, type_sinistre: e.target.value})}
              >
                <option value="">-- Choisir --</option>
                <option value="Lame voilée / fendue">Lame voilée / fendue</option>
                <option value="Infiltration d'eau">Infiltration d'eau</option>
                <option value="Problème encadrement">Problème encadrement</option>
                <option value="Grille anti-rongeur">Grille anti-rongeur</option>
                <option value="Fixation / Tasseau">Fixation / Tasseau</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            
            <div>
              <label className="text-xs text-gray-400 block mb-1">Localisation (Façade, Pignon...)</label>
              <input 
                type="text" 
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Ex: Façade Sud, entre M-12 et M-14"
                value={ticket.localisation}
                onChange={(e) => setTicket({...ticket, localisation: e.target.value})}
              />
            </div>
          </div>
        </div>

        {/* TUILE 2 : DIAGNOSTIC DTU */}
        <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <FileCheck size={18} /> 2. Diagnostic DTU 41.2
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Diagnostic & Cause probable</label>
              <textarea 
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white h-20 resize-none"
                placeholder="Ex: Entraxe 400mm OK. Cause: choc mécanique client."
                value={ticket.diagnostic_dtu}
                onChange={(e) => setTicket({...ticket, diagnostic_dtu: e.target.value})}
              />
            </div>

            <div className="flex items-center justify-between bg-transparent p-3 rounded-xl border border-white/10">
              <span className="text-sm font-semibold text-gray-300">Respect des normes DTU 41.2</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={ticket.respect_dtu}
                  onChange={(e) => setTicket({...ticket, respect_dtu: e.target.checked})}
                />
                <div className="w-11 h-6 bg-[#1A1D24] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#1A1D24] after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>
            {ticket.respect_dtu && (
              <p className="text-[10px] text-gray-400 font-medium">✅ Ce diagnostic protège juridiquement l'entreprise.</p>
            )}
          </div>
        </div>

        {/* TUILE 3 : MATÉRIEL */}
        <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Wrench size={18} /> 3. Matériel à prévoir
          </h2>
          <div className="bg-transparent p-3 rounded-xl border border-white/10 text-sm text-gray-400 italic text-center">
            <textarea 
              className="w-full bg-transparent border-none outline-none text-sm text-gray-300 h-20 resize-none"
              placeholder="Ex: 3x lames Red Cedar 3600, 2 tasseaux 22x45, 1 boîte vis Inox A2..."
              value={ticket.description}
              onChange={(e) => setTicket({...ticket, description: e.target.value})}
            />
          </div>
          <button className="w-full bg-red-600/20 text-gray-400 hover:bg-red-600/30 border border-white/10 py-2 rounded-lg text-xs font-bold transition-all">
            Ajouter au débit atelier (Prochainement)
          </button>
        </div>

        {/* TUILE 4 : INTERVENTION */}
        <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Calendar size={18} /> 4. Intervention
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Date prévue</label>
              <input 
                type="date" 
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={ticket.date_intervention}
                onChange={(e) => setTicket({...ticket, date_intervention: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Temps estimé</label>
              <input 
                type="text" 
                placeholder="Ex: 1h30"
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={ticket.temps_estime}
                onChange={(e) => setTicket({...ticket, temps_estime: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Équipe</label>
              <input 
                type="text" 
                placeholder="Ex: Gaël"
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={ticket.intervenant}
                onChange={(e) => setTicket({...ticket, intervenant: e.target.value})}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Accès</label>
              <select 
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                value={ticket.moyen_acces}
                onChange={(e) => setTicket({...ticket, moyen_acces: e.target.value})}
              >
                <option value="">Sélectionner</option>
                <option value="Échelle">Échelle</option>
                <option value="Échafaudage">Échafaudage</option>
                <option value="Nacelle">Nacelle</option>
                <option value="Pied">Plain-pied</option>
              </select>
            </div>
          </div>
        </div>

        {/* TUILE 5 : PHOTOS ET SIGNATURE */}
        <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden md:col-span-2">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Camera size={18} /> 5. Photos & Signature Client
          </h2>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400">PHOTOS D'INTERVENTION</p>
              <div className="flex gap-3 max-w-md">
                <label className="flex-1 border border-dashed border-slate-600 bg-transparent/50 hover:bg-[#1A1D24] rounded-xl h-24 flex flex-col items-center justify-center text-gray-400 transition-all cursor-pointer relative overflow-hidden">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, 'avant')} disabled={uploading.avant} />
                  {uploading.avant ? (
                    <Loader2 size={24} className="animate-spin mb-1 text-gray-300" />
                  ) : ticket.photos.avant ? (
                    <Image src={ticket.photos.avant} alt="Photo avant" className="absolute inset-0 w-full h-full object-cover opacity-60 hover:opacity-40 transition-opacity"  width={100} height={100} />
                  ) : (
                    <Camera size={24} className="mb-1" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest relative z-10 drop-shadow-md">Avant</span>
                </label>
                
                <label className="flex-1 border border-dashed border-slate-600 bg-transparent/50 hover:bg-[#1A1D24] rounded-xl h-24 flex flex-col items-center justify-center text-gray-400 transition-all cursor-pointer relative overflow-hidden">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, 'apres')} disabled={uploading.apres} />
                  {uploading.apres ? (
                    <Loader2 size={24} className="animate-spin mb-1 text-gray-300" />
                  ) : ticket.photos.apres ? (
                    <Image src={ticket.photos.apres} alt="Photo après" className="absolute inset-0 w-full h-full object-cover opacity-60 hover:opacity-40 transition-opacity"  width={100} height={100} />
                  ) : (
                    <Camera size={24} className="mb-1" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest relative z-10 drop-shadow-md">Après</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400">VALIDATION (FIN D'INTERVENTION)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-transparent rounded-xl border border-white/10 p-2 relative min-h-[120px]">
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-2">Visa du Technicien</p>
                  {ticket.signature_technicien ? (
                    <div className="relative">
                      <Image src={ticket.signature_technicien} alt="Signature Technicien" className="h-20 w-auto mx-auto filter invert opacity-80"  width={100} height={100} />
                      <button 
                        onClick={() => setTicket({...ticket, signature_technicien: null})}
                        className="absolute top-0 right-0 text-[10px] text-red-400 hover:underline"
                      >
                        Effacer
                      </button>
                    </div>
                  ) : (
                    <SignaturePad 
                      label=""
                      signerName=""
                      onChange={(img) => setTicket({...ticket, signature_technicien: img})}
                    />
                  )}
                </div>
                
                <div className="bg-transparent rounded-xl border border-white/10 p-2 relative min-h-[120px]">
                  <p className="text-[10px] uppercase text-gray-500 font-bold mb-2">Signature du Client</p>
                  {ticket.signature_client ? (
                    <div className="relative">
                      <Image src={ticket.signature_client} alt="Signature Client" className="h-20 w-auto mx-auto filter invert opacity-80"  width={100} height={100} />
                      <button 
                        onClick={() => setTicket({...ticket, signature_client: null})}
                        className="absolute top-0 right-0 text-[10px] text-red-400 hover:underline"
                      >
                        Effacer
                      </button>
                    </div>
                  ) : (
                    <SignaturePad 
                      label=""
                      signerName=""
                      onChange={(img) => setTicket({...ticket, signature_client: img})}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TUILE 6 : CLOTURE */}
        <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden md:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-600" />
          
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <CheckCircle size={18} /> 6. Clôture du Ticket
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              La clôture génère automatiquement le rapport PDF classé dans le dossier du chantier.
            </p>
          </div>

          <div className="flex gap-3">
            {!ticket.sous_garantie && (
              <button onClick={handleGenerateDevis} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-600/10 transition-all flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <FileCheck size={18} />} Générer Devis (+37%)
              </button>
            )}
            
            <button 
              onClick={handleCloture}
              disabled={ticket.statut === "cloture"}
              className="bg-red-600 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-600/10 transition-all flex items-center gap-2"
            >
              <Save size={18} /> {ticket.statut === "cloture" ? "Ticket Clôturé" : "Clôturer le SAV"}
            </button>
            {ticket.statut === "cloture" && (
              <button onClick={() => setShowPDF(true)} className="bg-[#1A1D24] hover:bg-[#1A1D24] text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2">
                <FileCheck size={18} /> Voir le Rapport
              </button>
            )}
          </div>

        </div>

      </div>

      {showPDF && (
        <div className="fixed inset-0 z-[100] bg-transparent/90 flex flex-col backdrop-blur-sm">
          <div className="flex justify-between items-center p-4 bg-transparent border-b border-slate-800 print:hidden">
            <h2 className="text-xl font-bold text-white">Rapport SAV</h2>
            <div className="flex gap-4">
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-bold">
                <Printer size={18} /> Imprimer / PDF
              </button>
              <button onClick={() => setShowPDF(false)} className="p-2 bg-[#1A1D24] hover:bg-[#1A1D24] rounded-xl text-gray-300">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#1A1D24]/50 flex justify-center print:bg-[#1A1D24] print:p-0 print:block">
            <RapportSAVPDF ticket={ticket as TicketSav} entreprise={entreprise} />
          </div>
        </div>
      )}
    </div>
  );

}
