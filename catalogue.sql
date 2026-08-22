CREATE TABLE IF NOT EXISTS catalogue_ouvrages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  categorie text NOT NULL,
  famille_label text NOT NULL,
  designation text NOT NULL,
  description text,
  unite text NOT NULL,
  pu_ht numeric NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insertion des données par défaut
INSERT INTO catalogue_ouvrages (categorie, famille_label, designation, description, unite, pu_ht) VALUES
('bardage', 'Bardage HPL', 'Fourniture et pose bardage HPL Compact 8mm', 'Panneaux stratifiés haute pression (HPL) type Trespa Meteon / Fundermax 8mm. Pose sur ossature aluminium Isolco 3000 P2 avec fixations vis laquées, entraxe max 600mm, joint creux 8mm et bande EPDM.', 'm²', 145.0),
('bardage', 'Bardage Bois', 'Fourniture et pose bardage bois Douglas claire-voie', 'Lames de bardage Douglas de pays purgé d''aubier, profil claire-voie avec coupe d''onglet 15°. Pose sur double liteaunage traité classe 2, pointes inox annelées A2.', 'm²', 95.0),
('bardage', 'Bardage Composite', 'Fourniture et pose bardage composite fibres de bois/résine', 'Lames composites coextrudées anti-taches / UV. Pose horizontale sur ossature bois avec clips inox invisibles et jeu de dilatation 5mm.', 'm²', 120.0),
('bardage', 'Bardage Métallique', 'Fourniture et pose bardage métallique simple peau bac acier', 'Profil acier galvanisé prélaqué 25µm, nervuré trapézoïdal. Fixation sur ossature avec vis autoperceuses et cavaliers avec rondelles EPDM étanches.', 'm²', 65.0),
('isolation', 'Isolation ITE', 'Fourniture et pose isolation laine de roche 120mm (R=3.40)', 'Panneaux semi-rigides laine de roche incombustible (Euroclasse A1) type Rockwool Rockfaçade épaisseur 120mm, chevillés mécaniquement au support béton/maçonnerie.', 'm²', 48.0),
('isolation', 'Isolation ITE', 'Fourniture et pose isolation laine de verre 100mm (R=3.10)', 'Panneaux semi-rigides laine de verre hydrophobe avec voile noir, fixés entre équerres Isolco avec rosaces de maintien.', 'm²', 38.0),
('etancheite', 'Pare-pluie & Étanchéité', 'Fourniture et pose membrane pare-pluie respirante HPV', 'Écran pare-pluie haute perméabilité à la vapeur d''eau (type Delta-Vent S / Doerken), résistant aux UV. Pose tendue avec recouvrement 100mm et collage des lés au scotch adhésif étanche.', 'm²', 14.5),
('etancheite', 'Ventilation', 'Fourniture et pose grilles anti-rongeurs et profil de ventilation', 'Profil perforé en aluminium/acier galvanisé pour ventilation basse et haute du bardage, passage d''air continu conforme DTU 41.2.', 'ml', 18.0),
('etancheite', 'Protection Ossature', 'Fourniture et agrafage bande de protection EPDM', 'Bande élastomère EPDM noire 80mm agrafée sur 100% de la face avant des montants bois pour protection contre les ruissellements d''eau aux joints de bardage.', 'ml', 6.5),
('habillage', 'Habillages & Rives', 'Fourniture et pose profil d''angle sortant aluminium laqué', 'Cornière d''angle en aluminium laqué plié 15/10ème, teinte RAL au choix, fixée sur ossature avec vis laquées discrètes.', 'ml', 32.0),
('habillage', 'Zinguerie & Bavettes', 'Fourniture et pose bavette de rejet d''eau sous menuiserie', 'Bavette aluminium pliée avec larmier goutte d''eau, embouts latéraux d''étanchéité et joint compribande sous appui de fenêtre.', 'ml', 42.0),
('habillage', 'Tableaux de fenêtres', 'Fourniture et pose habillage tableaux et linteaux aluminium', 'Tôles aluminium laqué pliées sur mesure pour habillage complet des ébrasements de fenêtres et portes.', 'ml', 55.0),
('habillage', 'Couvertines', 'Fourniture et pose couvertine aluminium sur acrotère', 'Couvertine alu laqué avec pinces de fixation invisibles et éclisses d''étanchéité avec pente d''écoulement vers l''intérieur.', 'ml', 65.0),
('installation', 'Installation & Sécurité', 'Montage, location et démontage échafaudage de pied R408', 'Échafaudage tubulaire en acier galvanisé conforme aux normes R408, planchers alu/bois avec trappes d''accès, plinthes et filets pare-gravats.', 'forfait', 850.0),
('installation', 'Démolition & Nettoyage', 'Dépose de l''ancien bardage et évacuation en décharge agréée', 'Dépose soignée de l''ancien parement et liteaux, tri des matériaux, transport et mise en décharge agréée avec bordereau de suivi des déchets (BSD).', 'm²', 22.0);
