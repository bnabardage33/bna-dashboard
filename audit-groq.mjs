import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Grille tarifaire officielle Groq (On-Demand / Pay-As-You-Go)
const PRICING_MAP = {
  'llama-3.1-8b-instant': { input: '$0.05/1M', output: '$0.08/1M', tier: 'Gratuit (Quota 6k TPM)' },
  'openai/gpt-oss-20b': { input: '$0.075/1M', output: '$0.30/1M', tier: 'Gratuit (Quota 8k TPM)' },
  'openai/gpt-oss-120b': { input: '$0.15/1M', output: '$0.60/1M', tier: 'Gratuit (Quota 8k TPM)' },
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: '$0.11/1M', output: '$0.34/1M', tier: 'Gratuit (Quota 30k TPM)' },
  'qwen/qwen3.6-27b': { input: '$0.60/1M', output: '$3.00/1M', tier: 'Gratuit / Payant si hors quota' },
  'groq/compound-mini': { input: 'Variable', output: 'Variable', tier: 'Gratuit / Agentic' },
  'groq/compound': { input: 'Variable', output: 'Variable', tier: 'Gratuit (Quota 70k TPM)' },
  'whisper-large-v3-turbo': { input: '$0.04/heure', output: '-', tier: 'Gratuit (2000 req/jour)' },
  'meta-llama/llama-prompt-guard-2-22m': { input: '$0.03/1M', output: '$0.03/1M', tier: 'Gratuit / Security' },
  'meta-llama/llama-prompt-guard-2-86m': { input: '$0.04/1M', output: '$0.04/1M', tier: 'Gratuit / Security' }
};

async function auditModels() {
  try {
    const list = await groq.models.list();
    
    const audit = list.data.map(m => {
      const priceInfo = PRICING_MAP[m.id] || { input: 'Non listé', output: 'Non listé', tier: 'Standard' };
      return {
        'Modèle ID': m.id,
        'Coût Input': priceInfo.input,
        'Coût Output': priceInfo.output,
        'Statut / Quota': priceInfo.tier
      };
    });

    console.log("🔍 Audit de sécurité des modèles Groq :");
    console.table(audit);
    
    console.log("\n💡 Astuce : Tant que tu n'as pas entré de carte bancaire sur Groq Console, la facturation payante est IMPOSSIBLE. Tes requêtes seront simplement bloquées (Erreur 429) si tu dépasses les quotas gratuits.");

  } catch (err) {
    console.error("❌ Erreur d'audit :", err.message);
  }
}

auditModels();
