# 📋 Avancement du projet

Récapitulatif de l'état du projet : ce qui est fait, comment le lancer, et ce
qu'il reste à faire.

> Base du jeu : [jsPacman](https://github.com/8tentaculos/jsPacman) (8tentaculos,
> MIT) — un Ms. Pac-Man solo en DOM/JS. Une couche multijoueur + backend est
> construite par-dessus pour **ft_transcendence**.

---

## 1. Architecture actuelle

```
pacman_ft_transcendence/
├── src/                          FRONTEND (jeu jsPacman + couche multi)
│   ├── index.js / index.html     point d'entrée. ?room=<nom> → mode multi
│   ├── styles.css
│   ├── rules-test.html           banc de test des règles (2 joueurs même clavier)
│   └── js/
│       ├── engine/               moteur (Game, Sprite, Sound, Keyboard, Touch, Gamepad, Timer…)
│       ├── Game.js  Pacman.js  Ghost.js  Map.js  Tile.js …   jeu de base (AMONT — non modifié)
│       ├── maps/                 4 labyrinthes
│       │
│       ├── Builder.js            NOUVEAU  fantôme qui pose des murs temporaires
│       ├── PacmanMan.js          NOUVEAU  Pac-Man « homme » (sprite + rotation)
│       ├── PacmanBaby.js         NOUVEAU  Pac-Man « bébé » (réduit + couche, suit un parent)
│       ├── RulesGame.js          NOUVEAU  variante avec règles avancées (hors réseau)
│       ├── factory/              make{Builder,PacmanMan,PacmanBaby}.js
│       │
│       └── net/                  NOUVEAU  toute la couche réseau, isolée
│           ├── NetClient.js          client WebSocket (connexion, reconnexion, events)
│           └── MultiplayerGame.js    jeu multi (rôles, joueurs distants, avatar fantôme/builder)
│
├── backend/                      BACKEND  Django + Channels + DRF
│   ├── game/
│   │   ├── consumers.py          WebSocket : GameConsumer (jeu) + VoiceConsumer (vocal)
│   │   ├── models.py             GameRoom, Player, Friendship, PlayerProfile, GameState
│   │   ├── views.py              API REST : rooms / players / friends / profiles
│   │   ├── serializers.py
│   │   ├── routing.py            ws/game/<salon>/  ,  ws/voice/<salon>/
│   │   ├── room_cleanup.py       NOUVEAU  suppression auto des salons vides
│   │   ├── room_state.py         NOUVEAU  état de jeu partagé (grains, scores, manche) — en mémoire process
│   │   ├── tests.py              NOUVEAU  tests de room_state
│   │   └── migrations/
│   └── pacman_server/            settings (SQLite + Redis pour les channels)
│
├── docker-compose.yml            3 services : redis, backend (daphne:8000), frontend (:3000)
├── scripts/server.js             serveur statique (sirv) pour src/ + public/
│
└── src/js/  (anciens fichiers réseau NON UTILISÉS, à supprimer ou intégrer) :
    NetworkManager.js  NetworkPlayer.js  VoiceChatManager.js  RoomSelector.js
    GameLobby.js  CommunicationManager.js  FriendsManager.js  GameModel.js
```

**Principe de dev** : le code amont (`Game.js`, `Pacman.js`, `Ghost.js`, moteur…)
n'est **jamais édité**. Tout ajout se fait par héritage (`extends`) ou dans de
nouveaux fichiers. Un bug = un petit fichier à regarder, pas tout le projet.

---

## 2. Ce qui a été fait

### ✅ Consolidation (commit `5ef6393`)
- Le repo avait 3 dossiers (`MadamePacman`, `network_pacman`, `network_pacman_v2`).
  Fusionnés en un seul à la racine ; les 2 obsolètes supprimés.

### ✅ Backend qui tourne (commit `e8ed479` + non commité)
- venv Python + `requirements.txt` (Django 5.0.6, channels, daphne, redis…).
- **Migrations créées** : le dossier `backend/game/migrations/` n'existait pas →
  aucune table. Migration initiale `0001` générée et appliquée.
- API REST testée : `GET/POST /api/rooms/` OK.
- WebSocket testé : relais temps réel entre 2 clients OK.

