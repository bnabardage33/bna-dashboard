// app/terrain/notes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import BoutonMicroNote from "@/components/BoutonMicroNote";
import { Mic, Pin, Plus, Trash2, Edit3, X, Check, Building } from "lucide-react";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";

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

type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  epingle: boolean;
  created_at: string;
  updated_at: string;
};

type ChantierItem = { id: string; nom: string | null; clients: { nom: string } | null };

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [chantiers, setChantiers] = useState<ChantierItem[]>([]);
  const [chantierId, setChantierId] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);

  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editContenu, setEditContenu] = useState("");
  const [editTitre, setEditTitre] = useState("");

  async function fetchNotes() {
    setLoading(true);
    const [notesRes, chRes] = await Promise.all([
      supabase
        .from("notes_patron")
        .select("*")
        .order("epingle", { ascending: false })
        .order("updated_at", { ascending: false }),
      supabase
        .from("chantiers")
        .select("id, nom, clients(nom)")
        .order("created_at", { ascending: false }),
    ]);

    if (notesRes.error) console.error(notesRes.error);
    else setNotes(notesRes.data as Note[]);

    if (chRes.data) setChantiers(chRes.data as unknown as ChantierItem[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchNotes();
  }, []);

  async function ajouterNote(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim()) return;

    let titreFinal = titre.trim();
    if (chantierId) {
      const ch = chantiers.find((c) => c.id === chantierId);
      const chNom = ch?.nom || ch?.clients?.nom || "Chantier";
      titreFinal = titreFinal ? `[${chNom}] ${titreFinal}` : `[${chNom}] Note chantier`;
    }

    // O3-B9 : `notes_patron` est une table RACINE (`entreprise_id` NOT NULL
    // sans défaut depuis le 2026-09-22, aucun trigger possible car pas de
    // `chantier_id`). Le préfixe `[chantier]` dans le titre est cosmétique :
    // il ne pose rien en base. On résout donc le tenant via le claim
    // `app_metadata.entreprise_id`, même source que `entreprise_courante()`.
    const { entreprise_id } = await resoudreContexteEntreprise(null);

    // Fail-closed : sans contexte entreprise, AUCUNE écriture.
    if (!estUuid(entreprise_id)) {
      alert(
        "Impossible d'enregistrer la note : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
      );
      return;
    }

    const { error } = await supabase.from("notes_patron").insert({
      titre: titreFinal || null,
      contenu: contenu.trim(),
      entreprise_id,
    });
    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    setTitre("");
    setContenu("");
    setChantierId("");
    setModalOuvert(false);
    fetchNotes();
  }

  async function togglePin(note: Note) {
    const { error } = await supabase
      .from("notes_patron")
      .update({ epingle: !note.epingle })
      .eq("id", note.id);
    if (!error) fetchNotes();
  }

  function commencerEdition(note: Note) {
    setEditId(note.id);
    setEditTitre(note.titre ?? "");
    setEditContenu(note.contenu);
  }

  async function enregistrerEdition(id: string) {
    const { error } = await supabase
      .from("notes_patron")
      .update({
        titre: editTitre.trim() || null,
        contenu: editContenu.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    setEditId(null);
    fetchNotes();
  }

  async function supprimerNote(id: string) {
    if (!confirm("Supprimer cette note ?")) return;
    const { error } = await supabase.from("notes_patron").delete().eq("id", id);
    if (!error) fetchNotes();
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Notes du Patron</h1>
          <p className="text-xs text-gray-400">Bloc-notes vocal &amp; synthèses techniques IA</p>
        </div>

        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          <span>Nouvelle Note</span>
        </button>
      </div>

      {/* Liste des Notes */}
      {loading ? (
        <div className="rounded-2xl border border-white/10/60 bg-[#1A1D24]/40 p-12 text-center text-xs text-gray-400">
          Chargement des notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#1A1D24]/30 p-12 text-center space-y-3">
          <Mic className="mx-auto h-10 w-10 text-gray-500" />
          <p className="text-sm font-medium text-gray-400">Aucune note pour l&apos;instant.</p>
          <button
            onClick={() => setModalOuvert(true)}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
          >
            + Rédiger ou dicter une note
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`flex flex-col justify-between rounded-2xl border p-4.5 shadow-md transition-all ${
                note.titre?.includes('🟢')
                  ? "border-white/10 bg-[#1A1D24]/90 shadow-red-600/10"
                  : note.titre?.includes('🔴')
                  ? "border-red-500/80 bg-[#1A1D24]/90 shadow-red-500/10"
                  : note.epingle
                  ? "border-red-600/50 bg-[#1A1D24] shadow-red-600/5"
                  : "border-white/10 bg-[#1A1D24] hover:border-slate-600"
              }`}
            >
              {editId === note.id ? (
                <div className="space-y-3">
                  <input
                    value={editTitre}
                    onChange={(e) => setEditTitre(e.target.value)}
                    placeholder="Titre"
                    className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                  <textarea
                    value={editContenu}
                    onChange={(e) => setEditContenu(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditId(null)}
                      className="rounded-xl border border-slate-600 bg-[#1A1D24] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#1A1D24]"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => enregistrerEdition(note.id)}
                      className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Enregistrer</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between h-full space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-bold text-white flex-1">
                        {note.titre || "Note libre"}
                      </h2>
                      <button
                        onClick={() => togglePin(note)}
                        className={`rounded-lg p-1.5 transition-colors ${
                          note.epingle
                            ? "text-gray-300 bg-sky-950/40"
                            : "text-gray-500 hover:text-gray-300 hover:bg-[#1A1D24]"
                        }`}
                        title={note.epingle ? "Désépingler" : "Épingler en haut"}
                      >
                        <Pin className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="whitespace-pre-wrap text-xs text-gray-300 leading-relaxed">
                      {note.contenu}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/10/60 pt-3 text-3xs text-gray-500">
                    <span>{new Date(note.updated_at).toLocaleDateString("fr-FR")}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => commencerEdition(note)}
                        className="p-1.5 text-gray-400 hover:text-gray-300 transition-colors"
                        title="Modifier la note"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => supprimerNote(note.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                        title="Supprimer la note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FAB (+) */}
      <FloatingActionButton
        onClick={() => setModalOuvert(true)}
        aria-label="Créer une note"
      >
        <Plus className="h-7 w-7 stroke-[2.5]" />
      </FloatingActionButton>

      {/* Bottom Sheet / Modal Nouvelle Note */}
      {modalOuvert && (
        <div className="fixed inset-0 z-[210] pt-48 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#1A1D24] p-6 shadow-2xl space-y-4 max-h-[85vh] sm:max-h-[90dvh] overflow-y-auto animate-in fade-in slide-in-from-bottom-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">Nouvelle Note Patron</h2>
                <p className="text-xs text-gray-400">Écrivez ou dictez avec le micro Whisper IA</p>
              </div>
              <button
                onClick={() => setModalOuvert(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={ajouterNote} className="space-y-3.5 pb-20 sm:pb-6">
              <div>
                <label className="text-xs font-semibold text-gray-300">Chantier lié (optionnel)</label>
                <select
                  value={chantierId}
                  onChange={(e) => setChantierId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="">🏢 Note générale libre</option>
                  {chantiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      📍 {c.nom || c.clients?.nom || "Chantier"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300">Titre</label>
                <input
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  placeholder="Ex. Réunion pose ossature bois"
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300">Contenu de la note *</label>
                <textarea
                  value={contenu}
                  onChange={(e) => setContenu(e.target.value)}
                  placeholder="Tapez votre note ou utilisez le dictaphone ci-dessous…"
                  rows={4}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-transparent p-3">
                <BoutonMicroNote
                  onTexteReformule={(texte) =>
                    setContenu((prev) => (prev.trim() ? prev.trim() + " " + texte : texte))
                  }
                  onErreur={(msg) => console.warn(msg)}
                />
              </div>

              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 bg-[#1A1D24] px-6 py-3 border-t border-white/10 flex items-center justify-end gap-3 shadow-lg">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 shadow-md"
                >
                  Enregistrer la note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
