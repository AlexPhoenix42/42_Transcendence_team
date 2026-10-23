from draw import resize_image
import json
import pygame


class Menu:
    def __init__(self, renderer):
        self._renderer = renderer
        self._start_screen = pygame.image.load("images/menu/start_screen.png").convert_alpha()
        self._menu_background = pygame.image.load("images/menu/menu_background.png").convert_alpha()
        self._title = pygame.image.load("images/menu/title.png").convert_alpha()
        self._menu_image = pygame.image.load("images/menu/menu.png").convert_alpha()
        self._3d_button = pygame.image.load("images/menu/3d.png").convert_alpha()
        self._view_button = pygame.image.load("images/menu/view.png").convert_alpha()
        self._instruction = pygame.image.load("images/menu/instruction.png").convert_alpha()
        self._exit_button = pygame.image.load("images/menu/exit.png").convert_alpha()
        self._exit_image = pygame.image.load("images/menu/exit_image.png").convert_alpha()
        self._yes = pygame.image.load("images/menu/yes.png").convert_alpha()
        self._no = pygame.image.load("images/menu/no.png").convert_alpha()
        self._h_score = pygame.image.load("images/menu/h_score.png").convert_alpha()
        self._back_menu = pygame.image.load("images/menu/back_menu.png").convert_alpha()
        self._back_instruct = pygame.image.load("images/menu/back_instructions.png").convert_alpha()
        self._pause_menu = pygame.image.load("images/menu/pause_menu.png").convert_alpha()
        self._resume = pygame.image.load("images/menu/resume.png").convert_alpha()
        self._cheat_menu = pygame.image.load("images/menu/cheat_menu.png").convert_alpha()
        self._pause_title = pygame.image.load("images/menu/pause_title.png").convert_alpha()
        self._cheat_screen = pygame.image.load("images/menu/cheat_screen.png").convert_alpha()
        self._invisib_buton = pygame.image.load("images/menu/invisib_buton.png").convert_alpha()
        self._level_skip_buton = pygame.image.load("images/menu/level_skip_buton.png").convert_alpha()
        self._ghost_freez_buton = pygame.image.load("images/menu/ghost_freez_buton.png").convert_alpha()
        self._extra_lives_buton = pygame.image.load("images/menu/extra_lives_buton.png").convert_alpha()
        self._incr_speed_buton = pygame.image.load("images/menu/speed_buton.png").convert_alpha()
        self._pause_back = pygame.image.load("images/menu/pause_back.png").convert_alpha()
        self._cheat_apple = pygame.image.load("images/menu/apple.png").convert_alpha()
        self._game_over_screen = pygame.image.load("images/menu/game_over.png").convert_alpha()
        self._game_over_image = pygame.image.load("images/menu/game_over_image.png").convert_alpha()
        self._game_over_font = pygame.font.SysFont("monospace", 33)
        self._name_place = pygame.image.load("images/menu/name_place.png").convert_alpha()
        self._pm_dead = pygame.image.load("images/menu/Pac-man_dead.png").convert_alpha()
        self._caspers = pygame.image.load("images/menu/caspers.png").convert_alpha()
        self._win_screen = pygame.image.load("images/menu/Win_image.png").convert_alpha()
        self._game_win_image = pygame.image.load("images/menu/game_win_image.png").convert_alpha()
        self._pm_win = pygame.image.load("images/menu/Pac-man_cool.png").convert_alpha()
        self._caspers_1 = pygame.image.load("images/menu/caspers_.png").convert_alpha()
        self._time_freeze_buton = pygame.image.load("images/menu/freeze_time1.png").convert_alpha()
        self._cheat_back_menu = pygame.image.load("images/menu/back_menu1.png").convert_alpha()
        self._cheat_menu_menu = pygame.image.load("images/menu/cheat_menu1.png").convert_alpha()
        self._cheat_pause_back = pygame.image.load("images/menu/pause_back1.png").convert_alpha()
        self._cheat_font = pygame.font.SysFont("monospace", 40)

    def draw_start(self, title_y: float) -> None:
        self._renderer._screen.blit(self._start_screen, (0, 0))
        title_x = (self._renderer.window_width - self._title.get_width()) // 2
        self._renderer._screen.blit(self._title, (title_x, title_y))

    def draw_menu(self, selected_button: int, title_y: float, title_alpha: int, title_scale: float, menu_alpha: int) -> None:
        self._renderer._screen.blit(self._menu_background, (0, 0))

        scaled_width = int(self._title.get_width() * title_scale)
        scaled_height = int(self._title.get_height() * title_scale)
        title_image = resize_image(self._title, (scaled_width, scaled_height))
        title_image.set_alpha(title_alpha)
        title_x = (self._renderer.window_width - title_image.get_width()) // 2
        self._renderer._screen.blit(title_image, (title_x, title_y))

        menu_image = self._menu_image.copy()
        menu_image.set_alpha(menu_alpha)
        menu_x = (self._renderer.window_width - menu_image.get_width()) // 2
        self._renderer._screen.blit(menu_image, (menu_x, 170))

        # Single column layout: 5 buttons
        # [0] Start 3D Game
        # [1] View Scores
        # [2] Instructions
        # [3] Cheat Menu
        # [4] Exit
        center_x = self._renderer.window_width // 2
        start_y = self._renderer.window_height * 40 // 100
        gap = self._renderer.window_height * 11 // 100

        buttons = [
            self._3d_button,
            self._view_button,
            self._instruction,
            self._cheat_menu_menu,
            #self._exit_button,
        ]

        for i, btn_src in enumerate(buttons):
            btn = btn_src.copy()
            if i == selected_button:
                btn.set_alpha(255)
            else:
                btn.set_alpha(160)
            bx = center_x - btn.get_width() // 2
            by = start_y + i * gap
            self._renderer._screen.blit(btn, (bx, by))

    def draw_view_score(self, file_name: str) -> None:
        self._renderer._screen.blit(self._h_score, (0, 0))

        try:
            with open(file_name, "r") as file:
                highscores = json.load(file)
        except (FileNotFoundError, json.JSONDecodeError):
            highscores = []

        start_y = 220
        for i, result in enumerate(highscores):
            text = f"{i + 1}. {result['name']} - {result['score']}"
            score_surface = self._game_over_font.render(text, True, (246, 232, 207))
            score_x = (self._renderer.window_width - score_surface.get_width()) // 2
            self._renderer._screen.blit(score_surface, (score_x, start_y))
            start_y += 55

        back_x = (self._renderer.window_width - self._back_menu.get_width()) // 2
        back_y = (self._renderer.window_height - self._back_menu.get_height() - self._back_menu.get_height() // 3)
        self._renderer._screen.blit(self._back_menu, (back_x, back_y))

    def draw_instructions(self) -> None:
        self._renderer._screen.blit(self._back_instruct, (0, 0))
        back_x = (self._renderer.window_width - self._back_menu.get_width()) // 2
        back_y = (self._renderer.window_height - self._back_menu.get_height() - self._back_menu.get_height() // 3)
        self._renderer._screen.blit(self._back_menu, (back_x, back_y))

    def draw_exit(self, exit_selected: int) -> None:
        self._renderer._screen.blit(self._exit_image, (0, 0))

        yes_image = self._yes.copy()
        no_image = self._no.copy()

        if exit_selected == 0:
            yes_image.set_alpha(255)
            no_image.set_alpha(160)
        else:
            yes_image.set_alpha(160)
            no_image.set_alpha(255)

        buttons_center_x = self._renderer.window_width // 2.9
        gap = yes_image.get_height() // 14
        buttons_height = (yes_image.get_height() + gap + no_image.get_height())
        first_button_y = (self._renderer.window_height - buttons_height) // 2
        second_button_y = (first_button_y + yes_image.get_height() + gap)
        yes_x = (buttons_center_x - yes_image.get_width() // 2)
        no_x = (buttons_center_x - no_image.get_width() // 2)

        self._renderer._screen.blit(yes_image, (yes_x, first_button_y))
        self._renderer._screen.blit(no_image, (no_x, second_button_y))

    def draw_pause(self, pause_selected: int) -> None:
        pause_image = self._pause_menu.copy()
        pause_image.set_alpha(255)
        pause_x = (self._renderer.window_width - pause_image.get_width()) // 2
        pause_y = (self._renderer.window_height - pause_image.get_height()) // 2
        self._renderer._screen.blit(pause_image, (pause_x, pause_y))

        title_x = (self._renderer.window_width - self._pause_title.get_width()) // 2
        title_y = pause_y + 140
        self._renderer._screen.blit(self._pause_title, (title_x, title_y))

        resume_image = self._resume.copy()
        cheat_image = self._cheat_menu.copy()
        back_image = self._back_menu.copy()

        buttons = [resume_image, cheat_image, back_image]

        for i in range(len(buttons)):
            if i == pause_selected:
                buttons[i].set_alpha(255)
            else:
                buttons[i].set_alpha(160)

        gap = -40
        total_height = (
            resume_image.get_height()
            + cheat_image.get_height()
            + back_image.get_height()
            + gap * 2
        )
        start_y = (self._renderer.window_height - total_height) // 1.6
        center_x = self._renderer.window_width // 2
        current_y = start_y

        for button in buttons:
            button_x = (center_x - button.get_width() // 2)
            self._renderer._screen.blit(button, (button_x, current_y))
            current_y += button.get_height() + gap

    def draw_cheat_modes(
        self,
        cheat_selected: int,
        cheat_active: list[bool],
        stat: str,
        level_skip_count: int,
        extra_lives_count: int
    ) -> None:
        self._renderer._screen.blit(self._cheat_screen, (0, 0))
        invisible_buton = self._invisib_buton.copy()
        level_skip_buton = self._level_skip_buton.copy()
        ghost_freez_buton = self._ghost_freez_buton.copy()
        extra_lives_buton = self._extra_lives_buton.copy()
        incr_speed_buton = self._incr_speed_buton.copy()
        cheat_pause_back = self._cheat_pause_back.copy()
        freeze_time = self._time_freeze_buton.copy()
        back_to_menu = self._cheat_back_menu.copy()

        if stat == "menu":
            buttons = [
                invisible_buton, level_skip_buton, ghost_freez_buton,
                extra_lives_buton, incr_speed_buton, freeze_time, back_to_menu
            ]
        else:
            buttons = [
                invisible_buton, level_skip_buton, ghost_freez_buton,
                extra_lives_buton, incr_speed_buton, freeze_time, cheat_pause_back
            ]

        for i in range(len(buttons)):
            if i == cheat_selected:
                buttons[i].set_alpha(255)
            else:
                buttons[i].set_alpha(160)

        gap = -65
        total_height = sum(b.get_height() for b in buttons) + gap * 6
        start_y = (self._renderer.window_height - total_height) // 2
        center_x = self._renderer.window_width // 2
        current_y = start_y + 30

        for i in range(len(buttons)):
            button = buttons[i]
            button_x = (center_x - button.get_width() // 2)
            if i == 6:
                current_y += 50
            self._renderer._screen.blit(button, (button_x, current_y))
            if i < 6 and cheat_active[i]:
                apple_x = (button_x - self._cheat_apple.get_width() - 10)
                apple_y = (current_y + (button.get_height() - self._cheat_apple.get_height()) // 2)
                if i == 1:
                    counter = self._cheat_font.render(f"x{level_skip_count}", True, (255, 225, 168))
                    self._renderer._screen.blit(counter, (apple_x + 16, apple_y + 18))
                elif i == 3:
                    counter = self._cheat_font.render(f"x{extra_lives_count}", True, (255, 225, 168))
                    self._renderer._screen.blit(counter, (apple_x + 16, apple_y + 18))
                else:
                    if i == 5:
                        apple_y -= 5
                    self._renderer._screen.blit(self._cheat_apple, (apple_x, apple_y))
            current_y += button.get_height() + gap

    def check_name(self, name: str) -> str:
        if not name.strip():
            return "Name cannot be empty"
        if len(name) > 10:
            return "Name must be 10 characters or fewer"
        if any(not (char.isalnum() or char == " ") for char in name):
            return "Name can only contain:\nletters/numbers/spaces"
        return name

    def draw_game_over(self, score: int, player_name: str, name_error: str) -> None:
        self._renderer._screen.blit(self._game_over_screen, (0, 0))
        g_o_image = self._game_over_image.copy()
        g_o_image.set_alpha(190)
        pause_x = (self._renderer.window_width - g_o_image.get_width()) // 2
        pause_y = (self._renderer.window_height - g_o_image.get_height()) // 1.3
        self._renderer._screen.blit(g_o_image, (pause_x, pause_y))

        name_place = self._name_place.copy()
        name_place.set_alpha(190)
        self._renderer._screen.blit(name_place, (320, 505))
        self._renderer._screen.blit(self._pm_dead, (650, 220))
        self._renderer._screen.blit(self._caspers, (630, 740))

        score_surface = self._game_over_font.render(f"Your score: {score}", True, (255, 255, 255))
        name_surface = self._game_over_font.render(f"Enter your name:\n\n   {player_name}", True, (255, 255, 255))
        self._renderer._screen.blit(score_surface, (600, 500))
        self._renderer._screen.blit(name_surface, (600, 570))

        if name_error:
            error_surface = self._renderer._font.render(name_error, True, (255, 100, 100))
            self._renderer._screen.blit(error_surface, (612, 680))

    def draw_win_game(self, score: int, player_name: str, name_error: str) -> None:
        self._renderer._screen.blit(self._win_screen, (0, 0))
        win_image = self._game_win_image.copy()
        win_image.set_alpha(255)
        pause_x = (self._renderer.window_width - win_image.get_width()) // 2
        pause_y = (self._renderer.window_height - win_image.get_height()) // 1.3
        self._renderer._screen.blit(win_image, (pause_x, pause_y))

        name_place = self._name_place.copy()
        name_place.set_alpha(190)
        self._renderer._screen.blit(name_place, (320, 505))
        self._renderer._screen.blit(self._pm_win, (670, 285))
        self._renderer._screen.blit(self._caspers_1, (640, 720))

        score_surface = self._game_over_font.render(f"Your score: {score}", True, (255, 255, 255))
        name_surface = self._game_over_font.render(f"Enter your name:\n\n   {player_name}", True, (255, 255, 255))
        self._renderer._screen.blit(score_surface, (600, 500))
        self._renderer._screen.blit(name_surface, (600, 570))

        if name_error:
            error_surface = self._renderer._font.render(name_error, True, (255, 100, 100))
            self._renderer._screen.blit(error_surface, (612, 680))

