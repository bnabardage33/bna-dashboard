// lib/rapports-client.ts
// Types et utilitaires partagés du module "Rapports Hebdo Client".
// Module 100 % côté client : pur, sans serveur, partagé par l'onglet
// dashboard, le rendu PDF clair et l'espace client.

export type FacadeId = "nord" | "sud" | "est" | "ouest";

export type FacadeCompteur = Record<FacadeId, number>;

export type PhotoRapport = {
  url: string;
  legende: string;
  date: string | null;
};

export type JourIntemperie = {
  date: string;
  motif: string;
  jour_arrete: boolean;
  vigilance: string;
};

export type SnapshotContenu = {
  periode: {
    debut: string;
    fin: string;
    semaine: string;
  };
  chantier: {
    id: string;
    nom: string | null;
    client_nom: string | null;
    adresse: string | null;
    date_fin_estimee: string | null;
  };
  avancement: {
    pct_debut: number;
    pct_fin: number;
    delta: number;
    facades: FacadeCompteur;
    cases_cochees: number;
  };
  photos: PhotoRapport[];
  pointages: {
    total_heures: number;
    nb_pointages: number;
    jours_pointes: number;
    coef_meteo_moyen: number | null;
    meteo_relevee: string[];
  };
  intemperies: {
    jours_arret_total: number;
    details: JourIntemperie[];
    vigilance_max: string;
  };
  communication: {
    observations: string | null;
    date_fin_estimee: string | null;
    message_patron: string | null;
  };
};

export type RapportClientLeger = {
  id: string;
  semaine_label: string;
  date_debut: string;
  contenu: unknown;
};

export const FACADES: { id: FacadeId; label: string }[] = [
  { id: "nord", label: "Façade Nord" },
  { id: "sud", label: "Façade Sud" },
  { id: "est", label: "Façade Est" },
  { id: "ouest", label: "Façade Ouest" },
];

export const EMOJI_VIGILANCE: Record<string, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
};

export function objet(valeur: unknown): Record<string, unknown> | null {
  return valeur !== null && typeof valeur === "object" && !Array.isArray(valeur)
    ? (valeur as Record<string, unknown>)
    : null;
}

export function texte(valeur: unknown): string {
  return typeof valeur === "string" ? valeur : "";
}

export function texteNull(valeur: unknown): string | null {
  return typeof valeur === "string" ? valeur : null;
}

export function nombre(valeur: unknown): number {
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : 0;
}

export function nombreNull(valeur: unknown): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

export function booleen(valeur: unknown): boolean {
  return valeur === true;
}

export function tableau(valeur: unknown): unknown[] {
  return Array.isArray(valeur) ? valeur : [];
}

export function analyserFacades(valeur: unknown): FacadeCompteur {
  const o = objet(valeur);
  const compteur: FacadeCompteur = { nord: 0, sud: 0, est: 0, ouest: 0 };

  for (const id of ["nord", "sud", "est", "ouest"] as const) {
    const n = o?.[id];
    if (typeof n === "number" && Number.isFinite(n)) compteur[id] = n;
  }

  return compteur;
}

export function analyserSnapshot(contenu: unknown): SnapshotContenu | null {
  const o = objet(contenu);
  if (!o) return null;

  const periode = objet(o.periode);
  const avancement = objet(o.avancement);
  const pointages = objet(o.pointages);
  const intemperies = objet(o.intemperies);
  const communication = objet(o.communication);
  const chantier = objet(o.chantier);

  if (!periode || !avancement || !pointages || !intemperies || !communication) {
    return null;
  }

  const photos: PhotoRapport[] = tableau(o.photos).map((p) => {
    const photo = objet(p);
    return {
      url: texte(photo?.url),
      legende: texte(photo?.legende),
      date: texteNull(photo?.date),
    };
  });

  const detailsIntemperies: JourIntemperie[] = tableau(intemperies.details).map((j) => {
    const jour = objet(j);
    return {
      date: texte(jour?.date),
      motif: texte(jour?.motif),
      jour_arrete: booleen(jour?.jour_arrete),
      vigilance: texte(jour?.vigilance),
    };
  });

  return {
    periode: {
      debut: texte(periode.debut),
      fin: texte(periode.fin),
      semaine: texte(periode.semaine),
    },
    chantier: {
      id: texte(chantier?.id),
      nom: texteNull(chantier?.nom),
      client_nom: texteNull(chantier?.client_nom),
      adresse: texteNull(chantier?.adresse),
      date_fin_estimee: texteNull(chantier?.date_fin_estimee),
    },
    avancement: {
      pct_debut: nombre(avancement.pct_debut),
      pct_fin: nombre(avancement.pct_fin),
      delta: nombre(avancement.delta),
      facades: analyserFacades(avancement.facades),
      cases_cochees: nombre(avancement.cases_cochees),
    },
    photos,
    pointages: {
      total_heures: nombre(pointages.total_heures),
      nb_pointages: nombre(pointages.nb_pointages),
      jours_pointes: nombre(pointages.jours_pointes),
      coef_meteo_moyen: nombreNull(pointages.coef_meteo_moyen),
      meteo_relevee: tableau(pointages.meteo_relevee)
        .map((m) => (typeof m === "string" ? m : ""))
        .filter((m) => m !== ""),
    },
    intemperies: {
      jours_arret_total: nombre(intemperies.jours_arret_total),
      details: detailsIntemperies,
      vigilance_max: texte(intemperies.vigilance_max),
    },
    communication: {
      observations: texteNull(communication.observations),
      date_fin_estimee: texteNull(communication.date_fin_estimee),
      message_patron: texteNull(communication.message_patron),
    },
  };
}

export function statutFacade(n: number): { label: string; className: string } {
  if (n >= 4) {
    return {
      label: "Terminée",
      className: "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (n > 0) {
    return {
      label: "En cours",
      className: "border border-amber-500/30 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    label: "À commencer",
    className: "border border-white/10 bg-[#1A1D24] text-gray-400",
  };
}

export function formatDateFr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// -----------------------------------------------------------------------------
// Impression : pré-chargement des images puis window.print()
// -----------------------------------------------------------------------------

export const RAPPORT_PRINT_ROOT_ID = "rapport-client-print";

export const STYLES_PRINT_RAPPORT = `
@media print {
  html, body { background: #ffffff !important; }
  body * { visibility: hidden !important; }
  #${RAPPORT_PRINT_ROOT_ID}, #${RAPPORT_PRINT_ROOT_ID} * { visibility: visible !important; }
  #${RAPPORT_PRINT_ROOT_ID} {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    box-shadow: none !important;
    border: none !important;
  }
  @page { margin: 12mm; }
}
`;

export async function preparerEtImprimer(
  rootId: string = RAPPORT_PRINT_ROOT_ID
): Promise<void> {
  if (typeof window === "undefined") return;

  const racine = document.getElementById(rootId);
  if (racine) {
    const images = Array.from(racine.querySelectorAll("img")) as HTMLImageElement[];

    await Promise.all(
      images.map((im) => {
        if (typeof im.decode === "function") {
          return im.decode().catch(() => undefined);
        }
        return new Promise<void>((resolve) => {
          if (im.complete) {
            resolve();
            return;
          }
          im.onload = () => resolve();
          im.onerror = () => resolve();
        });
      })
    );
  }

  window.print();
}