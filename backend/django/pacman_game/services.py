# pacman_game/services.py
#
# Couche de logique de jeu pure, portée telle quelle de
# `pacman_ft_transcendence` (`backend/game/room_state.py`, commit 2c46068).
#
# Deux différences avec l'original, imposées par le passage à Redis (pattern
# chess_game) :
#   1. L'état ne vit plus dans un dict module `ROOMS` mais dans le cache Redis.
#      `RoomState` gagne `to_dict()` / `from_dict()` pour l'aller-retour.
#   2. Tous les horodatages passent de `time.monotonic()` à `time.time()` :
#      monotonic n'a de sens que dans un process ; une valeur relue depuis Redis
#      (autre worker, redémarrage) doit être comparable en horloge murale.
#
# Les règles, constantes et signatures de méthodes sont identiques à l'original.

import time
from collections import deque


# --- Disposition du labyrinthe (map-1, seul niveau) --------------------------
#
# Copie littérale de `backend/pacman/src/js/maps/map-1.js`. L'original lisait ce
# fichier JS par un chemin relatif qui n'existe plus une fois le jeu intégré ;
# on embarque la carte ici. `.` = grain, `*` = super-grain (codes de `Tile.js`).
MAP1_ROWS = [
    '----------------------------',
    '----------------------------',
    '----------------------------',
    '============================',
    '=......==..........==......=',
    '=*====.==.========.==.====*=',
    '=.====.==.========.==.====.=',
    '=..........................=',
    '===.==.=====.==.=====.==.===',
    '--=.==.=====.==.=====.==.=--',
    '===.==.=====.==.=====.==.===',
    'ttt.==.......==.......==.ttt',
    '===.=====-========-=====.===',
    '--=.=====-========-=====.=--',
    '--=.--------------------.=--',
    '--=.=====-===hh===-=====.=--',
    '--=.=====-===--===-=====.=--',
    '--=.==----=------=----==.=--',
    '--=.==-==-========-==-==.=--',
    '===.==-==-========-==-==.===',
    'ttt.---==----------==---.ttt',
    '===.========-==-========.===',
    '--=.========-==-========.=--',
    '--=.......---==---.......=--',
    '--=.=====.========.=====.=--',
    '===.=====.========.=====.===',
    '=............--............=',
    '=.====.=====.==.=====.====.=',
    '=.====.=====.==.=====.====.=',
    '=.====.==....==....==.====.=',
    '=*====.==.========.==.====*=',
    '=.====.==.========.==.====.=',
    '=..........................=',
    '============================',
    '----------------------------',
    '----------------------------',
]

# Cartes 2 et 3, copiées telles quelles de `frontend-react/src/pacman/maps/
# map-2.ts` et `map-3.ts` (déjà importées côté front dans `GameModel.ts`
# pour la progression de niveau solo, mais jamais exposées au choix du
# joueur ni connues du serveur avant ce travail). Même légende, même
# géométrie 28x36 — vérifié que (14, 26), le point de départ du Pac-Man
# solo, est une case franchissable sur les 3.
MAP2_ROWS = [
    'tttttt-==..........==-tttttt',
    '======.==.========.==.======',
    '======.==.========.==.======',
    '=*...........==...........*=',
    '=.=======.==.==.==.=======.=',
    '=.=======.==.==.==.=======.=',
    '=.==......==.==.==......==.=',
    '=.==.====-==....==-====.==.=',
    '=.==.====-========-====.==.=',
    '=......==-========-==......=',
    '======.==----------==.======',
    '======.==-===hh===-==.======',
    '=......==-===--===-==......=',
    '=.====.==-=------=-==.====.=',
    '=.====.---========---.====.=',
    '=...==.==-========-==.==...=',
    '===.==.==----------==.==.===',
    '--=.==.====-====-====.==.=--',
    '--=.==.====-====-====.==.=--',
    '--=.........====.........=--',
    '--=.=======.====.=======.=--',
    '===.=======.====.=======.===',
    'ttt....==...----...==....ttt',
    '===.==.==.========.==.==.===',
    '===.==.==.========.==.==.===',
    '=*..==.......==.......==..*=',
    '=.====.=====.==.=====.====.=',
    '=.====.=====.==.=====.====.=',
    '=..........................=',
    '============================',
    '----------------------------',
    '----------------------------',
]
MAP2_ROWS = (
    ['----------------------------'] * 3
    + ['============================']
    + MAP2_ROWS
)

