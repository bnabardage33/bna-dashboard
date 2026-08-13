"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Client = {
  id: string;
  type: "particulier" | "professionnel";
  nom: string;
  societe: string | null;
  siret: string | null;
  adresse_facturation: string | null;
  tel: string | null;
  email: string | null;
  created_at: string;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");

  const [type, setType] = useState<"particulier" | "professionnel">("particulier");
  const [nom, setNom] = useState("");
  const [societe, setSociete] = useState("");
  const [siret, setSiret] = useState("");
  const [adresse, setAdresse] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");

  async function fetchClients() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setClients(data as Client[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchClients();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom) return;

    const { error } = await supabase.from("clients").insert({
      type,
      nom,
      societe: type === "professionnel" ? societe || null : null,
      siret: type === "professionnel" ? siret || null : null,
      adresse_facturation: adresse || null,
      tel: tel || null,
      email: email || null,
    });

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setType("particulier");
    setNom("");
    setSociete("");
    setSiret("");
    setAdresse("");
    setTel("");
    setEmail("");
    fetchClients();
  }

  const filtres = clients.filter((c) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      c.nom.toLowerCase().includes(q) ||
      (c.societe ?? "").toLowerCase().includes(q) ||
      (c.tel ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Clients</h1>
        <p className="text-sm text-slate-400">Particuliers et professionnels</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
      >
        <h2 className="font-medium text-white">Nouveau client</h2>

        <div className="flex gap-2">
          {(["particulier", "professionnel"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                type === t
                  ? "bg-red-600 text-white"
                  : "border border-slate-600 text-slate-300"
              }`}
            >
              {t === "particulier" ? "Particulier" : "Professionnel"}
            </button>
          ))}
        </div>

        {type === "professionnel" && (
          <div className="grid grid-cols-2 gap-3">
            <input
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="Société"
              value={societe}
              onChange={(e) => setSociete(e.target.value)}
            />
            <input
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="SIRET"
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
            />
          </div>
        )}

        <input
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          placeholder={
            type === "professionnel" ? "Nom du contact" : "Nom et prénom"
          }
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          placeholder="Adresse de facturation"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            placeholder="Téléphone"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          Ajouter
        </button>
      </form>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un client..."
        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
      />

      {loading ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : filtres.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun client trouvé.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtres.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-700 bg-slate-800 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  {c.type === "professionnel" && c.societe && (
                    <p className="font-semibold text-white">{c.societe}</p>
                  )}
                  <p className={c.societe ? "text-sm text-slate-300" : "font-semibold text-white"}>
                    {c.nom}
                  </p>
                  {c.siret && (
                    <p className="text-xs text-slate-500">SIRET {c.siret}</p>
                  )}
                </div>
                <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-400">
                  {c.type === "professionnel" ? "Pro" : "Particulier"}
                </span>
              </div>

              {c.adresse_facturation && (
                <p className="mt-2 text-sm text-slate-400">{c.adresse_facturation}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {c.tel && (
                  <a
                    href={`tel:${c.tel}`}
                    className="font-medium text-red-400 hover:text-red-300"
                  >
                    📞 {c.tel}
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="font-medium text-sky-400 hover:text-sky-300"
                  >
                    ✉️ {c.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
