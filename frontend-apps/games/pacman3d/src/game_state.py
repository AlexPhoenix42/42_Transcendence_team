import time
import math


class GameState:
    invincibility: bool
    frozen_ghosts: bool
    speed_boost: bool
    _level: int
    _max_level: int
    _lives: int
    _max_lives: int
    _score: int
    _gum_count: int
    _supergum_count: int
    _gum_score: int
    _supergum_score: int
    _ghost_score: int
    _superbonus_start: int
    _superbonus_end: int
    _max_time: int
    _time_left: float
    _map_instance: int
    _frozen_time: bool
    _frozen_time_start: float
    _last_frame_time: float

    def __init__(self, max_level: int, timer: int, max_lives: int, gum_score: int, supergum_score: int, ghost_score: int, superbonus_duration: int) -> None:
        self._level = 0
        self._max_level = max_level
        self._max_time = timer
        self._time_left = float(timer)
        self._frozen_time_start = time.perf_counter()
        self._max_lives = max_lives
        self._gum_score = gum_score
        self._supergum_score = supergum_score
        self._ghost_score = ghost_score
        self._superbonus_duration = superbonus_duration * 35
        self._superbonus_start = self._superbonus_end = 0
        self.invincibility = False
        self.frozen_ghosts = False
        self._frozen_time = False
        self.speed_boost = False
        self._map_instance = 0
        self._is_paused = False
        self._last_tick = time.perf_counter()
        return None

    def reset(self, gum_count: int) -> None:
        if self._level == 0:
            self._score = 0
            self._lives = self._max_lives
        self._gum_count = gum_count
        self._supergum_count = 4
        self._superbonus_start = self._superbonus_end = 0
        self._level += 1
        self._map_instance += 1
        self._time_left = float(self._max_time)

    def get_map_instance(self) -> int:
        return self._map_instance

    def get_time_left(self) -> int:
        return math.ceil(self._time_left)

    def get_level(self) -> int:
        return self._level

    def set_level(self, level: int) -> None:
        self._level = level
        return None

    def get_max_level(self) -> int:
        return self._max_level

    def get_score(self) -> int:
        return self._score

    def get_lives(self) -> int:
        return self._lives

    def add_lives(self, count: int) -> int:
        self._lives += count
        return self._lives

    def get_gum_count(self) -> int:
        return self._gum_count

    def eat_gum(self) -> bool:
        self._gum_count -= 1
        self._score += self._gum_score
        return self._gum_count == 0

    def eat_supergum(self, frame: int) -> None:
        self._supergum_count -= 1
        self._score += self._supergum_score
        self._superbonus_start = frame
        self._superbonus_end = frame + self._superbonus_duration
        return None

    def eat_ghost(self) -> None:
        self._score += self._ghost_score
        return None

    def player_death(self) -> bool:
        self._lives -= 1
        return self._lives > 0

    def has_superbonus(self, frame: int) -> tuple[bool, float]:
        return (frame < self._superbonus_end or self.invincibility, 0.0 if ((self._superbonus_duration <= 0) or (frame > self._superbonus_end)) else (frame - self._superbonus_start) / self._superbonus_duration)

    def toggle_freeze_time(self) -> bool:
        self._frozen_time = not self._frozen_time
        return self._frozen_time

    def pause(self) -> None:
        self._is_paused = True
        return None

    def resume(self, frozen: bool) -> None:
        self._is_paused = False
        return None

    def tick(self) -> None:
        now = time.perf_counter()
        if (not self._is_paused and not self._frozen_time):
            self._time_left -= now - self._last_tick
        self._last_tick = now
        return None

