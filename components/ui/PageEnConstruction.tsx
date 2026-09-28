import Link from "next/link";

/**
 * PageEnConstruction — l'écran « cette section est en cours de construction ».
 *
 * Lot 2F-6. `app/bureau-etudes`, `app/chantiers` et `app/boite-a-outils`
 * étaient trois copies au caractère près d'un même fichier de 24 lignes : le
 * diff deux à deux ne signalait qu'UNE ligne, le `<h1>` portant le titre de la
 * section. Les 23 autres, dont la carte en verre et ses classes arbitraires
 * `bg-[linear-gradient(...)]` et `shadow-[inset_0_1px_1px_...,0_8px_32px_...]`,
 * étaient recopiées telles quelles. 72 lignes pour 23 lignes distinctes.
 *
 * La duplication est d'une autre nature que les familles écartées au LOT 2E,
 * où les variantes différaient sur 8 à 14 axes : une prop `variant` y aurait
 * porté la liste des classes recopiées. Ici la classe d'habillage est constante
 * et le seul écart entre les trois occurrences est le contenu du titre, donc la
 * prop `titre` n'expose rien d'autre. C'est la seule duplication stricte du
 * dépôt.
 *
 * Ce que l'extraction élimine : deux copies redondantes des 23 lignes de JSX et
 * des 43 jetons de classe, et surtout trois points de modification au lieu d'un.
 * Ce qu'elle ne fait PAS : réduire le nombre de lignes. Le total passe de 72 à
 * 77, le composant coûtant 28 lignes de code (type de props, export, signature)
 * pour 23 lignes de JSX. Le gain est un gain de maintenance, pas un gain de
 * volume ; il est dit ici pour qu'on ne l'assimile pas à une réduction.
 *
 * `className` recopiés au caractère près : `text-[22px]`, `text-[14px]` et
 * `text-[13px]` restent hors du LOT 2F-1, qui ne couvre que 9, 10 et 11 px. Le
 * CSS émis est donc inchangé. Aucune prop `className` ni `children` : sur une
 * classe arbitraire de 200 caractères, accepter une surcharge rouvrirait la
 * porte à un habillage concurrent — contrainte assumée, comme pour
 * `FloatingActionButton`. Composant serveur : aucun des trois écrans n'a d'état
 * ni d'effet.
 *
 * Point relevé, hors périmètre : aucune de ces trois routes n'est liée depuis la
 * navigation. Le `Drawer` pointe vers `/bureau`, `/terrain/chantier` et
 * `/terrain/outils`, et il n'existe aucune autre occurrence de `/chantiers`,
 * `/bureau-etudes` ou `/boite-a-outils`. Ces écrans ne sont atteignables qu'en
 * tapant l'URL ; le rattachement est une décision de navigation, pas un
 * nettoyage esthétique, il n'est donc pas fait ici.
 */
export type ProprietesPageEnConstruction = {
  /** Titre de la section. Seule ligne qui différait entre les trois écrans. */
  titre: string;
};

export function PageEnConstruction({ titre }: ProprietesPageEnConstruction) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-3xl p-8 max-w-sm w-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="w-16 h-16 rounded-2xl bg-[#E30613]/15 border border-[#E30613]/20 flex items-center justify-center mx-auto mb-5">
          <span className="text-[#ff5a5a] text-2xl">🚧</span>
        </div>
        <h1 className="text-white font-black text-[22px] leading-tight">{titre}</h1>
        <p className="text-white/50 text-[14px] mt-2 leading-relaxed">
          Cette section est en cours de construction.
          <br />Elle sera bientôt disponible.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 bg-[#E30613] text-white font-bold text-[13px] px-5 py-3 rounded-2xl hover:bg-[#c50510] transition-all"
        >
          ← Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
