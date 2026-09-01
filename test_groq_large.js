const fetch = require('node-fetch');
async function test() {
  const catalogue = Array.from({length: 100}, (_, i) => ({designation: `Ouvrage ${i}`, description: `Desc ${i}`, unite: 'm2', pu_ht: 100}));
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
          content: "Prompt " + JSON.stringify(catalogue)
        },
        { role: 'user', content: 'test' },
      ],
      temperature: 0.2,
    }),
  });
  console.log(res.status);
  const text = await res.text();
  console.log(text);
}
test();
