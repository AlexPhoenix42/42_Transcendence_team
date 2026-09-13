# AVANCEMENT — intégration Pac-Man multijoueur

Branche : `pacman2` · Remote : `git@github.com:AlexPhoenix42/42_Transcendence_unofficial.git`
Dernière mise à jour : 2026-09-12
Dernier commit : `fcc212c pacman: corrige les désync multijoueur, convertit le moteur en TypeScript`

---

## 1. Objectif

Intégrer le jeu **Pac-Man multijoueur** (basé sur jsPacman de 8tentaculos, importé depuis
`/goinfre/isadbaib/pacman_ft_transcendence`) dans le monorepo `42_Transcendence_unofficial` :

- **Backend** : Django 6 + Django Channels (Daphne) + DRF + SimpleJWT, Redis (état live),
  PostgreSQL (lignes `Game` / `GamePlayer`), Vault (dev mode), nginx reverse-proxy.
- **Frontend** : `frontend-react` (React 19, react-router 7, Vite 8, Tailwind v4).
- **Stack dev** : `docker-compose-dev.yml`, Docker rootless, buildx `docker-container`.

---

## 2. Ce qui est FAIT et commité (branche `pacman2`)

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
  - `serializers.py` — `player_count` : les lignes `GamePlayer` en DB ne s'écrivent qu'en fin de
    manche (`_persist_result`), donc les compter affichait **0** pour tout salon en attente/en jeu.
    `get_player_count()` lit maintenant l'état live Redis (`_load_state_sync`, même source que le
    consumer WS) et ne retombe sur le compte DB que si l'entrée Redis a expiré (salon terminé).
  - `views.py` — `_reap_stale_waiting_rooms()` : supprime les salons `WAITING` dont
    `last_active` dépasse **5 min** (personne dedans). Appelé paresseusement depuis la liste REST
    (verrou cache 30 s). C'est ça qui tue les salons zombies type « kiki ».
  - Migrations `0001`, `0002_game_last_active`, `0003_ghost_roles` **(non commité, voir §2bis)**.
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
    builder, 4 fantômes sélectionnables — pinky/blinky/inky/sue, voir §2bis, **non commité** —,
    le bébé naît en jeu), exclusivité des rôles, roster live, « prêt ».
  - **Voyant d'état** : vert (partie en cours / tous prêts) · orange (en attente, X/Y prêts) · rouge (pas connecté).
  - **Lancement auto** : dès que tous les joueurs sont prêts, le 1er du roster déclenche `lobby_start`.
  - Moteur monté dans un `<div ref>` via `import("../pacman/net/MultiplayerGame.ts")`.
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
- **`pacman/`** — moteur jsPacman complet copié, **converti en TypeScript strict** (46 fichiers,
  ~9000 lignes, commit `fcc212c`) : bugs trouvés au passage (retour de promesse manquant, argument
  d'événement manquant) + un bug de fond corrigé (les champs de classe TS avec valeur par défaut
  cassaient la cascade par prototype de l'original → animations vides, mauvais ratio d'affichage ;
  fix = champs déclarés sans initialiseur pour restaurer le comportement d'origine).
  `Game.js` reste le seul fichier **jamais édité** (base du moteur, intouchée).
  - `assetBase.js` + patches dans `engine/Animation.js` `Sprite.js` `Sound.js` → assets servis
    depuis `/pacman-assets/`.
  - `net/NetClient.ts` — WS `ws/pacman/<room>/?token=`, origine dérivée de `location`.
  - `net/MultiplayerGame.ts` (`extends Game.js`) :
    - **Vision partagée** : `ROLE_LOOK` = apparence par rôle **identique sur tous les écrans**
      (plus de `hue-rotate` par joueur qui faisait virer le Pac-Man adverse au vert).
      `SELF_GLOW` = halo blanc sur ton perso. Rose = Ms Pac-Man, orange = blocker (Pac-Man constructeur),
      vert = builder.
    - **Fantômes IA masqués** en multi (`hideGhosts()` chaque frame, tous rôles non-spectateur) :
      seuls les vrais joueurs sont visibles.
    - Effets gel / prison / effrayé reviennent au look de repos, pas à `''`.
    - **Sprite Pac-Man neutre** (`PacmanPlain.ts` / `factory/makePacmanPlain.ts`, commits `c028f75`/
      `cfc183d`) : même rig 4-directions que Ms Pac-Man (jamais de rotation) mais sans nœud/rouge à
      lèvres, appliqué au perso **local et distant** pour les rôles `pacman`/`blocker`
      (`_applyLocalPacmanSprite` / `_makeRemoteSprite`, remplace l'ancien `makePacmanMan` qui pivotait
      et wobblait en boîte 60px). `madame_pacman` garde volontairement le sprite d'origine (nœud) —
      seul son propre rôle utilise `makeMsPacman` en distant, déjà non-rotatif. Cercle recentré
      (touchait les murs), rayon 26→24, angle de bouche mini 0°→12° (jamais totalement fermée).
    - `_resizeLocalPacman()` (`SPRITE_SIZE = 48`, commit `491a7e4`) : le perso local vient du moteur
      à 60px, trop grand pour les coins serrés du labyrinthe — rétréci au rendu uniquement, la
      position logique/collisions ne change pas.
    - **Désync corrigées** (`fcc212c`) : exclusivité des rôles vérifiée côté serveur (deux joueurs
      pouvaient choisir le même perso) ; fin de manche → tout le monde revient au salon d'attente
      (évite un salon fantôme sans joueurs enregistrés) ; verrou par salon autour des
      lecture-modif-écriture Redis (connexions concurrentes qui s'écrasaient) ; dédup du pid périmé à
      la reconnexion (perso dupliqué) ; le serveur envoie l'identifiant du joueur directement au lieu
      de le deviner via une course sur le premier `join` reçu.
  - `PacmanMan.js` — `ANGLE_BY_DIR = {l:0,u:90,r:180,d:270}` (était à 180° près → les Pac-Man
    distants affichaient la bouche à l'envers). N'est plus utilisé pour les rôles `pacman`/`blocker`
    depuis le sprite plain ci-dessus, mais reste dans le moteur pour d'éventuels autres usages.
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

## 2bis. En cours — 4 fantômes sélectionnables (⚠️ NON COMMITÉ, NON TESTÉ)

Demande : le jeu a 4 fantômes avec chacune leur particularité (couleur, comportement d'IA
d'origine dans `makeGhost.ts` — Pinky/Blinky/Inky/Sue), mais le multi n'exposait qu'un seul
rôle générique `ghost` : impossible de savoir/choisir lequel on incarne, et le skin était tiré
au hasard par hash de l'id de connexion (`_hue`), avec en plus une incohérence — on se voyait
toujours en Blinky soi-même alors que les autres nous voyaient avec la couleur du hash.

**Changement** : `ghost` devient 4 rôles distincts et exclusifs, comme `pacman`/`madame_pacman` :
`ghost_pinky`, `ghost_blinky`, `ghost_inky`, `ghost_sue`. Jusqu'à 4 fantômes différents peuvent
maintenant jouer dans le même salon (au lieu d'un seul fantôme générique).

- **Backend** (`pacman_game/`) :
  - `models.py` — `PlayerRole` : 4 valeurs `GHOST_PINKY`/`GHOST_BLINKY`/`GHOST_INKY`/`GHOST_SUE`
    remplacent `GHOST` ; `GHOST_ROLES` mis à jour.
  - `migrations/0003_ghost_roles.py` — écrite à la main (pas de Django installé hors conteneur) :
    `AlterField` sur `GamePlayer.role`. **À vérifier avec `makemigrations --check` dans le
    conteneur backend** avant de faire confiance à son contenu.
  - `consumers.py` — `ALLOWED_ROLES` accepte les 4 nouveaux rôles au lieu de `'ghost'`.
  - `services.py` — `_WINNING_ROLES['ghosts']` (condition de victoire équipe fantômes) reconnaît
    les 4 rôles + `builder`.
  - `tests/test_services.py` — les 12 usages du rôle `'ghost'` dans les fixtures de test migrés
    vers `'ghost_blinky'` (sinon `test_match_result_ghosts_win` cassait silencieusement : la
    condition `role in _WINNING_ROLES['ghosts']` ne matchait plus `'ghost'`).
- **Frontend** :
  - `pages/PacmanGame.tsx` — `CHARACTERS` : 4 boutons (🌸 Pinky / 🔴 Blinky / 🔵 Inky / 🟠 Sue) au
    choix de personnage au lieu d'un seul `👻 FANTÔME`.
  - `pages/pacmanLobbyClient.ts` — liste `ROLES` mise à jour.
  - `pacman/net/MultiplayerGame.ts` — `GHOST_ROLE_SKIN` (rôle → skin `makeGhost()`) remplace le
    tirage par hash `GHOST_LABELS[this._hue(id) % 4]` ; `_hue()` supprimée (plus aucun appelant).
    Skin **identique local et distant** maintenant (corrige l'incohérence Blinky-toujours-en-local).
    `_maybeUseFreeze` (pouvoir du fantôme) vérifie l'appartenance à `GHOST_ROLES` au lieu de
    `role === "ghost"`.

**Pas vérifié** : ni `tsc` ni Django ne sont installés hors conteneur ici — je n'ai relu le code
qu'à la main, rien n'a été compilé, migré ni lancé réellement. À valider avant de committer :
`make up`, `python manage.py makemigrations --check` puis `python manage.py test pacman_game`
dans le conteneur backend, et un tour en jeu (build front + `roles2.mjs` dans le scratchpad e2e,
qui teste déjà les 4 rôles mais avec l'ancien `ghost` générique — à adapter aux 4 nouveaux rôles).

---

## 3. Historique des commits `pacman` (du plus récent)

```
fcc212c pacman: corrige les désync multijoueur, convertit le moteur en TypeScript
3fe39a6 pacman: player_count lit l'état live (Redis) au lieu de GamePlayer (toujours 0 en attente/en jeu)
491a7e4 correction (resize du Pac-Man local, SPRITE_SIZE=48)
cfc183d pacman: recentre le sprite plain + bouche jamais fermee
c028f75 pacman: sprite Pac-Man neutre (sans noeud/rouge a levres) pour pacman/blocker
c1edccc resumer (création d'AVANCEMENT.md)
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
- Lobby, salle d'attente, voyant, lancement auto, moteur (TypeScript strict), sync positions,
  score/vies serveur, fin de manche, spectateur, cycle de vie des salons (création REST only,
  retour WAITING, purge 5 min, suppression créateur), accès LAN, thème unique PC/mobile sans
  clignotement, scroll coupé en jeu.
- `player_count` reflète l'état live Redis (0 fantôme corrigé en attente/en jeu).
- Exclusivité des rôles vérifiée côté serveur (deux joueurs ne peuvent plus choisir le même perso).
- Fin de manche : tout le monde revient au salon d'attente (plus de salon fantôme sans joueurs
  enregistrés) ; verrou par salon sur les lecture-modif-écriture Redis ; dédup du pid périmé à la
  reconnexion ; identifiant du joueur envoyé directement par le serveur (plus de course au 1er `join`).
- **Ms Pac-Man locale / distante** — *résolu pour `pacman`/`blocker`* : sprite neutre dédié
  (`PacmanPlain`, jamais de rotation), même rendu local et distant, plus de risque de désalignement.
  `madame_pacman` garde le sprite d'origine (nœud) **par choix**, pas par limitation technique.
- **Pac-Man distant qui wobble** — *résolu* : `makePacmanMan` (rotatif, boîte 64px dans un cadre
  60px) n'est plus utilisé pour `pacman`/`blocker`, remplacé par `PacmanPlain` (4 directions figées).

### À surveiller / pas parfait
- **Bandeau de fin** : le tableau des scores sous « … ONT GAGNÉ » n'apparaît pas toujours
  (dépend d'un `state_sync` final ; timing). Pré-existant, toujours ouvert.
- Commits `491a7e4` (« correction ») et `c1edccc` (« resumer ») ont des messages non descriptifs —
  contenu réel documenté ci-dessus et dans l'historique détaillé, mais à surveiller pour la suite.

### Pas commencé
- Tests `GameConsumer` (comme chess_game) — `pacman_game/tests/test_consumers.py` existe mais ne
  couvre que `_room_lock` (3 tests unitaires triviaux, pas de `WebsocketCommunicator`) : le vrai
  TODO reste entier.
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

Dernière demande traitée : **4 fantômes sélectionnables** (Pinky/Blinky/Inky/Sue) au lieu d'un
rôle `ghost` générique — voir §2bis. **⚠️ En cours, non commité, non testé** (pas de Django/tsc
hors conteneur ici). Précédée de `fcc212c` (désync multijoueur + conversion TypeScript du
moteur, commité) et `3fe39a6`/`491a7e4`/`cfc183d`/`c028f75`.

**À faire avant de committer §2bis** :
1. `make up` puis, dans le conteneur backend : `makemigrations --check` (valider la migration
   écrite à la main) et `python manage.py test pacman_game`.
2. Rebuild front + un tour en jeu à 2+ comptes pour vérifier les 4 fantômes en vrai (skin
   cohérent local/distant, exclusivité par fantôme).
3. Adapter `roles2.mjs` (scratchpad e2e) aux 4 nouveaux rôles (`ghost_pinky` etc. au lieu de
   `ghost`).

**Reprise possible ensuite sur** :
4. Le tableau de scores du bandeau de fin (le rendre fiable).
5. Les tests `GameConsumer` (`WebsocketCommunicator`, au-delà des tests triviaux `_room_lock`
   existants).
6. Le triage de `backend/pacman/` (import brut — trois arborescences pacman coexistent encore :
   `backend/pacman/`, `backend/django/pacman_game/`, `backend/pacman/backend/pacman_server`).
7. OAuth (surtout côté consoles Google / 42 — action utilisateur).
8. Clarifier les messages de commit non descriptifs (`491a7e4` « correction », `c1edccc` « resumer »)
   pour la prochaine fois.

`.env.dep` reste modifié localement, non commité — à vérifier avant de committer/écraser.

_(Le fichier parasite `t` n'est plus présent à la racine au 2026-09-12 — s'il réapparaît,
`rm t` sans risque.)_
