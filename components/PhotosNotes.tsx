"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Photo = {
  id: string;
  chantier_id: string;
  url: string;
  type: "avant" | "pendant" | "apres";
  date_prise: string;
};

type NotesTerrain = {
  code_acces: string | null;
  contact_chantier: string | null;
  horaires: string | null;
  notes_terrain: string | null;
};

const COLONNES: { type: Photo["type"]; label: string }[] = [
  { type: "avant", label: "Avant" },
  { type: "pendant", label: "Pendant" },
  { type: "apres", label: "Après" },
];

export default function PhotosNotes({ chantierId }: { chantierId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const [notes, setNotes] = useState<NotesTerrain>({
    code_acces: "",
    contact_chantier: "",
    horaires: "",
    notes_terrain: "",
  });
  const [saving, setSaving] = useState(false);

  async function fetchPhotos() {
    setLoading(true);
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("chantier_id", chantierId)
      .order("date_prise", { ascending: false });
    if (error) console.error(error);
    else setPhotos(data as Photo[]);
    setLoading(false);
  }

  async function fetchNotes() {
    const { data, error } = await supabase
      .from("chantiers")
      .select("code_acces, contact_chantier, horaires, notes_terrain")
      .eq("id", chantierId)
      .single();
    if (error) console.error(error);
    else if (data) setNotes(data as NotesTerrain);
  }

  useEffect(() => {
    fetchPhotos();
    fetchNotes();
  }, [chantierId]);

  async function handleUpload(type: Photo["type"], file: File | undefined) {
    if (!file) return;
    setUploading(type);

    const fileName = `${chantierId}/${type}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(fileName, file);

    if (uploadError) {
      alert("Erreur upload : " + uploadError.message);
      setUploading(null);
      return;
    }

    const { data: urlData } = supabase.storage.from("photos").getPublicUrl(fileName);

    const { error: insertError } = await supabase.from("photos").insert({
      chantier_id: chantierId,
      url: urlData.publicUrl,
      type,
      date_prise: new Date().toISOString(),
    });

    if (insertError) alert("Erreur enregistrement : " + insertError.message);

    setUploading(null);
    fetchPhotos();
  }

  async function enregistrerNotes(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("chantiers").update(notes).eq("id", chantierId);
    setSaving(false);
    if (error) alert("Erreur : " + error.message);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {COLONNES.map((col) => {
          const photosColonne = photos.filter((p) => p.type === col.type);
          return (
            <div key={col.type} className="rounded-xl border border-slate-700 bg-slate-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-white">{col.label}</p>
                <label className="cursor-pointer text-xs font-medium text-red-400 hover:text-red-300">
                  {uploading === col.type ? "Envoi…" : "+ Ajouter"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={uploading !== null}
                    onChange={(e) => handleUpload(col.type, e.target.files?.[0])}
                  />
                </label>
              </div>

              {photosColonne.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-600 text-xs text-slate-500">
                  Aucune photo
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {photosColonne.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={p.url}
                        alt={col.label}
                        className="h-20 w-full rounded-lg object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {loading && <p className="text-sm text-slate-400">Chargement des photos…</p>}

      <form
        onSubmit={enregistrerNotes}
        className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Code d&apos;accès
            </label>
            <input
              value={notes.code_acces ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, code_acces: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Contact sur place
            </label>
            <input
              value={notes.contact_chantier ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, contact_chantier: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">Horaires</label>
            <input
              value={notes.horaires ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, horaires: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Bloc-notes terrain
          </label>
          <textarea
            value={notes.notes_terrain ?? ""}
            onChange={(e) => setNotes((n) => ({ ...n, notes_terrain: e.target.value }))}
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
