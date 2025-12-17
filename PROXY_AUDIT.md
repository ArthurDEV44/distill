# Audit de Faisabilité : Proxy d'Optimisation de Tokens LLM

**Date:** 2025-12-17
**Auteur:** Claude Opus 4.5
**Version:** 1.0

---

## Résumé Exécutif

Ce document analyse la faisabilité d'un proxy d'interception et d'optimisation des appels API LLM pour le projet CtxOpt. L'objectif est de réduire significativement la consommation de tokens **au niveau du proxy** avant que les requêtes n'atteignent l'API Anthropic.

### Verdict Global

| Critère | Évaluation | Notes |
|---------|------------|-------|
| **Faisabilité technique** | ✅ Haute | Architecture standard, patterns bien documentés |
| **Potentiel d'économie** | ✅ 40-90% | Variable selon les techniques appliquées |
| **Complexité** | ⚠️ Moyenne-Haute | Streaming + optimisation temps réel = défis |
| **ROI estimé** | ✅ Excellent | Économies exponentielles à grande échelle |

---

## Table des Matières

1. [Contexte et Problématique](#1-contexte-et-problématique)
2. [État de l'Art : Solutions Existantes](#2-état-de-lart--solutions-existantes)
3. [Techniques d'Optimisation Disponibles](#3-techniques-doptimisation-disponibles)
4. [Architecture Proposée](#4-architecture-proposée)
5. [Contraintes Techniques](#5-contraintes-techniques)
6. [Analyse des Risques](#6-analyse-des-risques)
7. [Recommandations](#7-recommandations)
8. [Roadmap d'Implémentation](#8-roadmap-dimplémentation)
9. [Sources](#9-sources)

---

## 1. Contexte et Problématique

### 1.1 Observation Clé (Benchmarks CtxOpt)

Les benchmarks réalisés sur le projet CtxOpt démontrent clairement le problème :

| Scenario | Tokens Sans Optimisation | Tokens Avec Optimisation | Économie |
|----------|-------------------------|--------------------------|----------|
| Agent Explore (lecture codebase) | **56.9k** | 5.4k | **90%** |
| Analyse erreurs build | 2.7k messages | 1.8k messages | **33%** |

**Constat critique :** L'Agent Explore de Claude Code consomme **56.9k tokens invisibles** côté API qui ne sont pas visibles dans le contexte final mais qui sont facturés.

### 1.2 Où Se Trouve la Consommation ?

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUX ACTUEL (sans proxy)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Code ──► Anthropic API ──► Facturation directe          │
│       │                                                         │
│       └── MCP Server (ctxopt) : optimisation POST-lecture       │
│                                 │                               │
│                                 └── Économies : seulement sur   │
│                                     ce qui est lu par MCP       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FLUX CIBLE (avec proxy)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Code ──► PROXY CTXOPT ──► Anthropic API                 │
│                      │                                          │
│                      ├── Compression prompts (LLMLingua)        │
│                      ├── Semantic caching (GPTCache)            │
│                      ├── Model routing (Haiku vs Opus)          │
│                      ├── Deduplication contexte                 │
│                      └── Prompt caching (Anthropic natif)       │
│                                                                 │
│                 Économies : 40-90% sur TOUT le trafic           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 État Actuel de CtxOpt

L'infrastructure est **prête** pour accueillir un proxy :

- ✅ Schema DB avec table `requests` pour logging
- ✅ Constants avec pricing (`ANTHROPIC_MODELS`), rate limits, headers
- ✅ MCP Server fonctionnel avec outils d'optimisation
- ❌ Route proxy API (`/api/v1/proxy/messages`) **non implémentée**

---

## 2. État de l'Art : Solutions Existantes

### 2.1 Gateways LLM Open Source

| Solution | Performance | Points Forts | Points Faibles |
|----------|-------------|--------------|----------------|
| **[LiteLLM](https://docs.litellm.ai/)** | ~372MB RAM | 100+ modèles, semantic caching | Memory leaks historiques, Python |
| **[Bifrost (Maxim AI)](https://www.getmaxim.ai/)** | **11µs overhead** | Le plus rapide, <100µs latence | Moins de features |
| **[Portkey](https://portkey.ai/)** | Enterprise | 1600+ LLMs, guardrails | Pricing enterprise |
| **[Helicone](https://helicone.ai/)** | Rust | Très performant, observabilité | Focus analytics |
| **[Kong AI Gateway](https://docs.konghq.com/)** | Enterprise | Plugins riches, gouvernance | Complexe |

### 2.2 Solutions de Caching Sémantique

| Solution | Type | Intégrations | Efficacité |
|----------|------|--------------|------------|
| **[GPTCache](https://github.com/zilliztech/GPTCache)** | Open source | LangChain, LlamaIndex, Anthropic | Hit ratio variable |
| **[LLMBridge](https://arxiv.org/abs/2410.11857)** | Académique | WhatsApp Q&A (14.7k+ requêtes) | Model selection + caching |
| **[IC-Cache](https://arxiv.org/html/2501.12689v3)** | Recherche | In-context caching | SOSP 2025 |

### 2.3 Compression de Prompts

| Solution | Compression | Vitesse | Qualité |
|----------|-------------|---------|---------|
| **[LLMLingua](https://www.llmlingua.com/)** | **Jusqu'à 20x** | Baseline | Bonne |
| **[LLMLingua-2](https://llmlingua.com/llmlingua2.html)** | 2x-5x | **3-6x plus rapide** | Meilleure fidélité |
| **[PISCO](https://arxiv.org/html/2503.19114)** | Élevée | - | Moins d'hallucinations |

---

## 3. Techniques d'Optimisation Disponibles

### 3.1 Optimisations Natives Anthropic

Ces optimisations sont **gratuites** et intégrées à l'API Anthropic :

| Technique | Économie | Effort d'implémentation | Description |
|-----------|----------|------------------------|-------------|
| **Prompt Caching** | **-90% coûts, -85% latence** | ⭐ Faible | Cache contexte statique entre requêtes |
| **Token-Efficient Tool Use** | **-70% output tokens** | ⭐ Faible | Header `token-efficient-tools-2025-02-19` |
| **Tool Search Tool** | **-85% tool definitions** | ⭐⭐ Moyen | `defer_loading: true` pour discovery on-demand |
| **Programmatic Tool Calling (PTC)** | **-37%** | ⭐⭐ Moyen | Résultats intermédiaires hors contexte |

### 3.2 Optimisations au Niveau Proxy

| Technique | Économie Potentielle | Complexité | Latence Ajoutée |
|-----------|---------------------|------------|-----------------|
| **Semantic Caching** | 30-80% (selon hit rate) | ⭐⭐⭐ Haute | +10-50ms |
| **Prompt Compression (LLMLingua)** | 50-80% | ⭐⭐⭐ Haute | +100-500ms |
| **Model Routing** | 40-90% (Haiku vs Opus) | ⭐⭐ Moyen | +5ms |
| **Context Deduplication** | 10-30% | ⭐⭐ Moyen | +5-20ms |
| **Response Streaming Optimization** | -20% TTFT | ⭐⭐ Moyen | 0ms |

### 3.3 Matrice Décisionnelle

```
                    ÉCONOMIE
                      ▲
                      │
           Prompt     │    Semantic
         Compression  │     Caching
              ●       │        ●
                      │
                      │     Model
    ──────────────────┼──────Routing──────► FACILITÉ
                      │        ●
                      │
       Context        │    Token-Efficient
     Deduplication    │       Tools
              ●       │        ●
                      │
```

---

## 4. Architecture Proposée

### 4.1 Vue d'Ensemble

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          PROXY CTXOPT                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐ │
│  │   INGRESS   │───►│  OPTIMIZER  │───►│   EGRESS    │───►│ ANTHROPIC │ │
│  │             │    │   PIPELINE  │    │             │    │    API    │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └───────────┘ │
│        │                  │                  │                  │        │
│        ▼                  ▼                  ▼                  ▼        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐ │
│  │ Auth/Rate   │    │ • Semantic  │    │ • Streaming │    │ Response  │ │
│  │   Limit     │    │   Cache     │    │   Handler   │    │  Metrics  │ │
│  │ • API Key   │    │ • Compress  │    │ • Headers   │    │           │ │
│  │ • Quotas    │    │ • Route     │    │ • Logging   │    │           │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └───────────┘ │
│                                                                          │
│                           ┌─────────────┐                                │
│                           │  POSTGRESQL │                                │
│                           │  (Neon)     │                                │
│                           │ • requests  │                                │
│                           │ • cache     │                                │
│                           │ • metrics   │                                │
│                           └─────────────┘                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Pipeline d'Optimisation

```typescript
// Ordre d'exécution des optimisations
const OPTIMIZATION_PIPELINE = [
  // Phase 1: Quick wins (< 10ms)
  "deduplicateSystemPrompt",     // Évite répétition du system prompt
  "enablePromptCaching",         // Active cache Anthropic natif
  "enableTokenEfficientTools",   // Header beta pour tools

  // Phase 2: Caching (10-50ms)
  "checkSemanticCache",          // GPTCache lookup

  // Phase 3: Routing (5ms)
  "selectOptimalModel",          // Haiku vs Sonnet vs Opus

  // Phase 4: Compression (optionnel, 100-500ms)
  "compressPromptIfNeeded",      // LLMLingua si contexte > seuil
];
```

### 4.3 Structure de Fichiers Proposée

```
apps/web/app/api/v1/proxy/
├── messages/
│   └── route.ts              # POST handler principal
├── lib/
│   ├── pipeline.ts           # Orchestration optimisations
│   ├── auth.ts               # Validation API keys
│   ├── cache/
│   │   ├── semantic.ts       # GPTCache wrapper
│   │   └── prompt.ts         # Anthropic prompt caching
│   ├── compression/
│   │   └── llmlingua.ts      # Intégration LLMLingua
│   ├── routing/
│   │   └── model-selector.ts # Logique de routage modèle
│   ├── streaming/
│   │   └── sse-handler.ts    # Gestion SSE
│   └── metrics/
│       └── recorder.ts       # Enregistrement DB
└── types.ts                  # Types Anthropic Messages API
```

---

## 5. Contraintes Techniques

### 5.1 Streaming SSE

**Défi majeur :** L'API Anthropic utilise Server-Sent Events (SSE) pour le streaming. Le proxy doit :

1. **Maintenir la connexion** : Pas de buffering côté proxy
2. **Compter les tokens en temps réel** : Difficile avec streaming
3. **Faible TTFT** : Time To First Token critique pour UX

**Solutions :**

```typescript
// Configuration proxy pour streaming
const STREAMING_CONFIG = {
  // Désactiver buffering
  responseBuffering: false,

  // HTTP/1.1 ou HTTP/2 avec keep-alive
  keepAlive: true,

  // Headers obligatoires
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
  },

  // Timeout long pour générations
  timeout: 300_000, // 5 minutes (déjà dans constants.ts)
};
```

### 5.2 Token Counting en Temps Réel

**Problème :** Compter les tokens pendant le streaming pour la facturation.

**Approches :**

| Approche | Précision | Performance | Implémentation |
|----------|-----------|-------------|----------------|
| **Post-stream counting** | 100% | ✅ Aucun impact | Compter après réception complète |
| **Chunk estimation** | ~95% | ⚠️ +1ms/chunk | Estimer par chunk SSE |
| **Header parsing** | 100% | ✅ Aucun impact | Utiliser `usage` de la réponse finale |

**Recommandation :** Utiliser le champ `usage` de la réponse finale Anthropic.

### 5.3 Latence

**Budget latence typique :**

| Composant | Latence | Acceptable |
|-----------|---------|------------|
| Auth/Rate limit | 1-5ms | ✅ |
| Semantic cache lookup | 10-50ms | ✅ |
| Model routing decision | 1-5ms | ✅ |
| Prompt compression | 100-500ms | ⚠️ Optionnel |
| **Total overhead** | **15-60ms** | ✅ Acceptable |

**Comparaison :** Latence API Anthropic = 500ms-5s selon modèle. Overhead proxy négligeable.

### 5.4 Sécurité

| Aspect | Implémentation | Priorité |
|--------|----------------|----------|
| **API Keys** | Hash SHA-256, jamais stocké en clair | 🔴 Critique |
| **Rate Limiting** | Par IP + par API key | 🔴 Critique |
| **Request Validation** | Zod schemas (déjà dans shared) | 🟡 Haute |
| **Logging** | Pas de contenu sensible | 🟡 Haute |

---

## 6. Analyse des Risques

### 6.1 Risques Techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Latence inacceptable** | Faible | Élevé | Optimisations optionnelles, bypass mode |
| **Cache poisoning** | Faible | Moyen | Isolation par user/project |
| **Memory leaks** | Moyen | Moyen | Monitoring, restart automatique |
| **Breaking changes API Anthropic** | Moyen | Élevé | Abstraction, tests E2E |

### 6.2 Risques Business

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Faible adoption** | Moyen | Élevé | UX seamless, bénéfices visibles |
| **Coût infrastructure** | Faible | Moyen | Serverless (Vercel), cache externe |
| **Compétition (LiteLLM, etc.)** | Élevé | Moyen | Focus niche IDE/CLI, intégration MCP |

---

## 7. Recommandations

### 7.1 Stratégie d'Implémentation

**Phase 1 : Proxy Passthrough (MVP)**
- Proxy simple qui forward vers Anthropic
- Logging, métriques, rate limiting
- Aucune optimisation (baseline mesurable)

**Phase 2 : Optimisations Natives Anthropic**
- Activer prompt caching
- Token-efficient tool use
- Model routing basique

**Phase 3 : Caching Sémantique**
- Intégration GPTCache ou custom
- Vector store (Qdrant/Pinecone)

**Phase 4 : Compression Avancée**
- LLMLingua pour gros contextes
- Optionnel, activable par projet

### 7.2 Stack Technique Recommandée

| Composant | Recommandation | Alternative |
|-----------|----------------|-------------|
| **Runtime** | Bun (déjà utilisé) | Node.js |
| **Framework** | Next.js API Routes (déjà) | Hono |
| **Cache sémantique** | Qdrant + custom | GPTCache |
| **Compression** | LLMLingua-2 (Python service) | Custom |
| **Monitoring** | Helicone ou custom | Langfuse |

### 7.3 Configuration Utilisateur

```typescript
// Interface de configuration par projet
interface ProxyConfig {
  // Optimisations
  enablePromptCaching: boolean;      // default: true
  enableSemanticCaching: boolean;    // default: false (opt-in)
  enableModelRouting: boolean;       // default: false
  enableCompression: boolean;        // default: false

  // Routing
  defaultModel: AnthropicModel;
  routingRules: RoutingRule[];       // conditions pour Haiku vs Opus

  // Seuils
  compressionThreshold: number;      // tokens min pour compresser
  cacheTTL: number;                  // durée cache sémantique
}
```

---

## 8. Roadmap d'Implémentation

### Phase 1 : MVP Proxy (2-3 semaines)

```
[ ] Route POST /api/v1/proxy/messages
[ ] Auth par API key (SHA-256 lookup)
[ ] Forward vers Anthropic API
[ ] Streaming SSE passthrough
[ ] Logging dans table requests
[ ] Headers X-CtxOpt-* dans réponse
[ ] Rate limiting par plan
```

### Phase 2 : Optimisations Natives (1-2 semaines)

```
[ ] Prompt caching Anthropic (header)
[ ] Token-efficient tool use (header beta)
[ ] Métriques d'économies dans dashboard
```

### Phase 3 : Model Routing (1 semaine)

```
[ ] Détection complexité requête
[ ] Règles de routage configurables
[ ] Fallback automatique si rate limit
```

### Phase 4 : Semantic Caching (2-3 semaines)

```
[ ] Intégration vector store (Qdrant)
[ ] Embedding des prompts
[ ] Similarity search
[ ] Cache invalidation strategy
```

### Phase 5 : Compression (2 semaines)

```
[ ] Service Python LLMLingua
[ ] API interne de compression
[ ] Activation conditionnelle (> N tokens)
[ ] Métriques de compression
```

---

## 9. Sources

### Documentation Officielle
- [Token-efficient tool use - Anthropic](https://docs.claude.com/en/docs/agents-and-tools/tool-use/token-efficient-tool-use)
- [Token-saving updates - Claude Blog](https://claude.com/blog/token-saving-updates)
- [Reducing latency - Claude Docs](https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-latency)
- [Streaming SSE - Upstash Blog](https://upstash.com/blog/sse-streaming-llm-responses)

### Solutions & Frameworks
- [LiteLLM Alternatives 2025 - Pomerium](https://www.pomerium.com/blog/litellm-alternatives)
- [Top LLM Gateways 2025 - Helicone](https://www.helicone.ai/blog/top-llm-gateways-comparison-2025)
- [GPTCache - Zilliz](https://github.com/zilliztech/GPTCache)
- [LLMLingua - Microsoft Research](https://www.microsoft.com/en-us/research/blog/llmlingua-innovating-llm-efficiency-with-prompt-compression/)

### Recherche Académique
- [LLMBridge: Reducing Costs - arXiv](https://arxiv.org/abs/2410.11857)
- [LLMLingua-2: Data Distillation - arXiv](https://arxiv.org/abs/2403.12968)
- [IC-Cache: In-context Caching - arXiv](https://arxiv.org/html/2501.12689v3)
- [ChunkKV: Semantic-Preserving KV Cache - arXiv](https://arxiv.org/html/2502.00299)

### Implémentation
- [claude-code-proxy - GitHub](https://github.com/1rgs/claude-code-proxy)
- [LiteLLM Caching Docs](https://docs.litellm.ai/docs/proxy/caching)
- [TokenFlow: Responsive LLM Streaming - arXiv](https://arxiv.org/html/2510.02758v1)

---

## Conclusion

L'implémentation d'un proxy d'optimisation pour CtxOpt est **techniquement faisable** et **économiquement justifiée**. Les benchmarks montrent un potentiel d'économie de **40-90%** selon les techniques appliquées.

**Recommandation finale :** Commencer par un MVP proxy simple avec les optimisations natives Anthropic (prompt caching, token-efficient tools), puis itérer vers le caching sémantique et la compression.

Le point fort de CtxOpt est son **intégration MCP existante** qui permet une approche hybride : optimisations côté client (MCP tools) + optimisations côté proxy (interception API).
