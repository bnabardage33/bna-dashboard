const fetch = require('node-fetch');

async function test() {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: "Bearer " + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: 'groq/compound-mini',
      messages: [
        {
          role: 'system',
          content: "Tu es un expert métreur en bâtiment (spécialisé en bardage, isolation thermique par l'extérieur, menuiserie). Le client va dicter un besoin de chantier. Tu dois décomposer sa demande en PLUSIEURS lignes de devis distinctes (ex: séparer le bardage, l'échafaudage, la nacelle, etc.). \nFormat attendu STRICTEMENT : un TABLEAU JSON contenant les lignes : [{ \"designation\": \"Titre court\", \"description\": \"Détail technique\", \"qte\": 1, \"unite\": \"forfait\", \"pu_ht\": 100 }]. Renvoie UNIQUEMENT le tableau JSON valide, sans markdown, sans explication."
        },
        { role: 'user', content: '50m2 de bardage bois et 3 echafaudages' },
      ],
      temperature: 0.2,
    }),
  });
  const text = await res.text();
  console.log(text);
}
test();
