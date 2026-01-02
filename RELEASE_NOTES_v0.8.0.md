# Distill v0.8.0 - Release Notes

## Vue d'ensemble

Cette version majeure apporte des améliorations significatives sur trois axes principaux : **l'analyse de code AST**, **la sécurité et robustesse du SDK sandbox**, et **l'intelligence du résumé de logs**. Plus de 6 700 lignes de code ajoutées pour une expérience plus fiable et performante.

---

## Parsing AST enrichi pour 6 langages

### Nouvelles capacités d'extraction

Le parsing de code est maintenant considérablement plus détaillé. Pour tous les langages supportés (TypeScript, Python, Go, Rust, PHP, Swift), l'extraction inclut désormais :

- **Visibilité et modificateurs** : public/private/protected, static, abstract, final
- **Génériques et paramètres de type** : support complet des types génériques avec contraintes
- **Paramètres détaillés** : types, valeurs par défaut, paramètres optionnels, rest parameters
- **Décorateurs et attributs** : extraction des annotations et métadonnées du code
- **Enums** : nouveau type d'élément extrait (auparavant manquant)

### Améliorations par langage

**Rust** : Support des lifetimes, clauses `where`, fonctions `async/unsafe/const`, attributs `#[derive(...)]`, et ABI extern.

**Swift** : Support de Swift 6+ avec actors distribués, `async/await`, `Sendable`, typed throws, `@MainActor`, et le nouveau niveau d'accès `package`.

**Python** : Extraction améliorée des décorateurs, annotations de type, et classes avec héritage multiple.

**Go** : Meilleure gestion des interfaces, méthodes de receiver, et types embarqués.

**PHP** : Support des traits, interfaces, et namespaces amélioré.

---

## SDK Sandbox renforcé

### Gestion d'erreurs type-safe avec neverthrow

Toutes les API du SDK retournent maintenant des types `Result<T, Error>` au lieu de lever des exceptions. Cela permet :

- **Prévisibilité** : Impossible d'oublier de gérer une erreur - le compilateur vous rappelle à l'ordre
- **Composition** : Chaînage d'opérations avec gestion d'erreurs intégrée
- **Rétrocompatibilité** : Les anciennes API "legacy" qui lèvent des exceptions restent disponibles

### Types marqués (Branded Types)

Introduction de types marqués pour la sécurité à la compilation :

- `ValidatedPath` : Chemin de fichier validé contre les traversées de répertoire
- `SafePattern` : Pattern glob vérifié comme sûr
- `SanitizedGitArg` : Argument git nettoyé contre l'injection de commandes
- `SanitizedCode` : Code utilisateur ayant passé l'analyse de sécurité

Ces types garantissent au niveau du compilateur TypeScript qu'une valeur a été validée avant utilisation.

### Ressources avec nettoyage automatique (Disposables)

Utilisation du nouveau pattern `using` de TypeScript 5.2+ pour la gestion automatique des ressources :

- Les timers d'exécution sont automatiquement nettoyés
- Les sandboxes libèrent leurs ressources même en cas d'erreur
- Code plus propre et moins de fuites de ressources

### Mode QuickJS (expérimental)

Nouveau mode d'exécution optionnel utilisant WebAssembly pour une isolation complète :

- Sandbox véritablement isolée du processus Node.js
- Activable via `DISTILL_USE_QUICKJS=true`
- Plus sécurisé pour les cas d'usage sensibles

---

## Résumé de logs intelligent

### Scoring multi-facteurs

Nouveau système de scoring inspiré de BM25/TF-IDF qui prend en compte :

- **Niveau de log** : Erreurs pondérées plus fortement que les warnings et infos
- **Unicité du contenu** : Logs uniques valorisés par rapport aux répétitions
- **Position** : Début et fin de session considérés plus importants
- **Rareté** : Patterns inhabituels mis en avant

### Clustering sémantique

Regroupement automatique des logs similaires :

- Détection de patterns récurrents (ex: "Connection failed to X")
- Sélection du représentant le plus pertinent par cluster
- Réduction significative de la redondance dans les résumés

### Extraction de patterns

Identification automatique des templates de logs avec variables :

- Conversion de messages en patterns génériques (ex: `Error connecting to <IP>:<PORT>`)
- Statistiques sur la fréquence de chaque pattern
- Aide à identifier les problèmes récurrents

### Résumé hiérarchique

Nouveau mode de résumé pour les fichiers volumineux :

- Découpage temporel ou par taille en sections
- Résumé de chaque section puis agrégation
- Vision multi-niveaux : vue d'ensemble, sections, entrées critiques

---

## Pipeline Builder fluide

Nouvelle API chaînable pour les opérations multi-étapes :

- Interface immutable et type-safe
- Méthodes fluides : `glob()`, `read()`, `parse()`, `filter()`, `map()`, `compress()`
- Présets pour cas courants : analyse de code mort, extraction de signatures

---

## Nouvelles dépendances

- **neverthrow** : Gestion d'erreurs fonctionnelle type-safe
- **@jitl/quickjs-ng-wasmfile-release-sync** : Sandbox QuickJS WebAssembly
- **@sebastianwessel/quickjs** : Bridge hôte pour QuickJS

---

## Changements notables

- L'option `detailed` du parsing est maintenant dépréciée - l'extraction détaillée est toujours activée pour une meilleure qualité d'AST
- Les API retournant des `Result` sont la nouvelle norme ; les versions "legacy" qui lèvent des exceptions restent disponibles pour la rétrocompatibilité

---

**Note** : Cette release est un travail en cours. D'autres améliorations sont prévues avant la version finale 0.8.0.
