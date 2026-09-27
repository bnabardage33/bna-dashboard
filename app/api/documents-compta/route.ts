// app/api/documents-compta/route.ts
//
// O3-B9 / 13e producteur — isolation tenant de `documents_compta`.
//
// `documents_compta` est une table ENFANT de `chantiers` (`entreprise_id`
// NOT NULL sans DEFAULT depuis le 2026-09-22), mais son trigger
// `tg_set_entreprise_par_chantier()` est un NO-OP silencieux quand
// `chantier_id IS NULL` (`if new.chantier_id is not null then … end if`).
// Or cet écran propose explicitement « -- Aucun -- » : le mode sans chantier
// est une RÈGLE MÉTIER EXISTANTE, on ne la rend pas obligatoire.
//
// Les trois handlers utilisaient `supabaseAdmin` (clé `service_role`, donc
// `BYPASSRLS`) et `verifierSession()`, qui ne retourne QUE `{ authentifie:
// true }` — ni l'utilisateur, ni le tenant. Aucune policy RLS n'était donc
// évaluée, et le tenant n'était jamais imposé par le code.
//
// Règle appliquée, identique aux 10 autres routes API du dépôt
// (`app/api/devis/route.ts`, `app/api/dashboard-patron/route.ts`, …) :
//   1. résoudre le tenant AVANT toute requête ;
//   2. fail-closed si le claim est absent ou malformé (403, zéro requête) ;
//   3. porter le tenant explicitement dans le prédicat (`entreprise_id`).
//
// AUCUNE migration, AUCUN changement de schéma, AUCUN trigger ajouté.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import type { TablesInsert } from '@/types/supabase';

export const dynamic = 'force-dynamic';

// Le claim `app_metadata.entreprise_id` doit être un UUID avant d'être recopié
// dans une colonne `uuid` ET dans un prédicat `.eq()`. Sans cette garde, un
// claim corrompu produirait soit une erreur PostgreSQL opaque, soit — pire —
// un `.eq('entreprise_id', <non-uuid>)` qui ne correspond à aucune ligne.
//
// Le retour est un PRÉDICAT DE TYPE (`value is string`) : c'est ce qui permet
// à TypeScript de rétrécir `string` en `string` après l'appel, et donc
// d'exiger `entreprise_id: string` dans l'objet inséré SANS assertion `as`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

type ResultatTenant =
  | { ok: true; entrepriseId: string }
  | { ok: false; reponse: NextResponse };

/**
 * Résout le tenant de la requête, ou échoue fermé.
 *
 * Remplace `verifierSession()`, qui ne fournissait pas le tenant et imposait
 * donc un appel `auth.getUser()` supplémentaire sans rien apporter. Le client
 * SSR est celui de `verifierSession()` : clé `anon` + cookies de session, donc
 * `auth.getUser()` est bien exécuté avec le JWT de l'utilisateur.
 *
 * Fail-closed : claim absent, vide ou malformé ⇒ 403 et AUCUNE requête base.
 */
