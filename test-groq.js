const fetch = require('node-fetch');
async function test() {
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_MODEL = 'llama3-8b-8192'; 
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: "Bearer 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",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: 'bonjour' }],
    }),
  });
  const text = await res.text();
  console.log(text);
}
test();
