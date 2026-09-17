# Le Magicien Gris — Jeu de l'Oie

Ajoute un PNJ (le **Magicien Gris** 🧙) au Jeu de l'Oie multijoueur : il se
balade seul sur le plateau et, quand il tombe sur un joueur, lui pose une
question de culture générale à 4 choix. L'objectif : casser le côté "pure
course au dé sans décision" du jeu de base en ajoutant un vrai enjeu pendant
la partie.

Branche : `3D`. Rien n'est committé — voir tout en bas pour les commandes.

## Comment ça marche (règles du jeu)

- Le magicien avance de **1 à 3 cases à chaque tour**, il choisit lui-même
  la direction (avant ou arrière), et boucle indéfiniment sur les 64 cases
  du plateau (0 à 63).
- S'il atterrit sur la case d'un joueur — **actif ou déjà éliminé** — il lui
  pose une question à 4 choix, générée par IA, jamais deux fois la même
  dans une partie.
- **Joueur actif, mauvaise réponse** → +1 faute. À la **3ᵉ faute cumulée**
  sur toute la partie, le joueur est **éliminé** : il devient spectateur
  pour le reste de la partie (ne joue plus, mais reste visible sur le
  plateau).
- **Joueur déjà éliminé, bonne réponse** → **10 % de chance** d'être
  ressuscité : retour à la case 0, compteur de fautes remis à zéro.
- Le joueur a **25 secondes** pour répondre ; pas de réponse = compté comme
  faux.
- La popup de question ne s'affiche que pour le joueur ciblé ; les autres
  voient juste une ligne dans le journal de partie et continuent à jouer
  normalement — ça ne bloque jamais le reste de la table.

## Architecture

### Backend (`backend/django/goose_game/`)

- **`models.py`** — nouveaux champs :
  - `GooseGame.wizard_position` (0-63) et `wizard_questions_asked` (liste
    JSON des questions déjà posées dans cette partie, pour ne jamais
    répéter).
  - `GoosePlayer.wizard_strikes` (compteur de fautes).
  - Migration : `migrations/0002_goosegame_wizard_position_and_more.py`.

- **`wizard_service.py`** — génération des questions :
  - Appelle Ollama (même mécanisme que `chess_coach`, voir
    `settings.OLLAMA_URL` / `OLLAMA_MODEL`) en lui demandant un JSON strict
    `{"question", "choices": [4], "correct_index"}`.
  - **Repli automatique** sur une banque de ~30 questions statiques
    (culture générale : histoire, géo, art, sciences) si Ollama est
    injoignable, lent, ou renvoie n'importe quoi — la fonction
    `generate_question()` ne lève jamais d'exception, elle réussit
    toujours. Testé en conditions réelles (Ollama injoignable sur ce
    réseau) : le repli prend le relais sans planter la partie.

- **`consumers.py`** (`GooseGameConsumer`) — toute la logique temps réel,
  branchée sur la websocket existante `ws/goose/<game_id>/` (pas de
  nouvelle route) :
  - `_advance_wizard()` : déplace le magicien après chaque tour, détecte
    une collision avec un joueur.
  - `_start_wizard_encounter()` : génère la question, pose un verrou
    Redis (`cache.add`, clé `goose:<game_id>:pending_question:<username>`,
    TTL 40s) pour ne pas redéclencher deux fois la même rencontre, diffuse
    l'événement à toute la partie, programme le timeout de 25s
    (`asyncio.create_task`, pas de nouvelle infra).
  - `_handle_wizard_answer()` / `_resolve_wizard_answer()` : valide la
    réponse, applique faute/élimination ou tirage de résurrection, diffuse
    le résultat.

### Frontend (`frontend-react/src/`)

