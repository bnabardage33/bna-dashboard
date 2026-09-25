// app/api/photos-chantier/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifierSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const BUCKET = 'chantiers-photos';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClientSSR = Awaited<ReturnType<typeof createClient>>;
type Contexte =
  | { ok: true; supabase: ClientSSR; entreprise_id: string }
  | { ok: false; response: NextResponse };

function erreur(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function estUuid(value: string) {
  return UUID_RE.test(value);
}

async function obtenirContexte(): Promise<Contexte> {
  const session = await verifierSession();
  if (!session.authentifie) return { ok: false, response: session.reponse };

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, response: erreur('Non autorisé', 401) };
    }

    const valeur =
      (user.app_metadata as { entreprise_id?: unknown } | null | undefined)
        ?.entreprise_id;
    if (typeof valeur !== 'string') {
      return { ok: false, response: erreur('Contexte entreprise introuvable.', 403) };
    }

    const entreprise_id = valeur.trim();
    if (!estUuid(entreprise_id)) {
      return { ok: false, response: erreur('Contexte entreprise invalide.', 403) };
    }

    return { ok: true, supabase, entreprise_id };
  } catch (err) {
    console.error('Erreur résolution contexte photos-chantier:', err);
    return { ok: false, response: erreur('Erreur serveur', 500) };
  }
}

