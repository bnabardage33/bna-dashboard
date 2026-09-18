// app/api/dashboard-patron/route.ts
// Dashboard Patron — Prédiction de trésorerie en 1 écran.
// GET : calcule CA encaissé, CA en attente, dépenses à payer, tréso J+15/J+30,
//       projection 30 jours, alertes, top chantiers rentables / à perte.
// POST : met à jour la trésorerie actuelle (parametres_entreprise).

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const JOURS_PROJECTION = 30;
const DEFAUT_TRESORERIE = 5000;

function debutJourMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function jourDepuisAujourdhui(dateIso: string): number {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return JOURS_PROJECTION;
  const aujourdhui = debutJourMs(new Date());
  return Math.round((debutJourMs(d) - aujourdhui) / 86400000);
}

function ttcDepense(dep: { montant_ht: number; montant_tva?: number | null; taux_tva?: number | null }): number {
  const ht = dep.montant_ht || 0;
  if (typeof dep.montant_tva === 'number' && !Number.isNaN(dep.montant_tva)) {
    return ht + dep.montant_tva;
  }
  return ht * (1 + ((dep.taux_tva ?? 20) || 20) / 100);
}

function ttcFacture(f: { lignes: unknown; tva_pct?: number | null }): number {
  const lignes = (f.lignes as { qte: number; pu_ht: number }[] | null) ?? [];
  const totalHT = lignes.reduce((s, l) => s + (l.qte || 0) * (l.pu_ht || 0), 0);
  return totalHT * (1 + ((f.tva_pct ?? 20) || 20) / 100);
}

function ttcDevis(d: { lignes: unknown; tva_pct?: number | null }): number {
  return ttcFacture(d);
}

function estPaye(statut?: string | null): boolean {
  const s = (statut ?? '').toLowerCase();
  return s === 'payee' || s === 'payé' || s === 'paye' || s.startsWith('pay');
}

function clampJour(j: number): number {
  return Math.max(1, Math.min(JOURS_PROJECTION, j));
}

async function lireParametresEntreprise() {
  const { data: params } = await supabaseAdmin
    .from('parametres_entreprise')
    .select('tresorerie_actuelle, charges_fixes_mensuelles')
    .eq('id', 1)
    .single();

  let tresorerieActuelle = params?.tresorerie_actuelle ?? null;
  let chargesFixes = params?.charges_fixes_mensuelles ?? 0;

  if (tresorerieActuelle === null) {
    // Fallback sur l'ancien paramètre solde_bancaire si présent
    const { data: solde } = await supabaseAdmin
      .from('parametres_finance')
      .select('valeur')
      .eq('cle', 'solde_bancaire')
      .single();
    tresorerieActuelle = solde?.valeur ?? DEFAUT_TRESORERIE;
  }

  return { tresorerieActuelle, chargesFixes };
}

