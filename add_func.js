const fs = require('fs');
let code = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const iaFunc = `
  async function genererSecuriteIA() {
    setIsGeneratingSecurite(true);
    const contexte = \`Chantier: \${chantier?.nom}\\nMatériau: \${LABELS_MATERIAU[chantier?.materiau_structurel || "bois"]}\\nMoyen d'accès: \${LABELS_ACCES[chantier?.moyen_acces || "pied"]}\\nZone vent: \${chantier?.zone_vent}\`;
    
    try {
      const res = await fetch("/api/ia-securite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contexte }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const data = await res.json();
      setConsignesSecurite(data.texte);
    } catch (err) {
      alert("Impossible de générer les consignes.");
    } finally {
      setIsGeneratingSecurite(false);
    }
  }
`;

code = code.replace(
  '  const fetchChantier = useCallback(async () => {',
  iaFunc + '\n  const fetchChantier = useCallback(async () => {'
);
fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', code);