MAP3_ROWS = [
    '=.........==....==.........=',
    '=.=======.==.==.==.=======.=',
    '=*=======.==.==.==.=======*=',
    '=.==.........==.........==.=',
    '=.==.==.====.==.====.==.==.=',
    '=....==.====.==.====.==....=',
    '====.==.====.==.====.==.====',
    '====.==..............==.====',
    't....====-========-====....t',
    '=.==-====-========-====-==.=',
    '=.==--------------------==.=',
    '=.====-==-===hh===-==-====.=',
    '=.====-==-===--===-==-====.=',
    '=.-----==-=------=-==-----.=',
    '=.==-====-========-====-==.=',
    '=.==-====-========-====-==.=',
    '=.==--------------------==.=',
    '=.====-=====-==-=====-====.=',
    '=.====-=====-==-=====-====.=',
    '=......==....==....==......=',
    '===.==.==.========.==.==.===',
    '===.==.==.========.==.==.===',
    '=*..==.......--.......==..*=',
    '=.====.=====.==.=====.====.=',
    '=.====.=====.==.=====.====.=',
    '=......==....==....==......=',
    '=.====.==.========.==.====.=',
    '=.====.==.========.==.====.=',
    '=......==..........==......=',
    '============================',
    '----------------------------',
    '----------------------------',
]
MAP3_ROWS = (
    ['----------------------------'] * 3
    + ['============================']
    + MAP3_ROWS
)

MAPS = {1: MAP1_ROWS, 2: MAP2_ROWS, 3: MAP3_ROWS}

# Rôles qui mangent les grains. `blocker` est un Pac-Man increvable (voir
# `resolve_contact`) qui construit des murs anti-fantômes au lieu de tuer.
# Miroir de pacman_game.models.PACMAN_ROLES (strings, pour garder cette couche
# testable sans la base).
PACMAN_ROLES = frozenset({'pacman', 'madame_pacman', 'baby', 'blocker'})

# Les 4 fantômes-sprites, à l'exclusion de `builder` (rôle "camp fantômes"
# mais qui ne touche pas Pac-Man pour le faire perdre une vie — il construit
# des murs). C'est cette liste, pas `_WINNING_ROLES['ghosts']`, qu'il faut
# utiliser pour savoir contre quels joueurs le bot Pac-Man doit vérifier un
# contact.
GHOST_SPRITE_ROLES = frozenset({
    'ghost_pinky', 'ghost_blinky', 'ghost_inky', 'ghost_sue',
})

# Points, alignés sur `src/js/Game.js` (`dotScore` / `pillScore`).
DOT_SCORE = 10
PELLET_SCORE = 50
GHOST_EAT_SCORE = 200

# Un joueur muet depuis plus de 10 s est retiré du salon.
PLAYER_TTL_SECONDS = 10

# --- Combat ----------------------------------------------------------------

# Vies de départ d'un joueur Pac-Man (aligné sur `defaultLives` côté client).
DEFAULT_LIVES = 3
# Après un super-grain, fenêtre où un contact fantôme se solde par le fantôme
# renvoyé au bercail (et non par une vie perdue).
FRIGHTENED_SECONDS = 6
# Les contacts sont détectés côté client (~20/s) : on ignore les rapports en
# rafale pendant l'animation de mort.
CATCH_COOLDOWN_SECONDS = 2

# Durée d'emprisonnement d'un Blocker touché par un fantôme tueur (increvable,
# donc pas de perte de vie — juste immobilisé).
PRISON_SECONDS = 15


