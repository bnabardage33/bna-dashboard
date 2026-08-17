"use client";

import { calculerPose, FamillePose, LABELS_FAMILLE } from "@/lib/poseCalcul";

type Ouverture = { id: string; type: "fenetre" | "porte"; largeur: number; hauteur: number };

export type Zone = {
  id: string;
  chantier_id: string;
  type: "facade" | "pignon";
  nom: string;
  largeur: number;
  hauteur_mur: number;
  hauteur_faite: number | null;
  materiau: "lames" | "plaques";
  ouvertures: Ouverture[];
  famille_pose: FamillePose | null;
  angle: boolean;
  largeur_lame_mm: number | null;
};

export type LigneCommande = { designation: string; quantite: number; unite: string };

export function calculerZone(zone: Zone) {
  const bruteFacade = zone.type === "facade" ? zone.largeur * zone.hauteur_mur : 0;

  const hFaite = zone.hauteur_faite ?? 0;
  const rectanglePignon = zone.type === "pignon" ? zone.largeur * zone.hauteur_mur : 0;
  const trianglePignon =
    zone.type === "pignon" ? (zone.largeur * (hFaite - zone.hauteur_mur)) / 2 : 0;
  const brutePignon = rectanglePignon + trianglePignon;

  const pente =
    zone.type === "pignon" && zone.largeur > 0
      ? ((hFaite - zone.hauteur_mur) / (zone.largeur / 2)) * 100
      : 0;
  const totalOuvertures = zone.ouvertures.reduce((s, o) => s + o.largeur * o.hauteur, 0);
  const surfaceNette = Math.max(0, bruteFacade + brutePignon - totalOuvertures);
  const marge = zone.materiau === "lames" ? 1.1 : 1.15;
  const surfaceACommander = surfaceNette * marge;

  return { bruteFacade, brutePignon, pente, totalOuvertures, surfaceNette, surfaceACommander };
}

function labelModule(famille: FamillePose | null) {
  if (famille === "cassette") return "Largeur module cassette (mm)";
  return "Largeur lame (mm)";
}
function defautModule(famille: FamillePose | null) {
  return famille === "cassette" ? 600 : 125;
}