async function resoudreTenant(): Promise<ResultatTenant> {
  const supabase = await createClient();
  const {
    data: { user },
    error: erreurSession,
  } = await supabase.auth.getUser();

  if (erreurSession || !user) {
    return {
      ok: false,
      reponse: NextResponse.json(
        { error: 'Non autorisé — session requise' },
        { status: 401 }
      ),
    };
  }

  const brut = (user.app_metadata as { entreprise_id?: unknown } | null | undefined)
    ?.entreprise_id;
  const entrepriseId = typeof brut === 'string' ? brut.trim() : '';

  if (!estUuid(entrepriseId)) {
    return {
      ok: false,
      reponse: NextResponse.json(
        { error: 'Contexte entreprise introuvable ou invalide dans votre session.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, entrepriseId };
}

/**
 * Vérifie qu'une ligne appartient bien au tenant, AVANT de s'y référencer.
 *
 * Indispensable pour `chantier_id` : le trigger `tg_set_entreprise_par_chantier`
 * RECOUVRE `entreprise_id` avec la valeur du chantier. Sans ce contrôle, un
 * `chantier_id` forgé (appareil désaccordé, requête montée à la main) rattacherait
 * le document au tenant du chantier — donc l'isolation serait rompue alors même
 * que `entreprise_id` est renseigné.
 *
 * L'union est volontairement restreinte aux deux tables réellement appelées ici :
 * c'est ce qui fait que `.eq('entreprise_id', …)` reste typé par le généré, donc
 * vérifié par `tsc`, au lieu d'être un `string` qui passerait partout.
 */
type TableVerifiable = 'chantiers' | 'fournisseurs';

async function ligneAppartientAuTenant(
  table: TableVerifiable,
  id: string,
  entrepriseId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();
  return !error && data !== null;
}

export async function GET() {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { data, error } = await supabaseAdmin
    .from('documents_compta')
    .select('*, chantiers(id, nom), fournisseurs(id, nom)')
    // Scoping explicite OBLIGATOIRE : `service_role` contourne la RLS, donc
    // l'`entreprise_id` doit être porté par la requête elle-même.
    .eq('entreprise_id', tenant.entrepriseId)
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

export async function POST(request: NextRequest) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;
  const { entrepriseId } = tenant;

  // Chemin du fichier RÉELLEMENT stocké par CETTE requête. `null` tant que
  // rien n'a été écrit dans le bucket (cas `file_url` fourni par l'OCR, où l'on
  // ne possède pas le fichier et ne doit surtout pas le supprimer).
  let cheminStocke: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileUrl = (formData.get('file_url') as string) || null;
    const type = formData.get('type') as string;
    const date = (formData.get('date') as string) || new Date().toISOString().slice(0, 10);
    const note = (formData.get('note') as string) || '';
    const montantHt = parseFloat(formData.get('montant_ht') as string) || 0;
    const tauxTva = parseFloat(formData.get('taux_tva') as string) || 20;
    const chantierId = (formData.get('chantier_id') as string) || null;
    const fournisseurId = (formData.get('fournisseur_id') as string) || null;
    const categorie = (formData.get('categorie') as string) || 'materiaux';

    // Les deux parents optionnels sont vérifiés AVANT l'upload : un rejet ici
    // ne laisse aucun fichier derrière, alors qu'un rejet après l'upload
    // imposerait une compensation.
    if (chantierId !== null && !estUuid(chantierId)) {
      return NextResponse.json(
        { error: 'Identifiant de chantier invalide.' },
        { status: 400 }
      );
    }
    if (fournisseurId !== null && !estUuid(fournisseurId)) {
      return NextResponse.json(
        { error: 'Identifiant de fournisseur invalide.' },
        { status: 400 }
      );
    }
    if (
      chantierId !== null &&
      !(await ligneAppartientAuTenant('chantiers', chantierId, entrepriseId))
    ) {
      return NextResponse.json(
        { error: 'Chantier introuvable dans votre entreprise.' },
        { status: 400 }
      );
    }
    if (
      fournisseurId !== null &&
      !(await ligneAppartientAuTenant('fournisseurs', fournisseurId, entrepriseId))
    ) {
      return NextResponse.json(
        { error: 'Fournisseur introuvable dans votre entreprise.' },
        { status: 400 }
      );
    }

    const montantTva = montantHt * (tauxTva / 100);
    const montantTtc = montantHt + montantTva;

    let urlImage = fileUrl;

    if (!urlImage) {
      if (!file || !type) {
        return NextResponse.json({ error: 'file et type sont requis' }, { status: 400 });
      }
      if (type !== 'bl' && type !== 'ticket') {
        return NextResponse.json({ error: 'type doit etre "bl" ou "ticket"' }, { status: 400 });
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `documents-compta/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const { error: storageError } = await supabaseAdmin.storage
        .from('tickets')
        .upload(fileName, buffer, { contentType: file.type, upsert: false });

      // Échec d'upload : rien n'a été écrit en base, l'état est cohérent.
      if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

      // Le fichier existe désormais : toute sortie d'erreur ultérieure doit le
      // compenser, sinon il reste un orphelin dans le bucket.
      cheminStocke = fileName;

      const { data: urlData } = supabaseAdmin.storage
        .from('tickets')
        .getPublicUrl(fileName);

      urlImage = urlData.publicUrl;
    }

    const { data, error } = await supabaseAdmin
      .from('documents_compta')
      .insert({
        type,
        date,
        note,
        montant_ht: montantHt,
        taux_tva: tauxTva,
        montant_tva: montantTva,
        montant_ttc: montantTtc,
        url_image: urlImage,
        // `null` = l'utilisateur a choisi « -- Aucun -- ». Le trigger est alors
        // un no-op : c'est pourquoi `entreprise_id` est fourni explicitement.
        chantier_id: chantierId,
        fournisseur_id: fournisseurId,
        categorie,
        entreprise_id: entrepriseId,
      })
      .select()
      .single();

    if (error) {
      // COMPENSATION : l'upload est déjà committed, l'insert a échoué. Sans ce
      // bloc, chaque réessai laissait un fichier de plus dans le bucket
      // (`upsert: false` + nom horodaté). Échec de l'upload anterior, donc
      // aucun effet de bord en base : l'état reste cohérent.
      if (cheminStocke) {
        const { error: erreurCompensation } = await supabaseAdmin.storage
          .from('tickets')
          .remove([cheminStocke]);
        if (erreurCompensation) {
          // Signalé, jamais masqué : c'est le seul cas où un orphelin subsiste.
          console.error(
            `Documents compta : insertion échouée ET compensation Storage impossible pour ${cheminStocke} — fichier orphelin.`,
            erreurCompensation
          );
        }
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (chantierId && data) {
      // Miroir `depenses_chantier`. Table ENFANT : `entreprise_id` est laissé
      // au trigger, qui le dérive du chantier — chantier désormais VÉRIFIÉ
      // comme appartenant au tenant, donc la valeur dérivée est la bonne.
      // (Même choix que les sites enfants de B9 : le cast reste, la garantie
      // est portée par le contrôle runtime, pas par le type.)
      const { error: depenseError } = await supabaseAdmin
        .from('depenses_chantier')
        .insert({
          chantier_id: chantierId,
          fournisseur_id: fournisseurId,
          date,
          nature: categorie,
          montant_ht: montantHt,
          montant_tva: montantTva,
          taux_tva: tauxTva,
          statut: 'engage',
          document_url: urlImage,
        } as TablesInsert<"depenses_chantier">);

      if (depenseError) {
        // Le document EST enregistré. Renvoyer 2xx ici serait un mensonge :
        // l'utilisateur croirait la dépense sous-traitance prise en compte.
        // L'erreur est donc explicite, et l'UI affiche ce bandeau (existant).
        console.error('Documents compta : dépense miroir non créée.', depenseError);
        return NextResponse.json(
          {
            error: `Document enregistré, mais la dépense miroir n'a pas pu être créée : ${depenseError.message}`,
            document: data,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ document: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  if (!estUuid(id)) {
    return NextResponse.json({ error: 'id invalide' }, { status: 400 });
  }

  // Lecture SCOPÉE : si le document n'est pas dans le tenant, on répond 404
  // sans distinguer « inexistant » de « appartient à quelqu'un d'autre », pour
  // ne pas confirmer l'existence d'une ligne d'un autre tenant.
  const { data: doc, error: erreurLecture } = await supabaseAdmin
    .from('documents_compta')
    .select('id, url_image')
    .eq('id', id)
    .eq('entreprise_id', tenant.entrepriseId)
    .maybeSingle();

  if (erreurLecture) {
    return NextResponse.json({ error: erreurLecture.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json(
      { error: 'Document introuvable dans votre entreprise.' },
      { status: 404 }
    );
  }

  // Suppression du fichier : meilleur effort, comme avant. Un échec ici ne
  // doit pas empêcher la suppression de la ligne (l'inverse laisserait un
  // document pointant vers une image disparue).
  if (doc.url_image) {
    const path = doc.url_image.split('/tickets/')[1];
    if (path) {
      const { error: erreurStockage } = await supabaseAdmin.storage
        .from('tickets')
        .remove([path]);
      if (erreurStockage) {
        console.error(
          `Documents compta : fichier ${path} non supprimé alors que la ligne l'est.`,
          erreurStockage
        );
      }
    }
  }

  // Le prédicat porte TOUJOURS les deux critères, y compris sur le DELETE
  // lui-même : la lecture précédente ne doit pas pouvoir devenir une fenêtre
  // de TOCTOU si la ligne changeait de tenant entre les deux appels.
  const { error } = await supabaseAdmin
    .from('documents_compta')
    .delete()
    .eq('id', id)
    .eq('entreprise_id', tenant.entrepriseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
