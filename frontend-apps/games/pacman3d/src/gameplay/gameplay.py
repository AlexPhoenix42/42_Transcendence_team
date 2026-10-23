import pygame
import math
import asyncio
from mazegenerator import MazeGenerator
from pygame.math import Vector2
from dataclasses import dataclass
from draw import load_sprite
from vector2i import Vector2i
from game_state import GameState
from map import Map, IS_OCCUPIED, directions, inv_dir
from renderer import Renderer3D, ATTACK, DEATH
from ray import raycast_billboard
from entity import Ghost, Player3D
from menu_renderer import Menu
import json
import time

FPS = 35


@dataclass(frozen=True)
class GameConfig:
    map_width: int
    map_height: int
    seed: int
    gum_points: int
    supergum_points: int
    ghost_points: int
    max_lives: int
    max_level: int
    max_time: int
    player_speed: float
    ghost_speed: float
    file_name: str

class Game:
    _renderer: Renderer3D
    _player: Player3D
    _ghosts: list[Ghost]
    _map: Map
    _map_generator: MazeGenerator
    _clock: pygame.time.Clock
    _running: bool
    _hud_sprites: list[pygame.Surface]
    _fade_surf: pygame.Surface
    _state: GameState
    _cfg: GameConfig
    _death_sequence_dangle: float
    _death_sequence_angle: float
    _death_sequence_step: int
    _death_sequence_step_start: int
    _screen: pygame.Surface

    def __init__(self, cfg: GameConfig) -> None:
        self._cfg = cfg
        self._running = False
        self._state = GameState(cfg.max_level, cfg.max_time, cfg.max_lives, cfg.gum_points,
                                cfg.supergum_points, cfg.ghost_points, 20)
        self._map_generator = MazeGenerator(size=(cfg.map_width, cfg.map_height), perfect=False, seed=cfg.seed)
        self._map = Map(cfg.map_width, cfg.map_height, self._map_generator.maze, self._state)

        self._screen_state = "start"
        self._title_y = 80
        self._title_alpha = 255
        self._title_scale = 1.0
        self._selected_button = 0
        self._file_name = cfg.file_name

        self._death_sequence_dangle = 0.0
        self._death_sequence_angle = 0.0
        self._death_sequence_step = 0
        self._death_sequence_step_start = 0
        self._nombre_level_skip = self._cfg.max_level
        self._level_skip_count = 0
        self._extra_lives_count = 0

        player_pos = Vector2i(cfg.map_width // 2 - (0 if cfg.map_width & 1 else 1), cfg.map_height // 2)

        window_width = 1536
        window_height = 1024
        self._screen = pygame.display.set_mode((window_width, window_height))
        pygame.display.set_caption("Pacman 3D")

        self._renderer = Renderer3D(self._screen, (cfg.map_width, cfg.map_height), fov=math.pi / 3)
        self._player = Player3D(self._map, player_pos, 0.09)
        self._fade_surf = pygame.Surface((self._renderer.window_width, self._renderer.window_height), pygame.SRCALPHA)

        self._menu = Menu(self._renderer)
        self._ghosts = [
            Ghost(self._map, Vector2i(                0,                  0), 0.054, 0),
            Ghost(self._map, Vector2i(cfg.map_width - 1,                  0), 0.054, 1),
            Ghost(self._map, Vector2i(                0, cfg.map_height - 1), 0.054, 2),
            Ghost(self._map, Vector2i(cfg.map_width - 1, cfg.map_height - 1), 0.054, 3),
        ]
        self._hud_sprites = [
            load_sprite('gameplay/hud_00.png', 1.0),
            load_sprite('gameplay/hud_33.png', 1.0),
            load_sprite('gameplay/hud_66.png', 1.0),
            load_sprite('gameplay/hud_100.png', 1.0),
        ]

        self._menu_alpha = 0
        self._player_name = ""
        self._name_error = ""
        self._score_saved = False
        self._exit_selected = 0
        self._difficulty_selected = 0
        self._difficulty_active = 0
        self._pause_selected = 0
        self._cheat_selected = 0
        self._cheats_from = "menu"
        self._cheat_active = [False, False, False, False, False, False]

    def next_level(self) -> bool:
        if (self._state.get_level() < self._state.get_max_level()):
            if self._state.get_level() == 0:
                self._map_generator.generate(self._cfg.seed)
            else:
                self._map_generator.generate()
            self._map = Map(self._cfg.map_width, self._cfg.map_height, self._map_generator.maze, self._state)

            w = self._cfg.map_width
            h = self._cfg.map_height
            player_pos = Vector2i(w // 2 - (0 if w & 1 else 1), h // 2)
            self._player.teleport(player_pos, None)
            self._ghosts[0].teleport(Vector2i(    0,     0), self._map)
            self._ghosts[1].teleport(Vector2i(w - 1,     0), self._map)
            self._ghosts[2].teleport(Vector2i(    0, h - 1), self._map)
            self._ghosts[3].teleport(Vector2i(w - 1, h - 1), self._map)
            return True
        else:
            self._screen_state = "game_win"
            pygame.event.set_grab(False)
            pygame.mouse.set_visible(True)
            return False

    def reset_game(self) -> None:
        self._state._level = 0
        self._state._score = 0
        self._state._lives = self._state._max_lives
        self._level_skip_count = 0
        self._extra_lives_count = 0
        self._cheat_active[1] = False
        self._cheat_active[3] = False

        self._state._superbonus_start = 0
        self._state._superbonus_end = 0
        self._state._frozen_time = False
        self._state._frozen_time_start = time.perf_counter()

        self._state.invincibility = False
        self._state.frozen_ghosts = False
        self._state.speed_boost = False

        self._player_name = ""
        self._name_error = ""

        self._cheat_active = [False, False, False, False, False, False]
        self._renderer._level_idx = -1

    def apply_cheats(self) -> None:
        for i in range(self._level_skip_count):
            if not self.next_level():
                break
        self._state.add_lives(self._extra_lives_count)
        self._cheat_active[1] = False
        self._level_skip_count = 0
        self._cheat_active[3] = False
        self._extra_lives_count = 0

    def start_3d_game(self) -> None:
        player_pos = Vector2i(
            self._cfg.map_width // 2
            - (0 if self._cfg.map_width & 1 else 1),
            self._cfg.map_height // 2
        )

        self._renderer = Renderer3D(
            self._screen,
            (self._map.width, self._map.height),
            fov=math.pi / 3
        )

        self._player = Player3D(self._map, player_pos, 0.09)

        self._menu._renderer = self._renderer
        self._state.set_level(0)
        self.next_level()
        self.apply_cheats()

        pygame.mouse.set_visible(False)
        pygame.event.set_grab(True)
        pygame.mouse.get_rel()
        pygame.mouse.set_pos((self._renderer.window_width // 2, self._renderer.window_height // 2))

        self._screen_state = "game"

    def save_highscore(self, name: str, score: int) -> None:
        try:
            with open(self._file_name, "r") as file:
                highscores = json.load(file)
        except (FileNotFoundError, json.JSONDecodeError):
            highscores = []

        highscores.append({"name": name, "score": score})
        highscores.sort(key=lambda item: item["score"], reverse=True)
        highscores = highscores[:10]

        with open(self._file_name, "w") as file:
            json.dump(highscores, file, indent=4)

    def check_overlap(self, frame: int) -> Ghost:
        for ghost in self._ghosts:
            if not ghost.is_dead(frame) and ghost.overlap(self._player) and not self._player.is_dead(frame):
                if self._state.invincibility or self._state.has_superbonus(frame)[0]:
                    ghost.play_animation(DEATH, frame)
                    self._renderer.add_floating_text(f"+{self._state._ghost_score}", (255, 255, 255), self._player.pos.x, self._player.pos.y)
                    self._state.eat_ghost()
                else:
                    player_killer = ghost
                    self._death_sequence_step_start = frame
                    self._death_sequence_step = 1
                    forward_dir = Vector2(math.cos(self._player.angle), math.sin(self._player.angle))
                    new_pos = self._player.pos + forward_dir * 0.55
                    player_killer.teleport(Vector2i(int(new_pos.x), int(new_pos.y)), self._map)
                    player_killer.pos = new_pos
                    self._death_sequence_angle = self._player.angle
                    self._death_sequence_dangle = 0.0
                    return player_killer
        return None

    async def run(self) -> None:
        pygame.mouse.set_visible(False)
        pygame.event.set_grab(True)
        pygame.mouse.get_rel()
        pygame.mouse.set_pos((self._renderer.window_width // 2, self._renderer.window_height // 2))

        self._running = True
        self._clock = pygame.time.Clock()
        frame = 0
        player_killer = None
        self._death_sequence_step_start = 0
        self._death_sequence_step = 0
        self._death_sequence_angle = 0
        death_sequence_dangle = 0
        alpha = 255
        self._map.update_player_pos(self._player.pos, frame)

        in_menu = False

        while self._running:
            pressed_keys = set()
            unicode: str = ""
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self._running = False
                elif event.type == pygame.KEYDOWN:
                    pressed_keys.add(event.key)
                    unicode += event.unicode

            match self._screen_state:
                case "game":
                    if pygame.K_ESCAPE in pressed_keys:
                        self._screen_state = "pause"
                        self._pause_selected = 0
                        pygame.event.set_grab(False)
                        pygame.mouse.set_visible(True)
                    elif pygame.K_i in pressed_keys:
                        self._state.invincibility = not self._state.invincibility
                        self._cheat_active[0] = self._state.invincibility
                    elif pygame.K_g in pressed_keys:
                        self._state.frozen_ghosts = not self._state.frozen_ghosts
                        self._cheat_active[2] = self._state.frozen_ghosts
                    elif pygame.K_b in pressed_keys:
                        self._state.invincibility = not self._state.invincibility
                        self._cheat_active[0] = self._state.invincibility
                    elif pygame.K_n in pressed_keys:
                        self.next_level()
                    elif pygame.K_l in pressed_keys:
                        self._state._lives += 1
                    elif pygame.K_e in pressed_keys:
                        if not self._cheat_active[4]:
                            self._state.speed_boost = True
                            self._cheat_active[4] = True
                        else:
                            self._state.speed_boost = False
                            self._cheat_active[4] = False
                    elif pygame.K_t in pressed_keys:
                        self._cheat_active[5] = self._state.toggle_freeze_time()

                case "pause":
                    if pygame.K_ESCAPE in pressed_keys:
                        self._screen_state = "game"
                    if pygame.K_DOWN in pressed_keys:
                        if self._pause_selected < 2:
                            self._pause_selected += 1
                    elif pygame.K_UP in pressed_keys:
                        if self._pause_selected > 0:
                            self._pause_selected -= 1
                    elif pygame.K_RETURN in pressed_keys:
                        if self._pause_selected == 0:
                            pygame.event.set_grab(True)
                            pygame.mouse.set_visible(False)
                            pygame.mouse.set_pos((self._renderer.window_width // 2, self._renderer.window_height // 2))
                            pygame.mouse.get_rel()
                            self.apply_cheats()
                            self._screen_state = "game"
                        elif self._pause_selected == 1:
                            self._screen_state = "cheats"
                            self._cheats_from = "pause"
                        elif self._pause_selected == 2:
                            self._screen_state = "menu"

                    self._menu.draw_pause(self._pause_selected)

                case "start":
                    if len(pressed_keys) > 0:
                        self._screen_state = "transition"
                    self._menu.draw_start(self._title_y)

                # Menu: [0] Start 3D  [1] Scores  [2] Instructions  [3] Cheats  [4] Exit
                case "menu" | "transition":
                    if pygame.K_DOWN in pressed_keys:
                        if self._selected_button < 3:
                            self._selected_button += 1
                    elif pygame.K_UP in pressed_keys:
                        if self._selected_button > 0:
                            self._selected_button -= 1
                    elif pygame.K_RETURN in pressed_keys:
                        if self._selected_button == 0:
                            self.start_3d_game()
                        elif self._selected_button == 1:
                            self._screen_state = "score"
                        elif self._selected_button == 2:
                            self._screen_state = "instructions"
                        elif self._selected_button == 3:
                            self._screen_state = "cheats"
                            self._difficulty_selected = 0
                            self._cheats_from = "menu"
                        #elif self._selected_button == 4:
                        #    self._screen_state = "exit"
                        #    self._exit_selected = 0

                    if self._screen_state == "transition":
                        if self._title_y > 50:
                            self._title_y -= 1.3
                            if self._title_alpha > 10:
                                self._title_alpha -= 7
                            if self._title_y < 50:
                                self._title_y = 50
                        if self._title_scale > 0.6:
                            self._title_scale -= 0.015
                        if self._menu_alpha < 230:
                            self._menu_alpha += 6
                            if self._menu_alpha > 230:
                                self._menu_alpha = 230
                        if self._title_y <= 50 and self._menu_alpha >= 230:
                            self._screen_state = "menu"
                    else:
                        self._title_y = 50
                        self._title_scale = 0.6
                        self._menu_alpha = 230

                    self._menu.draw_menu(
                        self._selected_button,
                        self._title_y,
                        self._title_alpha,
                        self._title_scale,
                        self._menu_alpha
                    )

                case "score":
                    if pygame.K_RETURN in pressed_keys:
                        self._screen_state = "menu"
                    self._menu.draw_view_score(self._file_name)

                case "cheats":
                    if pygame.K_DOWN in pressed_keys:
                        if self._cheat_selected < 6:
                            self._cheat_selected += 1
                    elif pygame.K_UP in pressed_keys:
                        if self._cheat_selected > 0:
                            self._cheat_selected -= 1
                    elif pygame.K_LEFT in pressed_keys:
                        if self._cheat_selected == 1 and self._level_skip_count > 0:
                            self._level_skip_count -= 1
                            self._cheat_active[1] = self._level_skip_count > 0
                        elif self._cheat_selected == 3:
                            if self._extra_lives_count > 0:
                                self._extra_lives_count -= 1
                                self._cheat_active[3] = self._extra_lives_count > 0
                    elif pygame.K_RIGHT in pressed_keys:
                        if (self._cheat_selected == 1 and
                            (self._state.get_level() + self._level_skip_count) <= self._state.get_max_level()):
                            self._level_skip_count += 1
                            self._cheat_active[1] = True
                        elif self._cheat_selected == 3:
                            self._extra_lives_count += 1
                            self._cheat_active[3] = True
                    elif pygame.K_RETURN in pressed_keys:
                        if self._cheat_selected == 0:
                            self._state.invincibility = not self._state.invincibility
                            self._cheat_active[0] = self._state.invincibility
                        elif self._cheat_selected == 2:
                            self._state.frozen_ghosts = not self._state.frozen_ghosts
                            self._cheat_active[2] = self._state.frozen_ghosts
                        elif self._cheat_selected == 4:
                            self._state.speed_boost = not self._state.speed_boost
                            self._cheat_active[4] = self._state.speed_boost
                        elif self._cheat_selected == 5:
                            self._cheat_active[5] = self._state.toggle_freeze_time()
                        elif self._cheat_selected == 6:
                            self._screen_state = self._cheats_from

                    self._menu.draw_cheat_modes(
                        self._cheat_selected, self._cheat_active, self._cheats_from,
                        self._level_skip_count, self._extra_lives_count
                    )

                case "game_over":
                    if pygame.K_BACKSPACE in pressed_keys:
                        self._player_name = self._player_name[:-1]
                    elif pygame.K_RETURN in pressed_keys:
                        result = self._menu.check_name(self._player_name)
                        if result == self._player_name:
                            self._name_error = ""
                            self.save_highscore(self._player_name, self._state.get_score())
                            self.reset_game()
                            self._screen_state = "menu"
                        else:
                            self._name_error = result
                    for c in unicode:
                        if c.isprintable() and len(self._player_name) < 10:
                            self._player_name += c
                    self._menu.draw_game_over(self._state.get_score(), self._player_name, self._name_error)

                case "game_win":
                    if pygame.K_BACKSPACE in pressed_keys:
                        self._player_name = self._player_name[:-1]
                    elif pygame.K_RETURN in pressed_keys:
                        result = self._menu.check_name(self._player_name)
                        if result == self._player_name:
                            self._name_error = ""
                            self.save_highscore(self._player_name, self._state.get_score())
                            self.reset_game()
                            self._screen_state = "menu"
                        else:
                            self._name_error = result
                    for c in unicode:
                        if c.isprintable() and len(self._player_name) < 10:
                            self._player_name += c
                    self._menu.draw_win_game(self._state.get_score(), self._player_name, self._name_error)

                case "instructions":
                    if pygame.K_RETURN in pressed_keys:
                        self._screen_state = "menu"
                    self._menu.draw_instructions()

                case "exit":
                    if pygame.K_UP in pressed_keys:
                        self._exit_selected = 0
                    elif pygame.K_DOWN in pressed_keys:
                        self._exit_selected = 1
                    elif pygame.K_RETURN in pressed_keys:
                        if self._exit_selected == 0:
                            self._running = False
                        else:
                            self._screen_state = "menu"
                    self._menu.draw_exit(self._exit_selected)

            if self._screen_state != "game":
                self._renderer.flip()
                self._clock.tick(FPS)
                if not in_menu:
                    self._state.pause()
                    in_menu = True
                self._state.tick()
                await asyncio.sleep(0)
                continue
            else:
                if in_menu:
                    in_menu = False
                    self._state.resume(self._cheat_active[5])

            if self._state.get_gum_count() == 0:
                self.next_level()

            self._state.tick()

            match self._death_sequence_step:
                case 0:
                    self._player.update(self._map, self._state, frame)
                    self._map.update_player_pos(self._player.pos, frame)
                    if (frame < self._state._superbonus_end) and (self._state._superbonus_start == frame):
                        self._player.play_animation(ATTACK, frame - 3 * 4)
                        self._renderer.add_floating_text(f"+{self._state._supergum_score}", (255, 255, 255), self._player.pos.x, self._player.pos.y)
                    if (self._player._animation == ATTACK) and (self._player._animation_start == frame):
                        dx, dy = math.cos(self._player.angle), math.sin(self._player.angle)
                        dist = self._map.cast_ray(self._player.pos, Vector2(dx, dy), None)[0]
                        hit = None
                        for ghost in self._ghosts:
                            if not ghost.is_dead(frame):
                                dist2 = raycast_billboard(self._player.pos.x, self._player.pos.y, dx, dy, ghost.pos.x, ghost.pos.y, 0.5)
                                if dist2 < dist:
                                    dist = dist2
                                    hit = ghost
                        if hit is not None:
                            hit.play_animation(DEATH, frame)
                            self._renderer.add_floating_text(f"+{self._state._ghost_score}", (255, 255, 255), self._player.pos.x, self._player.pos.y)
                            self._state.eat_ghost()
                    player_killer = self.check_overlap(frame)
                    for ghost in self._ghosts:
                        ghost.update(self._map, self._state, frame)
                    player_killer = self.check_overlap(frame) if player_killer is None else player_killer
                case 1:
                    self._player.angle += death_sequence_dangle
                    if (frame - self._death_sequence_step_start) == 10:
                        self._player.angle = self._death_sequence_angle
                        self._death_sequence_step = 2
                        player_killer.play_animation(ATTACK, frame)
                        self._death_sequence_step_start = frame
                case 2:
                    if ((frame - self._death_sequence_step_start) // 4) == 4:
                        self._death_sequence_step = 3
                        alpha = 0
                        self._death_sequence_step_start = frame + 1
                case 3:
                    at = frame - self._death_sequence_step_start
                    alpha = int(255.0 * at * (1.0 / FPS))
                    if at == FPS:
                        alpha = 255
                        self._death_sequence_step = 4
                        self._death_sequence_step_start = frame + 1
                        if not self._state.player_death():
                            self._screen_state = "game_over"
                            self._death_sequence_step = 0
                            pygame.event.set_grab(False)
                            pygame.mouse.set_visible(True)
                        else:
                            self._player.teleport(self._player._start_pos, None)
                            self._player.angle = 0
                            for ghost in self._ghosts:
                                ghost.teleport(ghost._start_pos, self._map)
                                ghost._animation = 0
                                ghost._animation_start = 0
                case 4:
                    at = frame - self._death_sequence_step_start
                    alpha = 255 - int(255.0 * at * (1.0 / FPS))
                    if at == FPS:
                        self._death_sequence_step = 0
                        alpha = 255

            if not self._state.get_time_left():
                self._screen_state = "game_over"
                pygame.event.set_grab(False)
                pygame.mouse.set_visible(True)

            self._renderer.render_map(self._map, self._state, self._player.pos, self._player.angle, frame)
            self._renderer.player_angle = self._player.angle

            for ghost in self._ghosts:
                self._renderer.draw_ghost(ghost.pos, ghost._identity, ghost._animation, frame - ghost._animation_start, frame)
            self._renderer.draw_player(self._player.pos, self._player._animation, frame - self._player._animation_start, frame)

            self._renderer.end_frame(self._player.angle, frame)

            has_shotgun = self._state.has_superbonus(frame)[0]
            is_shooting = self._player.is_attacking(frame)
            def draw_shoot_spr(spr: pygame.Surface, offx: int, offy: int) -> None:
                self._renderer._screen.blit(spr, (offx * 2, self._renderer.window_height - spr.get_height() + offy))
            if has_shotgun and not is_shooting:
                draw_shoot_spr(self._player._shoot_sprites[0], 300, 0)
            elif is_shooting:
                match (frame - self._player._animation_start) // 4:
                    case 0:
                        draw_shoot_spr(self._player._shoot_sprites[0], 300, 0)
                        draw_shoot_spr(self._player._muzzle_flash_sprite, 332, -260)
                    case 1:
                        draw_shoot_spr(self._player._shoot_sprites[1], 260, 0)
                    case 2:
                        draw_shoot_spr(self._player._shoot_sprites[2], 210, 0)
                    case 3:
                        draw_shoot_spr(self._player._shoot_sprites[3], 270, 0)
                    case 4:
                        draw_shoot_spr(self._player._shoot_sprites[4], 185, 0)
                    case 5:
                        draw_shoot_spr(self._player._shoot_sprites[5], 245, 0)
                    case 6:
                        draw_shoot_spr(self._player._shoot_sprites[6], 270, 0)
                    case 7:
                        draw_shoot_spr(self._player._shoot_sprites[7], 291, 0)
                    case 8:
                        draw_shoot_spr(self._player._shoot_sprites[0], 300, 0)
                        self._player._animation_end = 0
                        self._player._animation = 0
            if has_shotgun or is_shooting:
                shotgun_remaining = self._state.has_superbonus(frame)[1]
                x = self._renderer.window_width // 4
                y = self._renderer.window_height - 40
                w = self._renderer.window_width // 2
                h = 40
                pygame.draw.rect(self._renderer._screen, (80, 80, 80), (x, y, w, h))
                pygame.draw.rect(self._renderer._screen, (0, 0, 0), (x + 2, y + 2, w - 4, h - 4))
                pygame.draw.rect(self._renderer._screen, (0, 200, 0), (x + 2, y + 2, int((w - 4) * shotgun_remaining), h - 4))

            # HUD overlay
            hud_font = self._renderer._font
            white = (255, 255, 255)
            hud_y = 10
            self._renderer.draw_text(f"Level: {self._state.get_level()}", (self._renderer.window_width - 400, hud_y), white)
            self._renderer.draw_text(f"Score: {self._state.get_score():>09}", (self._renderer.window_width - 400, hud_y + 30), white)
            self._renderer.draw_text(f"Lives: {self._state.get_lives()}", (self._renderer.window_width - 400, hud_y + 60), white)
            self._renderer.draw_text(f"Time: {self._state.get_time_left()}", (self._renderer.window_width - 400, hud_y + 90), white)

            if self._death_sequence_step in (3, 4):
                self._fade_surf.fill((0, 0, 0, alpha))
                self._renderer._screen.blit(self._fade_surf, (0, 0))

            self._renderer.draw_text(f"FPS  : {int(self._clock.get_fps())}", (10, 10), (255, 255, 255))
            self._renderer.flip()
            frame += 1
            self._clock.tick(35)
            await asyncio.sleep(0)

        pygame.event.set_grab(False)
        pygame.mouse.set_visible(True)

