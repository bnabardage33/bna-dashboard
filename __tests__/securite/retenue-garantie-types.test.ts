// @vitest-environment node
import { describe, it, expectTypeOf } from 'vitest';
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/supabase';
import type {
  ChantierRetenueGarantie,
  RetenueLiberation,
  StatutRetenueGarantie,
  TypeGarantieBTP,
  MotifLiberationRetenue,
  LibererRetenueResult,
  FactureFinance,
} from '@/types/finance';

describe('Phase 2 — Synchronisation des Types TypeScript (Retenue de Garantie & Réserves)', () => {
  describe('2.1 — Types Supabase : factures', () => {
    it('factures Row inclut les 4 nouvelles colonnes de retenue de garantie', () => {
      type FactureRow = Database['public']['Tables']['factures']['Row'];
      expectTypeOf<FactureRow['montant_retenue_ht']>().toEqualTypeOf<number>();
      expectTypeOf<FactureRow['montant_retenue_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<FactureRow['net_a_payer_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<FactureRow['retenue_garantie_pct']>().toEqualTypeOf<number>();
    });

    it('factures Insert permet d omettre les nouvelles colonnes (default SQL)', () => {
      type FactureInsert = Database['public']['Tables']['factures']['Insert'];
      expectTypeOf<FactureInsert['montant_retenue_ht']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureInsert['montant_retenue_ttc']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureInsert['net_a_payer_ttc']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureInsert['retenue_garantie_pct']>().toEqualTypeOf<number | undefined>();
    });

    it('factures Update permet la mise à jour typée des nouvelles colonnes', () => {
      type FactureUpdate = Database['public']['Tables']['factures']['Update'];
      expectTypeOf<FactureUpdate['montant_retenue_ht']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureUpdate['montant_retenue_ttc']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureUpdate['net_a_payer_ttc']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureUpdate['retenue_garantie_pct']>().toEqualTypeOf<number | undefined>();
    });
  });

  describe('2.2 — Types Supabase : chantier_retenues_garantie', () => {
    type CRGRow = Tables<'chantier_retenues_garantie'>;
    type CRGInsert = TablesInsert<'chantier_retenues_garantie'>;
    type CRGUpdate = TablesUpdate<'chantier_retenues_garantie'>;

    it('Row possède tous les champs du registre de chantier', () => {
      expectTypeOf<CRGRow['id']>().toEqualTypeOf<string>();
      expectTypeOf<CRGRow['entreprise_id']>().toEqualTypeOf<string>();
      expectTypeOf<CRGRow['chantier_id']>().toEqualTypeOf<string>();
      expectTypeOf<CRGRow['devis_id']>().toEqualTypeOf<string | null>();
      expectTypeOf<CRGRow['taux_applicable_pct']>().toEqualTypeOf<number>();
      expectTypeOf<CRGRow['type_garantie']>().toEqualTypeOf<string>();
      expectTypeOf<CRGRow['caution_organisme']>().toEqualTypeOf<string | null>();
      expectTypeOf<CRGRow['caution_reference']>().toEqualTypeOf<string | null>();
      expectTypeOf<CRGRow['caution_date_acte']>().toEqualTypeOf<string | null>();
      expectTypeOf<CRGRow['montant_retenu_cumule_ht']>().toEqualTypeOf<number>();
      expectTypeOf<CRGRow['montant_retenu_cumule_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<CRGRow['montant_libere_cumule_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<CRGRow['montant_restant_a_liberer_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<CRGRow['statut']>().toEqualTypeOf<string>();
      expectTypeOf<CRGRow['date_derniere_liberation']>().toEqualTypeOf<string | null>();
      expectTypeOf<CRGRow['observations']>().toEqualTypeOf<string | null>();
      expectTypeOf<CRGRow['created_at']>().toEqualTypeOf<string>();
      expectTypeOf<CRGRow['updated_at']>().toEqualTypeOf<string>();
    });

    it('Insert exige entreprise_id et chantier_id tout en rendant les cumuls optionnels', () => {
      expectTypeOf<CRGInsert['entreprise_id']>().toEqualTypeOf<string>();
      expectTypeOf<CRGInsert['chantier_id']>().toEqualTypeOf<string>();
      expectTypeOf<CRGInsert['id']>().toEqualTypeOf<string | undefined>();
      expectTypeOf<CRGInsert['montant_retenu_cumule_ttc']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<CRGInsert['montant_restant_a_liberer_ttc']>().toEqualTypeOf<number | undefined>();
    });

    it('Update rend tous les champs optionnels', () => {
      expectTypeOf<CRGUpdate['statut']>().toEqualTypeOf<string | undefined>();
      expectTypeOf<CRGUpdate['observations']>().toEqualTypeOf<string | null | undefined>();
    });
  });

  describe('2.3 — Types Supabase : retenues_liberations', () => {
    type RLRow = Tables<'retenues_liberations'>;
    type RLInsert = TablesInsert<'retenues_liberations'>;
    type RLUpdate = TablesUpdate<'retenues_liberations'>;

    it('Row possède tous les champs du journal immuable', () => {
      expectTypeOf<RLRow['id']>().toEqualTypeOf<string>();
      expectTypeOf<RLRow['entreprise_id']>().toEqualTypeOf<string>();
      expectTypeOf<RLRow['retenue_id']>().toEqualTypeOf<string>();
      expectTypeOf<RLRow['chantier_id']>().toEqualTypeOf<string>();
      expectTypeOf<RLRow['pv_reception_id']>().toEqualTypeOf<string | null>();
      expectTypeOf<RLRow['montant_libere_ht']>().toEqualTypeOf<number>();
      expectTypeOf<RLRow['montant_libere_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<RLRow['date_liberation']>().toEqualTypeOf<string>();
      expectTypeOf<RLRow['motif']>().toEqualTypeOf<string>();
      expectTypeOf<RLRow['utilisateur_id']>().toEqualTypeOf<string | null>();
      expectTypeOf<RLRow['document_ref']>().toEqualTypeOf<string | null>();
      expectTypeOf<RLRow['observations']>().toEqualTypeOf<string | null>();
      expectTypeOf<RLRow['created_at']>().toEqualTypeOf<string>();
    });

    it('Insert exige les identifiants clés et les montants libérés', () => {
      expectTypeOf<RLInsert['entreprise_id']>().toEqualTypeOf<string>();
      expectTypeOf<RLInsert['retenue_id']>().toEqualTypeOf<string>();
      expectTypeOf<RLInsert['chantier_id']>().toEqualTypeOf<string>();
      expectTypeOf<RLInsert['montant_libere_ht']>().toEqualTypeOf<number>();
      expectTypeOf<RLInsert['montant_libere_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<RLInsert['id']>().toEqualTypeOf<string | undefined>();
    });

    it('Update supporte les champs optionnels', () => {
      expectTypeOf<RLUpdate['observations']>().toEqualTypeOf<string | null | undefined>();
    });
  });

  describe('2.4 — Types Supabase : RPC liberer_retenue_garantie_rpc', () => {
    type RPC = Database['public']['Functions']['liberer_retenue_garantie_rpc'];

    it('exige p_chantier_id, p_montant_ttc et p_motif dans les arguments', () => {
      expectTypeOf<RPC['Args']['p_chantier_id']>().toEqualTypeOf<string>();
      expectTypeOf<RPC['Args']['p_montant_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<RPC['Args']['p_motif']>().toEqualTypeOf<string>();
    });

    it('rend p_pv_reception_id, p_observations et p_document_ref optionnels', () => {
      expectTypeOf<RPC['Args']['p_pv_reception_id']>().toEqualTypeOf<string | null | undefined>();
      expectTypeOf<RPC['Args']['p_observations']>().toEqualTypeOf<string | null | undefined>();
      expectTypeOf<RPC['Args']['p_document_ref']>().toEqualTypeOf<string | null | undefined>();
    });

    it('retourne un Json structuré', () => {
      expectTypeOf<RPC['Returns']>().not.toBeNever();
    });
  });

  describe('2.5 — Types Métier Finance (types/finance.ts)', () => {
    it('StatutRetenueGarantie couvre les 5 états métier', () => {
      type S = StatutRetenueGarantie;
      const s1: S = 'en_constitution';
      const s2: S = 'bloquee_avec_reserves';
      const s3: S = 'liberable';
      const s4: S = 'liberee_partiellement';
      const s5: S = 'liberee_totalement';
      expectTypeOf(s1).toMatchTypeOf<S>();
      expectTypeOf(s2).toMatchTypeOf<S>();
      expectTypeOf(s3).toMatchTypeOf<S>();
      expectTypeOf(s4).toMatchTypeOf<S>();
      expectTypeOf(s5).toMatchTypeOf<S>();
    });

    it('TypeGarantieBTP couvre la retenue et les cautions', () => {
      type T = TypeGarantieBTP;
      const t1: T = 'retenue_financiere';
      const t2: T = 'caution_bancaire';
      const t3: T = 'garantie_premiere_demande';
      expectTypeOf(t1).toMatchTypeOf<T>();
      expectTypeOf(t2).toMatchTypeOf<T>();
      expectTypeOf(t3).toMatchTypeOf<T>();
    });

    it('MotifLiberationRetenue couvre les motifs légaux reconnus', () => {
      type M = MotifLiberationRetenue;
      const m1: M = 'levee_reserves';
      const m2: M = 'echeance_1_an_gpa';
      const m3: M = 'accord_amiable';
      const m4: M = 'substitution_caution';
      expectTypeOf(m1).toMatchTypeOf<M>();
      expectTypeOf(m2).toMatchTypeOf<M>();
      expectTypeOf(m3).toMatchTypeOf<M>();
      expectTypeOf(m4).toMatchTypeOf<M>();
    });

    it('ChantierRetenueGarantie et RetenueLiberation sont pleinement exploitables', () => {
      expectTypeOf<ChantierRetenueGarantie['statut']>().toEqualTypeOf<StatutRetenueGarantie>();
      expectTypeOf<ChantierRetenueGarantie['type_garantie']>().toEqualTypeOf<TypeGarantieBTP>();
      expectTypeOf<RetenueLiberation['motif']>().toEqualTypeOf<MotifLiberationRetenue>();
    });

    it('LibererRetenueResult type fidèlement le retour de la RPC de libération', () => {
      expectTypeOf<LibererRetenueResult['success']>().toEqualTypeOf<boolean>();
      expectTypeOf<LibererRetenueResult['liberation_id']>().toEqualTypeOf<string>();
      expectTypeOf<LibererRetenueResult['montant_libere_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<LibererRetenueResult['montant_libere_ht']>().toEqualTypeOf<number>();
      expectTypeOf<LibererRetenueResult['nouveau_restant_ttc']>().toEqualTypeOf<number>();
      expectTypeOf<LibererRetenueResult['statut']>().toEqualTypeOf<StatutRetenueGarantie>();
    });

    it('FactureFinance accepte les champs optionnels de retenue de garantie', () => {
      expectTypeOf<FactureFinance['montant_retenue_ht']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureFinance['montant_retenue_ttc']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureFinance['net_a_payer_ttc']>().toEqualTypeOf<number | undefined>();
      expectTypeOf<FactureFinance['retenue_garantie_pct']>().toEqualTypeOf<number | undefined>();
    });
  });
});
