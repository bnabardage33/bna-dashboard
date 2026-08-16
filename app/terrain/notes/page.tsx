"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BoutonMicroNote from "@/components/BoutonMicroNote";

type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  epingle: boolean;
  created_at: string;
  updated_at: string;
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editContenu, setEditContenu] = useState("");
  const [editTitre, setEditTitre] = useState("");

  async function fetchNotes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notes_patron")
      .select("*")
      .order("epingle", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) console.error(error);
    else setNotes(data as Note[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchNotes();
  }, []);

  async function ajouterNote(e: React.FormEvent) {
    e.preventDefault();
    if (!contenu.trim()) return;
    const { error } = await supabase.from("notes_patron").insert({
      titre: titre.trim() || null,
      contenu: contenu.trim(),
    });
    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    setTitre("");
    setContenu("");
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Notes du Patron</h1>
        <p className="text-sm text-slate-400">Bloc-notes technique — libre, rapide</p>
      </div>

      <form
        onSubmit={ajouterNote}
        className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
      >
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre (optionnel)"
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <textarea
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          placeholder="Écris ta note ici…"
          rows={3}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <BoutonMicroNote
          onTexteReformule={(texte) =>
            setContenu((prev) => (prev.trim() ? prev.trim() + " " + texte : texte))
          }
          onErreur={(msg) => console.warn(msg)}
        />
        <button
          type="submit"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          + Ajouter la note
        </button>
      </form>

      {loading && <p className="text-sm text-slate-400">Chargement…</p>}
      {!loading && notes.length === 0 && (
        <p className="text-sm text-slate-500">Aucune note pour l&apos;instant.</p>
      )}

      <div className="space-y-3">
        {notes.map((note) => (
          <div
            key={note.id}
            className={`rounded-xl border p-4 ${
              note.epingle
                ? "border-red-600/40 bg-slate-800"
                : "border-slate-700 bg-slate-800"
            }`}
          >
            {editId === note.id ? (
              <div className="space-y-2">
                <input
                  value={editTitre}
                  onChange={(e) => setEditTitre(e.target.value)}
                  placeholder="Titre"
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
                <textarea
                  value={editContenu}
                  onChange={(e) => setEditContenu(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => enregistrerEdition(note.id)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
                  >
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {note.titre && (
                      <h3 className="font-medium text-white">{note.titre}</h3>
                    )}
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">
                      {note.contenu}
                    </p>
                  </div>
                  {note.epingle && <span className="text-red-400">📌</span>}
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <button
                    onClick={() => togglePin(note)}
                    className="font-medium text-slate-400 hover:text-red-400"
                  >
                    {note.epingle ? "Désépingler" : "Épingler"}
                  </button>
                  <button
                    onClick={() => commencerEdition(note)}
                    className="font-medium text-slate-400 hover:text-sky-400"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => supprimerNote(note.id)}
                    className="font-medium text-slate-400 hover:text-red-400"
                  >
                    Supprimer
                  </button>
                  <span className="ml-auto text-slate-500">
                    {new Date(note.updated_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
