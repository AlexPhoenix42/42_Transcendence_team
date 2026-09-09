"""Suppression automatique des salons de jeu inactifs.

Un salon est considéré « vide » quand plus aucune activité (connexion ou
message WebSocket) n'y a lieu. `GameConsumer` met à jour `GameRoom.last_active`
à chaque signe de vie ; ce module supprime les salons dont `last_active` date de
plus de `EMPTY_TTL_SECONDS`.

Le balayage tourne dans un thread démon lancé à la première connexion WebSocket
(`ensure_sweeper_running`), et il est aussi déclenché paresseusement à chaque
`GET /api/rooms/` comme filet de sécurité.
"""

import threading
import time

from django.db import close_old_connections
from django.utils import timezone

# Un salon sans activité depuis 5 minutes est supprimé.
EMPTY_TTL_SECONDS = 5 * 60
# Fréquence du balayage de fond.
SWEEP_INTERVAL_SECONDS = 60

_started = False
_lock = threading.Lock()


def sweep_stale_rooms():
    """Supprime les salons inactifs. Retourne le nombre de salons supprimés."""
    from .models import GameRoom

    close_old_connections()
    cutoff = timezone.now() - timezone.timedelta(seconds=EMPTY_TTL_SECONDS)
    deleted, _ = GameRoom.objects.filter(last_active__lt=cutoff).delete()
    return deleted


def _loop():
    while True:
        time.sleep(SWEEP_INTERVAL_SECONDS)
        try:
            sweep_stale_rooms()
        except Exception:
            # Un balayage raté ne doit pas tuer le thread.
            pass


def ensure_sweeper_running():
    """Démarre le thread de balayage une seule fois pour le processus."""
    global _started
    with _lock:
        if _started:
            return
        _started = True
        threading.Thread(target=_loop, name='room-sweeper', daemon=True).start()
