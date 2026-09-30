import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'

describe('Migration Espace Client — mémoire multi-sessions (A+B+C)', () => {
  const migrationPath =
    './supabase/migrations/20260912_espace_client_conversations.sql'
  const content = readFileSync(migrationPath, 'utf-8')

  it('crée la table espace_client_conversations avec le bon schéma', () => {
    expect(content).toContain(
      'create table if not exists public.espace_client_conversations'
    )
    expect(content).toContain('cle text not null unique')
    expect(content).toContain('messages_session jsonb not null default')
    expect(content).toContain('resumes_sessions jsonb not null default')
    expect(content).toContain('resume_global jsonb default')
    expect(content).toContain('session_id_en_cours text')
    expect(content).toContain('updated_at timestamptz default now()')
  })

  it('rattache la colonne espace_client_id à notes_patron avec un index unique', () => {
    expect(content).toContain(
      'add column if not exists espace_client_id text'
    )
    expect(content).toContain(
      'create unique index if not exists notes_patron_espace_client_unique_idx'
    )
  })

  it('définit espace_client_append (append de session) avec verrou advisory', () => {
    expect(content).toContain(
      'create or replace function public.espace_client_append'
    )
    expect(content).toContain('pg_advisory_xact_lock')
    expect(content).toContain('on conflict (cle) do update')
    expect(content).toContain('messages_session || excluded.messages_session')
  })

  it('définit espace_client_consolider avec écrasement conditionnel', () => {
    expect(content).toContain(
      'create or replace function public.espace_client_consolider'
    )
    expect(content).toContain('for update')
    expect(content).toContain('jsonb_array_length')
    expect(content).toContain("messages_session = '[]'::jsonb")
    // Le vidage ne doit dépendre d'aucun calcul hasardé : égalité exacte du compte.
    expect(content).toContain('if v_nb_presents = p_nb_messages_calcules then')
  })

  it('accepte aussi un append quand le canal a déjà divergé', () => {
    // Antidote anti-perte : quand les messages ont grandi pendant la génération,
    // on consolide le résumé mais on conserve la mémoire brute.
    expect(content).toContain('cleared')
    expect(content).not.toContain('truncate')
  })
})

// ---------------------------------------------------------------------------
// O3-B6 — Isolation multi-entreprise des deux RPC
//
// Faux vert corrigé : le bloc ci-dessus ne faisait qu'un grep de texte sur la
// migration de CRÉATION (20260912). Il ne disait RIEN de `security definer`, des
// `grant`/`revoke`, ni de l'isolation — or c'est précisément là que se situait
// l'anomalie. Le test passe au vert alors que `/rest/v1/rpc/espace_client_append`
// était appelable par la clé `anon` publique.
//
// 20260925_o3b6_isolation_espace_client_rpc.sql REMPLACE ces définitions
// (mêmes signatures). C'est donc ce fichier qui fait désormais foi pour le
// comportement effectif des deux fonctions ; le bloc précédent ne documente plus
// que le schéma d'origine et l'historique.
// ---------------------------------------------------------------------------

