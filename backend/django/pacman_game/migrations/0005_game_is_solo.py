# Generated migration for is_solo field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pacman_game', '0004_game_map_choice'),
    ]

    operations = [
        migrations.AddField(
            model_name='game',
            name='is_solo',
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