def seed_dots(rows):
    """`rows` (labyrinthe ASCII) -> (grains, super-grains), en tuples (col, row).

    `.` = grain, `*` = super-grain — mêmes codes que `src/js/Tile.js`.
    """
    dots, pellets = set(), set()
    for row, line in enumerate(rows):
        for col, ch in enumerate(line):
            if ch == '.':
                dots.add((col, row))
            elif ch == '*':
                pellets.add((col, row))
    return dots, pellets


# --- Bot Pac-Man (serveur) ---------------------------------------------------
#
# Quand personne n'a pris un rôle `PACMAN_ROLES` au lancement de la manche, le
# serveur joue lui-même un Pac-Man (voir `_bot_loop` dans consumers.py) plutôt
# que de laisser le Pac-Man de chaque client figé (`this.pacman.hide()`, voir
# `_setupLocalAvatar` côté front). Miroir volontaire de la géométrie du front
# (`Tile.ts` : tuile 32px, centre à `x+16`/`y+20` ; `Map.getTile` : le
# labyrinthe boucle sur les colonnes hors-bornes pour les tunnels) — mêmes
# nombres, pas de couplage de code possible entre TS et Python.
BOT_PACMAN_ID = 'bot:pacman'
BOT_PACMAN_NAME = '🤖 Bot'
TILE_SIZE = 32
MAZE_WIDTH = len(MAP1_ROWS[0])
MAZE_HEIGHT = len(MAP1_ROWS)
# Case de départ du Pac-Man humain en solo (`Game.ts`, `x:452, y:848`),
# reconvertie en tuile pour que le bot démarre au même endroit logique.
BOT_START_COL = round((452 - TILE_SIZE // 2) / TILE_SIZE)
BOT_START_ROW = round((848 - TILE_SIZE // 2 - 4) / TILE_SIZE)

# Une tuile est franchissable si ce n'est ni un mur (`=`) ni la maison des
# fantômes (`h`) — même règle que `Ghost.canGo()` côté front, appliquée à
# Pac-Man aussi (il n'entre pas plus dans la maison que les fantômes ne
# devraient le laisser passer). Une par carte (`map_choice` 1/2/3).
_WALKABLE_BY_MAP = {
    choice: frozenset(
        (col, row)
        for row, line in enumerate(rows)
        for col, ch in enumerate(line)
        if ch not in ('=', 'h')
    )
    for choice, rows in MAPS.items()
}


def walkable_for(map_choice):
    return _WALKABLE_BY_MAP.get(map_choice, _WALKABLE_BY_MAP[1])


def tile_to_pixel(col, row):
    """(col, row) -> centre de la tuile en pixels, mêmes constantes que `Tile.ts`."""
    return (col * TILE_SIZE + TILE_SIZE // 2, row * TILE_SIZE + TILE_SIZE // 2 + 4)


def pixel_to_tile(x, y):
    """Inverse de `tile_to_pixel`, mêmes règles que `Map.getTile(x, y, true)`
    côté front : troncature simple, pas de recentrage (l'offset de +16/+20
    n'existe que pour placer le CENTRE d'une tuile, pas pour la retrouver)."""
    return (int(x) // TILE_SIZE, int(y) // TILE_SIZE)


def _wrap_col(col):
    if col < 0:
        return MAZE_WIDTH - 1
    if col >= MAZE_WIDTH:
        return 0
    return col


def _neighbors(cell, blocked, walkable):
    col, row = cell
    for dcol, drow in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        ncol, nrow = _wrap_col(col + dcol), row + drow
        if not (0 <= nrow < MAZE_HEIGHT):
            continue
        n = (ncol, nrow)
        if n in walkable and n not in blocked:
            yield n


def bot_next_step(start, targets, blocked=frozenset(), map_choice=1):
    """BFS depuis `start` vers la cible atteignable la plus proche parmi
    `targets` (typiquement les grains restants), en évitant `blocked`
    (cases proches d'un fantôme non effrayé), sur la carte `map_choice`.
    Retourne la PROCHAINE case du chemin (un pas), ou `None` si `start` est
    déjà une cible ou qu'aucune n'est atteignable.

    `blocked` n'est qu'un filtre souple : si aucun chemin n'existe en
    l'évitant, on relance sans lui plutôt que de laisser le bot bloqué
    (mieux vaut frôler un fantôme que ne plus jamais bouger).
    """
    if not targets:
        return None
    if start in targets:
        return None

    walkable = walkable_for(map_choice)

    for avoid in (blocked, frozenset()):
        if avoid and start in avoid:
            continue  # le bot est déjà sur une case "bloquée" - ignore l'évitement ce tour
        visited = {start}
        queue = deque([(start, None)])
        while queue:
            cell, first_step = queue.popleft()
            for n in _neighbors(cell, avoid, walkable):
                if n in visited:
                    continue
                visited.add(n)
                step = first_step or n
                if n in targets:
                    return step
                queue.append((n, step))
    return None


class RoomState:
    """État partagé d'un salon : grains restants, scores, statut de manche."""

    def __init__(self, map_choice=1):
        self.map_choice = map_choice if map_choice in MAPS else 1
        self.dots, self.pellets = seed_dots(MAPS[self.map_choice])
        self.status = 'lobby'          # 'lobby' | 'playing' | 'over'
        self.winner = None            # 'pacman' (tout mangé) | 'ghosts' (0 vie)
        # Fin de la fenêtre « effrayé » (time.time()), 0 = pas actif.
        self.frightened_until = 0.0
        # Début de manche en heure murale (time.time()), pour la durée persistée.
        self.started_wall = 0.0
        # La manche terminée a-t-elle déjà été enregistrée en base ?
        self._result_saved = False
        # pid -> {'role', 'name', 'user_id', 'score', 'lives', 'seen_ts', 'caught_ts'}
        self.players = {}
        # pids qui regardent la partie sans y jouer (hors scores / manche)
        self.spectators = set()

    # --- (dé)sérialisation Redis -----------------------------------------

    def to_dict(self):
        return {
            'map_choice': self.map_choice,
            'dots': [list(cell) for cell in self.dots],
            'pellets': [list(cell) for cell in self.pellets],
            'status': self.status,
            'winner': self.winner,
            'frightened_until': self.frightened_until,
            'started_wall': self.started_wall,
            'result_saved': self._result_saved,
            'players': self.players,
            'spectators': list(self.spectators),
        }

    @classmethod
    def from_dict(cls, data):
        room = cls.__new__(cls)
        room.map_choice = data.get('map_choice', 1)
        if room.map_choice not in MAPS:
            room.map_choice = 1
        room.dots = {tuple(cell) for cell in data.get('dots', [])}
        room.pellets = {tuple(cell) for cell in data.get('pellets', [])}
        room.status = data.get('status', 'lobby')
        room.winner = data.get('winner')
        room.frightened_until = data.get('frightened_until', 0.0)
        room.started_wall = data.get('started_wall', 0.0)
        room._result_saved = data.get('result_saved', False)
        room.players = data.get('players', {})
        room.spectators = set(data.get('spectators', []))
        return room

    # --- joueurs ------------------------------------------------------------

    def add_player(self, pid, role='pacman', name='', user_id=None):
        if pid in self.spectators:
            return
        self.players.setdefault(pid, {
            'role': role,
            'name': name or '',
            'user_id': user_id,
            'score': 0,
            'lives': DEFAULT_LIVES,
            'seen_ts': time.time(),
            'caught_ts': 0.0,
        })

    def remove_player(self, pid):
        self.players.pop(pid, None)
        self.spectators.discard(pid)

    def find_pid_by_user(self, user_id, exclude_pid=None):
        """pid d'un AUTRE joueur du salon avec ce `user_id` (même compte),
        ou `None`.

        Sert à repérer une reconnexion réseau en pleine manche : le client
        rouvre une socket (nouveau pid) avant que le serveur ait remarqué que
        l'ancienne est morte, laissant le vieux pid enregistré - deux pids
        pour le même compte, donc deux sprites affichés côté clients tant que
        l'ancien n'expire pas. `user_id` est posé sur `add_player`/`set_role`
        (le compte authentifié, pas le pid éphémère de la connexion), donc
        stable d'une reconnexion à l'autre contrairement au pid.
        """
        if user_id is None:
            return None
        for pid, p in self.players.items():
            if pid != exclude_pid and p.get('user_id') == user_id:
                return pid
        return None

    def role_taken(self, role, exclude_pid=None):
        """True si un AUTRE pid du salon a déjà ce rôle.

        Les rôles de personnage (pacman, madame_pacman, blocker, builder,
        ghost) sont exclusifs : un seul joueur à la fois, même contrainte que
        `takenByOthers` côté front (PacmanGame.tsx). `spectator` (illimité) et
        `baby` (né en jeu, jamais choisi via `role_assignment`) n'ont pas
        cette contrainte.
        """
        if role in ('spectator', 'baby'):
            return False
        return any(
            pid != exclude_pid and p.get('role') == role
            for pid, p in self.players.items()
        )

    def set_role(self, pid, role, name=None):
        """Change le rôle d'un pid. `'spectator'` le sort de la liste des joueurs."""
        if role == 'spectator':
            self.players.pop(pid, None)
            self.spectators.add(pid)
            return
        self.spectators.discard(pid)
        player = self.players.get(pid)
        if not player:
            self.add_player(pid, role)
            player = self.players[pid]
        player['role'] = role
        if name:
            player['name'] = str(name)[:20]

    def touch(self, pid):
        """Signe de vie : repousse l'expiration du joueur."""
        player = self.players.get(pid)
        if player:
            player['seen_ts'] = time.time()

    def prune(self, now):
        """Retire les joueurs silencieux depuis trop longtemps.

        `BOT_PACMAN_ID` n'a pas de socket qui rafraîchit `seen_ts` (rien
        n'appelle `touch()` pour lui) — sans cette exclusion, `_sync_loop`
        (toutes les 2 s) le supprimerait de `room.players` ~10 s après le
        lancement de la manche, coupant `_bot_loop` en plein milieu.
        """
        stale = [
            pid for pid, p in self.players.items()
            if pid != BOT_PACMAN_ID and now - p['seen_ts'] > PLAYER_TTL_SECONDS
        ]
        for pid in stale:
            del self.players[pid]

    def empty(self):
        """Vrai si plus aucun humain (`BOT_PACMAN_ID` ne compte pas — sinon un
        salon que tout le monde a quitté ne serait jamais reconnu comme vide
        tant que le bot y figure encore comme "joueur")."""
        real_players = (pid for pid in self.players if pid != BOT_PACMAN_ID)
        return not any(real_players) and not self.spectators

    # --- manche -----------------------------------------------------------

    def start(self):
        """Passe la manche en cours (idempotent)."""
        if self.status == 'lobby':
            self.status = 'playing'
            self.started_wall = time.time()

    # --- persistance -----------------------------------------------------

    #: rôles gagnants selon `winner`
    _WINNING_ROLES = {
        'pacman': PACMAN_ROLES,
        'ghosts': frozenset({
            'builder', 'ghost_pinky', 'ghost_blinky', 'ghost_inky', 'ghost_sue',
        }),
    }

    def match_result(self):
        """Snapshot de la manche terminée pour la base, **une seule fois**.

        Retourne `None` si la manche n'est pas finie ou a déjà été enregistrée.
        """
        if self.status != 'over' or self._result_saved:
            return None
        self._result_saved = True
        winner = self.winner or 'pacman'
        won = self._WINNING_ROLES.get(winner, frozenset())
        return {
            'winner': winner,
            'level': 1,
            'duration': int(time.time() - self.started_wall) if self.started_wall else 0,
            'players': [
                {
                    'name': p.get('name', ''),
                    'user_id': p.get('user_id'),
                    'role': p['role'],
                    'score': p['score'],
                    'lives': p['lives'],
                    'won': p['role'] in won,
                }
                for p in self.players.values()
            ],
        }

    def eat_dot(self, pid, col, row):
        """Un joueur mange le grain en (col, row).

        Retourne `'dot'` / `'pellet'` si le grain a été consommé, `None` sinon
        (manche pas en cours, mauvais rôle, ou grain déjà mangé).
        """
        if self.status != 'playing':
            return None
        player = self.players.get(pid)
        if not player or player['role'] not in PACMAN_ROLES:
            return None

        cell = (col, row)
        if cell in self.dots:
            self.dots.discard(cell)
            player['score'] += DOT_SCORE
            return 'dot'
        if cell in self.pellets:
            self.pellets.discard(cell)
            player['score'] += PELLET_SCORE
            self.frightened_until = time.time() + FRIGHTENED_SECONDS
            return 'pellet'
        return None

    def resolve_contact(self, pacman_id, ghost_id, now):
        """Un fantôme touche un Pac-Man ; le serveur tranche.

        - fenêtre « effrayé » active -> Pac-Man mange le fantôme (+points, le
          fantôme rentre au bercail) : `{'type': 'ghost_home', 'ghost', 'score'}`
        - rôle `blocker` (increvable) -> jamais de vie perdue, juste emprisonné :
          `{'type': 'pacman_imprisoned', 'seconds'}`
        - sinon -> le Pac-Man perd une vie ; si tous les Pac-Man sont à 0, la
          manche est finie et les fantômes gagnent :
          `{'type': 'pacman_caught', 'lives', 'over'}`
        - `None` si le contact ne compte pas (manche pas en cours, mauvais rôle,
          ou cooldown anti-rafale).
        """
        if self.status != 'playing':
            return None
        pac = self.players.get(pacman_id)
        if not pac or pac['role'] not in PACMAN_ROLES:
            return None

        if now < self.frightened_until:
            pac['score'] += GHOST_EAT_SCORE
            return {'type': 'ghost_home', 'ghost': ghost_id, 'score': pac['score']}

        if now - pac.get('caught_ts', 0.0) < CATCH_COOLDOWN_SECONDS:
            return None
        pac['caught_ts'] = now

        if pac['role'] == 'blocker':
            return {'type': 'pacman_imprisoned', 'seconds': PRISON_SECONDS}

        pac['lives'] = max(0, pac['lives'] - 1)

        pac_players = [p for p in self.players.values()
                       if p['role'] in PACMAN_ROLES]
        over = bool(pac_players) and all(p['lives'] <= 0 for p in pac_players)
        if over:
            self.status = 'over'
            self.winner = 'ghosts'
        return {'type': 'pacman_caught', 'lives': pac['lives'], 'over': over}

    def is_cleared(self):
        return not self.dots and not self.pellets

    def reset_round(self):
        """Nouvelle manche : grille repeuplée (même carte), scores et vies
        remis à neuf."""
        self.dots, self.pellets = seed_dots(MAPS[self.map_choice])
        self.status = 'lobby'
        self.winner = None
        self.frightened_until = 0.0
        self.started_wall = 0.0
        self._result_saved = False
        for player in self.players.values():
            player['score'] = 0
            player['lives'] = DEFAULT_LIVES
            player['caught_ts'] = 0.0

    # --- diffusion --------------------------------------------------------

    def snapshot(self):
        return {
            'status': self.status,
            'level': 1,
            'map_choice': self.map_choice,
            'winner': self.winner,
            'dots': [list(cell) for cell in self.dots],
            'pellets': [list(cell) for cell in self.pellets],
            'scores': {pid: p['score'] for pid, p in self.players.items()},
            'roles': {pid: p['role'] for pid, p in self.players.items()},
            'lives': {pid: p['lives'] for pid, p in self.players.items()},
            'frightened_ms': max(
                0, int((self.frightened_until - time.time()) * 1000)
            ),
            'spectators': len(self.spectators),
        }
