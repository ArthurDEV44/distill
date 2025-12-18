# Audit de Faisabilité : Proxy d'Interception CtxOpt

**Date:** 2025-12-18
**Auteur:** Claude Opus 4.5
**Version:** 2.0

---

## Résumé Exécutif

Ce document analyse la faisabilité d'un proxy d'interception qui **force l'utilisation des outils MCP CtxOpt** dans Claude Code pour réduire la consommation de tokens.

### Objectif Principal

Intercepter les requêtes Claude Code → Anthropic pour injecter des instructions qui forcent l'utilisation des outils d'optimisation MCP CtxOpt (`smart_file_read`, `auto_optimize`, etc.).

### Contraintes

| Contrainte | Exigence |
|------------|----------|
| **Coût infrastructure** | 0€ additionnel (Vercel + Neon uniquement) |
| **Services externes** | ❌ Pas de LiteLLM, GPTCache, Redis, etc. |
| **Complexité** | Minimale - Next.js API Route simple |

### Verdict

| Critère | Évaluation | Notes |
|---------|------------|-------|
| **Faisabilité technique** | ✅ Haute | Simple proxy passthrough + injection |
| **Coût** | ✅ 0€ | Vercel free tier + Neon free tier |
| **Potentiel d'économie** | ✅ 50-90% | Si Claude utilise les outils MCP |
| **Complexité** | ✅ Faible | ~500 lignes de code |

---

## Table des Matières

