# AVANCEMENT — intégration Pac-Man multijoueur

Branche : `pacman` · Remote : `git@github.com:AlexPhoenix42/42_Transcendence_unofficial.git`
Dernière mise à jour : 2026-09-11
Dernier commit : `e5bc815 pacman: corrige l'alignement du Pac-Man local + le sens des Pac-Man distants`

---

## 1. Objectif

Intégrer le jeu **Pac-Man multijoueur** (basé sur jsPacman de 8tentaculos, importé depuis
`/goinfre/isadbaib/pacman_ft_transcendence`) dans le monorepo `42_Transcendence_unofficial` :

- **Backend** : Django 6 + Django Channels (Daphne) + DRF + SimpleJWT, Redis (état live),
  PostgreSQL (lignes `Game` / `GamePlayer`), Vault (dev mode), nginx reverse-proxy.
- **Frontend** : `frontend-react` (React 19, react-router 7, Vite 8, Tailwind v4).
- **Stack dev** : `docker-compose-dev.yml`, Docker rootless, buildx `docker-container`.

---

## 2. Ce qui est FAIT et commité (branche `pacman`)

Jeu multijoueur **fonctionnel de bout en bout** (vérifié en headless Puppeteer) :
lobby → salle d'attente (choix rôle/personnage, « prêt », voyant d'état) →
lancement auto quand tout le monde est prêt → moteur jsPacman monté, labyrinthe +
sprites rendus, sync des positions dans les deux sens, score / vies / collisions
autoritaires serveur, fin de manche (« LES FANTÔMES ONT GAGNÉ ! » / « Espace = rejouer »).

### Backend (`backend/django/`)
- **`pacman_game/`** : app complète.
  - `models.py` — `Game` (1 ligne par salon, clé = slug `room_name`) + `GamePlayer` + `last_active`.
  - `services.py` — `RoomState` (logique pure), `resolve_contact()`, ~34 tests verts.
  - `consumers.py` — `GameConsumer` (temps réel, autoritaire) + `VoiceConsumer`, pattern chess_game.
    - Le WS **ne crée jamais** de salon (`_get_game_id` → `close(4004)` si le salon n'existe pas).
    - Salon vide → repasse en `WAITING` (reste rejoignable), pas supprimé tout de suite.
    - `_sync_loop` : rediffuse `state_sync` toutes les 2 s, rafraîchit `last_active` ~30 s,
      purge le salon si vide.
  - `serializers.py` / `views.py` / `urls.py` / `admin.py` — couche REST du lobby
    (`/api/pacman/` list/create, `/api/pacman/<pk>/`, `/api/pacman/room/<slug>/` → 204 si absent,
    `/api/pacman/<pk>/cancel/` = suppression par le créateur).
  - `views.py` — `_reap_stale_waiting_rooms()` : supprime les salons `WAITING` dont
    `last_active` dépasse **5 min** (personne dedans). Appelé paresseusement depuis la liste REST
    (verrou cache 30 s). C'est ça qui tue les salons zombies type « kiki ».
  - Migrations `0001`, `0002_game_last_active`.
- **`config/ws_auth.py`** — `JWTAuthMiddleware` : lit `?token=<access>` en query-string pour les
  WebSockets (imports Django lazy). Câblé dans `config/asgi.py`.
- **`config/urls.py`** — `path('api/pacman/', include('pacman_game.urls'))`.
- **`local_auth/serializers.py`** — `RegisterSerializer` : erreurs d'inscription opaques par défaut
  (`"Invalid registration data."`), **détaillées quand `DEBUG`** ; vérif MX sautée en `DEBUG`.
  (Le bug « Invalid registration data » n'était PAS un bug : règles = username 3-30 `[\w-]`,
  mot de passe ≥8 non commun, domaine avec MX.)

### Frontend (`frontend-react/src/`)
- **`pages/PacmanLobby.tsx`** (route `/pacman`) — navigateur de salons, poll toutes les 5 s
  (`/api/pacman/?status=WAITING` = ouverts, `/api/pacman/` = mes salons, `?status=IN_PROGRESS` = en cours).
  Bouton « Créer », bouton 🗑 (créateur only). `Row` est au **niveau module** exprès
  (imbriqué = remount à chaque poll = clignotement).
- **`pages/PacmanGame.tsx`** (route `/pacman/:roomName`) — phases
  `loading | join | waiting | countdown | playing`.
  - À l'arrivée : `GET /api/pacman/room/:name/` → 204 = salon inexistant (propose de le créer),
    200 = rejoint (spectateur si plein / partie en cours).
  - Salle d'attente : choix Spectateur/Joueur + personnage (pacman, madame_pacman, blocker,
    builder, ghost — le bébé naît en jeu), exclusivité des rôles, roster live, « prêt ».
  - **Voyant d'état** : vert (partie en cours / tous prêts) · orange (en attente, X/Y prêts) · rouge (pas connecté).
  - **Lancement auto** : dès que tous les joueurs sont prêts, le 1er du roster déclenche `lobby_start`.
  - Moteur monté dans un `<div ref>` via `import("../pacman/net/MultiplayerGame.js")`.
  - Quitter la partie → retour au **choix du rôle** du même salon (pas au lobby direct).
  - Créateur : bouton « 🗑 Supprimer le salon » (waiting + playing).
  - **Scroll coupé** en phase `countdown`/`playing` : `overflow:hidden` sur html+body +
    `preventDefault` sur flèches / espace / PageUp-Down / Home-End (elles pilotent le jeu).
  - Taille du labyrinthe : marge `chrome = 210` pour que TOUT tienne dans la fenêtre
    (boutons compris) puisque la page ne défile plus.