export default function ZoneCard({
  zone,
  zoneVent,
  onChange,
  onDelete,
  onCreerCommande,
}: {
  zone: Zone;
  zoneVent: number;
  onChange: (zone: Zone) => void;
  onDelete: (id: string) => void;
  onCreerCommande?: (lignes: LigneCommande[], zoneNom: string) => void;
}) {
  const calc = calculerZone(zone);

  const hauteurTotale =
    zone.type === "pignon" && zone.hauteur_faite
      ? zone.hauteur_faite
      : zone.hauteur_mur;

  const pose =
    zone.famille_pose && zone.largeur > 0 && hauteurTotale > 0
      ? calculerPose(
          zone.famille_pose,
          zone.largeur,
          hauteurTotale,
          zone.angle,
          zoneVent,
          zone.largeur_lame_mm ?? defautModule(zone.famille_pose)
        )
      : null;

  function update(patch: Partial<Zone>) {
    onChange({ ...zone, ...patch });
  }

  function ajouterOuverture(type: "fenetre" | "porte") {
    update({
      ouvertures: [...zone.ouvertures, { id: crypto.randomUUID(), type, largeur: 0, hauteur: 0 }],
    });
  }

  function updateOuverture(id: string, patch: Partial<Ouverture>) {
    update({ ouvertures: zone.ouvertures.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  }

  function supprimerOuverture(id: string) {
    update({ ouvertures: zone.ouvertures.filter((o) => o.id !== id) });
  }

  function creerCommande() {
    if (!onCreerCommande) return;

    const lignes: LigneCommande[] = [];

    if (calc.surfaceACommander > 0) {
      const nomMateriau = zone.famille_pose ? LABELS_FAMILLE[zone.famille_pose] : "Bardage";
      lignes.push({
        designation: `${nomMateriau} — ${zone.nom}`,
        quantite: Math.round(calc.surfaceACommander * 100) / 100,
        unite: "m²",
      });
    }

    if (pose) {
      lignes.push({ designation: "Chevrons / montants", quantite: pose.nbMontants, unite: "pièces" });
      lignes.push({ designation: "Équerres Isolco 3000 P2", quantite: pose.nbFixationsTotal, unite: "pièces" });
      lignes.push({ designation: "Visserie / chevilles", quantite: pose.nbVis, unite: "pièces" });
    }

    if (lignes.length === 0) return;
    onCreerCommande(lignes, zone.nom);
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-4">
      <div className="flex items-center justify-between gap-2">
        <input
          value={zone.nom}
          onChange={(e) => update({ nom: e.target.value })}
          placeholder="Nom de la zone (ex. Façade Nord)"
          className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        />
        <button
          onClick={() => onDelete(zone.id)}
          className="rounded-lg border border-red-600/40 px-3 py-2 text-sm text-red-400 hover:bg-red-600/10"
        >
          Supprimer
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["facade", "pignon"] as const).map((t) => (
          <button
            key={t}
            onClick={() => update({ type: t })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              zone.type === t ? "bg-red-600 text-white" : "border border-slate-600 text-slate-300"
            }`}
          >
            {t === "facade" ? "Façade" : "Pignon"}
          </button>
        ))}
        <label className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={zone.angle}
            onChange={(e) => update({ angle: e.target.checked })}
          />
          Zone d&apos;angle
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Largeur (m)" value={zone.largeur} onChange={(v) => update({ largeur: v })} />
        <Field
          label={zone.type === "pignon" ? "H. mur (rectangle, m)" : "H. mur / rampant (m)"}
          value={zone.hauteur_mur}
          onChange={(v) => update({ hauteur_mur: v })}
        />
        {zone.type === "pignon" && (
          <Field
            label="H. faîte / totale (m)"
            value={zone.hauteur_faite ?? 0}
            onChange={(v) => update({ hauteur_faite: v })}
          />
        )}
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Matériau (marge commande)
          </label>
          <select
            value={zone.materiau}
            onChange={(e) => update({ materiau: e.target.value as Zone["materiau"] })}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            <option value="lames">Lames (+10%)</option>
            <option value="plaques">Plaques (+15%)</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-700 pt-3">
        <label className="text-xs uppercase tracking-wide text-slate-500">
          Famille de pose (calcul technique)
        </label>
        <select
          value={zone.famille_pose ?? ""}
          onChange={(e) =>
            update({ famille_pose: (e.target.value || null) as FamillePose | null })
          }
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">— Aucun calcul —</option>
          {Object.entries(LABELS_FAMILLE).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        {(zone.famille_pose === "bois_naturel" || zone.famille_pose === "cassette") && (
          <Field
            label={labelModule(zone.famille_pose)}
            value={zone.largeur_lame_mm ?? defautModule(zone.famille_pose)}
            onChange={(v) => update({ largeur_lame_mm: v })}
          />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ouvertures</p>
          <div className="flex gap-2">
            <button
              onClick={() => ajouterOuverture("fenetre")}
              className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              + Fenêtre
            </button>
            <button
              onClick={() => ajouterOuverture("porte")}
              className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              + Porte
            </button>
          </div>
        </div>

        {zone.ouvertures.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <span className="w-16 text-xs text-slate-400">
              {o.type === "fenetre" ? "Fenêtre" : "Porte"}
            </span>
            <input
              type="number"
              value={o.largeur}
              onChange={(e) => updateOuverture(o.id, { largeur: parseFloat(e.target.value) || 0 })}
              placeholder="L (m)"
              className="w-20 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
            />
            <input
              type="number"
              value={o.hauteur}
              onChange={(e) => updateOuverture(o.id, { hauteur: parseFloat(e.target.value) || 0 })}
              placeholder="H (m)"
              className="w-20 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
            />
            <span className="text-xs text-slate-500">{(o.largeur * o.hauteur).toFixed(2)} m²</span>
            <button
              onClick={() => supprimerOuverture(o.id)}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-700 pt-3 sm:grid-cols-3">
        <Resultat label="Brute façade" value={calc.bruteFacade} />
        <Resultat label="Brute pignon" value={calc.brutePignon} />
        <Resultat label="Ouvertures" value={calc.totalOuvertures} />
        {zone.type === "pignon" && <Resultat label="Pente" value={calc.pente} unite="%" />}
        <Resultat label="Nette à couvrir" value={calc.surfaceNette} highlight />
        <Resultat label="À commander" value={calc.surfaceACommander} highlight />
      </div>

      {pose && (
        <div className="space-y-2 rounded-lg border border-sky-600/30 bg-sky-600/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-400">
            Calcul technique — {LABELS_FAMILLE[zone.famille_pose!]}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Chiffre label="Entraxe vertical" value={`${(pose.entraxeVertical * 100).toFixed(0)} cm`} />
            {pose.entraxeHorizontal !== undefined && (
              <Chiffre label="Entraxe horizontal" value={`${(pose.entraxeHorizontal * 100).toFixed(0)} cm`} />
            )}
            <Chiffre label="Montants/chevrons" value={pose.nbMontants} />
            <Chiffre label="Fixations/montant" value={pose.fixationsParMontant} />
            <Chiffre label="Équerres/fixations totales" value={pose.nbFixationsTotal} />
            <Chiffre label="Vis (total estimé)" value={pose.nbVis} />
          </div>
          <p className="text-xs text-slate-400">{pose.joint}</p>
          {pose.remarques.length > 0 && (
            <ul className="list-inside list-disc text-xs text-slate-500">
              {pose.remarques.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          <p className="text-xs italic text-amber-400">
            ⚠️ Calcul indicatif — vérifie sur un premier chantier avant de commander en grande quantité.
          </p>
        </div>
      )}

      {onCreerCommande && (calc.surfaceACommander > 0 || pose) && (
        <button
          onClick={creerCommande}
          className="w-full rounded-lg border border-red-600/40 bg-red-600/10 py-2 text-sm font-medium text-red-400 hover:bg-red-600/20"
        >
          ➕ Créer une commande depuis cette zone
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-slate-500">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
      />
    </div>
  );
}

function Resultat({
  label,
  value,
  unite = "m²",
  highlight,
}: {
  label: string;
  value: number;
  unite?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-red-400" : "text-white"}`}>
        {value.toFixed(2)} {unite}
      </p>
    </div>
  );
}

function Chiffre({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-white">{value}</p>
    </div>
  );
}
