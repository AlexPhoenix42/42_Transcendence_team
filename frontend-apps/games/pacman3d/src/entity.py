from abc import ABC, abstractmethod
from pygame.math import Vector2
from vector2i import Vector2i
from map import Map, IS_OCCUPIED, directions, inv_dir
from game_state import GameState
from draw import load_sprite
import math
import pygame

FPS = 35
ATTACK = 1
DEATH = 2

class Entity(ABC):
    pos: Vector2
    _move_dir: Vector2
    _move_t: float
    _movespeed: float
    _start_pos: Vector2i
    ipos: Vector2i
    _npos: Vector2i
    _animation: int
    _animation_start: int
    _animation_end: int
    _sprites: list[pygame.Surface]

    def __init__(self, pos: Vector2i, movespeed: float, radius: float=0.3) -> None:
        self.ipos = self._npos = self._start_pos = pos
        self.pos = Vector2(float(pos.x) + 0.5, float(pos.y) + 0.5)
        self._radius = radius if radius > 0 else 0.3
        self._move_dir = Vector2(0, 0)
        self._animation = 0
        self._animation_start = 0
        self._animation_end = 0
        self._move_t = 1.0
        self._movespeed = movespeed
        return None

    def overlap(self, other: "Entity") -> bool:
        return (int(self.pos.x) == int(other.pos.x)) and (int(self.pos.y) == int(other.pos.y))

    def overlap_cell(self, cell: Vector2i) -> bool:
        return (int(self.pos.x) == cell.x) and (int(self.pos.y) == cell.y)

    def play_animation(self, animation: int, frame: int, end: int=99999999999999) -> None:
        self._animation = animation
        self._animation_start = frame
        self._animation_end = end
        return None

    def is_dead(self, frame: int) -> bool:
        return (self._animation == DEATH)

    def is_attacking(self, frame: int) -> bool:
        return (self._animation == ATTACK)

    def kill(self, frame: int) -> None:
        self.play_animation(DEATH, frame)
        self._move_t = 1.0
        return None

    def teleport(self, Dest: Vector2i, map: Map|None) -> bool:
        if (map is None) or ((Dest.x >= 0) and (Dest.x < map.width) and (Dest.y >= 0) and (Dest.y < map.height) and ((map.cells[Dest.y][Dest.x] & 15) != 15)):
            if map is not None:
                map.cells[self.ipos.y][self.ipos.x] &= ~IS_OCCUPIED
                map.cells[Dest.y][Dest.x] |= IS_OCCUPIED
            self.ipos = self.npos = Dest
            self.pos = Vector2(Dest.x + 0.5, Dest.y + 0.5)
            self._move_dir = Vector2(0, 0)
            self._move_t = 0
            self.reset()
            return True
        return False

    def move(self, disp: Vector2, map: Map|None) -> None:
        if map is None:
            self.pos += disp
            self.ipos = self.npos = Vector2i(self.pos)
            return
            
        if disp.x == 0.0 and disp.y == 0.0:
            return

        new_x = Vector2(self.pos.x + disp.x, self.pos.y)
        if map.check_radius_collision(new_x, self._radius):
            self.pos.x = new_x.x
            
        new_y = Vector2(self.pos.x, self.pos.y + disp.y)
        if map.check_radius_collision(new_y, self._radius):
            self.pos.y = new_y.y
            
        self.ipos = self.npos = Vector2i(self.pos)
        return None

    def can_step(self, dir: int, map: Map, occupancy: bool) -> bool:
        cell = map.cells[self.ipos.y][self.ipos.x]
        nx, ny = self.ipos.x + int(directions[dir][0]), self.ipos.y + int(directions[dir][1])
        return True if (dir >= 0) and not (cell & (1 << dir)) and (not occupancy or not (map.cells[ny][nx] & IS_OCCUPIED)) else False

    def step(self, dir: int, map: Map, mark_occupancy: bool) -> bool:
        self._move_dir.x = 0.0
        self._move_dir.y = 0.0
        if dir >= 0:
            cell = map.cells[self.ipos.y][self.ipos.x]
            if not (cell & (1 << dir) and (not mark_occupancy or not (cell & IS_OCCUPIED))):
                self._move_t = 0.0
                new_pos = Vector2i(self.ipos.x, self.ipos.y)
                new_pos.x += int(directions[dir][0])
                new_pos.y += int(directions[dir][1])
                if mark_occupancy and ((new_pos.x != self.ipos.x) or (new_pos.y != self.ipos.y)):
                    map.cells[self.ipos.y][self.ipos.x] &= ~IS_OCCUPIED
                    map.cells[new_pos.y][new_pos.x] |= IS_OCCUPIED
                self.ipos = new_pos
                self._move_dir.x = directions[dir][0]
                self._move_dir.y = directions[dir][1]
                return True
        return False  

    @abstractmethod
    def update(self, map: Map, state: GameState, frame: int) -> None:
        ...

    @abstractmethod
    def reset(self) -> None:
        ...