- **`pages/pacmanLobbyClient.ts`** — `PacmanLobbyClient` (porté de `net/LobbyClient.js`),
  WS `ws://<host>/ws/pacman/<room>/?token=<access>`, ré-annonce `lobby_hello` toutes les 2 s.
- **`pages/pacman.css`** — thème arcade (Press Start 2P, dégradé bleu nuit, jaune #ffe14d /
  orange #ff9d00). **Même style PC et mobile** (media query <640px = juste des tailles réduites,
  plus de style « Secret Hitler »). **Aucune animation qui clignote** (pm-pulse / pm-lamp-pulse /
  pm-slide-in supprimées).
- **`pacman/`** — moteur jsPacman complet copié.
  - `assetBase.js` + patches dans `engine/Animation.js` `Sprite.js` `Sound.js` → assets servis
    depuis `/pacman-assets/`.
  - `net/NetClient.js` — WS `ws/pacman/<room>/?token=`, origine dérivée de `location`.
  - `net/MultiplayerGame.js` (`extends Game.js`, **Game.js jamais édité**) :
    - **Vision partagée** : `ROLE_LOOK` = apparence par rôle **identique sur tous les écrans**
      (plus de `hue-rotate` par joueur qui faisait virer le Pac-Man adverse au vert).
      `SELF_GLOW` = halo blanc sur ton perso. Rose = Ms Pac-Man, orange = blocker (Pac-Man constructeur),
      vert = builder.
    - **Fantômes IA masqués** en multi (`hideGhosts()` chaque frame, tous rôles non-spectateur) :
      seuls les vrais joueurs sont visibles.
    - Effets gel / prison / effrayé reviennent au look de repos, pas à `''`.
  - `PacmanMan.js` — `ANGLE_BY_DIR = {l:0,u:90,r:180,d:270}` (était à 180° près → les Pac-Man
    distants affichaient la bouche à l'envers).
- **`routes.tsx`** / **`pages/Games.tsx`** — routes câblées, carte Pac-Man → `/pacman`.
- **`components/Navbar.tsx`** — `flex-wrap` pour ne pas casser le mobile.
- **`index.html`** — police Press Start 2P (Oswald/Mulish retirées avec le style Secret Hitler).

### Dev / infra
- **`.env.dev.template`** + **`scripts_dev/gen-dev-env.sh`** + **`Makefile`** :
  génération auto du `.env` par machine (détecte l'IP LAN, `sed` sur le template, déchiffre
  `.env.secrets.enc` pour les creds OAuth). `make up` / `make build` / `make ip` / `make seed` / `make down`.
- **`.env`** : **plus jamais commité** (`.gitignore` + `git rm --cached`). Contient les secrets OAuth déchiffrés.
- Accès LAN corrigé : nginx `resolver 127.0.0.11` + `set $backend` variable dans `proxy_pass`
  (l'`upstream` figeait l'IP du conteneur après recreate → 502 depuis un autre PC). `ALLOWED_HOSTS=*`.

---

## 3. Historique des commits `pacman` (du plus récent)

```
e5bc815 pacman: corrige l'alignement du Pac-Man local + le sens des Pac-Man distants
ae780d1 pacman: coupe le scroll pendant la partie
dee15c9 pacman: vision partagee - meme rendu pour tous + distinction par role
6f47b2e pacman: purge des salons abandonnés + fin du clignotement du lobby
f436a85 pacman: salons réels uniquement + suppression par le créateur + Mes salons propre
6a444fa pacman: lancement auto quand tous prêts + voyant d'état + sortie de partie
c20c4ee auth: erreurs d'inscription lisibles en dev + MX sautée en DEBUG
426e8ee pacman: salon rejoignable après avoir quitté + OAuth redirect sur localhost
1d0b865 dev: config auto par serveur (.env généré depuis un template) + fix accès LAN
3b64b75 pacman: jeu jouable + nettoyage salons + entrée spectateur
b1668f0 pacman: lobby + salle d'attente + moteur jsPacman dans le front React
08e6e12 ws: auth JWT en query-string pour les WebSockets
5ac7743 frontend: fix vite.config.ts (configureServer mal placé cassait le build)
02bb683 pacman: couche REST du lobby (serializers + views + urls + admin)
ae3a757 pacman: consumers multijoueur sur le pattern chess_game
76414dd pacman: migrations DB + fix vault-init et permissions dev backend_django
3f04c02 pacman: import complet du projet pacman_ft_transcendence dans backend/pacman/
95841c7 pacman: scaffold app + fix vault dev USER root + secrets dev locaux
```

---

## 4. État / bugs connus / TODO

### Ça marche
- Lobby, salle d'attente, voyant, lancement auto, moteur, sync positions, score/vies serveur,
  fin de manche, spectateur, cycle de vie des salons (création REST only, retour WAITING,
  purge 5 min, suppression créateur), accès LAN, thème unique PC/mobile sans clignotement,
  scroll coupé en jeu.

### À surveiller / pas parfait
- **Ms Pac-Man locale** : ton propre perso garde le sprite 4-directions du moteur (avec nœud) quel
  que soit le rôle `pacman` vs `madame_pacman` — distinction seulement par le halo. (On a essayé
  de forcer le spret « classique » sur le joueur local, ça se désalignait en tournant, annulé.)
- **Bandeau de fin** : le tableau des scores sous « … ONT GAGNÉ » n'apparaît pas toujours
  (dépend d'un `state_sync` final ; timing). Pré-existant.
- **Pac-Man distant** : `PacmanMan` pivote encore une frame 64px dans une boîte 60px → léger
  wobble sous-pixel possible sur les autres joueurs (perso secondaire, pas gênant).

### Pas commencé
- Tests `GameConsumer` (comme chess_game).
- Triage de `backend/pacman/` (import brut) : garder le moteur JS + assets, virer son backend
  Django séparé / son docker-compose / ses docs.
- **Google OAuth** : ne marche que si `http://localhost:9000/api/auth/google/callback/` est
  enregistré dans la console Google (client `493189702199-302m88l62sdhk9mafvgs93kcu6ml2org`).
  **Action utilisateur.** (Google refuse les redirect URIs `http://` sur IP privée.)
- **42 OAuth** : redirect URI à vérifier côté `https://profile.intra.42.fr/oauth/applications/78657`.

---

## 5. Règles de travail (IMPORTANT)

- **Jamais** `git commit` ni `git push` — c'est l'utilisateur qui les fait. Le reste de git est OK.
- **Aucune attribution IA** dans les messages de commit / PR (sauf si un system-reminder l'impose
  explicitement pour la session en cours).
- PC de l'école : **pas de root**, installs **VSCode uniquement**, config éditeur **locale** seulement.
- `.env` ne doit **jamais** être commité (secrets OAuth déchiffrés).
- Commits GPG-signés requis (`commit.gpgsign=true`) — l'assistant ne peut pas signer.

---

## 6. Lancer le stack (dev)

```bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin   # si docker/python3 introuvables
make up          # gen .env + docker compose up -d + seed (pas de rebuild)
make build       # idem + rebuild des images
make ip          # régénère juste le .env pour cette machine
make seed        # relance vault-init + restart backend (Vault dev perd les secrets au restart)
```

Front servi par nginx local depuis `frontend-react/dist` — rebuild :
```bash
cd frontend-react && docker run --rm -v "$PWD":/app -w /app node:20 sh -c "npx vite build"
```

App : http://localhost:3000 · backend direct : http://localhost:9000
Comptes de test : `test` / `test2` / `test3` / `test4`, mot de passe `test1234`.

### Fichiers machine-locaux (NON commités, git-exclus)
- `.env` (généré)
- `docker-compose-dev.yml` (limites `deploy.resources` commentées, volumes front → `dist`)
- `frontend/docker_conf/nginx.local.conf` (`resolver 127.0.0.11` + `proxy_pass` variable)
- Backups dans le scratchpad : `env.local-working`, `compose.local-working`, `nginx.local-working`.

### Tests e2e (Puppeteer headless, Chrome système)
Dans `<scratchpad>/e2e/` : `verify.mjs` (mort/fin de manche/fantômes cachés), `roles2.mjs`
(4 rôles), `align.mjs` (alignement sprite), `remoteface.mjs` (sens des Pac-Man distants),
`theme.mjs` (captures thème PC+mobile), `reap.mjs` (purge salons).

---

## 7. Où on en est / prochaine étape

Dernière demande traitée : **alignement du Pac-Man** quand on change de direction.
→ Commité (`e5bc815`). Le perso local reprend le sprite standard du moteur (plus de désalignement),
et le sens de la bouille des Pac-Man distants est corrigé.

**Rien en cours.** Working tree propre. Reprise possible sur :
1. Le tableau de scores du bandeau de fin (le rendre fiable).
2. Les tests `GameConsumer`.
3. Le triage de `backend/pacman/`.
4. OAuth (surtout côté consoles Google / 42 — action utilisateur).

_(Le fichier parasite `t` réapparaît régulièrement à la racine — `rm t` sans risque.)_