describe('Migration O3-B6 — isolation des RPC espace_client_*', () => {
  const b6Path = './supabase/migrations/20260925_o3b6_isolation_espace_client_rpc.sql'
  const b6 = readFileSync(b6Path, 'utf-8')

  // Signature exacte des fonctions en base : ces chaînes identifient les
  // objets visés par les PRIVILÈGES. Une migration qui exécuterait `create
  // function` au lieu de `create or replace` changerait le type interne et
  // n'appliquerait pas la correction.
  const sigAppend = 'public.espace_client_append(text, uuid, text, text, jsonb)'
  const sigConsolider = 'public.espace_client_consolider(text, text, integer, jsonb, jsonb)'

  it('les deux fonctions restent SECURITY DEFINER', () => {
    // On ne peut pas les passer en SECURITY INVOKER : le RLS s'appliquerait,
    // mais `service_role` est le seul appelant autorisé et il contourne déjà le
    // RLS. L'invariant à préserver est donc le verrou interne, pas le modèle.
    const corps = b6.slice(b6.indexOf('create or replace function public.espace_client_append'))
    expect(corps).toContain('security definer')
    const corpsConsolider = b6.slice(
      b6.indexOf('create or replace function public.espace_client_consolider')
    )
    expect(corpsConsolider).toContain('security definer')
  })

  it("F1 — EXECUTE est révoqué à PUBLIC, anon et authenticated sur LES DEUX fonctions", () => {
    for (const [sig, nom] of [
      [sigAppend, 'espace_client_append'],
      [sigConsolider, 'espace_client_consolider'],
    ] as const) {
      expect(b6).toContain(`revoke all on function ${sig} from public;`)
      expect(b6).toContain(`revoke all on function ${sig} from anon;`)
      expect(b6).toContain(`revoke all on function ${sig} from authenticated;`)
      expect(b6).toContain(`grant execute on function ${sig} to service_role;`)
      // Un `grant` résiduel vers anon/authenticated/public rouvrirait la faille.
      expect(b6).not.toMatch(
        new RegExp(`grant[^;]*\\bon\\s+function\\s+${sig.replace(/[()]/g, '\\$&')}[^;]*to\\s+(public|anon|authenticated)\\b`, 'i')
      )
      expect(nom).toBeTruthy()
    }
  })

  it('F1 — aucune autre migration du dépôt ne ré-accorde EXECUTE sur ces deux fonctions', () => {
    // Le défaut PostgreSQL sur `create function` est `grant execute to public` :
    // une seule concession résiduelle suffirait à rouvrir la porte. On relit donc
    // TOUTES les migrations — pas seulement la dernière — et on ne retient que les
    // concessions qui concernent CES fonctions (les `grant ... to authenticated`
    // portant sur d'autres fonctions, comme les générateurs de numéro d'avenant,
    // sont hors périmètre B6 et ne sont pas un défaut : elles sont invariantes
    // pour un utilisateur authentifié alors que le tenant y est déjà injecté).
    const dir = './supabase/migrations'
    const fautifs: string[] = []
    for (const fichier of readdirSync(dir).sort()) {
      if (!fichier.endsWith('.sql')) continue
      const texte = readFileSync(`${dir}/${fichier}`, 'utf-8')
      for (const c of texte.match(/grant[^;]*\bexecute\b[^;]*;/gi) ?? []) {
        if (!/espace_client_(append|consolider)/i.test(c)) continue
        // Ignore le GRANT attendu de la migration O3-B6 elle-même.
        if (fichier.startsWith('20260925_o3b6_')) continue
        if (/\bto\s+(public|anon|authenticated)\b/i.test(c)) fautifs.push(`${fichier}: ${c}`)
      }
    }
    expect(fautifs).toEqual([])
  })

  it('F1 — aucune migration ultérieure ne réinitialise les privilèges des deux fonctions', () => {
    // `create or replace function` CONSERVE l'ACL, mais `drop function` puis
    // `create function` la réinitialise au défaut `grant execute to public`.
    // On verrouille donc l'ordre : rien après la migration O3-B6 ne touche à ces
    // fonctions, et aucune migration ne les supprime.
    const migrations = readdirSync('./supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const indexB6 = migrations.findIndex((f) => f.startsWith('20260925_o3b6_'))
    expect(indexB6).toBeGreaterThan(-1)

    for (const fichier of migrations) {
      const texte = readFileSync(`./supabase/migrations/${fichier}`, 'utf-8')
      expect(texte, `${fichier} ne doit pas supprimer espace_client_append/consolider`).not.toMatch(
        /drop\s+function[^;]*espace_client_(append|consolider)/i
      )
      if (migrations.indexOf(fichier) <= indexB6) continue
      // Une redéfinition ultérieure serait inoffensive (ACL conservée) mais
      // ferait diverger le comportement testé ici : on la signale donc.
      expect(texte, `${fichier} redéfinit une fonction espace_client_* après la migration O3-B6`).not.toMatch(
        /create\s+(or\s+replace\s+)?function\s+public\.espace_client_(append|consolider)/i
      )
    }
  })

  it('F2 — append : le tenant est déduit du chantier, jamais reçu de l\'appelant', () => {
    const corps = b6.slice(
      b6.indexOf('create or replace function public.espace_client_append'),
      b6.indexOf('create or replace function public.espace_client_consolider')
    )
    // Aucune signature ne gagne de paramètre tenant (consigne GO : prévoirlait
    // `p_entreprise_id` seulement si strictement nécessaire — ce n'est pas le cas).
    expect(corps).not.toContain('p_entreprise_id')
    expect(corps).toContain('if p_chantier_id is null then')
    expect(coresOuRaise(corps, 'chantier introuvable ou sans entreprise')).toBe(true)
    expect(corps).toContain('from public.chantiers c')
    expect(corps).toContain('where c.id = p_chantier_id')
  })

  it('F2 — append : cohérence chantier_id ET entreprise_id sur la ligne existante', () => {
    const corps = b6.slice(
      b6.indexOf('create or replace function public.espace_client_append'),
      b6.indexOf('create or replace function public.espace_client_consolider')
    )
    // Le contrôle DOIT précéder l'insert, sinon la branche
    // `on conflict (cle) do update` peut écraser une conversation étrangère.
    const posControle = corps.indexOf('v_existante.chantier_id is distinct from p_chantier_id')
    const posInsert = corps.indexOf('insert into public.espace_client_conversations')
    expect(posControle).toBeGreaterThan(-1)
    expect(posInsert).toBeGreaterThan(-1)
    expect(posControle).toBeLessThan(posInsert)

    expect(corps).toContain('or v_existante.entreprise_id is distinct from v_entreprise then')
    expect(coresOuRaise(corps, 'cle deja utilisee par un autre chantier')).toBe(true)
    // La lecture de la ligne existante est verrouillée par le même advisory lock
    // que l'écriture, sinon deux appels concurrents pourraient passer entre la
    // lecture et l'insert.
    expect(corps.indexOf('pg_advisory_xact_lock')).toBeLessThan(corps.indexOf('select * into v_existante'))
  })

  it('F2 — consolider : la ligne ciblée est confrontée à son chantier parent', () => {
    const corps = b6.slice(b6.indexOf('create or replace function public.espace_client_consolider'))
    expect(corps).not.toContain('p_entreprise_id')
    expect(coresOuRaise(corps, 'conversation sans chantier')).toBe(true)
    expect(coresOuRaise(corps, 'incoherence entreprise conversation')).toBe(true)
    expect(corps).toContain('where c.id = v_ligne.chantier_id')
    expect(corps).toContain('v_entreprise is distinct from v_ligne.entreprise_id')
    // Le refus doit précéder TOUTE écriture : ni resume_global, ni resumes_sessions,
    // ni purge de messages_session.
    const posGarde = corps.indexOf("v_ligne.chantier_id is null then")
    const posUpdate = corps.indexOf('update public.espace_client_conversations')
    expect(posGarde).toBeGreaterThan(-1)
    expect(posUpdate).toBeGreaterThan(-1)
    expect(posGarde).toBeLessThan(posUpdate)
  })

  it('aucune modification de table, donnée, RLS ou trigger hors des deux fonctions', () => {
    // Périmètre strict : au niveau TOP-LEVEL, la migration ne doit contenir que
    // des REVOKE/GRANT et des `create or replace function`. Le corps des
    // fonctions ($$ … $$) est retiré avant l'analyse — l'`insert`/`update` qui s'y
    // trouvent sont le comportement même des RPC, pas un DML de migration.
    const instructions = corpsSansComments( corpsHorsDollarQuoting(b6) )
    const interdites = [
      /^insert\b/,
      /^update\b/,
      /^delete\b/,
      /^truncate\b/,
      /^drop\b/,
      /^alter\b/,
      /^create table\b/,
      /^create policy\b/,
      /^create trigger\b/,
      /^create index\b/,
      /^grant\b(?! execute on function)/,
    ]
    for (const ligne of instructions) {
      for (const motif of interdites) {
        expect(ligne, `instruction interdite : ${ligne}`).not.toMatch(motif)
      }
    }
    expect(instructions.filter((l) => l.startsWith('create or replace function')).length).toBe(2)
    expect(instructions.filter((l) => l.startsWith('revoke all on function')).length).toBe(6)
    expect(instructions.filter((l) => l.startsWith('grant execute on function')).length).toBe(2)
  })

  it('la migration de création 20260912 est laissée INTACTE (non modifiée)', () => {
    // La correction est une migration nouvelle et additive : réécrire l'historique
    // rendrait le diff ininterprétable et le déploiement non rejouable.
    const origin = readFileSync(
      './supabase/migrations/20260912_espace_client_conversations.sql',
      'utf-8'
    )
    expect(origin).toContain('create or replace function public.espace_client_append')
    // L'original ne doit PAS contenir les gardes O3-B6 : ceux-ci vivent uniquement
    // dans la migration dédiée, sinon le test ne prouverait rien sur le fait que
    // la nouvelle version est bien celle qui s'applique en dernier.
    expect(origin).not.toContain('cle deja utilisee par un autre chantier')
    expect(origin).not.toContain('incoherence entreprise conversation')
    expect(origin).not.toMatch(/revoke all on function public\.espace_client_(append|consolider)/i)
  })
})

function corpsSansComments(sql: string): string[] {
  return sql
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('--'))
}

// Retire le contenu des littéraux dollar-quotés (`$$ … $$`) : ce qui reste
// n'est que le SQL de niveau supérieur, les seuls ordres réellement exécutés
// par la migration en dehors du corps des fonctions.
function corpsHorsDollarQuoting(sql: string): string {
  return sql
    .split('$$')
    .filter((_segment, i) => i % 2 === 0)
    .join('\n;\n')
}

function coresOuRaise(corps: string, fragment: string): boolean {
  // Postgres n'accepte pas d'apostrophe droite dans un message d'exception sans
  // guillemets doubles : on vérifie donc la présence du fragment dans un `raise`.
  return new RegExp(`raise\\s+exception\\s+'[^']*${fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(
    corps
  )
}