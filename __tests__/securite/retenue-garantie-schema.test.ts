// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_SCHEMA_PATH = join(
  process.cwd(),
  'supabase/migrations/20261008_retenue_garantie_schema.sql'
);
const MIGRATION_RPC_PATH = join(
  process.cwd(),
  'supabase/migrations/20261008_liberer_retenue_rpc.sql'
);

describe('Phase 1 — Migrations SQL Retenue de Garantie & Réserves', () => {
  it('1.1 — Les deux fichiers de migration existent sur le disque', () => {
    expect(existsSync(MIGRATION_SCHEMA_PATH)).toBe(true);
    expect(existsSync(MIGRATION_RPC_PATH)).toBe(true);
  });

  describe('1.2 — Extension de la table factures (Immuabilité & Rétrocompatibilité)', () => {
    const sql = readFileSync(MIGRATION_SCHEMA_PATH, 'utf-8');

    it('ajoute les 4 colonnes nécessaires avec valeurs par défaut neutres', () => {
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS retenue_garantie_pct numeric(5,2) NOT NULL DEFAULT 0.00');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS montant_retenue_ht numeric(12,2) NOT NULL DEFAULT 0.00');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS montant_retenue_ttc numeric(12,2) NOT NULL DEFAULT 0.00');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS net_a_payer_ttc numeric(12,2) NOT NULL DEFAULT 0.00');
    });

    it('verrouille le plafond légal BTP à 5.00 % sur factures (Loi 71-584)', () => {
      expect(sql).toContain('chk_factures_rg_pct_range');
      expect(sql).toMatch(/retenue_garantie_pct\s*>=\s*0\.00\s+AND\s+retenue_garantie_pct\s*<=\s*5\.00/i);
    });

    it('garantit la positivité de montant_retenue_ht, montant_retenue_ttc et net_a_payer_ttc', () => {
      expect(sql).toContain('chk_factures_rg_ht_pos');
      expect(sql).toContain('montant_retenue_ht >= 0.00');
      expect(sql).toContain('chk_factures_rg_ttc_pos');
      expect(sql).toContain('montant_retenue_ttc >= 0.00');
      expect(sql).toContain('chk_factures_net_a_payer_pos');
      expect(sql).toContain('net_a_payer_ttc >= 0.00');
    });

    it('ne modifie aucunement les colonnes existantes de factures', () => {
      expect(sql).not.toMatch(/ALTER TABLE.*factures.*DROP COLUMN/i);
      expect(sql).not.toMatch(/ALTER TABLE.*factures.*ALTER COLUMN.*id/i);
      expect(sql).not.toMatch(/ALTER TABLE.*factures.*ALTER COLUMN.*numero/i);
    });
  });

  describe('1.3 — Table chantier_retenues_garantie & Invariants Mathématiques', () => {
    const sql = readFileSync(MIGRATION_SCHEMA_PATH, 'utf-8');

    it('définit la table avec les clés étrangères et contraintes nécessaires', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.chantier_retenues_garantie');
      expect(sql).toContain('entreprise_id                 uuid          NOT NULL REFERENCES public.entreprises(id)');
      expect(sql).toContain('chantier_id                   uuid          NOT NULL REFERENCES public.chantiers(id)');
      expect(sql).toContain('devis_id                      uuid          REFERENCES public.devis(id)');
      expect(sql).toContain('UNIQUE (chantier_id)');
    });

    it('verrouille le plafond de retenue contractuelle à 5.00 % (chk_crg_taux_plafond)', () => {
      expect(sql).toContain('chk_crg_taux_plafond');
      expect(sql).toMatch(/taux_applicable_pct\s*>=\s*0\.00\s+AND\s+taux_applicable_pct\s*<=\s*5\.00/i);
    });

    it('garantit la non-négativité des cumuls et soldes (>= 0)', () => {
      expect(sql).toContain('chk_crg_retenu_ht_pos');
      expect(sql).toContain('montant_retenu_cumule_ht >= 0.00');
      expect(sql).toContain('chk_crg_retenu_ttc_pos');
      expect(sql).toContain('montant_retenu_cumule_ttc >= 0.00');
      expect(sql).toContain('chk_crg_libere_ttc_pos');
      expect(sql).toContain('montant_libere_cumule_ttc >= 0.00');
      expect(sql).toContain('chk_crg_restant_ttc_pos');
      expect(sql).toContain('montant_restant_a_liberer_ttc >= 0.00');
    });

    it('verrouille l invariant : montant_libere_cumule_ttc <= montant_retenu_cumule_ttc', () => {
      expect(sql).toContain('chk_crg_libere_lte_retenu');
      expect(sql).toContain('montant_libere_cumule_ttc <= montant_retenu_cumule_ttc');
    });

    it('verrouille l égalité exacte : restant = retenu - libere (chk_crg_restant_exact)', () => {
      expect(sql).toContain('chk_crg_restant_exact');
      expect(sql).toMatch(/montant_restant_a_liberer_ttc\s*=\s*\(montant_retenu_cumule_ttc\s*-\s*montant_libere_cumule_ttc\)/i);
    });

    it('encadre strictement les statuts et types de garantie valides', () => {
      expect(sql).toContain('chk_crg_type_garantie');
      expect(sql).toContain("'retenue_financiere', 'caution_bancaire', 'garantie_premiere_demande'");
      expect(sql).toContain('chk_crg_statut');
      expect(sql).toContain("'en_constitution', 'bloquee_avec_reserves', 'liberable', 'liberee_partiellement', 'liberee_totalement'");
    });
  });

  describe('1.4 — Table retenues_liberations (Journal d audit immuable)', () => {
    const sql = readFileSync(MIGRATION_SCHEMA_PATH, 'utf-8');

    it('définit la table avec clé vers le compte, le chantier et le PV', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.retenues_liberations');
      expect(sql).toContain('retenue_id        uuid          NOT NULL REFERENCES public.chantier_retenues_garantie(id)');
      expect(sql).toContain('chantier_id       uuid          NOT NULL REFERENCES public.chantiers(id)');
      expect(sql).toContain('pv_reception_id   uuid          REFERENCES public.pv_receptions(id)');
    });

    it('impose des montants libérés strictement positifs', () => {
      expect(sql).toContain('chk_rl_montant_ht_strict_pos');
      expect(sql).toContain('montant_libere_ht > 0.00');
      expect(sql).toContain('chk_rl_montant_ttc_strict_pos');
      expect(sql).toContain('montant_libere_ttc > 0.00');
    });

    it('encadre les motifs légaux de libération', () => {
      expect(sql).toContain('chk_rl_motif');
      expect(sql).toContain("'levee_reserves', 'echeance_1_an_gpa', 'accord_amiable', 'substitution_caution'");
    });
  });

  describe('1.5 — Triggers & Moteur de Consolidation', () => {
    const sql = readFileSync(MIGRATION_SCHEMA_PATH, 'utf-8');

    it('associe le trigger tg_auto_entreprise sur les deux nouvelles tables', () => {
      expect(sql).toContain("'chantier_retenues_garantie'");
      expect(sql).toContain("'retenues_liberations'");
      expect(sql).toContain('CREATE TRIGGER tg_auto_entreprise BEFORE INSERT ON public.%I');
      expect(sql).toContain('public.tg_set_entreprise_par_chantier()');
    });

    it('exécute tg_recalculer_retenue_chantier sur factures', () => {
      expect(sql).toContain('tg_factures_consolider_retenue');
      expect(sql).toContain('AFTER INSERT OR UPDATE OF chantier_id, statut, montant_retenue_ht, montant_retenue_ttc OR DELETE');
      expect(sql).toContain('ON public.factures');
    });

    it('filtre strictement pour exclure factures annulées et brouillons du cumul', () => {
      expect(sql).toMatch(/WHERE chantier_id = v_chantier_id\s+AND statut IN \('envoyee', 'payee'\)/i);
    });

    it('ne reconstruit ni n écrase JAMAIS montant_libere_cumule_ttc dans le trigger', () => {
      // Le trigger lit v_libere_ttc et met à jour uniquement retenu_cumule et restant
      expect(sql).toMatch(/SELECT montant_libere_cumule_ttc\s+INTO v_libere_ttc/i);
      expect(sql).toMatch(/v_restant_ttc := v_cumul_ttc - v_libere_ttc/i);
      expect(sql).not.toMatch(/UPDATE public\.chantier_retenues_garantie[\s\S]*SET[\s\S]*montant_libere_cumule_ttc\s*=/i);
    });

    it('rejette formellement toute modification/annulation rendant la retenue inférieure à ce qui est déjà libéré', () => {
      expect(sql).toMatch(/IF v_cumul_ttc < v_libere_ttc THEN/i);
      expect(sql).toContain('RAISE EXCEPTION');
    });

    it('gère le déplacement de facture Chantier A → Chantier B en recalculant les deux chantiers', () => {
      // Détection de l'invariance OLD.chantier_id IS DISTINCT FROM NEW.chantier_id
      expect(sql).toMatch(/ELSIF TG_OP = 'UPDATE' AND \(OLD\.chantier_id IS DISTINCT FROM NEW\.chantier_id\) THEN/i);
      expect(sql).toContain('v_chantiers := ARRAY[OLD.chantier_id, NEW.chantier_id];');
      expect(sql).toContain('FOREACH v_chantier_id IN ARRAY v_chantiers LOOP');
    });
  });

  describe('1.6 — RLS & Protection Anti-Falsification Frontend', () => {
    const sql = readFileSync(MIGRATION_SCHEMA_PATH, 'utf-8');

    it('active le RLS sur les deux tables', () => {
      expect(sql).toContain('ALTER TABLE public.chantier_retenues_garantie ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.retenues_liberations ENABLE ROW LEVEL SECURITY;');
    });

    it('scinde la lecture par tenant via public.entreprise_courante()', () => {
      expect(sql).toContain('CREATE POLICY crg_ent_select ON public.chantier_retenues_garantie');
      expect(sql).toContain('USING (entreprise_id = public.entreprise_courante())');
      expect(sql).toContain('CREATE POLICY rl_ent_select ON public.retenues_liberations');
      expect(sql).toContain('USING (entreprise_id = public.entreprise_courante())');
    });

    it('interdit l écriture directe (INSERT/UPDATE/DELETE) au frontend sur les cumuls', () => {
      expect(sql).toContain('CREATE POLICY crg_ent_insert ON public.chantier_retenues_garantie');
      expect(sql).toContain('FOR INSERT WITH CHECK (false);');
      expect(sql).toContain('CREATE POLICY crg_ent_update ON public.chantier_retenues_garantie');
      expect(sql).toContain('FOR UPDATE USING (false);');
      expect(sql).toContain('CREATE POLICY crg_ent_delete ON public.chantier_retenues_garantie');
      expect(sql).toContain('FOR DELETE USING (false);');
    });

    it('rend la table retenues_liberations immuable pour le frontend', () => {
      expect(sql).toContain('CREATE POLICY rl_ent_insert ON public.retenues_liberations');
      expect(sql).toContain('FOR INSERT WITH CHECK (false);');
      expect(sql).toContain('CREATE POLICY rl_ent_update ON public.retenues_liberations');
      expect(sql).toContain('FOR UPDATE USING (false);');
      expect(sql).toContain('CREATE POLICY rl_ent_delete ON public.retenues_liberations');
      expect(sql).toContain('FOR DELETE USING (false);');
    });
  });

  describe('1.7 — RPC de Libération Transactionnelle (liberer_retenue_garantie_rpc)', () => {
    const sql = readFileSync(MIGRATION_RPC_PATH, 'utf-8');

    it('est déclarée avec SECURITY DEFINER et search_path sécurisé', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.liberer_retenue_garantie_rpc');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('SET search_path = public, pg_temp');
    });

    it('vérifie le contexte tenant via public.entreprise_courante()', () => {
      expect(sql).toContain('v_entreprise_id := public.entreprise_courante();');
      expect(sql).toContain("RAISE EXCEPTION 'contexte entreprise manquant'");
    });

    it('verrouille la ligne de retenue avec FOR UPDATE', () => {
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain('WHERE chantier_id = p_chantier_id');
      expect(sql).toContain('AND entreprise_id = v_entreprise_id');
    });

    it('refuse tout montant supérieur au solde restant à libérer', () => {
      expect(sql).toContain('IF p_montant_ttc > v_crg.montant_restant_a_liberer_ttc THEN');
      expect(sql).toContain('RAISE EXCEPTION');
    });

    it('rejette formellement le motif levee_reserves si p_pv_reception_id est NULL', () => {
      expect(sql).toContain("IF p_motif = 'levee_reserves' AND p_pv_reception_id IS NULL THEN");
      expect(sql).toContain("RAISE EXCEPTION 'un pv de reception valide est obligatoire pour le motif levee_reserves'");
    });

    it('accepte le motif levee_reserves uniquement si le statut du PV est sans_reserve ou reserves_levees', () => {
      expect(sql).toContain("v_pv_statut NOT IN ('sans_reserve', 'reserves_levees')");
    });

    it('rejette le motif levee_reserves si le statut du PV est invalide (avec_reserves ou refuse)', () => {
      expect(sql).toContain("RAISE EXCEPTION 'impossible de liberer au motif de levee_reserves : le pv est actuellement %'");
    });

    it('insère dans le journal d audit et met à jour les cumuls libéré et restant', () => {
      expect(sql).toContain('INSERT INTO public.retenues_liberations');
      expect(sql).toContain('UPDATE public.chantier_retenues_garantie');
      expect(sql).toContain('montant_libere_cumule_ttc     = v_nouveau_libere');
      expect(sql).toContain('montant_restant_a_liberer_ttc = v_nouveau_restant');
    });

    it('accorde les droits uniquement à authenticated et service_role en révoquant public', () => {
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.liberer_retenue_garantie_rpc(uuid, numeric, text, uuid, text, text) FROM PUBLIC;');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.liberer_retenue_garantie_rpc(uuid, numeric, text, uuid, text, text) TO authenticated, service_role;');
    });
  });
});
