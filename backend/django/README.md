## Q: When I make new edits to my backend_django what should I do to make them effective in the container?

Depends on what kind of edit — three different cases:

**1. Just editing Python code (views, models' logic, consumers, etc.) — no new packages, no schema changes:**
The bind mount (`./backend/django:/django`) already reflects your edit instantly inside the container — no rebuild needed. Daphne itself just needs to restart to actually load the new code into memory:
```bash
docker compose exec backend_django pkill daphne
```
The supervising loop notices Daphne exited and restarts it immediately with your new code. This is the workflow we specifically built for.

**2. You changed a model (added a field, new model, etc.) — needs a migration:**
Bind mount handles the code change the same way, but the database schema itself won't update on its own. You need to actually generate and apply a migration:
```bash
docker compose exec backend_django python3 manage.py makemigrations
docker compose exec backend_django python3 manage.py migrate
```
Then restart Daphne as in case 1 so the running process picks up the new model code alongside the new schema.

**3. You added/changed a package in `requirements.txt`:**
This is the one case the bind mount can't help with — installed packages live inside the image itself (`/usr/local/lib/python3.14/site-packages/`), not in the bind-mounted `/django` folder. This needs an actual rebuild:
```bash
docker compose up backend_django --build
```
Thanks to the BuildKit cache mounts we set up, this should be fast — only the new/changed package gets downloaded, everything else comes straight from the `goinfre` cache.

**Quick way to know which case you're in:** if you only touched `.py` files → case 1. If you touched `models.py` specifically → also do case 2. If you touched `requirements.txt` → case 3, and restart isn't even necessary since the rebuild recreates the container fresh anyway.

---