export async function GET() {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const [{ tresorerieActuelle, chargesFixes }, facturesRes, devisRes, depensesRes, docsRes, chantiersRes] =
      await Promise.all([
        lireParametresEntreprise(),
        supabaseAdmin.from('factures').select('*, clients(nom, email, societe)'),
        supabaseAdmin.from('devis').select('*, clients(nom, email)'),
        supabaseAdmin.from('depenses_chantier').select('*, fournisseurs(nom, email)'),
        supabaseAdmin
          .from('documents_compta')
          .select('*, fournisseurs(nom, email)'),
        supabaseAdmin
          .from('chantiers')
          .select('id, nom, client_nom, prix_vente_ht, statut'),
      ]);

    const factures = facturesRes.data ?? [];
    const devis = devisRes.data ?? [];
    const depenses = depensesRes.data ?? [];
    const documents = docsRes.data ?? [];
    const chantiers = chantiersRes.data ?? [];

    const aujourdhui = debutJourMs(new Date());
    const moisCourant = new Date().toISOString().slice(0, 7);

    // --- a) CA encaissé mois en cours ---
    const caEncaissedMois = factures
      .filter((f) => estPaye(f.statut))
      .filter((f) => {
        const dateRef = (f.echeance || f.date_emission || '').slice(0, 7);
        return dateRef === moisCourant;
      })
      .reduce((s, f) => s + ttcFacture(f), 0);

    // --- b) CA en attente : factures non payées + devis signés non facturés ---
    const facturesEnAttente = factures.filter((f) => !estPaye(f.statut) && f.statut !== 'annulee');

    const devisFacturesIds = new Set(
      factures.filter((f) => f.devis_id).map((f) => f.devis_id)
    );
    const devisSignes = devis.filter(
      (d) => (d.statut === 'accepte' || d.statut === 'signe') && !devisFacturesIds.has(d.id)
    );

    const caEnAttente =
      facturesEnAttente.reduce((s, f) => s + ttcFacture(f), 0) +
      devisSignes.reduce((s, d) => s + ttcDevis(d), 0);

    // --- c) Dépenses à payer ---
    const depensesAPayerRows = depenses.filter((d) => d.statut === null || !estPaye(d.statut));
    // documents_compta sans chantier = facture fournisseur non liée à une dépense déjà comptée
    const docsAPayerRows = documents.filter((dc) => !dc.chantier_id);

    const depensesParFournisseur = new Map<string, { nom: string; email: string | null; montant: number; datePlusAncienne: string | null }>();
    let depensesAPayer = 0;

    const ajouterFournisseur = (id: string | null, nom: string | null, email: string | null, montant: number, date: string | null) => {
      depensesAPayer += montant;
      if (!id) return;
      const key = id;
      const existant = depensesParFournisseur.get(key);
      if (existant) {
        existant.montant += montant;
        if (date && (!existant.datePlusAncienne || new Date(date) < new Date(existant.datePlusAncienne))) {
          existant.datePlusAncienne = date;
        }
      } else {
        depensesParFournisseur.set(key, { nom: nom || 'Fournisseur', email, montant, datePlusAncienne: date });
      }
    };

    depensesAPayerRows.forEach((d) =>
      ajouterFournisseur(
        d.fournisseur_id,
        d.fournisseurs?.nom ?? null,
        d.fournisseurs?.email ?? null,
        ttcDepense(d),
        d.date ?? d.created_at ?? null
      )
    );
    docsAPayerRows.forEach((dc) =>
      ajouterFournisseur(
        dc.fournisseur_id,
        dc.fournisseurs?.nom ?? null,
        dc.fournisseurs?.email ?? null,
        dc.montant_ttc || 0,
        dc.date ?? dc.created_at ?? null
      )
    );

    // --- d) Projection tréso sur 30 jours ---
    const fluxParJour: number[] = new Array(JOURS_PROJECTION + 1).fill(0);
    const ajouterFlux = (dateIso: string | null | undefined, montant: number) => {
      const jour = clampJour(jourDepuisAujourdhui(dateIso || new Date().toISOString().slice(0, 10)));
      fluxParJour[jour] += montant;
    };

    facturesEnAttente.forEach((f) => ajouterFlux(f.echeance || f.date_emission, ttcFacture(f)));
    depensesAPayerRows.forEach((d) => ajouterFlux(d.date ?? d.created_at, -ttcDepense(d)));
    docsAPayerRows.forEach((dc) => ajouterFlux(dc.date ?? dc.created_at, -(dc.montant_ttc || 0)));

    const chargeParJour = chargesFixes > 0 ? chargesFixes / JOURS_PROJECTION : 0;

    const balance: number[] = new Array(JOURS_PROJECTION).fill(0);
    let cumul = tresorerieActuelle;
    for (let j = 1; j <= JOURS_PROJECTION; j++) {
      cumul += fluxParJour[j] - chargeParJour;
      balance[j - 1] = cumul;
    }

    const tresoJ15 = balance[14];
    const tresoJ30 = balance[29];

    // --- e) Alertes ---
    type Alerte = {
      id: string;
      niveau: 'rouge' | 'orange' | 'vert';
      type: 'facture_retard' | 'fournisseur_impaye' | 'chantier_budget' | 'treso_negative' | 'positif';
      message: string;
      sous_message?: string;
      montant?: number;
      action?: { label: string; href?: string; mailto?: string };
    };
    const alertes: Alerte[] = [];

    // Factures en retard (> 10 jours après échéance)
    const facturesEnRetard = facturesEnAttente.filter((f) => {
      const dateRef = f.echeance || f.date_emission;
      if (!dateRef) return false;
      return jourDepuisAujourdhui(dateRef) < -10;
    });
    facturesEnRetard.forEach((f) => {
      const dateRef = f.echeance || f.date_emission || '';
      const joursRetard = Math.abs(jourDepuisAujourdhui(dateRef));
      alertes.push({
        id: `facture_${f.id}`,
        niveau: joursRetard >= 30 ? 'rouge' : 'orange',
        type: 'facture_retard',
        message: `Facture ${f.numero || ''} ${f.clients?.nom || ''} — impayée depuis ${joursRetard} j`,
        sous_message: `${f.clients?.societe || f.clients?.nom || 'Client'}`,
        montant: ttcFacture(f),
        action: {
          label: 'Relancer',
          mailto: f.clients?.email
            ? `mailto:${f.clients.email}?subject=${encodeURIComponent(`Relance facture ${f.numero || ''}`)}`
            : undefined,
        },
      });
    });
    if (facturesEnRetard.length === 0) {
      alertes.push({
        id: 'positif_factures',
        niveau: 'vert',
        type: 'positif',
        message: 'Aucune facture en retard de paiement',
      });
    }

    // Fournisseurs impayés depuis plus de 15 jours
    const fournisseursImpayes: { id: string; nom: string; email: string | null; montant: number; datePlusAncienne: string | null }[] = [];
    depensesParFournisseur.forEach((f, id) => {
      if (f.datePlusAncienne && jourDepuisAujourdhui(f.datePlusAncienne) < -15) {
        fournisseursImpayes.push({ id, ...f });
      }
    });
    fournisseursImpayes.forEach((f) => {
      const jours = Math.abs(jourDepuisAujourdhui(f.datePlusAncienne!));
      alertes.push({
        id: `fournisseur_${f.id}`,
        niveau: jours >= 30 ? 'rouge' : 'orange',
        type: 'fournisseur_impaye',
        message: `${f.nom} — impayé depuis ${jours} j`,
        sous_message: 'Dernière dépense non réglée',
        montant: f.montant,
        action: f.email
          ? { label: 'Relancer', mailto: `mailto:${f.email}?subject=${encodeURIComponent('Relance paiement')}` }
          : undefined,
      });
    });

    // Chantiers où les dépenses dépassent 80% du budget (prix_vente_ht)
    const depensesParChantier = new Map<string, number>();
    depenses.forEach((d) => {
      if (!d.chantier_id) return;
      depensesParChantier.set(d.chantier_id, (depensesParChantier.get(d.chantier_id) || 0) + ttcDepense(d));
    });

    const chantiersRentabilite = chantiers.map((c) => {
      const budget = c.prix_vente_ht || 0;
      const depensesChantier = depensesParChantier.get(c.id) || 0;
      return {
        id: c.id,
        nom: c.nom || c.client_nom || 'Chantier',
        statut: c.statut || '',
        budget,
        depenses: depensesChantier,
        marge: budget - depensesChantier,
      };
    });

    chantiersRentabilite.forEach((c) => {
      if (c.budget > 0 && c.depenses > c.budget * 0.8) {
        const pctDep = Math.round((c.depenses / c.budget) * 100);
        alertes.push({
          id: `budget_${c.id}`,
          niveau: c.marge < 0 ? 'rouge' : 'orange',
          type: 'chantier_budget',
          message: `${c.nom} — ${pctDep}% du budget consommé`,
          sous_message: `Dépenses ${fmtMontant(c.depenses)} / budget ${fmtMontant(c.budget)}`,
          montant: c.marge < 0 ? -c.marge : undefined,
          action: { label: 'Voir chantier', href: `/terrain/chantier/${c.id}` },
        });
      }
    });

    // Trésorerie J+15 négative
    if (tresoJ15 < 0) {
      alertes.push({
        id: 'treso_negative',
        niveau: 'rouge',
        type: 'treso_negative',
        message: 'Trésorerie prévisionnelle négative à J+15',
        sous_message: `Découvert estimé de ${fmtMontant(Math.abs(tresoJ15))} si tout est confirmé`,
        montant: Math.abs(tresoJ15),
        action: { label: 'Voir factures', href: '/bureau/factures' },
      });
    } else {
      alertes.push({
        id: 'positif_treso',
        niveau: 'vert',
        type: 'positif',
        message: 'Trésorerie prévisionnelle positive à J+15',
      });
    }

    const ordreNiveau = { rouge: 0, orange: 1, vert: 2 };
    alertes.sort((a, b) => ordreNiveau[a.niveau] - ordreNiveau[b.niveau]);

    // --- Top 3 rentables / à perte ---
    const avecBudget = chantiersRentabilite.filter((c) => c.budget > 0);
    const topRentables = [...avecBudget].sort((a, b) => b.marge - a.marge).slice(0, 3);
    const topPertes = [...avecBudget].filter((c) => c.marge < 0).sort((a, b) => a.marge - b.marge).slice(0, 3);

    return NextResponse.json({
      parametres: {
        tresorerie_actuelle: tresorerieActuelle,
        charges_fixes_mensuelles: chargesFixes,
      },
      ca_encaisse_mois: caEncaissedMois,
      ca_en_attente: caEnAttente,
      depenses_a_payer: depensesAPayer,
      depenses_a_payer_par_fournisseur: Array.from(depensesParFournisseur.values()).map((f) => ({
        nom: f.nom,
        email: f.email,
        montant: f.montant,
      })),
      treso_j15: tresoJ15,
      treso_j30: tresoJ30,
      projection: balance,
      alertes,
      top_chantiers_rentables: topRentables,
      top_chantiers_pertes: topPertes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur dashboard-patron:', message);
    return NextResponse.json({ error: 'Erreur serveur', debug: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const body = await req.json();
    const tresorerieActuelle =
      typeof body.tresorerie_actuelle === 'number' ? body.tresorerie_actuelle : undefined;
    const chargesFixesMensuelles =
      typeof body.charges_fixes_mensuelles === 'number' ? body.charges_fixes_mensuelles : undefined;

    if (tresorerieActuelle === undefined && chargesFixesMensuelles === undefined) {
      return NextResponse.json({ error: 'Aucun paramètre à mettre à jour' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('parametres_entreprise')
      .upsert(
        {
          id: 1,
          tresorerie_actuelle: tresorerieActuelle ?? DEFAUT_TRESORERIE,
          charges_fixes_mensuelles: chargesFixesMensuelles ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur POST dashboard-patron:', message);
    return NextResponse.json({ error: 'Erreur serveur', debug: message }, { status: 500 });
  }
}

function fmtMontant(n: number): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}