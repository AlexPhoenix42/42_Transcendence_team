import math
import pygame
from pygame.math import Vector2
from dataclasses import dataclass
from abc import ABC, abstractmethod
from entity import DEATH, ATTACK
from draw import resize_image, load_sprite
from vector2i import Vector2i
from game_state import GameState
from map import Map, GUM, SUPERGUM, N, S, W, E


@dataclass
class FloatingText:
    image: pygame.Surface
    x: float
    y: float
    t: float
    ox: float
    oy: float


class Renderer(ABC):
    window_width: int
    window_height: int
    _font: pygame.font.Font
    _screen: pygame.Surface
    _floating_texts: list[FloatingText]

    def __init__(self, screen: pygame.Surface, window_width: int,
                 window_height: int) -> None:
        self.window_width = window_width
        self.window_height = window_height
        self._screen = screen
        self._font = pygame.font.SysFont("monospace", 24)
        self._floating_texts = []

    def flip(self) -> None:
        for text in self._floating_texts:
            text.t += 0.02
        self._floating_texts = [item for item in self._floating_texts if item.t < 1.0]
        pygame.display.flip()
        return None

    def add_floating_text(self, text: str, color: tuple[int, int, int], x: float, y: float) -> None:
        surface = self._font.render(text, True, color)
        self._floating_texts.append(FloatingText(surface, x, y, 0.0, -surface.get_width() * 0.5, -surface.get_height() * 0.5))

    def draw_image(self, image: pygame.Surface, pos: tuple[int, int]) -> None:
        scale = self.window_width / 800
        self._screen.blit(resize_image(image, (int(image.get_width() * scale), int(image.get_height() * scale))), (int(pos[0] / 800 * self.window_width), int(pos[1] / 600 * self.window_height)))
        return None

    def draw_text(self, text: str,
                  pos: tuple[int, int],
                  color: tuple[int, int, int],
                  font: None|pygame.font.Font=None) -> None:
        if font is None:
            font = self._font
        surface = font.render(text, True, color)
        self._screen.blit(surface, pos)

    @abstractmethod
    def draw_ghost(self, pos: Vector2, id: int, animation: int, a_frame: int, g_frame: int) -> None:
        ...

    @abstractmethod
    def draw_player(self, pos: Vector2, animation: int, a_frame: int, g_frame: int) -> None:
        ...

    @abstractmethod
    def render_map(self, map: Map, state: GameState, player_pos: Vector2, angle: float, frame: int) -> list[Vector2i]:
        ...

    @abstractmethod
    def draw_sprite(self, pos: Vector2, sprite: pygame.Surface, scale: float, offset_x: int, offset_y: int) -> None:
        ...

    @abstractmethod
    def end_frame(self, player_angle: float) -> None:
        ...

SpriteToRender = tuple[pygame.Surface, Vector2, float, int, int, float]


