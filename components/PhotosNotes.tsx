"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TablesInsert } from "@/types/supabase";
import { compresserImage } from "@/lib/imageCompress";
import Image from "next/image";
import { Surface } from '@/components/ui/Surface';

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
  const [deleting, setDeleting] = useState<string | null>(null);

  const [notes, setNotes] = useState<NotesTerrain>({
    code_acces: "",
    contact_chantier: "",
    horaires: "",
    notes_terrain: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "erreur">("idle");
  const [saveMessage, setSaveMessage] = useState("");

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

    try {
      // Compression automatique côté client pour réduire la taille (10 Mo -> ~350 Ko)
      const fichierCompresse = await compresserImage(file, 1920, 0.82);

      const fileName = `${chantierId}/${type}-${Date.now()}-${fichierCompresse.name}`;
      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(fileName, fichierCompresse);

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
      } as TablesInsert<"photos">);

      if (insertError) alert("Erreur enregistrement : " + insertError.message);
    } catch (err) {
      alert("Erreur traitement photo : " + ((err as Error).message || String(err)));
    } finally {
      setUploading(null);
      fetchPhotos();
    }
  }

  async function supprimerPhoto(photo: Photo) {
    if (!confirm("Supprimer cette photo ?")) return;
    setDeleting(photo.id);

    const cheminStorage = photo.url.split("/photos/")[1];
    if (cheminStorage) {
      await supabase.storage.from("photos").remove([cheminStorage]);
    }

    const { error } = await supabase.from("photos").delete().eq("id", photo.id);
    setDeleting(null);

    if (error) {
      alert("Erreur suppression : " + error.message);
      return;
    }
    fetchPhotos();
  }

  async function enregistrerNotes(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");

    const { error } = await supabase.from("chantiers").update(notes).eq("id", chantierId);

    setSaving(false);
    if (error) {
      setSaveStatus("erreur");
      setSaveMessage(error.message);
    } else {
      setSaveStatus("ok");
      setSaveMessage("Notes enregistrées.");
    }

    setTimeout(() => setSaveStatus("idle"), 3000);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {COLONNES.map((col) => {
          const photosColonne = photos.filter((p) => p.type === col.type);
          const busy = uploading === col.type;
          return (
            <Surface key={col.type} className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-white">{col.label}</p>
                <div className="flex gap-2">
                  <label className="cursor-pointer text-xs font-medium text-red-400 hover:text-red-300">
                    {busy ? "Envoi…" : "📷 Prendre"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={uploading !== null}
                      onChange={(e) => handleUpload(col.type, e.target.files?.[0])}
                    />
                  </label>
                  <label className="cursor-pointer text-xs font-medium text-gray-300 hover:text-gray-400">
                    {busy ? "…" : "🖼️ Importer"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading !== null}
                      onChange={(e) => handleUpload(col.type, e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              {photosColonne.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-gray-500">
                  Aucune photo
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {photosColonne.map((p) => (
                    <div key={p.id} className="group relative">
                      <a href={p.url} target="_blank" rel="noopener noreferrer">
                        <Image
                          src={p.url}
                          alt={col.label}
                          className="h-20 w-full rounded-lg object-cover"
                         width={100} height={100} />
                      </a>
                      <button
                        onClick={() => supprimerPhoto(p)}
                        disabled={deleting === p.id}
                        className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-xs text-white hover:bg-red-600"
                        title="Supprimer"
                      >
                        {deleting === p.id ? "…" : "✕"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          );
        })}
      </div>

      {loading && <p className="text-sm text-gray-400">Chargement des photos…</p>}

      <form
        onSubmit={enregistrerNotes}
        className="space-y-3 rounded-xl border border-white/10 bg-[#1A1D24] p-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="chp-code-d-acces" className="text-xs uppercase tracking-wide text-gray-500">
              Code d&apos;accès
            </label>
            <input id="chp-code-d-acces"
              value={notes.code_acces ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, code_acces: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="chp-contact-sur-place" className="text-xs uppercase tracking-wide text-gray-500">
              Contact sur place
            </label>
            <input id="chp-contact-sur-place"
              value={notes.contact_chantier ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, contact_chantier: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="chp-horaires" className="text-xs uppercase tracking-wide text-gray-500">Horaires</label>
            <input id="chp-horaires"
              value={notes.horaires ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, horaires: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <div>
          <label htmlFor="chp-bloc-notes-terrain" className="text-xs uppercase tracking-wide text-gray-500">
            Bloc-notes terrain
          </label>
          <textarea id="chp-bloc-notes-terrain"
            value={notes.notes_terrain ?? ""}
            onChange={(e) => setNotes((n) => ({ ...n, notes_terrain: e.target.value }))}
            rows={4}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saveStatus === "ok" && (
            <span className="text-sm font-medium text-emerald-400">✓ {saveMessage}</span>
          )}
          {saveStatus === "erreur" && (
            <span className="text-sm font-medium text-red-400">✕ {saveMessage}</span>
          )}
        </div>
      </form>
    </div>
  );
}
