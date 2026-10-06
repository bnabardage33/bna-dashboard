// __tests__/securite/_lecture-source.ts
//
// LECTURE DE SOURCES POUR TESTS STRUCTURELS
// =========================================
//
// Shared par `devis-id-tenant.test.ts`, `espace-client-signature.test.ts` et
// `signature-parcours-client.test.tsx`. Dupliqué dans chaque fichier, ce helper
// serait le premier endroit où une correction ne serait appliquée qu'à un seul
// exemplaire — et les tests structurels sont justement ceux dont l'échec est
// silencieux.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI UN VRAI SCANNER, ET NON DEUX REGEX
// ─────────────────────────────────────────────────────────────────────────────
//
// La version d'origine était :
//
//     src.replace(regexBloc, "").replace(regexLigne, "")
//
// Elle est FAUSSE, et le piège est concret : la première regex ouvre un bloc au
// premier couple SLASH-ASTERISK du fichier. Or un commentaire de ce dépôt
// contient la ligne
//
//     // aurait exposé TOUTES les routes `/api/devis/*`, dont `analyse`
//
// Le glob y fournit précisément ce couple. Le « bloc » englobe alors tout ce qui
// suit, jusqu'au premier couple ASTERISK-SLASH réel : quarante lignes plus bas,
// tout le bloc d'imports disparaissait SANS ERREUR. Un test structurel cherche
// alors un prédicat qui n'existe plus et passe au vert sur une route qui ne
// filtre plus rien. C'est exactement ce qui s'est produit : `sansCommentaires`
// gobait `from "../_garde-signature"`, et le défaut aurait pu passer inaperçu
// sur le fichier d'origine, dont les tests portaient sur des routes disparues.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE SECOND PIÈGE : UNE APOSTROPHE DANS DU TEXTE JSX
// ─────────────────────────────────────────────────────────────────────────────
//
// Remplacer le stripper par un scanner à la main ne suffit pas. Un scanner
// maison qui suit l'état du code tombe sur le MÊME genre de défaut, plus
// insidieux, sur les fichiers `.tsx` : le texte JSX est de la PROSE, et une
// apostrophe y est une apostrophe, pas un délimiteur de chaîne.
//
// Cas minimal reproduit sur ce dépôt :
//
//     return (
//       <p>
//         Signez aujourd'hui.
//       </p>
//     );
//     // pour des raisons techniques
//     const d = fetch("/autre");
//
// `aujourd'hui` ouvre un littéral `'` que rien ne referme dans le fichier. Tout
// ce qui suit — y compris les commentaires — est alors REPASSÉ TEL QUEL, comme
// si c'était du code.
//
// Ce n'est pas une bizarrerie de test : c'est un défaut qui rend le helper
// DANGEREUX. Un test qui affirme « la route ne contient pas `.eq("client_id")` »
// voit un commentaire qui le contient, et échoue à tort. Un test qui affirme
// « la route contient telle garde » peut être satisfait par la PROSE d'un
// commentaire. Dans les deux cas le test porte sur autre chose que sur le code.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA CORRECTION : LE SCANNER DE TYPESCRIPT, LUI-MÊME
// ─────────────────────────────────────────────────────────────────────────────
//
// `typescript` est déjà une dépendance : il n'y a rien à ajouter. Son scanner
// lexical sait ce qu'est un littéral, une expression régulière, un littéral
// modèle et — en variante JSX — du texte JSX. Il est donc incapable de se
// désynchroniser sur l'une ou l'autre.
//
// Ce qui reste à faire, c'est remplacer le texte de chaque jeton non
// commentaire, en PRÉSERVANT les retours à la ligne : sinon tous les numéros de
// ligne des tests seraient décalés par rapport aux sources.
//
// `jsx: true` est un CHOIX EXPLICITE, jamais une déduction. En mode TS, un
// chevron est un chevron ; en mode JSX, c'est une balise. Se tromper de variante
// sur un fichier `.tsx` relit du JSX comme de l'arithmétique, et l'erreur
// inverse — sur un `.ts` contenant `<T>` — ferait de la comparaison une
// ouverture de balise. Les appelants qui lisent un `.tsx` doivent donc le dire.

import ts from "typescript";

export type OptionsLecture = {
  /**
   * `true` pour un fichier `.tsx` (le chevron ouvre une balise, le texte entre
   * balises est du texte JSX). `false` — le défaut — pour un `.ts` (le chevron
   * est une comparaison ou un transtypage).
   */
  jsx?: boolean;
};

