export default function MeteoPage() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
      <h1 className="text-xl font-semibold text-white">Météo & Alertes</h1>
      <p className="mt-2 text-sm text-slate-400">
        Cartes chantiers (vert / orange / rouge) avec rafales de vent — à connecter
        au moteur de règles météo/sécurité (matériau × moyen d&apos;accès).
      </p>
    </div>
  );
}
