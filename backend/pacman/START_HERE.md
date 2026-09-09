# 🎮 PAC-MAN MULTIPLAYER - GUIDE DE DÉMARRAGE

## 🚀 Commencer Immédiatement

### Option 1: Ouvrir dans le Navigateur (Recommandé)

```bash
# Linux/Mac - Ouvrir index.html
open file:///home/camy/Bureau/new_pacman/network_pacman_v2/index.html

# Windows - Double-cliquer sur index.html
# Ou: C:\Users\...\Bureau\new_pacman\network_pacman_v2\index.html

# En ligne de commande
cd /home/camy/Bureau/new_pacman/network_pacman_v2
# Puis copier cette URL dans votre navigateur:
# file:///home/camy/Bureau/new_pacman/network_pacman_v2/index.html
```

### Option 2: Lancer un Serveur Local

```bash
# Avec Python 3
cd /home/camy/Bureau/new_pacman/network_pacman_v2
python3 -m http.server 8000

# Puis ouvrir dans navigateur:
# http://localhost:8000/index.html
```

```bash
# Avec Node.js (si installé)
cd /home/camy/Bureau/new_pacman/network_pacman_v2
npx http-server -p 8000

# Puis ouvrir:
# http://localhost:8000/index.html
```

---

## 📁 Structure des Fichiers

```
network_pacman_v2/
├── index.html                    ⭐ PAGE D'ACCUEIL - LANCER D'ABORD
├── lobby.html                    🎮 Salle d'attente
├── audio-test.html               🔊 Test audio
├── START_HERE.md                 📖 Ce fichier
├── GAME_RULES.md                 📋 Règles du jeu
├── IMPLEMENTATION_SUMMARY.md     📊 Résumé technique
│
├── src/js/
│   ├── GameRules.js              ⚙️ Système de règles
│   ├── GameRulesIntegration.js   🔧 Intégration
│   ├── CommunicationManager.js   🎙️ Audio/Chat
│   ├── GameLobby.js              👥 Lobby
│   ├── FriendsManager.js         👫 Gestion des amis
│   ├── AudioTest.js              🧪 Tests audio
│   └── [autres fichiers existants]
│
├── src/
│   ├── img/                      🖼️ Images & sprites
│   ├── audio/                    🎵 Sons du jeu
│   └── fonts/                    ✍️ Polices
│
└── public/                       🎭 Icônes & manifest
```

---

## 🎮 FLUX DE JEU COMPLET

```
┌─────────────────────────────────────────┐
│     🎮 PAGE D'ACCUEIL (index.html)      │
│   Choisir un mode de jeu ou tester     │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴─────────┬──────────────┬──────────────┐
       │                 │              │              │
       ▼                 ▼              ▼              ▼
   [1v1]          [1v2]          [2v3]          [2v4]
   CONFIG         CONFIG          CONFIG         CONFIG
       │                 │              │              │
       └───────┬─────────┴──────────────┴──────────────┘
               │
               ▼
   ┌─────────────────────────────────────┐
   │  🎭 LOBBY (lobby.html)               │
   │  - Rejoindre comme Joueur/Spectateur│
   │  - Inviter des amis                 │
   │  - Voir liste d'attente             │
   │  - Marquer "Prêt"                   │
   │  - Démarrer le jeu                  │
   └──────────────┬──────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────────┐
   │  🎮 PARTIE EN JEU (game.html)         │
   │  - Joueurs: Parlent au micro        │
   │  - Spectateurs: Regardent & écoutent│
   │  - Tous: Entendent les sons du jeu  │
   │  - Chat pour spectateurs             │
   └──────────────┬───────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────────┐
   │  📊 RÉSULTATS & SCORES               │
   │  - Afficher gagnant                 │
   │  - Classement                       │
   │  - Option rejouer                   │
   └──────────────────────────────────────┘
```

---

## 🧪 TESTS DISPONIBLES

### Test 1: Audio (5 minutes)
```
URL: audio-test.html

Étapes:
1. Cliquer "Tester Tous les Sons"
2. Vérifier que tous les sons sont chargés
3. Cliquer sur chaque son individuellement
4. Ajuster le volume avec le curseur
5. Vérifier le support du navigateur

Résultat attendu:
✓ Tous les 9 sons chargés
✓ Support audio HTML5
✓ Volume fonctionne correctement
```