export function sansCommentaires(src: string, options: OptionsLecture = {}): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    /* LanguageVariant */ options.jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    src
  );

  const sortie: string[] = [];

  // ───────────────────────────────────────────────────────────────────────────
  // LES SUBSTITUTIONS `${…}` : LE TROISIÈME PIÈGE, ET LE PLUS SUBTIL
  // ───────────────────────────────────────────────────────────────────────────
  //
  // `ts.createScanner` est un LEXER. Il rend un `TemplateHead` pour `` `abc${ ``,
  // puis rend les jetons de la substitution comme s'ils étaient du code
  // ordinaire — et il ne sait plus où la substitution se termine. Le backtick de
  // FERMETURE du gabarit est alors pris pour un OUVERTURE, et le lexer avale
  // tout ce qui suit jusqu'au backtick suivant.
  //
  // Le fichier réel qui l'a révélé — une route OTP du portail, dans sa
  // demoralisation du délai de renvoi :
  //
  //     { error: `Patientez encore ${restant} s avant de redemander un code.` },
  //
  // Après `${`, le scanner rend `restant`, puis confond le `}` de fin de
  // substitution et le backtick final, et continue : les `}` et `)` de l'appel,
  // le corps de la fonction entière, PUIS tous les commentaires du fichier
  // jusqu'au prochain backtick. Le fichier devient illisible pour le test, et
  // un invariant chercherait sa preuve dans de la prose.
  //
  // C'est l'ANALYSEUR qui rattrape cela, pas le lexer : quand il rencontre un
  // `}` à la profondeur où la substitution s'est ouverte, il appelle
  // `reScanTemplateToken()`. Nous faisons exactement de même — c'est trois
  // lignes, et sans elles ce helper vaut moins que le scanner à la main
  // qu'il a remplacé.
  //
  // La profondeur compte les `{` imbriqués : `${ { a: 1 }.a }` contient un `}`
  // qui NE referme pas la substitution. Confondre les deux refermerait le
  // gabarit au mauvais endroit — c'est-à-dire exactement le défaut qu'on
  // cherche à éviter.
  let profondeur = 0;
  let dansSubstitution = false;
  // Filet de sécurité : `reScanTemplateToken` ne rend pas toujours un gabarit,
  // et une boucle infinie dans un helper de test rendrait le debogage IMPOSSIBLE
  // alors que le symptôme est ailleurs.
  let garde = src.length * 4 + 16;

  let jeton = scanner.scan();

  while (jeton !== ts.SyntaxKind.EndOfFileToken) {
    if (jeton === ts.SyntaxKind.TemplateHead) {
      dansSubstitution = true;
      profondeur = 0;
    } else if (jeton === ts.SyntaxKind.TemplateTail || jeton === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
      dansSubstitution = false;
      profondeur = 0;
    } else if (dansSubstitution) {
      if (jeton === ts.SyntaxKind.OpenBraceToken) profondeur++;
      else if (jeton === ts.SyntaxKind.CloseBraceToken) {
        if (profondeur === 0) {
          jeton = scanner.reScanTemplateToken(/* isTaggedTemplate */ false);
          if (jeton === ts.SyntaxKind.TemplateTail || jeton === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
            dansSubstitution = false;
            profondeur = 0;
          }
        } else {
          profondeur--;
        }
      }
    }

    const texte = scanner.getTokenText();

    if (jeton === ts.SyntaxKind.SingleLineCommentTrivia || jeton === ts.SyntaxKind.MultiLineCommentTrivia) {
      // Le commentaire disparaît, mais PAS ses retours à la ligne : sans cela,
      // le numéro de ligne rapporté par une assertion ne correspondrait plus à
      // la source, et un échec serait impossible à situer.
      for (let i = 0; i < texte.length; i++) {
        if (texte[i] === "\n") sortie.push("\n");
      }
    } else {
      // Tout le reste est REPASSÉ : les tests cherchent des prédicats comme
      // `.eq("entreprise_id", …)` qui vivent dans des chaînes, et un littéral
      // est précisément un prédicat qu'on veut voir.
      sortie.push(texte);
    }

    if (--garde <= 0) break;
    jeton = scanner.scan();
  }

  return retirerCommentairesJsx(sortie.join(""));
}

/**
 * Retire les commentaires JSX `{/* … *\/}`.
 *
 * LE SCANNER LEXICAL DE TYPESCRIPT NE PEUT PAS LE FAIRE, et c'est une limite de
 * fond, pas un oubli. Il-tokenise, il n'analyse pas : dans `Standard`, le `{`
 * d'un conteneur d'expression ouvre un LITTÉRAL MODÈLE, et le `/*` qui suit
 * passe donc dedans avec tout ce qui vient après. Le commentaire est réémis
 * intact — texte et compris.
 *
 * On le retire donc APRÈS le scan lexical, sur sa sortie. L'ordre compte : le
 * scan vient d'éliminer tous les commentaires ordinaires, donc les seuls `{/*`
 * qui subsistent sont de vrais commentaires JSX.
 *
 * Le motif est ANCRE au plus près : `{`, puis `/*`, puis le plus court contenu
 * possible, puis `*\/`, puis `}`. Rien entre `}` et `{`. Autoriser du texte
 * quelconque entre deux accolades serait exactement le défaut du glob
 * `/api/devis/*` décrit plus haut : le motif avalerait du code, et un test
 * cherchant un prédicat dans le code avalé passerait au vert sur une route qui
 * ne filtre plus rien. Un motif « plus complet » n'est pas ici un progrès.
 *
 * Les retours à la ligne sont préservés comme ailleurs, pour la même raison :
 * les numéros de ligne doivent continuer de correspondre à la source.
 */
function retirerCommentairesJsx(src: string): string {
  return src.replace(/\{\/\*[\s\S]*?\*\/\}/g, (bloc) => {
    let sauts = "";
    for (let i = 0; i < bloc.length; i++) {
      if (bloc[i] === "\n") sauts += "\n";
    }
    return sauts;
  });
}