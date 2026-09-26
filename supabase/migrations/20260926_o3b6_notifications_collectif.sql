-- O3-B6 / N1 — Notifications : modèle COLLECTIF par entreprise
-- ============================================================================
--
-- POURQUOI CETTE MIGRATION
--
-- `notifications` est la SEULE table du périmètre qui ait reçu des policies RLS
-- dérogatoires (part2 §5.1 l.27-39) :
--
--     using (entreprise_id = public.entreprise_courante()
--            and (destinataire_id is null or destinataire_id = auth.uid()))
--
-- Le correctif d'isolation « par entreprise + éventuellement par destinataire »
-- est structurellement INATTEIGNABLE sur la seconde clause :
--
--   * `notifications.destinataire_id` est déclaré
--     `references public.profiles(id)` (20260906_notifications.sql l.8) ;
--   * `profiles.id` est un uuid AUTONOME, sans colonne `user_id`
--     (types/supabase.ts:1940-1958) ;
--   * le schéma ne contient AUCUN pont vers `auth.users` : les trois autres
--     colonnes nommées `user_id` pointent toutes vers `profiles`
--     (`pointages`, `entreprise_membres` part1 l.73) ;
--   * `20260922_phase2a…` l.11-13 documente explicitement que
--     `profiles.id` N'EST PAS comparable à `auth.users.id`, et
--     `20260923_p1_29…` l.39 qualifie l'architecture de « deux systèmes
--     distincts ».
--
-- Donc `destinataire_id = auth.uid()` ne peut jamais être vrai : ce n'est pas
-- une clause « actuellement fausse », c'est une clause INVALIDE. Effet
-- observable : les notifications écrites par `lib/espace-chat-summary.server.ts`
-- (l.500, l.514) sont targeting un `profiles.id` puis deviennent INVISIBLES au
-- lecteur, qui est le seul à avoir le droit de les lire. La cloche affiche
-- « Aucune notification » alors que la ligne existe.
--
-- DÉCISION PRODUIT (arbitrage explicite, O3-B6)
--
-- Modèle retenu : NOTIFICATION COLLECTIVE, scopée par `entreprise_id`.
--   - AUCUN pont `profiles.user_id` n'est créé ;
--   - AUCUNE table d'état de lecture par utilisateur n'est créée ;
--   - AUCUNE nouvelle architecture d'identité n'est introduite.
--
-- Ce modèle est celui que le dépôt applique DÉJÀ à 2 des 3 notifications
-- produites en production, et il est cohérent avec le schéma existant :
--   - `commande_retard` : `destinataire_id` laissé à null par
--     `app/bureau/fournisseurs/page.tsx` (O3-B6/N9) ;
--   - `general` (seed part4 l.160) : `destinataire_id = null`, et son propre
--     message dit « Visible uniquement par le tenant TEST ».
-- Seul `client_alert` visait un profil ; il devient, comme les autres, une
-- notification de tenant.
--
-- La présente migration ESTELLE-MÊME SÛRE ? Oui, et l'élargissement est
-- borné : la nouvelle clause est STRICTEMENT une suppression de la seconde
-- moitié du prédicat. Elle ne retire ni `entreprise_id = entreprise_courante()`,
-- ni le RLS lui-même. Aucune ligne d'un autre tenant ne peut devenir lisible.
-- Elle rend en revanche lisibles à tous les utilisateurs du tenant les lignes
-- ciblées qui ne l'étaient pour personne jusqu'ici.
--
-- EFFET DE BORD ASSUMÉ SUR `lu`
--
-- `lu` est un booléen UNIQUE porté par la ligne (20260906 l.9) ; il n'existe
-- aucune table de lecture par utilisateur. Une notification collective marquée
-- lue par un utilisateur l'est donc pour tous les autres du tenant. C'est le
-- comportement attendu d'un modèle collectif et il est celui qui fonctionne
-- déjà aujourd'hui pour toutes les notifications à `destinataire_id = null`.
-- Le compteur de non-lus reste donc approximatif dès qu'un tenant compte
-- plusieurs utilisateurs — c'est une limite du schéma, hors périmètre ici.
--
-- IDEMPOTENCE
-- `drop policy if exists` puis `create policy` : réexécutable sans effet de bord.
-- Aucune donnée n'est écrite, aucune colonne n'est modifiée, aucun trigger
-- n'est créé. `service_role` contourne la RLS par défaut : les 2 insertions de
-- `lib/espace-chat-summary.server.ts` (supabaseAdmin) ne sont pas concernées.
-- ============================================================================

do $$
declare
  r record;
begin
  -- Retirer les 4 policies dérogatoires (parties l.27-39 de la part2) : le `if
  -- exists` suffit donc ; le `drop ... if exists` rend le script rejouable sur
  -- une base déjà migrée.
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
  loop
    execute format('drop policy if exists %I on public.notifications;', r.policyname);
  end loop;

  -- Modèle COLLECTIF : le seul critère est l'entreprise courante.
  execute 'create policy notifications_ent_select on public.notifications for select
           using (entreprise_id = public.entreprise_courante());';
  execute 'create policy notifications_ent_insert on public.notifications for insert
           with check (entreprise_id = public.entreprise_courante());';
  execute 'create policy notifications_ent_update on public.notifications for update
           using (entreprise_id = public.entreprise_courante())
           with check (entreprise_id = public.entreprise_courante());';
  execute 'create policy notifications_ent_delete on public.notifications for delete
           using (entreprise_id = public.entreprise_courante());';
end $$;

comment on column public.notifications.destinataire_id is
  'Modèle collectif O3-B6/N1 : colonne conservée à titre INFORMATIF uniquement. Elle ne filtre plus rien (policy notifications_ent_select). Ne pas y comte pour décider de la visibilité d''une notification, et ne pas l''utiliser comme adresse de livraison : aucun pont profiles <-> auth.users n''existe dans ce schéma.';

comment on table public.notifications is
  'Notifications collectives, scopées par entreprise_id via public.entreprise_courante() (O3-B6/N1). Les policies ne se fondent plus sur destinataire_id : le comparer à auth.uid() était invalide (destinataire_id -> profiles.id, profiles.id sans pont vers auth.users).';
