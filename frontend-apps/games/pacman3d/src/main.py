import asyncio
from parsing import config_parser
from parsing import config_validator
from typing import Any
import pygame
from gameplay.gameplay import GameConfig, Game


async def main() -> None:
    try:
        config: dict[str, Any] = config_parser.load_config("config.json")
    except Exception as e:
        print(f"Load config error: {e}")
        return
    data: dict[str, Any] = config_validator.config_validator(config)

    pygame.display.init()
    pygame.font.init()

    cfg = GameConfig(
        map_width=data['width'],
        map_height=data['height'],
        seed=42,
        gum_points=data['points_per_pacgum'],
        supergum_points=data['points_per_super_pacgum'],
        ghost_points=data['points_per_ghost'],
        max_lives=data['lives'],
        max_level=data['max_levels'],
        max_time=data['level_max_time'],
        file_name=data['highscore_filename'],
        player_speed=3.0,
        ghost_speed=1.8,
    )
    game = Game(cfg)
    await game.run()
    pygame.quit()


asyncio.run(main())