BLINKY = 0
PINKY = 1
INKY = 2
CLYDE = 3

class Ghost(Entity):
    _flee_pos: Vector2i
    _last_dir: int
    _identity: int

    def __init__(self, map: Map, pos: Vector2i, movespeed: float, idx: int) -> None:
        super().__init__(pos, movespeed)
        self._move_t += idx * 0.25
        self._last_dir = 0
        self._identity = idx
        map.cells[self.ipos.y][self.ipos.x] |= IS_OCCUPIED
        self._flee_pos = Vector2i(self._start_pos.x + 5.0 if self._start_pos.x == 0.0 else -5.0,
                                  self._start_pos.y + 5.0 if self._start_pos.y == 0.0 else -5.0)
        return None

    def reset(self) -> None:
        self._last_dir = 0

    def move_to_target(self, target: Vector2i, map: Map) -> None:
        self._move_dir.x = 0.0
        self._move_dir.y = 0.0
        self._move_t = 0.0
        best_dist = 99999999999
        best_dir = -1
        for i in range(4):
            test_pos_x = self.pos.x + directions[i][0]
            test_pos_y = self.pos.y + directions[i][1]
            test_dist = (test_pos_x - target.x) ** 2 + (test_pos_y - target.y) ** 2
            if (inv_dir[i] != self._last_dir) and self.can_step(i, map, True) and (test_dist < best_dist):
                best_dist = test_dist
                best_dir = i
        if (best_dir >= 0):
            self.step(best_dir, map, True)
            self._last_dir = 1 << best_dir
        else:
            self._last_dir = 0
        return None

    def update(self, map: Map, state: GameState, frame: int) -> None:
        if state.frozen_ghosts:
            return None
        if self.is_dead(frame):
            disp = min(self._movespeed, 1.0 - self._move_t)
            self._move_t += disp
            self.pos += disp * self._move_dir
            if self._move_t >= 1.0:
                if self.ipos == self._start_pos:
                    self._animation = 0
                    self._animation_start = 0
                elif (frame - self._animation_start) > (4 * 4):
                    self.move_to_target(self._start_pos, map)
                else:
                    self._move_dir.x = 0.0
                    self._move_dir.y = 0.0
            if (frame - self._animation_start) >= (10 * FPS):
                self._animation = 0
                self._animation_start = 0
        else:
            disp = min(self._movespeed, 1.0 - self._move_t)
            self._move_t += disp
            self.pos += disp * self._move_dir
            if self._move_t >= 1.0:
                if state.has_superbonus(frame)[0]:
                    target = self._flee_pos
                    self.move_to_target(target, map)
                else:
                    match self._identity:
                        case 0:
                            target = Vector2i(map.player_pos.x, map.player_pos.y)
                            self.move_to_target(target, map)
                        case 1:
                            target = Vector2i(map.player_pos.x + map.player_dir.x * 4, map.player_pos.y + map.player_dir.y * 4)
                            self.move_to_target(target, map)
                        case 2:
                            target = Vector2i(((map.player_pos.x + map.player_dir.x * 2) - self.ipos.x) * 2 + self.ipos.x,
                                              ((map.player_pos.y + map.player_dir.y * 2) - self.ipos.y) * 2 + self.ipos.y)
                            self.move_to_target(target, map)
                        case 3:
                            target = (Vector2i(map.player_pos.x, map.player_pos.y) if max(map.player_pos.x - self.ipos.x, map.player_pos.y - self.pos.y) > 8
                                      else self._flee_pos)
                            self.move_to_target(target, map)
                        case 4:
                            path = map.find_path(self.ipos, map.player_pos)
                            dir = path[-1] if (len(path) > 0) else Vector2i(0, 0)
                            new_pos = self.ipos + dir
                            if (((dir.x != 0) or (dir.y != 0)) and not (map.cells[self.ipos.y + dir.y][self.ipos.x + dir.x] & IS_OCCUPIED)):
                                map.cells[self.ipos.y][self.ipos.x] &= ~IS_OCCUPIED
                                map.cells[new_pos.y][new_pos.x] |= IS_OCCUPIED
                                self.ipos = new_pos
                                self._move_t = 0.0
                                self._move_dir = Vector2(float(dir.x), float(dir.y))
                            else:
                                self._move_t = 0.0
                                self._move_dir = Vector2(0, 0)
        return None


