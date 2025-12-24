# Plan d'Optimisation du Serveur MCP

**Date**: 2025-12-24
**Objectif**: Réduire la surconsommation de tokens du serveur MCP `@ctxopt/mcp-server`

---

## Contexte

Le serveur MCP, conçu pour économiser des tokens, présente paradoxalement une surconsommation significative :
- **~7-10k tokens** pour charger les définitions d'outils
- **50-100 tokens** d'overhead par réponse (formatage Markdown)
- **Parsing AST complet** même pour des extractions ciblées

---

## Phase 1 : Réduction des Définitions d'Outils (P0)

### 1.1 Implémenter Dynamic Toolsets

**Fichiers concernés**: `src/server.ts`, nouveau `src/tools/dynamic-loader.ts`

**Approche**:
- [x] Créer un outil "meta" `discover_tools` qui retourne les outils pertinents selon la requête
- [x] Charger uniquement 2-3 outils de base au démarrage (`auto_optimize`, `smart_file_read`)
- [x] Les autres outils sont chargés à la demande via `tools/list` dynamique

**Impact estimé**: -70% tokens au startup (7k → 2k)

**Implémenté le 2025-12-24**:
- `src/tools/dynamic-loader.ts` - Catalogue d'outils avec chargement lazy
- `src/tools/discover-tools.ts` - Meta-tool pour découverte
- `src/tools/registry.ts` - Ajout événements `onToolsChanged`
- `src/server.ts` - Intégration du loader dynamique

### 1.2 Réduire les Descriptions d'Outils

**Fichiers concernés**: `src/tools/*.ts` (tous les fichiers d'outils)

**Actions**:
- [x] Supprimer les exemples des descriptions (les mettre dans une doc externe)
- [x] Raccourcir les descriptions de paramètres à une ligne max
- [x] Supprimer les descriptions redondantes

**Exemple** - `smart-file-read.ts`:
```typescript
// AVANT (verbose)
description: "Extract only function/class signatures without bodies (skeleton mode). Great for getting an overview of a large file."

// APRÈS (concis)
description: "Signatures only, no bodies"
```

**Implémenté le 2025-12-24**:
- 10 outils optimisés (top 5 + 5 secondaires)
- Suppression des patterns "Use this tool when..."
- Suppression des exemples inline
- Descriptions de paramètres réduites à 1 phrase max

**Impact estimé**: -30% sur les définitions

---

## Phase 2 : Optimisation des Réponses (P1)

### 2.1 Mode Texte Brut

**Fichiers concernés**: `src/tools/smart-file-read.ts`, `src/tools/auto-optimize.ts`

**Actions**:
- [x] Ajouter un paramètre `format: "plain" | "markdown"` (défaut: `plain`)
- [x] Supprimer les headers `##` et `**bold**` en mode plain
- [x] Retourner uniquement les données essentielles

**Implémenté le 2025-12-24**:
- `src/tools/smart-file-read.ts` - Paramètre format ajouté, 4 fonctions de formatage modifiées
- `src/tools/auto-optimize.ts` - Paramètre format ajouté, formatage conditionnel
- `src/ast/index.ts` - `formatStructureSummary()` supporte format
- `src/utils/signature-grouper.ts` - `formatGroups()` supporte format

**Exemple de réponse optimisée**:
```
// AVANT (160 tokens)
## File Skeleton: src/server.ts

**Language:** typescript
**Total Lines:** 143

### Functions
- `export function createServer()` (lines 46-121)
...

// APRÈS (80 tokens)
src/server.ts (typescript, 143 lines)
FUNCTIONS: createServer (46-121), runServer (126-142)
```

**Impact estimé**: -50% tokens par réponse

### 2.2 Skeleton Mode Allégé

**Fichiers concernés**: `src/tools/smart-file-read.ts`, `src/ast/index.ts`

**Actions**:
- [x] Ne pas lister toutes les variables (seulement les exportées)
- [x] Limiter les imports à 3 max (markdown et plain)
- [x] Supprimer les numéros de lignes pour les éléments mineurs (types, interfaces)

**Implémenté le 2025-12-24**:
- `formatSkeletonOutput`: imports max 3, types sans lignes
- `formatStructureSummary`: variables exportées seulement, imports max 3, types/interfaces sans lignes

**Impact estimé**: -20% tokens supplémentaires

---

## Phase 3 : Optimisation AST (P2)

### 3.1 Lazy Parsing

**Fichiers concernés**: `src/ast/quick-scan.ts` (nouveau), `src/ast/index.ts`, `src/tools/smart-file-read.ts`

**Actions**:
- [x] Implémenter un mode "scan" qui ne parse que les déclarations de premier niveau
- [x] Parser le contenu d'une fonction uniquement si elle est ciblée
- [x] Utiliser des regex pour la détection rapide avant le parsing complet

**Implémenté le 2025-12-24**:
- `src/ast/quick-scan.ts` - Scanner regex pour TypeScript, Python et Go
- `src/ast/index.ts` - `parseFile()` accepte `mode: 'full' | 'quick'`
- `src/tools/smart-file-read.ts` - Skeleton mode utilise quick scan
- `formatSkeletonOutput` - Mode quick affiche uniquement la ligne de début

**Trade-off accepté**: Mode quick n'a pas `endLine`, affiche `(46)` au lieu de `(46-121)`

**Impact estimé**: -90% temps de parsing pour skeleton mode

### 3.2 Réduire la Structure CodeElement

**Fichier concerné**: `src/ast/types.ts:29-48`

**Actions**:
- [ ] Rendre `signature`, `documentation`, `isAsync` optionnels et non-calculés par défaut
- [ ] Ajouter un paramètre `detailed: boolean` pour contrôler le niveau d'extraction

---

## Phase 4 : Cache Amélioré (P3)

### 4.1 Cache des Schémas d'Outils

**Fichiers concernés**: `src/tools/registry.ts`, `src/server.ts`

**Actions**:
- [ ] Sérialiser les schémas une seule fois au build
- [ ] Charger depuis le cache plutôt que reconstruire

---

## Métriques de Succès

| Métrique | Avant | Cible | Méthode de mesure |
|----------|-------|-------|-------------------|
| Tokens au startup | ~10k | <3k | `context_budget` sur tools/list |
| Tokens par smart_file_read | ~200 | <100 | Mesure directe |
| Tokens par auto_optimize | ~150 | <80 | Mesure directe |

---

## Ordre d'Implémentation

1. **Semaine 1**: Phase 1.2 (descriptions concises) - Quick win
2. **Semaine 2**: Phase 2.1 (mode texte brut)
3. **Semaine 3**: Phase 1.1 (dynamic toolsets) - Impact majeur
4. **Semaine 4**: Phases 2.2, 3.1, 3.2

---

## Références

- [SEP-1576: Mitigating Token Bloat in MCP](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576)
- [Reducing MCP token usage by 100x](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2)
- [The Hidden Cost of MCP](https://www.arsturn.com/blog/hidden-cost-of-mcp-monitor-reduce-token-usage)
