import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function testModel() {
  console.log("⏳ Test de openai/gpt-oss-20b...");
  const start = Date.now();

  try {
    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Réponds par "Modèle OK pour BNA" si tu reçois ce message.' }],
      model: 'openai/gpt-oss-20b',
      temperature: 0.1,
    });

    console.log(`✅ Réponse reçue en ${Date.now() - start} ms !`);
    console.log("💬 Message :", response.choices[0]?.message?.content);
  } catch (error) {
    console.error("❌ Erreur :", error.message || error);
  }
}

testModel();