class Player3D(Entity):
    angle: float
    mouse_sensitivity: float
    rotation_speed: float
    _map: Map
    _shoot_sprites: list[pygame.Surface]
    _muzzle_flash_sprite: pygame.Surface

    def __init__(self, map: Map, pos: Vector2i, movespeed: float) -> None:
        super().__init__(pos, movespeed)
        self.angle = 0.0
        #self.mouse_sensitivity = 0.003
        self.mouse_sensitivity = 0.001
        self.rotation_speed = 0.03
        self._map = map
        self._shoot_sprites = [load_sprite('gameplay/shotgun0.png', 4.0),
                               load_sprite('gameplay/shotgun1.png', 4.0),
                               load_sprite('gameplay/shotgun2.png', 4.0),
                               load_sprite('gameplay/shotgun3.png', 4.0),
                               load_sprite('gameplay/shotgun4.png', 4.0),
                               load_sprite('gameplay/shotgun5.png', 4.0),
                               load_sprite('gameplay/shotgun6.png', 4.0),
                               load_sprite('gameplay/shotgun7.png', 4.0)]
        self._muzzle_flash_sprite = load_sprite('gameplay/muzzle_flash.png', 4.0)
        return None

    def reset(self) -> None:
        self.angle = 0.0

    def update(self, map: Map, state: GameState, frame: int) -> None:
        self._map = map
        if (self.is_dead(frame)):
            ...
        else:
            keys = pygame.key.get_pressed()
            mouse = pygame.mouse.get_pressed()
            if (keys[pygame.K_SPACE] or mouse[0]) and (state.has_superbonus(frame)[0]) and (self._animation == 0):
                self.play_animation(ATTACK, frame)
            #mouse_pos = pygame.mouse.get_pos()
            #mouse_rel_x = mouse_pos[0] - 400
            #self.angle += mouse_rel_x * self.mouse_sensitivity
            #pygame.mouse.set_pos((400, 300))
            mouse_rel = pygame.mouse.get_rel()
            self.angle += mouse_rel[0] * self.mouse_sensitivity

            movespeed = self._movespeed
            if state.speed_boost:
                movespeed *= 2.0
            dx = math.cos(self.angle) * movespeed
            dy = math.sin(self.angle) * movespeed
            disp = Vector2(0, 0)

            if keys[pygame.K_UP] or keys[pygame.K_w]:
                disp.x = dx
                disp.y = dy

            if keys[pygame.K_DOWN] or keys[pygame.K_s]:
                disp.x = -dx
                disp.y = -dy

            if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
                disp.x = -dy
                disp.y = dx

            if keys[pygame.K_LEFT] or keys[pygame.K_a]:
                disp.x = dy
                disp.y = -dx

            self.move(disp, map)
        return None