function cheminStorageDepuisUrl(url: string): string | null {
  try {
    const expectedOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== expectedOrigin) return null;

    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = parsedUrl.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(parsedUrl.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

function cheminStorageAutorise(path: string, entreprise_id: string, chantier_id: string) {
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false;
  return (
    path.startsWith(`${entreprise_id}/${chantier_id}/`) ||
    // Les anciens objets utilisaient déjà le préfixe chantier_id.
    path.startsWith(`${chantier_id}/`)
  );
}

export async function GET(request: NextRequest) {
  const contexte = await obtenirContexte();
  if (!contexte.ok) return contexte.response;
  const { supabase, entreprise_id } = contexte;

  try {
    const chantierId = request.nextUrl.searchParams.get('chantier_id')?.trim();

    // Sans chantier_id => liste des chantiers du tenant courant uniquement.
    if (!chantierId) {
      const { data, error } = await supabase
        .from('chantiers')
        .select('id, entreprise_id, nom, adresse_chantier, statut')
        .eq('entreprise_id', entreprise_id)
        .order('created_at', { ascending: false });

      if (error) return erreur(error.message, 500);
      if (data?.some((chantier) => chantier.entreprise_id !== entreprise_id)) {
        return erreur('Contexte entreprise invalide', 500);
      }

      return NextResponse.json({
        chantiers: (data ?? []).map((chantier) => ({
          id: chantier.id,
          nom: chantier.nom,
          adresse_chantier: chantier.adresse_chantier,
          statut: chantier.statut,
        })),
      });
    }

    if (!estUuid(chantierId)) return erreur('chantier_id invalide', 400);

    // Résout le parent avant toute lecture de photos ; un ID BNA avec une
    // session TEST est donc traité comme inexistant, jamais lu.
    const { data: chantier, error: chantierError } = await supabase
      .from('chantiers')
      .select('id, entreprise_id')
      .eq('id', chantierId)
      .eq('entreprise_id', entreprise_id)
      .maybeSingle();

    if (chantierError) return erreur(chantierError.message, 500);
    if (!chantier || chantier.entreprise_id !== entreprise_id) {
      return erreur('Chantier introuvable', 404);
    }

    const { data, error } = await supabase
      .from('photos_chantier')
      .select('id, chantier_id, entreprise_id, url_image, titre, date_ajout')
      .eq('chantier_id', chantierId)
      .eq('entreprise_id', entreprise_id)
      .order('date_ajout', { ascending: false });

    if (error) return erreur(error.message, 500);
    if (data?.some((photo) => photo.entreprise_id !== entreprise_id)) {
      return erreur('Contexte entreprise invalide', 500);
    }

    return NextResponse.json({
      photos: (data ?? []).map((photo) => ({
        id: photo.id,
        chantier_id: photo.chantier_id,
        url_image: photo.url_image,
        titre: photo.titre,
        date_ajout: photo.date_ajout,
      })),
    });
  } catch (err) {
    console.error('Erreur lecture photos-chantier:', err);
    return erreur('Erreur serveur', 500);
  }
}

export async function POST(request: NextRequest) {
  const contexte = await obtenirContexte();
  if (!contexte.ok) return contexte.response;
  const { supabase, entreprise_id } = contexte;

  try {
    const formData = await request.formData();
    const fileEntry = formData.get('file');
    const chantierEntry = formData.get('chantier_id');
    const titreEntry = formData.get('titre');

    if (!(fileEntry instanceof File) || typeof chantierEntry !== 'string') {
      return erreur('file et chantier_id sont requis', 400);
    }

    const chantier_id = chantierEntry.trim();
    if (!estUuid(chantier_id)) return erreur('chantier_id invalide', 400);

    const titre =
      typeof titreEntry === 'string' && titreEntry.trim()
        ? titreEntry.trim()
        : 'Photo chantier';

    // Le parent doit être visible dans le tenant courant avant tout upload ou
    // insert ; cela bloque une tentative de rattachement à un chantier BNA.
    const { data: chantier, error: chantierError } = await supabase
      .from('chantiers')
      .select('id, entreprise_id')
      .eq('id', chantier_id)
      .eq('entreprise_id', entreprise_id)
      .maybeSingle();

    if (chantierError) return erreur(chantierError.message, 500);
    if (!chantier || chantier.entreprise_id !== entreprise_id) {
      return erreur('Chantier introuvable', 404);
    }

    const extension =
      fileEntry.name
        .split('.')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `${entreprise_id}/${chantier_id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;
    const buffer = new Uint8Array(await fileEntry.arrayBuffer());

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: fileEntry.type, upsert: false });

    if (storageError) return erreur(storageError.message, 500);

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    const { data: inserted, error: insertError } = await supabase
      .from('photos_chantier')
      .insert({
        chantier_id,
        entreprise_id,
        url_image: urlData.publicUrl,
        titre,
        date_ajout: new Date().toISOString(),
      })
      .select('id, chantier_id, entreprise_id, url_image, titre, date_ajout')
      .single();

    if (insertError) {
      const { error: cleanupError } = await supabase.storage
        .from(BUCKET)
        .remove([fileName]);
      if (cleanupError) {
        console.error('Erreur nettoyage fichier après échec insert:', cleanupError.message);
      }
      return erreur(insertError.message, 500);
    }

    if (inserted.entreprise_id !== entreprise_id || inserted.chantier_id !== chantier_id) {
      await supabase
        .from('photos_chantier')
        .delete()
        .eq('id', inserted.id)
        .eq('entreprise_id', entreprise_id)
        .eq('chantier_id', chantier_id);
      await supabase.storage.from(BUCKET).remove([fileName]);
      return erreur('Contexte entreprise invalide', 500);
    }

    return NextResponse.json({
      photo: {
        id: inserted.id,
        chantier_id: inserted.chantier_id,
        url_image: inserted.url_image,
        titre: inserted.titre,
        date_ajout: inserted.date_ajout,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return erreur(message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const contexte = await obtenirContexte();
  if (!contexte.ok) return contexte.response;
  const { supabase, entreprise_id } = contexte;

  try {
    const id = request.nextUrl.searchParams.get('id')?.trim();
    if (!id) return erreur('id requis', 400);
    if (!estUuid(id)) return erreur('id invalide', 400);

    // La photo est résolue dans le tenant avant de lire son URL ou de
    // supprimer un objet Storage ; un id BNA n'est jamais manipulable par TEST.
    const { data: photo, error: photoError } = await supabase
      .from('photos_chantier')
      .select('id, chantier_id, entreprise_id, url_image')
      .eq('id', id)
      .eq('entreprise_id', entreprise_id)
      .maybeSingle();

    if (photoError) return erreur(photoError.message, 500);
    if (!photo) return erreur('Photo introuvable', 404);
    if (photo.entreprise_id !== entreprise_id) return erreur('Photo introuvable', 404);

    const { data: chantier, error: chantierError } = await supabase
      .from('chantiers')
      .select('id, entreprise_id')
      .eq('id', photo.chantier_id)
      .eq('entreprise_id', entreprise_id)
      .maybeSingle();

    if (chantierError) return erreur(chantierError.message, 500);
    if (!chantier || chantier.entreprise_id !== entreprise_id) {
      return erreur('Chantier introuvable', 404);
    }

    const path = cheminStorageDepuisUrl(photo.url_image);
    if (!path || !cheminStorageAutorise(path, entreprise_id, photo.chantier_id)) {
      return erreur('Chemin de photo invalide', 500);
    }

    // Si Storage refuse l'opération, conserver la ligne métier plutôt que
    // de laisser une suppression partielle ; le route reste fail-closed.
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([path]);
    if (storageError) return erreur(storageError.message, 500);

    const { data: deleted, error: deleteError } = await supabase
      .from('photos_chantier')
      .delete()
      .eq('id', id)
      .eq('entreprise_id', entreprise_id)
      .eq('chantier_id', photo.chantier_id)
      .select('id')
      .maybeSingle();

    if (deleteError) return erreur(deleteError.message, 500);
    if (!deleted) return erreur('Photo introuvable', 404);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return erreur(message, 500);
  }
}
