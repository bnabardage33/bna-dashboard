// app/terrain/notes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BoutonMicroNote from "@/components/BoutonMicroNote";
import { Mic, Pin, Plus, Trash2, Edit3, X, Check, Building } from "lucide-react";

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

    const { error } = await supabase.from("notes_patron").insert({
      titre: titreFinal || null,
      contenu: contenu.trim(),
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
          <h1 className="text-xl font-bold text-slate-100">Notes du Patron</h1>
          <p className="text-xs text-slate-400">Bloc-notes vocal &amp; synthèses techniques IA</p>
        </div>

        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          <span>Nouvelle Note</span>
        </button>
      </div>

      {/* Liste des Notes */}
      {loading ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-12 text-center text-xs text-slate-400">
          Chargement des notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-12 text-center space-y-3">
          <Mic className="mx-auto h-10 w-10 text-slate-500" />
          <p className="text-sm font-medium text-slate-400">Aucune note pour l&apos;instant.</p>
          <button
            onClick={() => setModalOuvert(true)}
            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
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
                  ? "border-emerald-500/80 bg-slate-800/90 shadow-emerald-500/10"
                  : note.titre?.includes('🔴')
                  ? "border-red-500/80 bg-slate-800/90 shadow-red-500/10"
                  : note.epingle
                  ? "border-sky-500/50 bg-slate-800 shadow-sky-500/5"
                  : "border-slate-700 bg-slate-800 hover:border-slate-600"
              }`}
            >
              {editId === note.id ? (
                <div className="space-y-3">
                  <input
                    value={editTitre}
                    onChange={(e) => setEditTitre(e.target.value)}
                    placeholder="Titre"
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                  <textarea
                    value={editContenu}
                    onChange={(e) => setEditContenu(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditId(null)}
                      className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => enregistrerEdition(note.id)}
                      className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
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
                      <h2 className="text-sm font-bold text-slate-100 flex-1">
                        {note.titre || "Note libre"}
                      </h2>
                      <button
                        onClick={() => togglePin(note)}
                        className={`rounded-lg p-1.5 transition-colors ${
                          note.epingle
                            ? "text-sky-400 bg-sky-950/40"
                            : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                        }`}
                        title={note.epingle ? "Désépingler" : "Épingler en haut"}
                      >
                        <Pin className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="whitespace-pre-wrap text-xs text-slate-300 leading-relaxed">
                      {note.contenu}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-700/60 pt-3 text-[11px] text-slate-500">
                    <span>{new Date(note.updated_at).toLocaleDateString("fr-FR")}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => commencerEdition(note)}
                        className="p-1.5 text-slate-400 hover:text-sky-400 transition-colors"
                        title="Modifier la note"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => supprimerNote(note.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
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
      <button
        onClick={() => setModalOuvert(true)}
        aria-label="Créer une note"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-2xl shadow-amber-500/40 transition-transform active:scale-95 hover:scale-105 hover:bg-amber-400"
      >
        <Plus className="h-7 w-7 stroke-[2.5]" />
      </button>

      {/* Bottom Sheet / Modal Nouvelle Note */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl space-y-4 max-h-[85vh] sm:max-h-[90dvh] overflow-y-auto animate-in fade-in slide-in-from-bottom-6">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-100">Nouvelle Note Patron</h2>
                <p className="text-xs text-slate-400">Écrivez ou dictez avec le micro Whisper IA</p>
              </div>
              <button
                onClick={() => setModalOuvert(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={ajouterNote} className="space-y-3.5 pb-20 sm:pb-6">
              <div>
                <label className="text-xs font-semibold text-slate-300">Chantier lié (optionnel)</label>
                <select
                  value={chantierId}
                  onChange={(e) => setChantierId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
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
                <label className="text-xs font-semibold text-slate-300">Titre</label>
                <input
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  placeholder="Ex. Réunion pose ossature bois"
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Contenu de la note *</label>
                <textarea
                  value={contenu}
                  onChange={(e) => setContenu(e.target.value)}
                  placeholder="Tapez votre note ou utilisez le dictaphone ci-dessous…"
                  rows={4}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                <BoutonMicroNote
                  onTexteReformule={(texte) =>
                    setContenu((prev) => (prev.trim() ? prev.trim() + " " + texte : texte))
                  }
                  onErreur={(msg) => console.warn(msg)}
                />
              </div>

              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 bg-slate-800 px-6 py-3 border-t border-slate-700 flex items-center justify-end gap-3 shadow-lg">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-md"
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