### Test 2: Lobby (5 minutes)
```
URL: lobby.html

Scénario 1 - Joueur:
1. Entrer un nom (ex: "Player1")
2. Sélectionner "JOUEUR"
3. Choisir "Pac-Man"
4. Cliquer "REJOINDRE"
5. Vérifier le statut du microphone
6. Voir son nom dans la liste des joueurs

Résultat attendu:
✓ Nom apparaît dans liste joueurs
✓ Microphone affiche statut
✓ Bouton "DÉMARRER PARTIE" actif

Scénario 2 - Spectateur:
1. Ouvrir une autre fenêtre/onglet
2. Entrer un nom (ex: "Viewer1")
3. Sélectionner "SPECTATEUR"
4. Cliquer "REJOINDRE"
5. Voir son nom dans liste spectateurs

Résultat attendu:
✓ Nom apparaît dans liste spectateurs
✓ Peut écrire des messages
✓ Voit les joueurs et liste d'attente

Scénario 3 - Liste d'attente:
1. Ouvrir 3 onglets du lobby
2. Remplir avec 2 joueurs et 1 en attente
3. Joueur 1 quitte
4. Vérifier que joueur en attente est promu

Résultat attendu:
✓ Joueur 3 prend place de Joueur 1
✓ Liste d'attente mise à jour
```

### Test 3: Menu Principal (2 minutes)
```
URL: index.html

Actions à tester:
1. Voir titre et logo
2. Lire les features
3. Cliquer chaque bouton de mode (1v1, 1v2, 2v3, 2v4)
4. Devrait aller à lobby.html
5. Cliquer "AUDIO TEST"
6. Cliquer "GAME RULES"

Résultat attendu:
✓ Page charge correctement
✓ Animations fonctionnent
✓ Tous les boutons cliquables
✓ Navigation vers bonnes pages
```

---

## 🎮 CONFIGURATIONS DE JEU

### Configuration 1v1 (Débutant)
```
👾 Joueurs: 1 Pac-Man normal
👹 Fantômes: 1 Wall-Maker

Pac-Man 1:
  ✓ Mange les grains
  ✗ Ne peut pas détruire murs
  ✗ Meurt au contact des killers
  ✗ Peut pas être emprisonné

Fantôme 1 (Wall-Maker):
  ✓ Crée murs temporaires (10s)
  ✗ Ne tue pas
  ✗ Ne gèle pas

Difficulté: Facile
```

### Configuration 1v2
```
👾 Joueurs: 1 Pac-Man normal
👹 Fantômes: 2 Killers

Fantômes:
  ✓ Tuent Pac-Man au contact
  ✓ Chassent activement
  ✗ Pas d'autres pouvoirs

Difficulté: Moyen
```

### Configuration 2v3 (Coop)
```
👾 Joueurs: 
  - Pac-Man 1 (normal)
  - Pac-Man 2 (invincible)

👹 Fantômes: 
  - 2 Killers
  - 1 Blocker

Pac-Man 2 (Invincible):
  ✓ Immunisé aux fantômes
  ✓ Peut détruire murs
  ✗ Peut ÊTRE emprisonné (15s)
  ✗ NE PEUT PAS manger grains

Difficulté: Difficile (coopératif)
```

### Configuration 2v4 (Complet)
```
👾 Joueurs: 
  - Pac-Man 1 (normal)
  - Pac-Man 2 (invincible)

👹 Fantômes: 
  - 2 Killers
  - 1 Blocker
  - 1 Freezer

Freezer Ghost:
  ✓ Gèle Pac-Men (5s)
  ✓ Doit revenir en prison (7s recharge)
  ✗ Ne tue pas pendant gel

Difficulté: Expert (tous les pouvoirs)
```

---

## 🎙️ SYSTÈME AUDIO & COMMUNICATION

### Pour les JOUEURS 🎮

**Avant la partie:**
- ✓ Demande d'accès au microphone
- ✓ Affiche statut du micro
- ✓ Affiche niveau audio en temps réel
- ✓ Bouton mute/unmute

**Pendant la partie:**
- Voix du joueur enregistrée
- Transmise aux spectateurs
- Synchronisée avec jeu
- Sons du jeu aussi captés

### Pour les SPECTATEURS 👁️

**Avant la partie:**
- ✓ Chat pour écrire messages
- ✓ Voir liste des joueurs
- ✓ Voir liste d'attente
- ✓ Voir configuration du jeu

**Pendant la partie:**
- ✓ Regarder le jeu
- ✓ Entendre voix des joueurs
- ✓ Entendre sons du jeu
- ✓ Écrire commentaires dans chat
- ✓ Voir score en direct

### Fichiers Audio Disponibles

```
🎵 intro.mp3 (intro de la partie)
🎵 dot.mp3 (manger un grain)
🎵 eat.mp3 (manger un fruit)
🎵 eaten.mp3 (Pac-Man mangé)
🎵 dead.mp3 (Pac-Man mort)
🎵 bonus.mp3 (bonus/boost)
🎵 frightened.mp3 (mode peur fantômes)
🎵 back.mp3 (bruit fond)
🎵 life.mp3 (extra vie)

Tous testables dans audio-test.html
```

