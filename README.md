# Talus

TP Kubernetes (INFO910), Université Savoie Mont Blanc.

**Membre (travail individuel) : Antoine GUICHARD**

Talus est un jeu de conduite 2D pour navigateur : un petit véhicule roule sur un terrain infini, de plus en plus accidenté, en ramassant des pièces et des bidons d'essence. Un backend gère les comptes, le classement et une boutique d'améliorations. Côté Kubernetes, un worker indépendant **rejoue chaque partie** pour valider les scores (anti-triche), et la configuration du jeu se modifie **à chaud** via une ConfigMap. La base est sauvegardée en continu sur un volume persistant dédié, et des scripts rejouent des pannes de façon reproductible.

---

## 1. Le jeu

| Touche | Action |
|---|---|
| `→` ou `D` | Accélérer (en l'air : pencher en arrière) |
| `←` ou `A` | Freiner, reculer (en l'air : pencher en avant) |
| `R`, `Espace` ou `Entrée` | Relancer instantanément |
| `Échap` ou `P` | Menu pause (reprendre, recommencer, Garage, classement, compte) ; ferme aussi les fenêtres |

- L'écran titre disparaît dès qu'on appuie sur `→` : on roule immédiatement.
- La partie s'arrête si la tête du pilote touche le sol ou s'il n'y a plus d'essence. Le score est la distance parcourue.
- On peut jouer tout de suite, sans compte (mode invité). Avec un compte (bouton **Sign in to save**), chaque partie est vérifiée par le serveur : la distance entre alors au **Leaderboard** et les pièces sont créditées.
- Le **Garage** permet d'acheter avec ces pièces 4 améliorations : moteur, pneus, suspension et réservoir.
- Le terrain traverse 5 biomes, chacun avec son ciel, ses montagnes, sa végétation, sa météo et son adhérence : **Meadow** (arbres, fleurs, pollen), **Desert** (mesas, cactus, vent de sable), **Tundra** (sapins enneigés, aurore boréale, neige, sol glissant), **Volcano** (volcan fumant, roches de lave, braises), **Dusk** (lune, étoiles, cristaux et champignons lumineux, lucioles). Les phares s'allument dans les biomes sombres. Tout l'habillage d'un biome (couleurs, objets, densité, météo) est décrit dans la ConfigMap `game-config`.
- En haut à droite, `served by api-xxxx` indique le pod de l'API qui a répondu.

### Pourquoi une physique « maison »
La physique (ressorts, roues, contact avec le sol) est écrite à la main dans `packages/game-core` et **déterministe** : pas de temps fixe de 1/120 s, et seulement les opérations `+ − × ÷ √`, dont le résultat est identique au bit près dans tous les moteurs JavaScript. Les fonctions comme `sin`/`cos` n'ont pas cette garantie. Une partie se résume donc à **une graine et une liste de changements de touches**, et le serveur peut la rejouer exactement : c'est la base de l'anti-triche.

## 2. Architecture

```
                     ┌──────────── namespace talus ─────────────────────────────────────┐
 navigateur ──HTTP──▶│ Ingress (nginx) talus.local                                       │
                     │   ├─ /api ──▶ Service api ──▶ Deployment api ×2 (Hono)            │
                     │   └─ /    ──▶ Service web ──▶ Deployment web ×2 (nginx, React)    │
                     │                                   │  ConfigMap game-config (fichier)│
                     │   Deployment verifier ×2 ─────────┤                                │
                     │   (rejoue les parties)            ▼                                │
                     │                     Service headless postgres                      │
                     │                     StatefulSet postgres (PVC data-postgres-0)     │
                     │                                   ▲                                │
                     │   Deployment backup (pg_dump en boucle) ──▶ PVC backups ──▶ PV Retain│
                     └───────────────────────────────────────────────────────────────────┘
```

| Dossier | Contenu |
|---|---|
| `packages/game-core` | Terrain, physique, simulation, rejeu, schéma Zod de la configuration. Utilisé **à la fois** par le navigateur et par le verifier |
| `packages/db` | Schéma Drizzle, migrations SQL, connexion PostgreSQL |
| `apps/web` | React, Zustand, rendu Canvas 2D (Vite, servi par nginx) |
| `apps/api` | API Hono (comptes, parties, classement, boutique, configuration, sondes de santé) |
| `apps/verifier` | Worker anti-triche |
| `k8s/` | Manifestes Kubernetes, numérotés dans l'ordre d'application et commentés |
| `scripts/` | Construction des images, déploiement, démonstrations, bot de test |

Cycle de vie d'une partie connectée :
1. `POST /api/runs` : le serveur tire la graine et fige un instantané de la configuration (son hash) et des améliorations du joueur. Le client ne choisit pas sa graine.
2. Le client joue et enregistre ses changements de touches.
3. `POST /api/runs/:id/finish` : la partie passe en `pending`.
4. Un pod verifier la prend (`SELECT … FOR UPDATE SKIP LOCKED`), la rejoue avec exactement la même configuration, compare le résultat à ce qu'annonce le client, puis la marque `verified` (pièces créditées) ou `rejected`. Il enregistre aussi son nom de pod dans `verified_by`.

## 3. Déployer sur Kubernetes (minikube)

Prérequis : `docker`, `minikube`, `kubectl`. Node.js et pnpm ne servent qu'au bot de démonstration et au développement.

```bash
minikube start --driver=docker --cpus=4 --memory=6g
scripts/build-images.sh   # construit talus/{api,verifier,web}:1.0.0 et les charge dans minikube
scripts/deploy.sh         # active l'addon ingress, applique k8s/, attend que tout soit prêt
```

Il suffit ensuite d'ajouter le nom d'hôte dans `/etc/hosts` puis d'ouvrir <http://talus.local> :

```bash
echo "$(minikube ip) talus.local" | sudo tee -a /etc/hosts
```

Les manifestes peuvent aussi s'appliquer à la main : `kubectl apply -f k8s/00-namespace.yaml && kubectl apply -f k8s/`.
Pour tout supprimer : `kubectl delete namespace talus && kubectl delete pv talus-backups`. Le contenu des sauvegardes reste dans `/data/talus-backups` sur le nœud minikube.

> **Secrets** : `k8s/10-secrets.demo.yaml` contient des **valeurs de démonstration** clairement signalées (`demo-only-…`). Elles sont versionnées pour que le projet se déploie en une commande. En usage réel, on les crée hors du dépôt (`kubectl create secret …`, la commande est en commentaire dans le fichier).

## 4. Choix Kubernetes

| Notion | Où | Pourquoi |
|---|---|---|
| **Namespace** | `talus` | Isolation des noms, nettoyage en une commande, DNS `*.talus.svc.cluster.local` |
| **StatefulSet + Service headless** | `postgres` | Nom stable `postgres-0`, DNS stable `postgres-0.postgres` (utilisé par les applications), PVC propre au pod via `volumeClaimTemplates`, réattaché quand le pod est recréé |
| **Deployment** | `api`, `web`, `verifier`, `backup` | Applications sans état, sauf `backup` qui écrit sur son propre volume (stratégie `Recreate`, car le volume est en RWO) |
| **Service ClusterIP** | `api`, `web` | Adresse stable et répartition de charge entre les répliques. Le verifier n'en a **pas** : il ne reçoit aucun trafic |
| **Ingress** (fanout par chemin) | `/api` vers api, `/` vers web | Une seule origine, donc pas de CORS et le cookie de session fonctionne directement |
| **ConfigMap (volume)** | `game-config` vers `/etc/talus/game.json` | Physique, carburant, difficulté du terrain, prix de la boutique et biomes sont **modifiables à chaud**, sans reconstruire ni redémarrer. Le fichier est validé par Zod : une config invalide est refusée et l'ancienne reste active |
| **ConfigMap (env)** | `platform` | Réglages non sensibles (hôte de la base, intervalle des sauvegardes…) |
| **ConfigMap (fichier exécutable)** | `backup-script` (`defaultMode: 0755`) | Le script de sauvegarde vit dans le cluster, pas dans une image |
| **Secrets** | `db-credentials` (type `basic-auth`), `api-session` (`Opaque`) | Injectés par `secretKeyRef` |
| **Downward API** | `POD_NAME` dans api et verifier | En-tête `X-Served-By` affiché dans le jeu ; colonne `verified_by` des parties |
| **emptyDir** | verifier `/run/heartbeat` | Fichier « battement de cœur » lu par la liveness probe |
| **PV statique + PVC (selector)** | `talus-backups`, `storageClassName: manual`, `Retain` | Les sauvegardes survivent à la suppression de la base, de son PVC, voire du namespace |
| **requests / limits** | tous les conteneurs | Ressources garanties et plafonds |

### Sondes de santé : une question précise par sonde

| Composant | startup | liveness | readiness |
|---|---|---|---|
| **api** | `/healthz/startup` : migrations appliquées (sous verrou consultatif Postgres, sans risque avec plusieurs répliques) et configuration chargée. Jusqu'à 2 min, le temps que la base démarre | `/healthz/live` : la boucle d'événements répond. **Ne teste pas la base**, pour qu'une panne de base ne provoque pas une tempête de redémarrages | `/healthz/ready` : base joignable et pod pas en cours d'arrêt. En cas d'échec, le pod sort des endpoints du Service, puis revient seul |
| **verifier** | premier battement de cœur écrit | battement de cœur de moins de 30 s (exec) : détecte une boucle bloquée. Le battement continue même si la base est en panne | aucune, car il n'est derrière aucun Service |
| **postgres** | `pg_isready` (jusqu'à 60 s, pour `initdb`) | `tcpSocket` 5432, volontairement plus léger que la readiness | `pg_isready` |
| **web** | inutile (nginx démarre instantanément) | `tcpSocket` | `GET /` |
| **backup** | une première sauvegarde existe | la dernière sauvegarde a moins de 2 intervalles + 1 min : si les sauvegardes s'arrêtent en silence, le compteur de redémarrages le montre | aucune, sans objet |

À l'arrêt (`SIGTERM`), l'API passe d'abord en « non prête », attend 5 s que le Service la retire, puis se ferme : les mises à jour progressives ne coupent pas de requêtes.

## 5. Démonstrations reproductibles

Chaque script s'exécute sur le cluster déployé et affiche ce qu'il fait. Ils ont été exécutés pendant le développement ; les sorties ci-dessous sont résumées.

### Démo 1 : supprimer le pod de la base (`scripts/demo-db-resilience.sh`)
- `kubectl delete pod postgres-0` : le pod est recréé sous le **même nom**, avec le **même PVC** (`data-postgres-0`). Joueurs et classement sont identiques après coup.
- Panne prolongée (StatefulSet ramené à 0 réplique pendant environ 40 s) : au bout d'environ 10 s, les deux pods api passent `ready=false` et quittent les endpoints, et l'Ingress répond 503. Au retour de la base, ils redeviennent prêts **d'eux-mêmes**.
- Compteur de redémarrages des pods api : `0 0 → 0 0`. La liveness n'a pas réagi à la panne de base, comme prévu.

### Démo 2 : changer la gravité à chaud (`scripts/demo-config.sh`)
- La gravité passe de 9.81 à 1.62 (gravité lunaire) par un `kubectl apply` de la ConfigMap. **Chaque** pod api sert la nouvelle valeur après un délai qui varie (de quelques secondes à environ 1 min : c'est le kubelet qui rafraîchit le fichier monté). Les UID des pods ne changent pas : pas de redémarrage.
- Une configuration invalide (gravité négative) est refusée, avec un message dans les logs, et l'ancienne reste active.
- Chaque configuration est enregistrée en base sous son hash. Une partie commencée avec l'ancienne gravité est donc rejouée avec l'ancienne gravité.

### Démo 3 : anti-triche et mise à l'échelle (`scripts/demo-anticheat.sh`)
- Le verifier passe à 3 répliques, et 6 bots jouent en même temps. Deux d'entre eux annoncent 3 fois leur vraie distance et 500 pièces de trop.
- Résultat obtenu : 4 parties `VERIFIED`, 2 `REJECTED` (`claimed 1014 m / 515 coins, replay gave 338 m / 15 coins`), réparties entre plusieurs pods (`verified_by`). Les tricheurs n'apparaissent pas au classement.
- On peut jouer une seule partie à la main : `scripts/bot.sh --ip=$(minikube ip) [--cheat]`.

### Démo 4 : sinistre et restauration (`scripts/demo-backup-restore.sh`)
- Un dump est pris, puis on supprime le **StatefulSet et le PVC** de la base : les données sont réellement perdues.
- Le manifeste est réappliqué : la nouvelle base est vide (0 table).
- `scripts/restore-backup.sh <dump>` restaure depuis le PV de sauvegarde. Le résultat obtenu est identique : `2 players, 2 runs, 25 coins`, et le classement est revenu.

## 6. Développement local (sans Kubernetes)

```bash
pnpm install
pnpm test                                  # tests game-core (déterminisme, terrain, ConfigMap)
docker run -d --name talus-pg -e POSTGRES_USER=talus -e POSTGRES_PASSWORD=talus -e POSTGRES_DB=talus -p 55432:5432 postgres:17-alpine
pnpm --filter @talus/api build && DATABASE_PORT=55432 SESSION_SECRET=local-dev-secret-0123456789 node apps/api/dist/index.js
pnpm --filter @talus/verifier build && DATABASE_PORT=55432 node apps/verifier/dist/index.js
pnpm --filter @talus/web dev               # http://localhost:5173 (proxy /api vers :3000)
```

`scripts/gen-game-configmap.sh` régénère la ConfigMap du jeu à partir des valeurs par défaut du code. Un test vérifie que les deux restent identiques.

## 7. Ce qui a été vérifié et ce qui reste à vérifier à la main

**Exécuté** pendant le développement, sur minikube v1.39 (Kubernetes 1.37, runtime containerd) :
- Tests unitaires `game-core` (8 tests) : déterminisme, rejeu identique, détection d'entrées falsifiées, pente du terrain plafonnée, validité de la ConfigMap.
- Déploiement complet par `scripts/deploy.sh` : tous les pods passent `Running/Ready`.
- Les 4 démonstrations ci-dessus.
- Parcours complet dans Chromium (headless, via l'Ingress) : inscription, partie jusqu'à la fin, partie **Verified** par un pod verifier.

**À vérifier à la main** :
- Le **ressenti du jeu** : difficulté, sensation de la physique, lisibilité. Je n'ai fait que des parties automatisées (bot et Chromium headless). Les réglages sont dans la ConfigMap `game-config`.
- Le jeu dans **Firefox** : le déterminisme entre Firefox (SpiderMonkey) et Node (V8) repose sur l'arithmétique IEEE 754, mais une partie jouée dans Firefox n'a pas encore été vérifiée.
- Le bouton d'achat du Garage dans l'interface. L'achat lui-même a été testé via l'API (refus si les pièces manquent, achat réussi, puis partie avec le moteur amélioré **Verified**), mais pas par un clic.
- La persistance de `/data/talus-backups` après `minikube stop && minikube start`.

**Limites connues** : chaque relance pré-réserve une partie côté serveur, et les parties jamais terminées restent en statut `started` (aucun nettoyage automatique).
