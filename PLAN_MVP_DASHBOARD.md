# Plan MVP Web CtxOpt - Dashboard Minimaliste

## Contexte

### Recherche - Besoins Critiques des Développeurs LLM (2025)

Sources: [LLM Cost Optimization Guide](https://ai.koombea.com/blog/llm-cost-optimization), [AI API Cost Management](https://skywork.ai/blog/ai-api-cost-throughput-pricing-token-math-budgets-2025/)

| Besoin | Importance | Justification |
|--------|------------|---------------|
| **Visibilité tokens en temps réel** | Critique | Output coûte 2-5x plus que input |
| **Économies affichées clairement** | Critique | Valide le ROI de l'outil |
| **Répartition par modèle** | Haute | Permet l'optimisation ciblée |
| **Transparence consommation** | Haute | Pas de surprise, données indicatives |

### Décisions

- **Scope**: Global + Par projet (toggle)
- **Navigation**: Dashboard unique (fusionné avec Analytics)
- **Alertes**: Non pertinent (pas d'accès aux rate limits LLM)
- **Prévisions**: Hors MVP

### Capacités MCP Server

Métriques disponibles via `/api/usage`:
- `tokensUsed`, `tokensSaved`, `savingsPercent`
- `cost` (microdollars), `model`, `projectType`
- `toolsBreakdown` (détail par outil MCP)

---

## TODO MVP - Dashboard Unique

### Phase 1: Refonte Dashboard Principal

**Fichier:** `apps/web/app/(dashboard)/dashboard/page.tsx`

#### 1.1 Sélecteur de Scope
- [x] Toggle "All Projects" / "Project: [name]"
- [x] Dropdown pour sélectionner un projet spécifique
- [x] URL param pour bookmarker la vue (`?project=xxx`)

#### 1.2 Hero Stats Cards (4 cards)
- [x] **Tokens Used** : total tokens (input + output)
- [x] **Tokens Saved** : économies grâce aux outils MCP
- [x] **Est. Cost** : coût estimé en $ (basé sur pricing models)
- [x] **Savings Rate** : % d'économies (avec badge visuel)

#### 1.3 Section Charts (fusion Analytics)
- [x] **Usage Over Time** : line chart tokens par jour/semaine
- [x] **Cost by Model** : pie chart répartition par modèle
- [x] Période sélectionnable : 7d / 30d / 90d

#### 1.4 Table Détails
- [x] Tableau des sessions récentes (date, tokens, savings, model)
- [x] Tri et pagination simple

### Phase 2: Composants Dashboard

**Dossier:** `apps/web/components/dashboard/`

#### 2.1 Nouveaux Composants
- [x] `scope-selector.tsx` - Toggle global/projet + dropdown
- [x] `usage-chart.tsx` - Chart unifié (remplace TokensChart)
- [x] `model-breakdown.tsx` - Pie chart simplifié
- [x] `sessions-table.tsx` - Tableau sessions récentes

#### 2.2 Refonte Composants Existants
- [x] `stats-cards.tsx` - Simplifier à 4 cards essentielles
- [x] Supprimer `QuickActions`, `SuggestionsPreview` (hors scope MVP)

### Phase 3: Simplification Navigation

#### 3.1 Sidebar
- [x] **Dashboard** (icône: LayoutDashboard)
- [x] **Projects** (icône: FolderKanban)
- [x] **Docs** (icône: BookOpen)
- [x] Retirer "Analytics" et "API Keys" du menu principal

#### 3.2 API Keys → Sous Projects
- [x] Déplacer gestion API Keys dans la page projet (`/projects/[id]`)
- [x] Onglets dans page projet: "Overview" | "API Keys" | "Settings"

### Phase 4: Hooks & Data

#### 4.1 Nouveau Hook Unifié
- [x] `useProjectUsage(projectId?: string)` - retourne usage (global si undefined)
- [x] Agrégation côté serveur pour vue "All Projects"

#### 4.2 API Endpoint
- [x] `GET /api/usage?projectId=xxx&period=30d`
- [x] Si `projectId` absent → agrège tous les projets de l'user

### Phase 5: Polish UX

#### 5.1 Empty State
- [x] Dashboard vide → CTA "Create your first project"
- [x] Wizard rapide: Project → API Key → Copy snippet

#### 5.2 Loading States
- [x] Skeletons pour cards et charts
- [x] Pas de layout shift

---

## Fichiers à Modifier/Créer

```
apps/web/
├── app/(dashboard)/dashboard/
│   └── page.tsx                      # MODIFY: Dashboard complet
├── app/(dashboard)/projects/
│   └── [id]/
│       └── page.tsx                  # MODIFY: Ajouter tabs (Overview/Keys/Settings)
├── components/dashboard/
│   ├── scope-selector.tsx            # NEW
│   ├── usage-chart.tsx               # NEW (fusion)
│   ├── model-breakdown.tsx           # NEW
│   ├── sessions-table.tsx            # NEW
│   └── stats-cards.tsx               # MODIFY: Simplifier
├── components/layout/
│   └── sidebar.tsx                   # MODIFY: 3 items
├── hooks/
│   └── use-project-usage.ts          # NEW
└── app/api/
    └── usage/
        └── route.ts                  # MODIFY: Support global + GET
```

---

## Ordre d'Exécution

1. **Hook `useProjectUsage`** + API endpoint modifié (GET support)
2. **Scope Selector** composant
3. **Stats Cards** refonte (4 cards)
4. **Charts** (usage + model breakdown)
5. **Sessions Table**
6. **Sidebar** simplification (3 items)
7. **API Keys** déplacement sous Projects
8. **Empty states** et loading skeletons

---

## Hors Scope MVP

- Prévisions fin de mois
- Alertes de quota (pas d'accès aux limites LLM)
- Notifications email
- Export CSV/JSON
- Page Settings utilisateur
- Historique facturation
- CI/CD webhooks
