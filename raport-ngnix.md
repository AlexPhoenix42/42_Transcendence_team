# Rapport : WebSocket cassé sur tout le backend

Date : 2026-09-20

## Symptôme

Erreur observée dans Firefox :

```
Firefox can't establish a connection to the server at ws://localhost:3000/ws/pacman/coucou/?token=...
```

Confirmé : plus aucune **nouvelle** connexion WebSocket ne s'établit, sur **tous les
endpoints** (`/ws/pacman/...`, `/ws/goose/...`), pas seulement Pacman.

## Tests effectués (aucune action corrective prise)

- Client Python `websockets` (celui utilisé pour tous les tests réussis plus tôt dans
  la session) → rejeté avec `HTTP 403 Access denied`.
- Testé directement sur les 4 workers Daphne (ports 9000 à 9003 sur
  `trans_backend_django`) → 403 partout, identique sur les 4.
- En passant par nginx (port 3000, comme le fait réellement le navigateur) → même 403.
- Depuis l'intérieur même du conteneur backend (donc pas un souci réseau/nginx) → même
  403.

## Ce qui n'est PAS en cause

- **nginx** : config vérifiée (`nginx -T`), correcte (`location ^~ /ws/` proxy bien
  configuré avec les headers `Upgrade`/`Connection`), pas de ModSecurity actif.
- **`ALLOWED_HOSTS`** : `*` (tout autorisé).
- **Middleware de rate-limiting/lockout** : rien trouvé (pas de `django-axes` ou
  équivalent) dans `MIDDLEWARE`/`INSTALLED_APPS`.
- **Logs applicatifs Django** : aucune exception/traceback trouvée — le rejet a lieu
  **avant** que le code Django/Channels ne s'exécute, au niveau Daphne/Twisted
  directement.

## Indice notable

Les logs backend montrent **2 connexions WebSocket déjà établies qui continuent de
fonctionner normalement** (échange de frames en continu, IP source
`172.19.0.9` = `trans_frontend_nginx`) — donc ce n'est **pas une panne totale**, juste
plus aucune **nouvelle** connexion ne passe. Ça ressemble à une limite de
connexions/ressources atteinte sur le process Daphne plutôt qu'un problème de config.

## Piste la plus probable (non confirmée)

Cette session a fait tourner énormément de connexions de test (scripts WS répétés
pour `goose_game` et `pacman_game`, boucles de fond par salon type `_prison_loop`
(goose) / `_bot_loop`, `_sync_loop` (pacman)) sans toujours passer par une
déconnexion propre (suppressions directes en base plutôt que fermeture de socket).
Plausible que ça ait épuisé quelque chose côté Daphne (connexions, threads, ou une
limite interne). Pas vérifié plus loin.

## Pas encore regardé

- Les flags de lancement de Daphne dans `docker_conf/entrypoint.sh` (limite de
  connexions éventuelle).
- Un simple restart du backend suffirait sans doute à vérifier l'hypothèse — pas
  fait, en attente de confirmation.