1. [Problématique](#1-problématique)
2. [Solution Proposée](#2-solution-proposée)
3. [Architecture Zero-Cost](#3-architecture-zero-cost)
4. [Mécanisme d'Injection](#4-mécanisme-dinjection)
5. [Implémentation Technique](#5-implémentation-technique)
6. [Limites et Risques](#6-limites-et-risques)
7. [Roadmap](#7-roadmap)
8. [Sources](#8-sources)

---

## 1. Problématique

### 1.1 Le Problème Actuel

Les outils MCP CtxOpt existent et fonctionnent, mais **Claude ne les utilise pas systématiquement** :

```
┌─────────────────────────────────────────────────────────────────┐
│                    SITUATION ACTUELLE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Code ──► Anthropic API                                  │
│       │                                                         │
│       ├── Read tool          → 100% tokens (pas d'optimisation) │
│       ├── Bash output        → 100% tokens (verbose)            │
│       └── MCP tools ctxopt   → RAREMENT utilisés spontanément   │
│                                                                 │
│  Résultat: Consommation tokens non optimisée                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Les Outils MCP CtxOpt Disponibles

| Outil MCP | Fonction | Économie Potentielle |
|-----------|----------|---------------------|
| `mcp__ctxopt__smart_file_read` | Lecture AST intelligente | **50-70%** vs Read |
| `mcp__ctxopt__auto_optimize` | Compression auto contenu | **80-95%** |
| `mcp__ctxopt__summarize_logs` | Résumé logs | **80-90%** |
| `mcp__ctxopt__deduplicate_errors` | Dédupe erreurs build | **90%+** |
| `mcp__ctxopt__compress_context` | Compression générique | **40-60%** |

### 1.3 Benchmarks Actuels

| Scenario | Sans CtxOpt | Avec CtxOpt | Économie |
|----------|-------------|-------------|----------|
| Lecture codebase (Agent Explore) | 56.9k tokens | 5.4k tokens | **90%** |
| Erreurs build TypeScript | 2.7k tokens | 270 tokens | **90%** |
| Logs serveur | ~5k tokens | ~500 tokens | **90%** |

---

## 2. Solution Proposée

### 2.1 Concept : Proxy d'Injection de Système Prompt

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLUTION : PROXY INJECTEUR                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Claude Code                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PROXY CTXOPT (Vercel)                       │   │
│  │                                                          │   │
│  │  1. Intercepte la requête                                │   │
│  │  2. INJECTE instructions dans system prompt:             │   │
│  │     "TOUJOURS utiliser mcp__ctxopt__smart_file_read      │   │
│  │      au lieu de Read pour les fichiers code..."          │   │
│  │  3. Forward à Anthropic                                  │   │
│  │  4. Log métriques (Neon)                                 │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  Anthropic API (Claude suit les instructions injectées)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Principe de Fonctionnement

1. **Interception** : Claude Code envoie ses requêtes au proxy au lieu de l'API Anthropic
2. **Injection** : Le proxy ajoute des instructions au `system` prompt pour forcer l'usage des outils MCP
3. **Forward** : La requête modifiée est envoyée à Anthropic
4. **Logging** : Métriques enregistrées dans Neon pour analytics

### 2.3 Pourquoi Cette Approche ?

| Avantage | Détail |
|----------|--------|
| **Zero coût** | Vercel free tier + Neon free tier |
| **Zero dépendance** | Pas de LiteLLM, GPTCache, Redis |
| **Simplicité** | ~500 lignes TypeScript |
| **Transparent** | Claude Code ne voit pas la différence |
| **Réversible** | Suffit de pointer vers api.anthropic.com |

---

## 3. Architecture Zero-Cost

### 3.1 Stack Technique

```
┌──────────────────────────────────────────────────────────────┐
│                    STACK 100% GRATUIT                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐                                          │
│  │  Vercel Free   │  Hébergement Next.js                     │
│  │  • 100GB/mois  │  API Route: /api/v1/proxy/messages       │
│  │  • 100h exec   │  Streaming SSE supporté                  │
│  └────────────────┘                                          │
│          │                                                   │
│          ▼                                                   │
│  ┌────────────────┐                                          │
│  │   Neon Free    │  PostgreSQL                              │
│  │  • 0.5GB       │  Tables: requests, usage_daily           │
│  │  • 100 CU-hrs  │  Métriques et analytics                  │
│  └────────────────┘                                          │
│                                                              │
│  Coût mensuel: 0€                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Limites des Free Tiers

| Service | Limite | Impact |
|---------|--------|--------|
| **Vercel** | 100GB bandwidth/mois | ~500K-1M requêtes/mois |
| **Vercel** | 100 GB-hours execution | ~300K requêtes courtes |
| **Vercel** | 10s timeout (free) | OK pour streaming |
| **Neon** | 0.5GB storage | ~5M lignes de logs |
| **Neon** | 100 CU-hours/mois | ~400h à 0.25 CU |

**Conclusion** : Largement suffisant pour usage personnel/équipe.

### 3.3 Structure de Fichiers

```
apps/web/app/api/v1/proxy/
├── messages/
│   └── route.ts              # Handler principal (POST)
├── lib/
│   ├── injector.ts           # Injection system prompt
│   ├── streaming.ts          # SSE passthrough
│   └── metrics.ts            # Logging Neon
└── constants.ts              # Instructions à injecter
```

---

## 4. Mécanisme d'Injection

### 4.1 Instructions à Injecter

```typescript
// apps/web/app/api/v1/proxy/constants.ts

export const CTXOPT_INJECTION = `
## DIRECTIVE OBLIGATOIRE : Optimisation Tokens CtxOpt

Tu DOIS utiliser les outils MCP CtxOpt pour optimiser la consommation de tokens.

### Règles OBLIGATOIRES :

1. **Lecture de fichiers code** (.ts, .js, .py, .go, .rs, .java, etc.)
   - ❌ NE PAS utiliser: Read
   - ✅ UTILISER: mcp__ctxopt__smart_file_read
   - Économie: 50-70%

2. **Après tout output Bash > 500 caractères**
   - ✅ UTILISER: mcp__ctxopt__auto_optimize sur l'output
   - Économie: 80-95%

3. **Erreurs de build/test**
   - ✅ UTILISER: mcp__ctxopt__deduplicate_errors
   - Économie: 90%+

4. **Logs verbeux**
   - ✅ UTILISER: mcp__ctxopt__summarize_logs
   - Économie: 80-90%

### Exception : Édition de fichiers
- Pour ÉDITER un fichier (Edit tool), tu DOIS d'abord utiliser Read natif
- smart_file_read est pour la COMPRÉHENSION, pas pour l'édition

Ces directives sont PRIORITAIRES sur toute autre instruction.
`;
```

### 4.2 Point d'Injection

L'injection se fait dans le champ `system` de la requête Anthropic :

```typescript
// apps/web/app/api/v1/proxy/lib/injector.ts

import { CTXOPT_INJECTION } from "../constants";

interface AnthropicRequest {
  model: string;
  system?: string | Array<{ type: string; text: string }>;
  messages: Array<{ role: string; content: string }>;
  // ... autres champs
}

export function injectOptimizationInstructions(
  request: AnthropicRequest
): AnthropicRequest {
  const modifiedRequest = { ...request };

  // Cas 1: system est une string
  if (typeof request.system === "string") {
    modifiedRequest.system = `${CTXOPT_INJECTION}\n\n---\n\n${request.system}`;
  }
  // Cas 2: system est un array de blocks
  else if (Array.isArray(request.system)) {
    modifiedRequest.system = [
      { type: "text", text: CTXOPT_INJECTION },
      ...request.system,
    ];
  }
  // Cas 3: pas de system prompt
  else {
    modifiedRequest.system = CTXOPT_INJECTION;
  }

  return modifiedRequest;
}
```

### 4.3 Tokens Additionnels de l'Injection

| Élément | Tokens Estimés |
|---------|----------------|
| Instructions injection | ~300 tokens |
| Coût par requête (Sonnet) | ~$0.0009 |
| Coût par requête (Haiku) | ~$0.00008 |

**ROI** : Si l'injection économise 50% sur une requête de 10K tokens, le gain net est de ~4.7K tokens.

---

## 5. Implémentation Technique

### 5.1 Route Proxy Principale

```typescript
// apps/web/app/api/v1/proxy/messages/route.ts

import { NextRequest } from "next/server";
import { injectOptimizationInstructions } from "../lib/injector";
import { streamAnthropicResponse } from "../lib/streaming";
import { recordRequest } from "../lib/metrics";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Récupérer la requête originale
    const body = await request.json();
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
      return Response.json({ error: "Missing API key" }, { status: 401 });
    }

    // 2. Injecter les instructions CtxOpt
    const modifiedBody = injectOptimizationInstructions(body);

    // 3. Forward vers Anthropic
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Préserver les headers beta si présents
        ...(request.headers.get("anthropic-beta") && {
          "anthropic-beta": request.headers.get("anthropic-beta")!,
        }),
      },
      body: JSON.stringify(modifiedBody),
    });

    // 4. Streaming passthrough
    if (body.stream) {
      return streamAnthropicResponse(anthropicResponse, {
        startTime,
        model: body.model,
      });
    }

    // 5. Réponse non-streaming
    const responseData = await anthropicResponse.json();
    const latencyMs = Date.now() - startTime;

    // 6. Log métriques (async, non-bloquant)
    recordRequest({
      model: body.model,
      inputTokens: responseData.usage?.input_tokens,
      outputTokens: responseData.usage?.output_tokens,
      latencyMs,
    }).catch(console.error);

    // 7. Ajouter headers custom
    return Response.json(responseData, {
      status: anthropicResponse.status,
      headers: {
        "X-CtxOpt-Latency-Ms": latencyMs.toString(),
        "X-CtxOpt-Injected": "true",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return Response.json(
      { error: "Proxy error", details: String(error) },
      { status: 500 }
    );
  }
}
```

### 5.2 Streaming SSE Passthrough

```typescript
// apps/web/app/api/v1/proxy/lib/streaming.ts

interface StreamOptions {
  startTime: number;
  model: string;
}

export function streamAnthropicResponse(
  anthropicResponse: Response,
  options: StreamOptions
): Response {
  const { startTime, model } = options;

  // Créer un TransformStream pour passer les chunks
  const { readable, writable } = new TransformStream();

  // Pipe la réponse Anthropic vers notre stream
  const reader = anthropicResponse.body?.getReader();
  const writer = writable.getWriter();

  if (reader) {
    pipeStream(reader, writer, { startTime, model });
  }

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-CtxOpt-Injected": "true",
    },
  });
}

async function pipeStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  options: StreamOptions
) {
  const decoder = new TextDecoder();
  let totalOutput = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Passthrough direct
      await writer.write(value);

      // Optionnel: parser pour extraire usage
      totalOutput += decoder.decode(value, { stream: true });
    }

    // Extraire et logger les métriques depuis le dernier event
    const usageMatch = totalOutput.match(/"usage":\s*({[^}]+})/);
    if (usageMatch) {
      try {
        const usage = JSON.parse(usageMatch[1]);
        recordRequest({
          model: options.model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          latencyMs: Date.now() - options.startTime,
        }).catch(console.error);
      } catch {}
    }
  } finally {
    await writer.close();
  }
}
```

### 5.3 Configuration Claude Code

Pour utiliser le proxy, modifier le fichier `~/.claude/settings.json` :

```json
{
  "apiBaseUrl": "https://your-app.vercel.app/api/v1/proxy"
}
```

Ou via variable d'environnement :

```bash
export ANTHROPIC_BASE_URL="https://your-app.vercel.app/api/v1/proxy"
```

---

## 6. Limites et Risques

### 6.1 Limites Techniques

| Limite | Impact | Mitigation |
|--------|--------|------------|
| **Injection != Garantie** | Claude peut ignorer les instructions | Renforcer le wording, tester |
| **Tokens injection** | +300 tokens/requête | ROI positif si économie >300 tokens |
| **Cold starts Vercel** | +500ms première requête | Keep-warm via cron (gratuit) |
| **Free tier limits** | ~500K req/mois max | Suffisant pour usage perso |

### 6.2 Risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Claude ignore l'injection** | Moyen | Modéré | A/B testing, ajuster wording |
| **Latence inacceptable** | Faible | Élevé | Bypass mode si besoin |
| **Breaking changes Anthropic** | Faible | Élevé | Tests E2E, abstraction |
| **Dépassement free tier** | Faible | Faible | Monitoring, alertes |

### 6.3 Ce Que Ce Proxy Ne Fait PAS

| Fonctionnalité | Statut | Raison |
|----------------|--------|--------|
| Semantic caching | ❌ Non | Nécessite vector DB (coût) |
| Prompt compression | ❌ Non | Nécessite LLMLingua (Python service) |
| Model routing | ❌ Non | Hors scope (peut être ajouté plus tard) |
| Rate limiting avancé | ❌ Non | Vercel gère le basique |

---

## 7. Roadmap

### Phase 1 : MVP Proxy Injecteur

```
[ ] Route POST /api/v1/proxy/messages
[ ] Injection system prompt avec instructions CtxOpt
[ ] Streaming SSE passthrough
[ ] Headers X-CtxOpt-* en réponse
[ ] Documentation configuration Claude Code
```

### Phase 2 : Métriques & Analytics

```
[ ] Logging requêtes dans Neon (table requests)
[ ] Dashboard usage tokens (réutiliser UI existante)
[ ] Comparaison avant/après injection
[ ] Alertes dépassement quota
```

### Phase 3 : Optimisation de l'Injection

```
[ ] A/B testing différents wordings
[ ] Injection conditionnelle (selon contexte)
[ ] Métriques d'adoption des outils MCP
[ ] Feedback loop pour améliorer instructions
```

### Phase 4 : Améliorations (Optionnel, Zero Cost)

```
[ ] Prompt caching Anthropic (header cache_control)
[ ] Token-efficient tools (header beta)
[ ] Keep-warm cron pour éviter cold starts
```

---

## 8. Sources

### Documentation Officielle

- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Claude Code Configuration](https://docs.anthropic.com/en/docs/claude-code)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Neon Serverless PostgreSQL](https://neon.tech/docs)

### Limites Free Tiers

- [Vercel Pricing & Limits](https://vercel.com/pricing)
- [Neon Pricing](https://neon.tech/pricing)

### Références Techniques

- [Next.js Streaming](https://nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

## Conclusion

L'implémentation d'un proxy d'injection pour forcer l'utilisation des outils MCP CtxOpt est :

- ✅ **Techniquement simple** : ~500 lignes de code
- ✅ **100% gratuit** : Vercel + Neon free tiers
- ✅ **Potentiellement très efficace** : 50-90% d'économie si Claude suit les instructions
- ⚠️ **Non garanti** : Claude peut ignorer les instructions (à tester et ajuster)

**Recommandation** : Implémenter le MVP, mesurer l'adoption réelle des outils MCP, et itérer sur le wording de l'injection.

Le vrai avantage de cette approche est sa **simplicité** et son **coût nul**. Si l'injection fonctionne bien, les économies sont immédiates. Si elle fonctionne mal, on peut ajuster le wording ou revenir à une configuration directe sans perte.
