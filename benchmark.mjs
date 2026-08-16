import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import Groq from 'groq-sdk';
import Cerebras from '@cerebras/cerebras_cloud_sdk';

const groqApiKey = process.env.GROQ_API_KEY;
const cerebrasApiKey = process.env.CEREBRAS_API_KEY;

if (!groqApiKey || !cerebrasApiKey) {
  console.error("❌ Clés manquantes dans .env.local");
  process.exit(1);
}

const groq = new Groq({ apiKey: groqApiKey });
const cerebras = new Cerebras({ apiKey: cerebrasApiKey });

const PROMPT = "Génère une analyse au format JSON contenant 5 indicateurs de performance clés pour un dashboard de gestion de matériel et d'achats. Inclut des métriques chiffrées fictives et une courte recommandation pour chaque point.";

async function testProvider(name, fetchCall) {
  console.log(`\n--- Test de : ${name} ---`);
  const start = performance.now();
  let firstTokenTime = null;
  let text = '';
  let tokenCount = 0;

  try {
    const stream = await fetchCall();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        if (!firstTokenTime) {
          firstTokenTime = performance.now();
        }
        text += content;
        tokenCount++;
      }
    }

    const end = performance.now();
    const ttft = (firstTokenTime - start).toFixed(2);
    const totalTime = ((end - start) / 1000).toFixed(2);
    const tokensPerSec = (tokenCount / ((end - firstTokenTime) / 1000)).toFixed(2);

    console.log(`⏱️ Premier token (TTFT) : ${ttft} ms`);
    console.log(`⚡ Vitesse approximative : ${tokensPerSec} chunks/sec`);
    console.log(`🏁 Temps total           : ${totalTime} s`);
    console.log(`📄 Caractères générés   : ${text.length}`);
    
  } catch (error) {
    console.error(`❌ Erreur avec ${name}:`, error.message);
  }
}

async function runBenchmark() {
  console.log("🚀 Lancement du benchmark...");

  await testProvider("Groq (llama-3.3-70b-versatile)", () =>
    groq.chat.completions.create({
      messages: [{ role: "user", content: PROMPT }],
      model: "llama-3.3-70b-versatile",
      stream: true,
    })
  );

  await testProvider("Cerebras (gpt-oss-120b)", () =>
    cerebras.chat.completions.create({
      messages: [{ role: "user", content: PROMPT }],
      model: "gpt-oss-120b",
      stream: true,
    })
  );
}

runBenchmark();
