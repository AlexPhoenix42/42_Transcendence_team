import pygame


def resize_image(image: pygame.Surface, new_size: tuple[int, int]) -> pygame.Surface:
    return pygame.transform.smoothscale(image, new_size)


def load_sprite(filename: str, scale: float) -> pygame.Surface:
    sprite = pygame.image.load(filename).convert_alpha()
    if scale != 1.0:
        sprite = resize_image(sprite, (int(scale * sprite.get_width()), int(scale * sprite.get_height())))
    return sprite