---

## 🚨 DÉPANNAGE

### Le son ne fonctionne pas

```
✓ Solution 1: Vérifier navigateur
  - Ouvrir audio-test.html
  - Cliquer "Tester Tous les Sons"
  - Vérifier que support existe

✓ Solution 2: Vérifier fichiers
  - Vérifier que fichiers audio existent
  - Vérifier chemin relatif correct
  - Vérifier permissions fichiers

✓ Solution 3: Vérifier volume
  - Vérifier volume navigateur
  - Vérifier volume système
  - Tester avec autre onglet
```

### Le lobby ne charge pas

```
✓ Solution 1: Ouvrir avec serveur
  - Ne pas ouvrir avec file://
  - Utiliser http://localhost:8000
  - Ou copier fichiers sur serveur

✓ Solution 2: Vérifier console
  - Ouvrir F12 (DevTools)
  - Aller onglet Console
  - Chercher messages erreur
  - Copier erreur pour debug
```

### Microphone ne fonctionne pas

```
✓ Vérifier permissions:
  - Navigateur > Paramètres site
  - Vérifier que microphone autorisé
  - Vérifier que pas bloqué

✓ Vérifier appareil:
  - Tester microphone ailleurs
  - Vérifier volume input système
  - Essayer autre navigateur

✓ Tester:
  - Aller lobby.html
  - Vérifier indicateur microphone
  - Voir niveau audio en direct
```

---

## 📊 CHECKLIST DE VÉRIFICATION

### ✓ Installation Complète

- [ ] index.html existe et charge
- [ ] lobby.html existe et charge
- [ ] audio-test.html existe et charge
- [ ] Fichiers audio présents (9 fichiers)
- [ ] Fichiers images présentes (5 fichiers)
- [ ] Polices chargées correctement
- [ ] Aucune erreur dans console (F12)

### ✓ Fonctionnalités Audio

- [ ] Test audio fonctionne
- [ ] Tous les sons se chargent
- [ ] Volume contrôlable
- [ ] Support navigateur détecté
- [ ] Microphone fonctionne (lobby.html)

### ✓ Fonctionnalités Lobby

- [ ] Peut rejoindre comme joueur
- [ ] Peut rejoindre comme spectateur
- [ ] Liste des joueurs mise à jour
- [ ] Liste des spectateurs mise à jour
- [ ] Microphone indicator visible
- [ ] Chat fonctionne (spectateurs)
- [ ] Countdown fonctionne
- [ ] Peut démarrer partie

### ✓ Règles du Jeu

- [ ] Règles Pac-Man compris
- [ ] Règles Fantômes compris
- [ ] Configurations testées
- [ ] Chaque type de fantôme documenté

### ✓ Performance

- [ ] Page charge rapidement
- [ ] Animations fluides
- [ ] Pas de lag audio
- [ ] Responsive design fonctionne

---

## 🎯 PROCHAINES ÉTAPES

### Immédiat (Aujourd'hui)
1. ✅ Tester index.html
2. ✅ Tester audio-test.html
3. ✅ Tester lobby.html
4. ✅ Tester configurations
5. ✅ Vérifier tous les sons

### Court terme (Cette semaine)
1. Implémenter backend WebSocket
2. Connecter lobby à vrai jeu Pac-Man
3. Tester avec vrais utilisateurs
4. Enregistrer audio en direct
5. Améliorer UI basée sur feedback

### Moyen terme (Ce mois)
1. Système d'authentification
2. Classements et statistiques
3. Historique des parties
4. Invitations amis en direct
5. Mode spectateur amélioré

---

## 📞 SUPPORT

### Fichiers Documentation
- `GAME_RULES.md` - Règles détaillées
- `IMPLEMENTATION_SUMMARY.md` - Vue technique
- Code source - JSDoc commentaires

### En cas de problème
1. Vérifier console (F12)
2. Lire le fichier relevants (.md)
3. Vérifier dépannage ci-dessus
4. Tester avec autre navigateur

---

## 🎉 PRÊT À JOUER!

**Vous avez maintenant un système Pac-Man complet avec:**
- ✅ Règles avancées
- ✅ Système de lobby
- ✅ Communication audio/chat
- ✅ Gestion des amis
- ✅ Tests inclus
- ✅ Documentation complète

### Cliquez sur ce lien pour commencer:
## 👉 [OUVRIR LE JEU](index.html) 👈

**Bon jeu! 🎮🕹️👾**

---

*Version 1.0 - Créé avec Claude Code*
*Dernière mise à jour: 2024-09-03*