class Renderer3D(Renderer):
    fov: float
    player_angle: float
    _num_rays: int
    _depth_buffer: list[float] | None
    _wall_texture: pygame.Surface
    _visible_cells: set[tuple[int, int]]
    _sprites: list[SpriteToRender]
    _sprite_count: int
    _player_pos: Vector2
    _gum_sprite: pygame.Surface
    _supergum_sprite: pygame.Surface
    _shade_surfaces: list[pygame.Surface]
    _ghost_sprite: list[pygame.Surface]
    _ghosta_sprite: list[pygame.Surface]
    _ghostd_sprite: list[pygame.Surface]

    def __init__(self, screen: pygame.Surface, map_size: tuple[int, int], fov: float) -> None:
        super().__init__(screen, 1536, 1024)
        self._level_idx = -1
        self.player_angle = 0.0
        self.fov = fov
        self._num_rays = 128
        self._depth_buffer = None
        self._wall_texture = resize_image(load_sprite('images/wall2.png', 1.0), (512, 512))
        self._visible_cells = None
        self._sprites = []
        self._sprite_count = 0
        self._supergum_sprite = [load_sprite('gameplay/shotgun.png', 1.0)]
        self._gum_sprite = [load_sprite('images/gum0.png', 1.0),
                            load_sprite('images/gum1.png', 1.0),
                            load_sprite('images/gum2.png', 1.0),
                            load_sprite('images/gum3.png', 1.0)]

        self._ghost_sprite = [load_sprite('gameplay/yokai0.png', 1.0),
                              load_sprite('gameplay/yokai1.png', 1.0),
                              load_sprite('gameplay/yokai2.png', 1.0),
                              load_sprite('gameplay/yokai3.png', 1.0)]

        self._ghosta_sprite = [load_sprite('gameplay/yokaia0.png', 1.0),
                               load_sprite('gameplay/yokaia1.png', 1.0),
                               load_sprite('gameplay/yokaia2.png', 1.0),
                               load_sprite('gameplay/yokaia3.png', 1.0),
                               load_sprite('gameplay/yokaia4.png', 1.0)]

        self._ghostd_sprite = [load_sprite('gameplay/yokaid0.png', 1.0),
                               load_sprite('gameplay/yokaid1.png', 1.0),
                               load_sprite('gameplay/yokaid2.png', 1.0),
                               load_sprite('gameplay/yokaid3.png', 1.0),
                               load_sprite('gameplay/yokaid4.png', 1.0)]
        self._shade_surfaces = [None] * 32
        for i in range(32):
            self._shade_surfaces[i] = pygame.Surface((1, 1))
            val = min(255, i * 8)
            self._shade_surfaces[i].fill((val, val, val))

        max_size = (300, 300)
        ratio = (max_size[0] / map_size[0], max_size[1] / map_size[1])
        if ratio[0] > ratio[1]:
            self.CELL_SIZE = max_size[1] // (map_size[1] * 5) * 4
            self.WALL_SIZE = self.CELL_SIZE // 4
        else:
            self.CELL_SIZE = max_size[0] // (map_size[0] * 5) * 4
            self.WALL_SIZE = self.CELL_SIZE // 4
        C = self.CELL_SIZE
        W = self.WALL_SIZE
        self._map_width=map_size[0] * C + (map_size[0] + 1) * W
        self._map_height=map_size[1] * C + (map_size[1] + 1) * W

        self._msup_spr = resize_image(load_sprite('images/bonus_pacgum.png', 1.0), (C, C))
        self._mgum_spr = resize_image(load_sprite('images/pacgum.png', 1.0), (C, C))
        self._mghost_spr = [resize_image(load_sprite('images/Inky.png', 1.0), (C, C)),
                            resize_image(load_sprite('images/Pinky.png', 1.0), (C, C)),
                            resize_image(load_sprite('images/Blinky.png', 1.0), (C, C)),
                            resize_image(load_sprite('images/Clyde.png', 1.0), (C, C))]
        self._mghostd_spr = resize_image(load_sprite('images/ghost_dead.png', 1.0), (C, C))
        self._mghosts_spr = resize_image(load_sprite('images/casper.png', 1.0), (C, C))
        self._mghosts_pos = [(0, 0)] * 4
        self._mghosts_state = [0] * 4

        return None

    def draw_sprite(self, pos: Vector2, sprite: pygame.Surface, offset_x: int, offset_y: int, scale: float) -> None:
        if (int(pos.x), int(pos.y)) in self._visible_cells:
            if scale == 0.0:
                raise Exception("")
            rel_pos = pos - self._player_pos
            dist = math.hypot(rel_pos.x, rel_pos.y)
            spr = (sprite, rel_pos, dist, offset_x, offset_y, scale)
            if self._sprite_count == len(self._sprites):
                self._sprites.append(None)
            slot = self._sprite_count
            self._sprites[slot] = spr
            self._sprite_count += 1

    def draw_ghost(self, pos: Vector2, id: int, animation: int, a_frame: int, g_frame: int) -> None:
        self._mghosts_pos[id] = pos
        self._mghosts_state[id] = 0
        if animation == DEATH:
            self._mghosts_state[id] = 2
            match (a_frame) // 4:
                case 0:
                    self.draw_sprite(pos, self._ghostd_sprite[0], 0, 0, 0.8)
                case 1:
                    self.draw_sprite(pos, self._ghostd_sprite[1], 0, 0, 0.8)
                case 2:
                    self.draw_sprite(pos, self._ghostd_sprite[2], 0, 10, 0.8)
                case 3:
                    self.draw_sprite(pos, self._ghostd_sprite[3], 0, 20, 0.8)
                case _:
                    self.draw_sprite(pos, self._ghostd_sprite[4], 0, 150, 0.4)

        elif animation == ATTACK:
            match (a_frame) // 4:
                case 0:
                    self.draw_sprite(pos, self._ghosta_sprite[0], 0, 0, 0.8)
                case 1:
                    self.draw_sprite(pos, self._ghosta_sprite[1], 0, 20, 0.9)
                case 2:
                    self.draw_sprite(pos, self._ghosta_sprite[2], 0, 40, 1.0)
                case _:
                    self.draw_sprite(pos, self._ghosta_sprite[3], 0, 60, 1.1)
        else:
            match ((a_frame) // 4) % 6:
                case 0:
                    self.draw_sprite(pos, self._ghost_sprite[0], 0, 0, 0.8)
                case 1 | 5:
                    self.draw_sprite(pos, self._ghost_sprite[1], 0, 0, 0.8)
                case 2 | 4:
                    self.draw_sprite(pos, self._ghost_sprite[2], 0, 0, 0.8)
                case 3:
                    self.draw_sprite(pos, self._ghost_sprite[3], 0, 0, 0.8)
        if animation != DEATH and self._state.has_superbonus(g_frame)[0]:
            self._mghosts_state[id] = 1
        return None

    def draw_player(self, pos: Vector2, animation: int, a_frame: int, g_frame: int) -> None:
        return None

    def render_map(self, map: Map, state: GameState, player_pos: Vector2, angle: float, frame: int) -> None:
        self._state = state
        self._visible_cells = {(int(player_pos.x), int(player_pos.y))}
        self._player_pos = player_pos
        self._map = map
        if self._depth_buffer is None:
            self._depth_buffer = [float('inf')] * self._num_rays

        ww = self.window_width
        wh = self.window_height

        self._screen.fill((25, 25, 25), (0, 0, ww, wh // 2))
        self._screen.fill((50, 50, 50), (0, wh // 2, ww, wh // 2))

        column_width = ww / self._num_rays
        start_angle = angle - self.fov / 2
        delta_angle = self.fov / self._num_rays

        for i in range(self._num_rays):
            self._depth_buffer[i] = float('inf')
            ray_angle = start_angle + (i / self._num_rays) * self.fov
            distance, side, wall_x = map.cast_ray(player_pos, Vector2(math.cos(ray_angle), math.sin(ray_angle)), self._visible_cells)

            if distance is not None and distance > 0:
                self._depth_buffer[i] = distance
                fish_eye_fix = max(distance * math.cos(ray_angle - angle), 0.0001)
                wall_height = int(wh / fish_eye_fix)
                wall_width = wall_height
                capped_wall_height = min(wall_height, wh)
                wall_top = (wh - capped_wall_height) // 2

                tex_w = self._wall_texture.get_width()
                tex_h = self._wall_texture.get_height()
                tex_x = int(wall_x * tex_w)
                tex_x = min(max(0, tex_x), tex_w - 1)
                strip_width = max(1, min(tex_w - tex_x, int(tex_w * fish_eye_fix * self.fov / self._num_rays)))

                capped_part = int(0.5 * (1.0 - (capped_wall_height / wall_height)) * tex_h)
                strip = self._wall_texture.subsurface(pygame.Rect(tex_x, capped_part, strip_width, tex_h - capped_part * 2))
                scaled_strip = pygame.transform.scale(
                    strip, (column_width, max(1, capped_wall_height))
                )

                if side == 1:
                    scaled_strip.fill((160, 160, 160), special_flags=pygame.BLEND_RGB_MULT)

                self._screen.blit(scaled_strip, (i * column_width, wall_top))

        for x, y in self._visible_cells:
            if map.cells[y][x] & GUM:
                match (frame // 10) % 6:
                    case 0:
                        self.draw_sprite(Vector2(float(x) + 0.5, float(y) + 0.5), self._gum_sprite[0], 0, 50, 0.2)
                    case 1 | 5:
                        self.draw_sprite(Vector2(float(x) + 0.5, float(y) + 0.5), self._gum_sprite[1], 0, 50, 0.2)
                    case 2 | 4:
                        self.draw_sprite(Vector2(float(x) + 0.5, float(y) + 0.5), self._gum_sprite[2], 0, 50, 0.2)
                    case 3:
                        self.draw_sprite(Vector2(float(x) + 0.5, float(y) + 0.5), self._gum_sprite[3], 0, 50, 0.2)
            elif map.cells[y][x] & SUPERGUM:
                self.draw_sprite(Vector2(float(x) + 0.5, float(y) + 0.5), self._supergum_sprite[0], 0, 50, 0.2)

        return None

    def render_minimap(self, map: Map, state: GameState, player_pos: Vector2, angle: float, frame: int) -> list[Vector2i]:
        D = self.CELL_SIZE + self.WALL_SIZE
        C = self.CELL_SIZE
        G = self.WALL_SIZE
        ox = G
        oy = G

        if state.get_map_instance() != self._level_idx:
            self._level_idx = state.get_map_instance()
            self._level_img = pygame.Surface((self._map_width,
                                              self._map_height),
                                             flags=pygame.SRCALPHA)
            pygame.draw.rect(self._level_img, (70, 130, 180), (0, 0, self._map_width, self._map_height))
            for y in range(map.height):
                for x in range(map.width):
                    cell = map.cells[y][x]
                    if (cell & 15) != 15:
                        pygame.draw.rect(self._level_img, (84, 156, 216), ((ox + x * D), (oy + y * D), C, C))

                    if not (cell & N):
                        pygame.draw.rect(self._level_img, (84, 156, 216), ((ox + x * D), (oy - G + y * D), C, G))

                    if not (cell & W):
                        pygame.draw.rect(self._level_img, (84, 156, 216), ((ox - G + x * D), (oy + y * D), G, C))

        self._screen.blit(self._level_img, (10, self.window_height - self._map_height - 10))

        ox = 10 + G
        oy = self.window_height - self._map_height - 10 + G
        for y in range(map.height):
            for x in range(map.width):
                cell = map.cells[y][x]
                if cell & GUM:
                    self._screen.blit(self._mgum_spr, (ox + x * D, oy + y * D))
                if cell & SUPERGUM:
                    self._screen.blit(self._msup_spr, (ox + x * D, oy + y * D))

        for i in range(len(self._mghosts_pos)):
            if self._mghosts_state[i] == 2:
                spr = self._mghostd_spr
            elif self._mghosts_state[i] == 1:
                spr = self._mghosts_spr
            else:
                spr = self._mghost_spr[i]
            ex = ox + self._mghosts_pos[i][0] * D - C // 2
            ey = oy + self._mghosts_pos[i][1] * D - C // 2
            self._screen.blit(self._mghost_spr[i], (ex, ey))

        mpx = ox + self._player_pos.x * (D)
        mpy = oy + self._player_pos.y * (D)
        fov_x = math.cos(angle - self.fov * 0.5)
        fov_y = math.sin(angle - self.fov * 0.5)
        pygame.draw.line(self._screen, (255, 255, 255, 192), (mpx, mpy), (mpx + fov_x * 72, mpy + fov_y * 72), 1)
        fov_x = math.cos(angle + self.fov * 0.5)
        fov_y = math.sin(angle + self.fov * 0.5)
        pygame.draw.line(self._screen, (255, 255, 255, 192), (mpx, mpy), (mpx + fov_x * 72, mpy + fov_y * 72), 1)
        pygame.draw.circle(self._screen, (255, 255, 0, 192), (mpx, mpy), 6)

    def end_frame(self, player_angle: float, frame: int) -> None:
        count = self._sprite_count
        sprites = self._sprites[:count]
        sprites.sort(key=lambda s: s[2], reverse=True)
        self._sprite_count = 0

        column_width = self.window_width / self._num_rays
        self._sprites.sort(key=lambda s: s[2], reverse=True)
        ww = self.window_width
        wh = self.window_height
        y_scale = wh / 900.0

        dir_x, dir_y = math.cos(player_angle), math.sin(player_angle)
        half_fov_tan = math.tan(self.fov / 2.0)
        plane_x = -dir_y * half_fov_tan
        plane_y = dir_x * half_fov_tan

        inv_det = 1.0 / (dir_y * plane_x - plane_y * dir_x)

        for i in range(count):
            spr = sprites[i]

            rel_x = spr[1].x
            rel_y = spr[1].y

            transform_x = inv_det * (dir_y * rel_x - dir_x * rel_y)
            transform_y = inv_det * (-plane_y * rel_x + plane_x * rel_y)

            if transform_y <= 0.01:
                continue

            screen_x_center = (ww / 2.0) * (1.0 + transform_x / transform_y)
            perp_dist = transform_y

            w = spr[0].get_width()
            h = spr[0].get_height()
            aspect_ratio = w / h
            sprite_h = int(wh / perp_dist * spr[5])
            sprite_w = int(sprite_h * aspect_ratio)

            if sprite_h < 1:
                continue

            x0 = screen_x_center - (sprite_w / 2)
            x1 = screen_x_center + (sprite_w / 2)
            x0c = max(x0, 0)
            x1c = min(x1, ww)
            start_col = max(0, int(x0c / column_width))
            end_col = min(self._num_rays, int(x1c / column_width) + 1)

            full_y0 = wh * 0.5 - sprite_h * 0.5 + spr[4] * y_scale / perp_dist
            full_y1 = full_y0 + sprite_h
            y0 = max(0.0, full_y0)
            y1 = min(wh, full_y1)
            capped_h = y1 - y0

            if capped_h < 1:
                continue

            src_y = max(0, min(h - 1, int((y0 - full_y0) / sprite_h * h)))
            src_h = max(1, min(h - src_y, int((capped_h / sprite_h) * h)))

            for col in range(start_col, end_col):
                if perp_dist < self._depth_buffer[col]:
                    col_x = col * column_width
                    src_x = int((col_x - x0) / sprite_w * w)

                    if 0 <= src_x < w:
                        src_w = min(w - src_x, max(1, int(column_width / sprite_w * w)))
                        sprite = spr[0].subsurface(pygame.Rect(src_x, src_y, src_w, src_h))
                        sprite = pygame.transform.scale(sprite,
                            (column_width, int(capped_h))
                        )
                        self._screen.blit(sprite, (col_x, int(y0)))

        self.render_minimap(self._map, self._state, self._player_pos,
                            player_angle, frame)