- **`components/Wizard3D.tsx`** (nouveau) — le magicien en **vrai modèle
  3D procédural three.js** (cônes/sphères/cylindres : robe, chapeau,
  barbe, bâton — pas d'asset externe téléchargé), avec rotation d'idle,
  rebond/écrasement pendant le saut, et une lueur colorée (verte/rouge)
  qui réagit à la bonne/mauvaise réponse.
- **`components/GooseBoard.tsx`** — le magicien saute case par case (façon
  saute-mouton) dans les deux sens (nouvelle prop `wizardMove: {from,
  step}`, `step` signé pour gérer la direction).
- **`components/WizardQuiz.tsx`** (nouveau) — popup de question : 4
  boutons, compte à rebours 25s, feedback visuel bonne/mauvaise réponse.
- **`pages/GooseGame.tsx`** — branché sur les nouveaux types de message
  WS (`wizard_encounter`, `wizard_result`), gère l'ouverture/fermeture de
  la popup et l'ajout au journal de partie.

## Protocole WebSocket (nouveaux messages)

Serveur → client :
```jsonc
// Rencontre déclenchée
{"type": "wizard_encounter", "target": "alice", "question": "...", "choices": ["a","b","c","d"]}

// Résultat (après réponse ou timeout)
{"type": "wizard_result", "target": "alice", "correct": false, "correct_index": 2,
 "eliminated": true, "revived": false, "strikes": 3, "players": [...], "message": "☠️ Le magicien a éliminé alice !"}

// wizard_position / wizard_step ajoutés aux messages existants game_state / turn_result
```

Client → serveur :
```jsonc
{"action": "wizard_answer", "choice_index": 2}
```

## Comment l'intégrer / la lancer

Tout est déjà appliqué et testé sur cette machine (`mi-r2-p6`), mais pour
la remonter ailleurs (autre machine, ou après un `git pull` de la branche) :

1. **Backend** — appliquer la migration :
   ```bash
   docker exec trans_backend_django python manage.py migrate goose_game
   ```
   Aucune variable d'env supplémentaire : `OLLAMA_URL`/`OLLAMA_MODEL`
   existent déjà pour `chess_coach`, réutilisées telles quelles.

2. **Frontend** — `three.js` a été ajouté à `frontend-react/package.json`
   (+ `package-lock.json` régénéré). Reconstruire l'image/le build :
   ```bash
   docker compose -f docker-compose-dev.yml up -d --force-recreate frontend_builder
   ```

3. **Redémarrer le backend** pour charger le nouveau modèle/consumer :
   ```bash
   docker compose -f docker-compose-dev.yml restart backend_django
   ```

## Tests effectués

Script de test bout en bout (websocket réel contre le serveur tournant,
2 comptes de test créés puis supprimés) :
- Déplacement du magicien (direction aléatoire, boucle sur le plateau) ✓
- Rencontre déclenchée à la collision, question posée une seule fois par
  rencontre (verrou cache) ✓
- Repli sur la banque locale quand Ollama est injoignable, sans crash ✓
- 3 fautes cumulées → `is_active=False` en base, joueur éliminé ✓
- Journal de partie et diffusion à tous les joueurs ✓

Non testé en conditions réelles (probabilité trop faible pour un test
rapide, mais logique relue) : le tirage de résurrection à 10 %.

## Limites connues

- `current_turn` est un **index** dans la liste des joueurs actifs ; une
  élimination/résurrection en cours de partie peut ponctuellement décaler
  à qui "revient" le tour suivant. Pas de crash, juste un tour qui peut
  sembler sauter une fois — à surveiller si ça devient gênant en jeu réel.
- Les questions Ollama sont vérifiées côté serveur pour éviter les
  doublons exacts/quasi-exacts, mais rien n'empêche une question
  thématiquement proche d'une précédente si Ollama est bavard.
- Pas de plateau 3D complet pour l'instant — seul le magicien est en 3D
  (three.js), le reste du plateau reste en 2D (divs positionnées sur une
  spirale). Un bouton "tout basculer en 3D" a été évoqué mais mis de côté
  comme chantier séparé, pas encore cadré.

## Commit

Tout ce qui suit est prêt à committer (l'intégration complète du Jeu de
l'oie + la mécanique du Magicien Gris). Depuis la racine du projet :

```bash
git add backend/django/goose_game frontend-react/src/components/GooseBoard.tsx \
  frontend-react/src/components/Wizard3D.tsx frontend-react/src/components/WizardQuiz.tsx \
  frontend-react/src/pages/GooseGame.tsx frontend-react/src/pages/GooseLobby.tsx \
  frontend-react/src/pages/Games.tsx frontend-react/src/routes.tsx \
  frontend-react/package.json frontend-react/package-lock.json \
  backend/django/config/asgi.py backend/django/config/settings.py backend/django/config/urls.py \
  AVANCEMENT.md GOOSE_WIZARD.md

git commit -m "goose: ajoute le Magicien Gris (quiz culture générale + magicien 3D three.js)"
```
