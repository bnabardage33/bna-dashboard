'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Check, Loader2, Trash2, Paperclip, Sparkles } from 'lucide-react';
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  normaliserTauxTva,
  serialiserTauxTva,
  estNombreTauxTva,
} from "@/lib/tauxTva";

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

interface Chantier { id: string; nom: string | null; clients?: { nom: string | null; societe: string | null } | null; }
interface Fournisseur { id: string; nom: string; }

interface DocumentCompta {
  id: string;
  type: 'bl' | 'ticket';
  date: string;
  note: string | null;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  url_image: string;
  chantier_id: string | null;
  fournisseur_id: string | null;
  categorie: string | null;
  chantiers: { id: string; nom: string | null } | null;
  fournisseurs: { id: string; nom: string } | null;
}

const CATEGORIES = [
  { value: 'materiaux', label: 'Matériaux' },
  { value: 'quincaillerie', label: 'Quincaillerie' },
  { value: 'location', label: 'Location' },
  { value: 'carburant', label: 'Carburant' },
  { value: 'sous_traitance', label: 'Sous-traitance' },
  { value: 'frais', label: 'Frais' },
  { value: 'autre', label: 'Autre' },
];

export default function DocumentsComptaPage() {
  const [onglet, setOnglet] = useState<'scanner' | 'documents'>('scanner');

  const [type, setType] = useState<'bl' | 'ticket'>('bl');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [montantHt, setMontantHt] = useState('');
  const [tauxTva, setTauxTva] = useState('20');
  const [chantierId, setChantierId] = useState('');
  const [fournisseurId, setFournisseurId] = useState('');
  const [categorie, setCategorie] = useState('materiaux');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentCompta[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  // O3-B9 / 13e : distingue « la liste est vide » de « la liste n'a pas pu être
  // lue ». Sans cet état, un GET fail-closed (403) produisait l'affichage de
  // « Aucun document enregistré » — une affirmation FAUSSE, alors que la liste
  // n'a jamais été lue. Le bandeau d'explication est déjà rendu plus bas.
  const [listeLisible, setListeLisible] = useState(false);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [ocrEnCours, setOcrEnCours] = useState(false);
  const [ocrInfo, setOcrInfo] = useState<string | null>(null);
  const [ocrImageUrl, setOcrImageUrl] = useState<string | null>(null);
  const [fpPropose, setFpPropose] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ht = parseFloat(montantHt) || 0;
  // F3 : même règle que le serveur (`lib/tauxTva.ts`). `parseFloat(x) || 0`
  // renvoyait 0 par ACCIDENT (0 est falsy) et non par choix — invisible tant
  // que le serveur, lui, faisait `|| 20` et stockait 20. Règle explicite pour que
  // l'affichage et le stockage ne puissent plus diverger.
  const tva = normaliserTauxTva(tauxTva);
  const montantTvaCalcule = ht * (tva / 100);
  const montantTtcCalcule = ht + montantTvaCalcule;

  const loadData = async () => {
    setLoadingDocs(true);
    try {
      const [docsRes, listRes] = await Promise.all([
        fetch('/api/documents-compta'),
        fetch('/api/chantiers-fournisseurs'),
      ]);
      const docsData: Record<string, unknown> = await docsRes.json().catch(() => ({}));
      const listData: Record<string, unknown> = await listRes.json().catch(() => ({}));

      // O3-B9 / 13e : le GET est désormais fail-closed (403 si le contexte
      // entreprise est absent). Ignorer ce code rendrait l'échec SILENCIEUX —
      // l'écran afficherait « Aucun document enregistré », ce qui est un mensonge
      // alors que la liste n'a jamais été lue. L'erreur remonte dans le bandeau
      // EXISTANT (aucune UI ajoutée).
      if (!docsRes.ok || docsData.error) {
        setDocuments([]);
        setListeLisible(false);
        throw new Error(
          String(docsData.error ?? `Liste des documents illisible (HTTP ${docsRes.status})`)
        );
      }

      setListeLisible(true);
      setDocuments(Array.isArray(docsData.documents) ? (docsData.documents as DocumentCompta[]) : []);
      setChantiers(Array.isArray(listData.chantiers) ? (listData.chantiers as Chantier[]) : []);
      setFournisseurs(Array.isArray(listData.fournisseurs) ? (listData.fournisseurs as Fournisseur[]) : []);
    } catch (e) {
      setError(`Documents compta : ${(e as Error).message}`);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSuccess(false);
    setError(null);
    analyserPhoto(f);
  };

  const normaliser = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const mapperCategorie = (cat: string): string => {
    if (cat === 'outillage') return 'quincaillerie';
    const trouve = CATEGORIES.find((c) => c.value === cat);
    return trouve ? cat : 'autre';
  };

  const analyserPhoto = async (f: File) => {
    setOcrEnCours(true);
    setOcrInfo(null);
    setOcrImageUrl(null);
    setFpPropose(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/ia-ocr-ticket', { method: 'POST', body: fd });
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || data.error) throw new Error(String(data.error || `Erreur serveur HTTP ${res.status}`));

      if (data.montant_ht) {
        setMontantHt(String(data.montant_ht));
      } else if (estNombreTauxTva(data.tva) && Number(data.montant_ttc) > 0) {
        // F3 : `data.tva` vaut 0 pour un ticket à 0 % — un test de VÉRITÉ
        // (`&& data.tva`) écartait alors ce ticket ET recalculait le HT avec
        // 20 %. Ici on teste l'EXISTENCE d'un nombre fini.
        const ht = Number(data.montant_ttc) / (1 + normaliserTauxTva(data.tva) / 100);
        setMontantHt(String(Math.round(ht * 100) / 100));
      }
      // F3 : `if (data.tva)` ignorait un taux de 0 % (falsy) et laissait l'ancien
      // taux dans le formulaire. Test d'existence, pas de vérité.
      if (estNombreTauxTva(data.tva)) setTauxTva(String(data.tva));
      if (data.date_facture) setDate(String(data.date_facture));
      if (data.categorie) setCategorie(mapperCategorie(String(data.categorie)));

      if (data.fournisseur_nom) {
        const nom = String(data.fournisseur_nom);
        const norm = normaliser(nom);
        const trouve = fournisseurs.find((f) => {
          const fn = normaliser(f.nom);
          return fn && (fn.includes(norm) || norm.includes(fn));
        });
        if (trouve) setFournisseurId(trouve.id);
        else setFpPropose(nom);
      }

      if (data.image_url) setOcrImageUrl(String(data.image_url));
      setOcrInfo('🤖 Rempli auto par IA — vérifiez puis Enregistrer');
    } catch (e) {
      setError(`OCR échoué : ${(e as Error).message} — saisie manuelle possible`);
    } finally {
      setOcrEnCours(false);
    }
  };

  const creerFournisseur = async () => {
    if (!fpPropose) return;

    // O3-B9 : `fournisseurs` est une table RACINE (`entreprise_id` NOT NULL
    // sans défaut depuis le 2026-09-22, aucun trigger possible car pas de
    // `chantier_id`). Le fournisseur proposé par l'OCR n'a aucun parent dont
    // hériter : on résout le tenant via le claim `app_metadata.entreprise_id`,
    // même source que `entreprise_courante()` côté PostgREST.
    const { entreprise_id } = await resoudreContexteEntreprise(null);

    // Fail-closed : sans contexte entreprise, AUCUNE écriture. Sans cette garde
    // l'insert échouait (NOT NULL) et l'affectation du document comptable était
    // bloquée, l'utilisateur ne pouvait donc pas utiliser le flux OCR.
    if (!estUuid(entreprise_id)) {
      setError(
        'Impossible de créer le fournisseur : votre session ne contient pas d\'entreprise identifiée. Reconnectez-vous et réessayez.'
      );
      console.error(
        'Documents compta : fournisseur OCR NON créé — contexte entreprise introuvable ou invalide dans la session.'
      );
      return;
    }

    const { data, error } = await supabase
      .from('fournisseurs')
      .insert({ nom: fpPropose, entreprise_id })
      .select()
      .single();
    if (error) {
      setError('Erreur création fournisseur : ' + error.message);
      return;
    }
    setFournisseurId(data.id);
    setFpPropose(null);
    loadData();
  };

  const handleUpload = async () => {
    if (!file) { setError("Choisissez une photo avant d'envoyer."); return; }

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      fd.append('date', date);
      fd.append('note', note.trim());
      fd.append('montant_ht', montantHt || '0');
      // F3 : `tauxTva || '20'` envoyait la chaîne vide à l'API (qui retombait
      // alors sur 20 de son côté). On sérialise la valeur DÉJÀ normalisée : le
      // payload est donc toujours un taux valide, "0" compris.
      fd.append('taux_tva', serialiserTauxTva(tauxTva));
      if (ocrImageUrl) fd.append('file_url', ocrImageUrl);
      if (chantierId) fd.append('chantier_id', chantierId);
      if (fournisseurId) fd.append('fournisseur_id', fournisseurId);
      fd.append('categorie', categorie);

      const res = await fetch('/api/documents-compta', { method: 'POST', body: fd });

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Reponse invalide du serveur (HTTP ${res.status})`);
      }

      if (!res.ok || data.error) {
        throw new Error(String(data.error) || `Erreur serveur HTTP ${res.status}`);
      }

      setSuccess(true);
      setFile(null);
      setPreview(null);
      setNote('');
      setMontantHt('');
      setChantierId('');
      setFournisseurId('');
      setCategorie('materiaux');
      setOcrInfo(null);
      setOcrImageUrl(null);
      setFpPropose(null);
      if (fileRef.current) fileRef.current.value = '';
      loadData();
    } catch (e) {
      setError(`Echec de l'envoi : ${(e as Error).message}`);
      // O3-B9 / 13e : quand seul le MIROIR `depenses_chantier` échoue, le
      // document EST créé et la route répond 500 (masquer cela par un 2xx
      // mentirait sur la prise en compte de la dépense). On rafraîchit donc la
      // liste pour que le document réellement créé apparaisse malgré l'erreur.
      loadData();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce document definitivement ?')) return;
    try {
      const res = await fetch(`/api/documents-compta?id=${id}`, { method: 'DELETE' });
      // O3-B9 / 13e : la réponse était IGNORÉE. Or le DELETE est désormais
      // fail-closed (404 hors tenant, 403 sans contexte) : sans ce contrôle,
      // un échec de suppression se traduisait par un simple rechargement de la
      // liste, le document restant visible et l'utilisateur sans aucune
      // information. L'erreur va dans le bandeau EXISTANT.
      if (!res.ok) {
        const data: Record<string, unknown> = await res.json().catch(() => ({}));
        throw new Error(String(data.error ?? `Erreur serveur HTTP ${res.status}`));
      }
      setError(null);
      loadData();
    } catch (e) {
      setError(`Erreur suppression : ${(e as Error).message}`);
    }
  };

  return (
    <div className="min-h-screen bg-transparent p-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-bold text-white">Docs Compta</h1>
          <p className="text-xs text-gray-400">Scanner BL/Ticket et rattacher à un chantier</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setOnglet('scanner')}
            className={`text-sm whitespace-nowrap transition-all ${
              onglet === 'scanner'
                ? "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                : "bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full px-4 py-2 border border-white/5"
            }`}
          >
            📷 Scanner
          </button>
          <button
            onClick={() => setOnglet('documents')}
            className={`text-sm whitespace-nowrap transition-all ${
              onglet === 'documents'
                ? "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                : "bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full px-4 py-2 border border-white/5"
            }`}
          >
            📁 Documents ({documents.length})
          </button>
        </div>

        {onglet === 'scanner' && (
          <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-white mb-1 block">Type de document</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType('bl')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${type === 'bl' ? 'bg-red-600 text-white' : 'bg-transparent border border-white/10 text-gray-400'}`}
                >
                  Bon de Livraison
                </button>
                <button
                  type="button"
                  onClick={() => setType('ticket')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${type === 'ticket' ? 'bg-red-600 text-white' : 'bg-transparent border border-white/10 text-gray-400'}`}
                >
                  Ticket
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-white mb-1 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white mb-1 block">Montant HT</label>
                <input
                  type="number"
                  step="0.01"
                  value={montantHt}
                  onChange={(e) => setMontantHt(e.target.value)}
                  className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-white mb-1 block">TVA (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tauxTva}
                  onChange={(e) => setTauxTva(e.target.value)}
                  className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">TVA</p>
                <p className="text-sm font-black text-white">{montantTvaCalcule.toFixed(2)} EUR</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-red-400 font-bold">Total TTC</p>
                <p className="text-sm font-black text-red-400">{montantTtcCalcule.toFixed(2)} EUR</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-white mb-1 block">Rattacher à un chantier</label>
              <select
                value={chantierId}
                onChange={(e) => setChantierId(e.target.value)}
                className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
              >
                <option value="">-- Aucun --</option>
                {chantiers.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom || c.clients?.societe || c.clients?.nom || 'Chantier (sans nom)'}</option>
                ))}
              </select>
              {chantierId && (
                <p className="mt-1 text-[10px] text-emerald-400 font-bold">+ La dépense sera créée automatiquement dans Finance</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white mb-1 block">Fournisseur</label>
                <select
                  value={fournisseurId}
                  onChange={(e) => setFournisseurId(e.target.value)}
                  className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
                >
                  <option value="">-- Aucun --</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>{f.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-white mb-1 block">Catégorie</label>
                <select
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-white mb-1 block">Note (optionnel)</label>
              <input
                className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
                placeholder="ex: Materiaux Leroy Merlin"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div
              className="border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer gap-2 bg-transparent active:bg-white/10 transition"
              onClick={() => fileRef.current?.click()}
            >
              {preview ? (
                <Image src={preview} alt="preview" className="max-h-48 rounded-xl object-contain" width={100} height={100} />
              ) : (
                <>
                  <Upload size={32} className="text-white" />
                  <p className="text-sm font-bold text-white text-center">Appuyer pour scanner / choisir une photo</p>
                  <p className="text-xs text-gray-400">JPG, PNG, HEIC acceptes</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {ocrEnCours && (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-gray-300">
                <Loader2 size={14} className="animate-spin text-red-400" />
                Lecture du ticket / BL par l'IA…
              </div>
            )}

            {!ocrEnCours && ocrInfo && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-400">
                <Sparkles size={14} />
                {ocrInfo}
              </div>
            )}

            {fpPropose && (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <span className="text-xs text-gray-300">
                  Fournisseur détecté : <b className="text-white">{fpPropose}</b>
                </span>
                <button
                  onClick={creerFournisseur}
                  className="ml-auto shrink-0 rounded-lg bg-emerald-600/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-600/30"
                >
                  + Créer (« {fpPropose} »)
                </button>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              className="w-full h-[56px] bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              {uploading
                ? <><Loader2 size={20} className="animate-spin" /> Envoi en cours...</>
                : <><Upload size={20} /> Enregistrer</>
              }
            </button>
          </div>
        )}

        {/* O3-B9 / 13e : les deux bandeaux ci-dessous étaient PRÉCÉDEMMENT
            à l'INTÉRIEUR du bloc de l'onglet « scanner » (ils fermaient avant
            le bouton « Enregistrer »). Or la suppression d'un document se
            déclenche depuis l'onglet « documents » : son erreur était donc
            écrite dans l'état `error` mais JAMAIS affichée — un échec de
            suppression invisible. Les avoir remontés hors des deux onglets les
            rend visibles partout. Même JSX, mêmes classes, UNE seule instance :
            ce n'est pas une UI ajoutée. */}
        {error && (
          <div className="bg-red-900/20 border border-[#E30613] rounded-xl p-3">
            <p className="text-xs text-[#E30613] font-bold leading-relaxed">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-900/20 border border-white/10 rounded-xl p-3 flex items-center gap-2">
            <Check size={16} className="text-red-400 shrink-0" />
            <p className="text-xs text-red-400 font-bold">Document enregistré !{chantierId && ' Dépense chantier créée.'}</p>
          </div>
        )}

        {onglet === 'documents' && (
          <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-4">
            {loadingDocs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-white" size={24} />
              </div>
            ) : documents.length === 0 ? (
              // O3-B9 / 13e : « aucun document » n'est affiché que si la lecture
              // a RÉUSSI. Sinon l'affirmation serait fausse, et le bandeau
              // d'erreur (au-dessus, hors onglets) explique déjà la situation.
              listeLisible ? (
                <p className="text-sm text-gray-400 text-center py-6 italic">Aucun document enregistré</p>
              ) : null
            ) : (
              <div className="space-y-2">
                {documents.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => window.open(d.url_image, '_blank')}
                    className={`flex items-center gap-3 rounded-xl border p-2 cursor-pointer active:bg-white/5 ${
                      d.chantier_id ? 'border-emerald-500/30' : 'border-white/10'
                    }`}
                  >
                    <Image src={d.url_image} alt={d.type} className="w-14 h-14 rounded-lg object-cover shrink-0" width={100} height={100} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${d.type === 'bl' ? 'bg-blue-600/30 text-blue-300' : 'bg-emerald-600/30 text-emerald-300'}`}>
                          {d.type === 'bl' ? 'BL' : 'Ticket'}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(d.date).toLocaleDateString('fr-FR')}</span>
                        {d.chantier_id && d.chantiers && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400">
                            <Paperclip className="h-3 w-3" />
                            Lié à {d.chantiers?.nom || 'chantier'}
                          </span>
                        )}
                      </div>
                      {d.note && <p className="text-xs text-gray-300 truncate mt-0.5">{d.note}</p>}
                      <p className="text-sm font-bold text-white mt-0.5">{d.montant_ttc.toFixed(2)} EUR TTC</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {d.chantier_id && (
                        <Link
                          href="/finance/historique"
                          onClick={(e) => e.stopPropagation()}
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                          title="Voir la dépense"
                        >
                          <Paperclip size={14} />
                        </Link>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                        className="w-8 h-8 shrink-0 bg-[#E30613] rounded-full flex items-center justify-center"
                      >
                        <Trash2 size={14} className="text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
