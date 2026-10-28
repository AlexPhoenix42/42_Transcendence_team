# pacman_game/admin.py

from django.contrib import admin

from .models        import Game, GamePlayer


class GamePlayerInline(admin.TabularInline):
    model   = GamePlayer
    extra   = 0
    raw_id_fields = ("user",)


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display  = ("room_name", "status", "level", "winner", "created_by", "created_at")
    list_filter   = ("status", "winner", "level")
    search_fields = ("room_name",)
    raw_id_fields = ("created_by",)
    inlines       = (GamePlayerInline,)


@admin.register(GamePlayer)
class GamePlayerAdmin(admin.ModelAdmin):
    list_display  = ("game", "user", "role", "score", "lives", "won")
    list_filter   = ("role", "won")
    raw_id_fields = ("game", "user")
