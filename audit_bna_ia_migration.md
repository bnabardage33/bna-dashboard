# Diagnostic & Plan d'Intégration — Module BNA-IA (Centre de Contrôle IA)

Date : 2026-11-17  
Périmètre : `Bna-app` (`AssistantScreen.tsx`, `bnaAssistantService.ts`, `/api/assistant`) → `bna-dashboard` (`/terrain/bna-ia`)

---

## 1. Inventaire complet dans `Bna-app`

### Fichiers liés à BNA-IA
- **Interface utilisateur :** `src/components/screens/AssistantScreen.tsx` (733 lignes)
- **Moteur local, prompts & actions :** `src/lib/services/bnaAssistantService.ts` (990 lignes)
- **Route API :** `src/app/api/assistant/route.ts` (266 lignes)
- **Tests associés :** `src/lib/services/bnaAssistant.test.ts`

### Modèles LLM, routage & audio dans `Bna-app`
- **Architecture hybride « Moteur Local + Cloud LLM »** (`src/app/api/assistant/route.ts`) :
  1. **Moteur local déterministe** (`generateLocalAssistantResponse` dans `bnaAssistantService.ts`) : traite instantanément (0 ms, sans fuite de données) les demandes simples, la base de connaissances DTU embarquée (`DTU_KNOWLEDGE_BASE` : NF DTU 51.4, 41.2, 45.4, NF P98-405), les tarifs indicatifs (`BNA_TARIFS_INDICATIFS`) et la détection d'actions (`detectAssistantActions`).
  2. **Relais Cloud LLM** (`isComplexOrConversationalQuery`) en cascade :
     - Priorité 1 : **Mistral AI** (`MISTRAL_API_KEY`, modèle `MISTRAL_MODEL || "mistral-small-latest"`)
     - Priorité 2 : **Gemini Cloud** (`GEMINI_API_KEY` ou `GOOGLE_GENERATIVE_AI_API_KEY`, modèle `gemini-2.5-flash`)
     - Priorité 3 : **Groq** (`GROQ_API_KEY`, modèles `GROQ_MODEL`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-20b`)
- **Audio / Voix :** `AssistantScreen.tsx` utilise uniquement l'API navigateur `SpeechRecognition` / `webkitSpeechRecognition` (pas de dictaphone Whisper serveur dans `Bna-app`).

### Ergonomie & fonctionnalités du Centre de Contrôle IA dans `Bna-app`
- **8 raccourcis intelligents (`QUICK_PROMPTS`) :** Briefing du jour, Trésorerie & Marges, Planifier RDV demain 9h30, Météo & Pose DTU, Règles DTU 51.4 & 41.2, Créer Devis Terrasse 40 m², PV Réception & SAV, État des commandes.
- **Contexte opérationnel injecté (`AssistantContext` → `buildSystemPromptContext`) :** liste des `chantiers` (ville, métier, avancement, alerte météo), `rdvs`, `commandes` fournisseurs, `devis` et `factures` (CA signé, pipeline, encaissé, reste à facturer, marge brute, factures en retard).
- **7 actions exécutables (`AssistantActionType`)** avec bouton de validation par l'utilisateur (`handleExecuteAction`) : `create_rdv`, `update_avancement`, `open_calepinage`, `open_cockpit`, `open_planning`, `create_devis`, `open_devis`.
- **Persistance locale :** historique des 30 derniers messages stocké dans `localStorage` (`bna_assistant_chat_v1`).

---

## 2. Ce qui existe déjà dans `bna-dashboard`

### Routes API & briques IA en place
- **Transcription & Notes vocales :**
  - `app/api/transcrire-note/route.ts` : **Groq Whisper** (`whisper-large-v3` via `GROQ_API_KEY`)
  - `app/api/reformuler-note/route.ts` : reformulation via **Groq** (`openai/gpt-oss-20b` / `GROQ_MODEL`)
  - `components/BoutonMicroNote.tsx` : composant dictaphone réutilisable
- **Devis, OCR & Avancement :**
  - `app/api/ia-devis/route.ts` : **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`) + moteur métier `lib/iaDevisMetre.ts`, `lib/catalogueMatching.ts`, `lib/servirMetreComplet.ts`
  - `app/api/ia-ocr-ticket/route.ts` : **Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`)
  - `app/api/ia-avancement/route.ts` & `app/api/ia-securite/route.ts` : **Groq** (`GROQ_API_KEY`)
- **Chat Client :**
  - `app/api/chat-client-summary/route.ts`, `app/api/espace-client/[code_acces]/chat/route.ts`, `lib/espace-chat-summary.server.ts` (**Groq**)
- **Métré photo :**
  - `app/terrain/metre-ia/page.tsx` : outil de métré sur photo par étalonnage et tracé de polygones sur `<canvas>` (sans LLM)

### Variables d'environnement documentées (`.env.example`)
- `GROQ_API_KEY` + `GROQ_MODEL=openai/gpt-oss-20b`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- *(Optionnel : `MISTRAL_API_KEY` si souhaité en priorité Cloud RGPD)*

---

## 3. Plan d'intégration dans `bna-dashboard` (Charte claire `#F3F3F1` / Cartes blanches / Terracotta `#B85B2B`)

1. **Nouvelle route dédiée & Branchement Navigation :**
   - Créer `/terrain/bna-ia` (`app/terrain/bna-ia/page.tsx`) en thème clair BNA Dashboard (`#F3F3F1`, en-tête blanc « BNA Pilotage BTP · BNA-IA Centre de Contrôle », cartes blanches `border-[#E5E5E5]`, accents Terracotta `#B85B2B`).
   - Brancher la 4e carte de `components/AccueilProfessionnel.tsx` vers `/terrain/bna-ia` avec un bouton actif Terracotta `#B85B2B`.
   - Ajouter l'entrée « BNA-IA · Copilote » dans `components/MenuNavigationMobile.tsx` (synchronisée automatiquement avec `SidebarDesktop.tsx`).
2. **Backend unifié & sécurisé multi-tenant (`/api/bna-ia/route.ts` + `lib/bnaIaService.ts`) :**
   - Adapter `bnaAssistantService.ts` au schéma réel de `bna-dashboard` (`chantiers` avec `metier`, `commandes`, `devis`, `factures`, `pv_receptions`, `tickets_sav`, `notes_patron`) en s'appuyant sur `resoudreTenant()` côté serveur.
   - Conserver le routage intelligent **Moteur Local BNA (0 ms)** + **Cloud LLM** réutilisant `GROQ_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` (et `MISTRAL_API_KEY` en priorité si définie).
   - Brancher la saisie vocale sur `/api/transcrire-note` (**Groq Whisper**) plutôt que `webkitSpeechRecognition` seul.
3. **Connexion aux 3 piliers métiers, Planning & Alertes proactives :**
   - Redirections directes vers `/terrain/chantier/[id]`, `/terrain/terrasse/[id]`, `/terrain/cloture/[id]`, `/terrain` (planning unifié), `/bureau/devis-factures`, `/bureau/fournisseurs?tab=commandes`, `/bureau/sav` et `/bureau/fin-chantier`.
   - Actions exécutables adaptées (avancement, planning, notes vocales, ouverture de hubs/devis) et panneau d'alertes proactives en haut de page (retards commandes, factures en retard, réserves PV / SAV ouverts, alertes météo DTU).