### ✅ Personnages + règles (commit `0279473`)
| Fichier | Rôle |
|---|---|
| `Builder.js` (`extends Ghost`) | pose un mur temporaire 10 s (`tile.code = '='`), cooldown 3 s, ne tue pas, teinte verte |
| `PacmanMan.js` (`extends Pacman`) | sprite ligne 0 de `characters.png` + rotation selon la direction |
| `PacmanBaby.js` (`extends PacmanMan`) | 0.6×, bande blanche « couche » en CSS, suit le parent le plus proche |
| `factory/make*.js` | mêmes conventions que `makeGhost` / `makeMsPacman` |
| `RulesGame.js` (`extends Game.js`) | override `makeLevel` / `mainLoop` / `reset` : Builder remplace Sue, 2ᵉ joueur (WASD/ZQSD), bébé né de la rencontre des 2 pacmen, effets gel (5 s) / prison (15 s) |
| `rules-test.html` | jeu jouable + boutons (mur, bébé, gel, prison) + panneau d'état live |

### 🔸 Réseau — palier 1 : se voir bouger (NON COMMITÉ)
- `NetClient.js` : client WebSocket propre — `connect`, reconnexion (5 essais),
  throttle des envois, events `open/close/join/leave/pos/role/error`, sans `console`.
- `MultiplayerGame.js` (`extends Game.js`) : `?room=<nom>` connecte au backend,
  les autres joueurs s'affichent en Pac-Men interpolés vers leur position réseau.
- `index.js` : `?room=` → `MultiplayerGame`, sinon jeu solo inchangé.

### 🔸 Réseau — palier 2 : les rôles (NON COMMITÉ)
- `?role=pacman|madame_pacman|baby|ghost|builder`.
- Chaque joueur distant s'affiche avec **le sprite de son rôle** (un fantôme
  distant = sprite fantôme, un builder = vert, etc.).
- Ré-annonce du rôle quand un nouveau joueur arrive (le backend ne fait que
  relayer, il ne rejoue pas l'historique).

### 🔸 Réseau — palier 2.5 : contrôle local du rôle (NON COMMITÉ)
- `?role=ghost` ou `builder` → tu **pilotes un fantôme / builder** (`this.avatar`),
  pas Ms Pac-Man. Le Pac-Man de base est caché et gelé (les fantômes IA le
  gardent comme cible valide), ses événements de mort sont coupés.
- Récupération propre après reconnexion (redémarrage backend, socket coupée) :
  reset de l'identité + purge des joueurs distants.
- GC : un joueur distant silencieux depuis 3 s est retiré (plus de « fantômes
  figés »).

### 🔸 Réseau — palier 3 : grille de grains + score autoritaires serveur (NON COMMITÉ)
- `backend/game/room_state.py` : `RoomState` par salon, gardé en mémoire du
  process daphne. Le serveur possède **la grille de grains** (lue depuis
  `src/js/maps/map-1.js`), **le score par joueur** et **l'issue de la manche**
  (Pac-Man gagne quand tout est mangé). Expiration des joueurs muets (> 10 s).
- `consumers.py` : handlers `round_start` (la manche passe « en cours »),
  `eat_dot` (le serveur tranche, échoue silencieusement si grain déjà mangé /
  mauvais rôle / manche finie), `request_sync`. Boucle `state_sync` de secours
  toutes les 2 s + purge des absents ; le gros passe par les `dot_eaten` en
  direct. `round_over` est maintenant **déclenché serveur**.
- `MultiplayerGame.js` : le Pac-Man local reporte chaque grain (`item:eatdot` /
  `item:eatpill`) au serveur — score local = simple prédiction, réconciliation
  via `dot_eaten` (grain mangé par un autre) et `state_sync` (resync deux sens).
  `win()` local neutralisé (un miscount ne peut plus finir la manche tôt). En
  palier 3 il n'y a **pas encore de combat** : la mort par fantôme IA est coupée
  côté Pac-Man (un game-over local isolerait ce client).
- `NetClient.js` : events `roundstarted` / `doteaten` / `sync`.
- `backend/game/tests.py` : 12 tests (`seed_dots`, `eat_dot`, manche, prune,
  snapshot) — `manage.py test game`.
- **Écran de fin** : le bandeau de fin de manche affiche le classement des
  joueurs (rôle + « (toi) », trié par score) à partir du `state_sync` — le
  serveur envoie un `snapshot` avec `roles` + un `state_sync` final juste après
  `round_over` pour des scores exacts. L'event `roundstarted` est branché
  (`_roundAnnounced` anti-doublon).

### 🔸 Réseau — palier 4 : collisions joueurs (NON COMMITÉ)
- **Détection côté client, arbitrage serveur** (même modèle de confiance que
  `eat_dot`). Un joueur Pac-Man qui voit un fantôme/Builder distant le toucher
  envoie `contact {ghost: <id>}` (débounce 1,2 s) ; le serveur tranche.
- `room_state.py` : `resolve_contact()` — vies par joueur (`DEFAULT_LIVES = 3`),
  cooldown anti-rafale (2 s), fenêtre « effrayé » de 6 s ouverte par un
  super-grain. Contact normal → une vie en moins ; tous les Pac-Man à 0 →
  `status = 'over'`, `winner = 'ghosts'`. Contact pendant la fenêtre → le
  fantôme rentre au bercail et le Pac-Man marque `GHOST_EAT_SCORE = 200`.
- `consumers.py` : `handle_contact` → broadcast `player_caught {pid, lives}` /
  `ghost_home {ghost, by}` + `round_over` si fin + `state_sync`.
- `MultiplayerGame.js` : la mort de Pac-Man est **rétablie** mais seulement
  entre joueurs — `_disarmAiGhosts()` coupe le `item:eat` des 4 fantômes IA
  (déco en multi) sans casser la chaîne `game:ghost:eat → mort`. `player_caught`
  (soi) rejoue l'anim de mort ; `_onChangeLives` ne déclenche plus jamais
  l'écran GAME OVER de base (c'est le serveur qui envoie `round_over`).
  `ghost_home` (soi) renvoie l'avatar dans la maison. Avatar teinté bleu pendant
  la fenêtre « effrayé » (`_updateFrightenedTint`). `snapshot` porte `lives` +
  `frightened_ms` ; `_onSync` recale `model.lives` (jamais à 0).
