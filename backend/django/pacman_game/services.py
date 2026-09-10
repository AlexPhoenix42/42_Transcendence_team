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

# Rôles qui mangent les grains. `blocker` est un Pac-Man increvable (voir
# `resolve_contact`) qui construit des murs anti-fantômes au lieu de tuer.
# Miroir de pacman_game.models.PACMAN_ROLES (strings, pour garder cette couche
# testable sans la base).
PACMAN_ROLES = frozenset({'pacman', 'madame_pacman', 'baby', 'blocker'})

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


class RoomState:
    """État partagé d'un salon : grains restants, scores, statut de manche."""

    def __init__(self):
        self.dots, self.pellets = seed_dots(MAP1_ROWS)
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
        """Retire les joueurs silencieux depuis trop longtemps."""
        stale = [
            pid for pid, p in self.players.items()
            if now - p['seen_ts'] > PLAYER_TTL_SECONDS
        ]
        for pid in stale:
            del self.players[pid]

    def empty(self):
        return not self.players and not self.spectators

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
        'ghosts': frozenset({'ghost', 'builder'}),
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
        """Nouvelle manche : grille repeuplée, scores et vies remis à neuf."""
        self.dots, self.pellets = seed_dots(MAP1_ROWS)
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
