export default function UrssafPage() {
  const taux = [
    { label: "Cotisations sociales URSSAF", value: "21,20 %" },
    { label: "Contribution Formation Pro (CFP)", value: "0,30 %" },
    { label: "Taxe Frais Chambre Consulaire (TFCC)", value: "0,48 %" },
    { label: "Versement libératoire impôt (optionnel)", value: "1,70 %" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h1 className="text-xl font-semibold text-white">Taxes & URSSAF</h1>
        <p className="mt-2 text-sm text-slate-400">
          Calcul à connecter au chiffre d&apos;affaires encaissé. Taux de référence
          (micro-entreprise artisan) :
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {taux.map((row) => (
          <div
            key={row.label}
            className="rounded-xl border border-slate-700 bg-slate-800 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {row.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-white">{row.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-red-600/40 bg-slate-800 p-4">
        <p className="text-xs uppercase tracking-wide text-red-400">
          Total à déduire
        </p>
        <p className="mt-1 text-lg font-semibold text-white">
          21,98 % sans option impôt · 23,68 % avec option impôt
        </p>
      </div>
    </div>
  );
}