- `NetClient.js` : `sendContact()`, events `caught` / `ghosthome`.
- `tests.py` : 18 tests (6 nouveaux sur `resolve_contact`).

**Limites palier 4** : la fenêtre « effrayé » est pilotée serveur (6 s après un
super-grain) et **désynchro** de l'animation « frightened » des fantômes IA
locaux. Le Pac-Man qui mange un fantôme n'a pas d'anim locale « gobe-fantôme »,
juste les points. Pas de bébé pris en compte dans le décompte des vies.

### 🔸 Réseau — rôle Blocker (NON COMMITÉ)
- Nouveau rôle **Pac-Man** `blocker`, symétrique inverse du fantôme Builder :
  construit des murs anti-fantômes (`BLOCKER_WALL_CODE`, bleus) que les autres
  Pac-Man traversent librement mais qui bloquent les avatars fantôme/Builder ;
  peut marcher sur un mur Builder (exempté du blocage normal) pour le détruire,
  diffusé à tous via `wall_destroy`.
- **Increvable** : `resolve_contact()` renvoie `{'type': 'pacman_imprisoned',
  'seconds': 15}` au lieu de retirer une vie quand la cible touchée est un
  Blocker (la fenêtre « effrayé » reste prioritaire — un Blocker mange
  toujours normalement un fantôme pendant cette fenêtre). Le Blocker mange les
  grains comme un Pac-Man normal.
- `consumers.py` : `handle_wall_destroy` (relais sans état, comme
  `handle_wall_placed` qui gagne un champ `kind: 'builder'|'blocker'`),
  `broadcast_player_imprisoned {pid, seconds}`.
- `MultiplayerGame.js` : `_maybeDropBlockerWall`, `_maybeDestroyWall`,
  `_blockGhostOnBlockerWalls` (symétrique de `_blockPacmanOnBuilderWalls`),
  `_onPlayerImprisoned` / `_updateImprisoned` (vitesse 0 + teinte, 15 s).
- `tests.py` : 3 tests (`RoomStateBlockerTests`).

