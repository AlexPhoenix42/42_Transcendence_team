Understanding django apps:

- **`__init__.py`** — empty, just marks `users/` as a Python package so it can be imported.
- **`admin.py`** — where you register models to show up in Django's built-in admin panel (a free CRUD UI). Not urgent for you yet.
- **`apps.py`** — a small config class Django uses to identify this app internally (its name, some hooks). You rarely touch this beyond initial setup.
- **`migrations/`** — a folder (currently just holding its own `__init__.py`) where Django will auto-generate files describing schema changes whenever you add/modify models. Empty right now because you have no models yet.
- **`models.py`** — where you define your Python classes that map to database tables. This is where your custom `User` model will go.
- **`tests.py`** — placeholder for writing this app's tests.
- **`views.py`** — where request-handling logic goes (though for an API, this often becomes DRF "views" or "viewsets" instead of plain Django views — we'll get there).

One more thing needs to happen before Django will actually recognize this app exists — it's not enough for the folder to exist on disk. Do you have a guess where you'd need to register this new app so Django knows to load it? (Think back to `config/` — the project folder holding `settings.py`.)

