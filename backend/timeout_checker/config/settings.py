# timeout_checker/config/settings.py

import os

SECRET_KEY = os.environ.get("SECRET_KEY", "checker-secret-key")
DEBUG = False
ALLOWED_HOSTS = []

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "channels",
    "chess_game",
    "users",
]

def _read_secret_file(path):
    if  path and os.path.exists(path):
        with open(path) as f:
            return f.read().strip()

    return None

DB_USER = _read_secret_file(os.environ.get("DB_USER_FILE")) or os.environ.get("DB_SERVER_USER")
DB_PASS = _read_secret_file(os.environ.get("DB_PASS_FILE")) or os.environ.get("DB_SERVER_PASS")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["DB_SERVER_DB"],
        #"USER": os.environ["DB_SERVER_USER"],
        "USER": DB_USER,
        #"PASSWORD": os.environ["DB_SERVER_PASS"],
        "PASSWORD": DB_PASS,
        "HOST": os.environ["DB_HOST"],
        "PORT": int(os.environ.get("DB_PORT", "5432")),
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [(
                os.environ.get("REDIS_HOST", "redis"),
                int(os.environ.get("REDIS_PORT", "6379")),
            )],
        },
    }
}

AUTH_USER_MODEL = "users.User"

# Disable migrations – tables already exist in the main database
MIGRATION_MODULES = {
    "chess_game": None,
    "users": None,
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
ROOT_URLCONF = "config.urls"
TIME_ZONE = "UTC"
USE_TZ = True