### 🔸 Suppression auto des salons vides (NON COMMITÉ)
- `GameRoom.last_active` (nouveau champ, migration `0002`).
- `consumers.py` : chaque connexion WS **crée le salon en base** (avant, seuls
  les salons créés via l'API REST existaient) + rafraîchit `last_active`
  (throttlé à 15 s pour ne pas écrire à chaque position).
- `room_cleanup.py` : `sweep_stale_rooms()` supprime tout salon inactif depuis
  **5 min**. Un thread démon balaie toutes les 60 s (démarré à la 1ʳᵉ connexion
  WS) ; `GET /api/rooms/` déclenche aussi un balayage (filet de sécurité).

### ✅ Corrections diverses
- `PacmanMan` / `PacmanBaby` : orientation du sprite (base regarde à droite).
- `npm install` : le script `prepare` (`test` cassé) fait échouer l'install →
  utiliser `npm install --ignore-scripts`.

---

## 3. Lancer le projet

### Tout en une commande (recommandé — sert le lobby + le jeu, back en LAN)
```bash
npm install --ignore-scripts        # une fois
./scripts/dev-all.sh                 # front + daphne, logs [front]/[back], Ctrl-C = stop
#   LOCAL=1 ./scripts/dev-all.sh     # localhost uniquement
```
Redis doit tourner (`redis-cli ping`). Menu `/`, lobby `/lobby.html`, jeu
`/game?room=…&role=…`. Le lobby redirige vers `/game` avec `&autostart=1`.

### À la main (debug ciblé)
```bash
node scripts/dev-server.js           # front + live-reload + route /game
cd backend && REDIS_HOST=127.0.0.1 ../.venv/bin/daphne -b 0.0.0.0 -p 8000 pacman_server.asgi:application
```
(`scripts/server.js` sert seulement `src/` + `public/` — pas le lobby.)
(Redis doit tourner : `redis-server` ou `docker run -p 6379:6379 redis:7-alpine`.)

### URLs
| URL | Ce que ça fait |
|---|---|
| `http://localhost:3000/` | jeu solo |
| `http://localhost:3000/?room=x&role=pacman` | multi, tu es Pac-Man |
| `http://localhost:3000/?room=x&role=ghost` | multi, tu es un fantôme |
| `http://localhost:3000/?room=x&role=builder` | multi, tu es le builder |
| `http://localhost:3000/rules-test.html` | test des règles (2 joueurs même clavier) |
| `http://localhost:8000/api/rooms/` | liste des salons (JSON) |

Ouvrir **2 onglets** avec le même `room=` et des `role=` différents pour voir le multi.

### Docker
`docker compose up` — **pas encore fonctionnel** (voir « reste à faire »).

---

## 4. Ce qui reste à faire

### 🔨 Le jeu multi
1. **Fusionner `RulesGame` + `MultiplayerGame`** — ✅ murs (Builder + Blocker),
   gel, prison (rôle Blocker) et bébé sont en réseau. Reste : le Builder ne
   peut pas détruire les murs du Blocker (à sens unique pour l'instant).
2. **État autoritaire serveur** — ✅ *(paliers 3-4)* dots / score / vies / fin de
   manche / collisions joueurs gérés par `room_state.py` + `consumers.py`.
   Reste la **persistance en base** (`models.py` GameState / Player toujours
   inutilisés en jeu) et le **positionnement autoritaire** (les persos bougent
   encore côté client, le serveur ne vérifie pas les positions).
3. **Synchro** des murs du Builder, de la naissance du bébé, des pouvoirs.
4. **Chat vocal WebRTC** — `VoiceChatManager.js` + `VoiceConsumer` existent, pas branchés.
5. ✅ **Spectateurs** — rôle `spectator` : depuis le lobby, bascule dans `/game?role=spectator`,
   vue en lecture seule (bandeau « MODE SPECTATEUR » + scoreboard live, ne pilote rien,
   n'envoie aucune position). `RoomState.spectators` les tient hors des scores / de la manche ;
   les joueurs ne voient pas de sprite pour eux.

### 🔨 Lobby & parcours
6. ✅ **`lobby.html` → jeu** — roster live via `lobby_hello` (WS), bouton Prêt,
   décompte synchro (`lobby_start`), redirection `/game?room=…&role=…&name=…&autostart=1`.
   Le pseudo suit dans la partie (métadonnée de rôle → scoreboard). **Restes :**
   exclusivité des rôles (2 joueurs peuvent prendre `pacman`), vue spectateur,
   liste des salons filtrée par activité récente.
7. **Écran de fin** — ✅ bandeau + classement ; reste « rejouer » propre / retour lobby.
8. **`index.html` (menu)** — vraies stats, navigation cohérente.

### 🔨 Backend & comptes
9. ✅ *(partiel)* **`consumers.py` ↔ base de données** — chaque manche terminée est
   enregistrée (`MatchResult` : salon, durée, gagnant, scores/rôles/vies par joueur)
   et met à jour `PlayerProfile` (parties jouées / gagnées / score total).
   API `GET /api/matches/` (`?player=` `?room=` `?limit`) + `/api/profiles/leaderboard/`.
   Lobby : panneaux « Classement » + « Dernières manches ». Reste : persister
   l'état live en cours de partie, l'historique par compte (→ auth).
10. **Fix Docker** — `migrate` au démarrage dans `Dockerfile.backend` (fait
    seulement `makemigrations` au build) ; virer `WSGI_APPLICATION` (module
    inexistant) de `settings.py` ; ajouter une route `/admin/`.
11-12. **Authentification / OAuth 42** — **backend fait par le binôme** (service
    séparé). Côté ce repo : `login.html` (bouton « Se connecter avec 42 » +
    invité), `src/js/net/auth.js` (`initAuth()` async → `GET <AUTH_BASE>/api/auth/me/`
    cookie ; `ft42LoginUrl()` → `<AUTH_BASE>/api/auth/42/login/` ; `AUTH_BASE`
    configurable `?authBase=`), bouton dans le lobby. Fallback invité si le
    service d'auth n'est pas joignable.
13. **Profils / historique / classement** — ✅ *(partiel)* `MatchResult` +
    `PlayerProfile` remplis à chaque manche ; classement + historique dans le lobby.
14. **Amis** — `FriendsManager.js` (mock) → API réelle (l'API `/api/friends/` existe).

### 🔨 Sujet ft_transcendence (gros manques)
15. **SPA** — actuellement multi-pages HTML, le sujet exige une single-page app.
16. **`docker compose up` unique** qui lance tout et marche.
17. **HTTPS / WSS**.
18. **Tournois + matchmaking**.
19. ✅ *(partiel)* jeu à 2 sur même clavier — `rules-test.html` le fait.
20. **~7 modules majeurs** à choisir : sécurité (2FA, Vault, WAF), DevOps (ELK,
    Prometheus/Grafana, microservices), 3D Babylon.js, multi-langue,
    accessibilité, IA, blockchain scores…
21. **Compat Firefox, RGPD**.

### 🧹 Qualité / nettoyage
22. Réparer `npm test` (mocha / jsdom-global cassé — bloque `npm install` propre).
23. Supprimer ou intégrer les vieux fichiers réseau inutilisés :
    `NetworkManager.js`, `NetworkPlayer.js`, `GameLobby.js`, `RoomSelector.js`,
    `CommunicationManager.js`, `FriendsManager.js`.
24. Node 24 (`.nvmrc`) vs Node 18 installé.

---

## 5. Limites connues du réseau (paliers actuels)

- Le joueur **local** conduit toujours soit Ms Pac-Man (rôle pacman), soit un
  avatar fantôme/builder. **Score, vies, collisions joueurs et fin de manche**
  sont autoritaires serveur (paliers 3-4). Les **positions** restent client
  (le serveur ne vérifie pas les déplacements).
- `room_state.py` vit dans la mémoire d'**un seul** process daphne : pas de
  multi-worker sans le déporter dans Redis.
- En rôle fantôme/builder, tu te vois piloter un fantôme, mais Ms Pac-Man tourne
  toujours « à vide » en arrière-plan (cachée). Les 4 fantômes IA la suivent.
- Détection de sa propre identité réseau : on prend le **premier `player_joined`**
  reçu après connexion. Robuste en pratique, faillible si 2 joueurs se
  connectent exactement au même instant.
- Après un redémarrage du backend : rafraîchir la page (Ctrl+Shift+R) pour que
  le client reparte proprement (le reset auto gère la plupart des cas, mais le
  vieux JS en cache non).
