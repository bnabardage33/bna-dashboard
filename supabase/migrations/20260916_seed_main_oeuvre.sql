-- Insertion de prestations de main-d'œuvre avec formalisme normé (NF DTU)

INSERT INTO public.catalogue_ouvrages (
    id, categorie, famille_label, designation, description, designation_devis, unite, pu_ht, pu_revient, type_cout
) VALUES (
    gen_random_uuid(),
    'isolation',
    'Pose ITE',
    'Pose d''isolant thermique par l''extérieur (ITE)',
    'Pose calée-chevillée d''isolant thermique',
    'Main d''œuvre pour la pose calée-chevillée de panneaux isolants thermiques en conformité avec les règles de l''art et les exigences du NF DTU 45.4. Comprend la découpe, l''ajustement et la fixation mécanique par chevilles rosaces ETA.',
    'm²',
    45.00,
    25.00,
    'main_oeuvre'
),
(
    gen_random_uuid(),
    'bardage',
    'Pose Ossature',
    'Pose de l''ossature secondaire (Équerres et Chevrons)',
    'Fixation d''équerres et chevrons bois',
    'Main d''œuvre pour le traçage, l''implantation et la fixation d''équerres de bardage renforcées et de chevrons bois Classe 3.2. Alignement, réglage de la planéité de la façade et création de la lame d''air ventilée réglementaire selon les prescriptions du NF DTU 41.2 et 45.4.',
    'm²',
    35.00,
    18.00,
    'main_oeuvre'
),
(
    gen_random_uuid(),
    'bardage',
    'Pose Parement',
    'Pose du parement final (Clins de bardage)',
    'Pose de lames de bardage avec fixations',
    'Main d''œuvre pour la pose de lames de bardage extérieur. Fixations invisibles ou apparentes par vis inox conformes au NF EN 14592 et respect des joints de dilatation selon le NF DTU 41.2.',
    'm²',
    55.00,
    28.00,
    'main_oeuvre'
);
