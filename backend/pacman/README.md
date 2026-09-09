# 🎮 Network Pacman v2 - Multijoueur avec Chat Vocal

**Un jeu Pacman multijoueur en temps réel basé sur le projet MadamePacman original**

Tous les joueurs se voient et jouent ensemble dans des salons synchronisés avec compte à rebours.

## ✨ Nouvelles Fonctionnalités

### 🎯 Système de Salons
- ✅ Créer des salons personnalisés
- ✅ Rejoindre des salons existants
- ✅ Connexion rapide avec code de salon
- ✅ Liste des salons actifs avec nombre de joueurs
- ✅ Maximum 20 joueurs par salon

### ⏱️ Compte à Rebours Synchronisé
- ✅ Tous les joueurs commencent en même temps
- ✅ Bouton "Prêt" pour chaque joueur
- ✅ Décompte de 10 à 3 secondes
- ✅ Démarrage automatique quand tous sont prêts

### 👥 Système d'Amis
- ✅ Ajouter des amis par pseudo
- ✅ Recherche de joueurs (minimum 2 lettres)
- ✅ Demandes d'amis en attente
- ✅ Accepter/Refuser les demandes
- ✅ Liste de tous vos amis
- ✅ Voir qui est en ligne

### 🎙️ Chat Vocal Intégré
- ✅ Microphone activé automatiquement
- ✅ WebRTC peer-to-peer
- ✅ Tous les joueurs du salon s'entendent
- ✅ Interface colonne droite
- ✅ Pas d'écriture, uniquement vocal

### 🌐 Multijoueur Temps Réel
- ✅ Tous les joueurs se voient en direct
- ✅ Synchronisation des positions via WebSocket
- ✅ Interpolation fluide des mouvements
- ✅ Support de n joueurs simultanés

### 📱 Multi-Plateforme
- ✅ PC (clavier)
- ✅ Mobile/Tablette (tactile)
- ✅ Responsive design adaptatif

## 🎭 Personnages (du jeu original MadamePacman)

- 🟡 **Pacman** - Le héros
- 👑 **Madame Pacman** - Avec son nœud rose
- 👶 **Bébé Pacman** - Petit et mignon
- 🔨 **Constructeur** - Bâtit des murs
- 👻 **Fantômes** - Pinky, Blinky, Inky, Sue

## 🚀 Installation et Démarrage

### Prérequis

- Docker
- Docker Compose

### Lancement Rapide

```bash
cd network_pacman_v2
./docker-start.sh
```

Puis ouvre **http://localhost:3000**

### Lancement Manuel

```bash
# Construire
docker compose build

# Démarrer
docker compose up -d

# Voir les logs
docker compose logs -f

# Arrêter
docker compose down
```

## 🎮 Comment Jouer

### 1. Rejoindre un Salon

Au démarrage, tu verras l'interface de sélection de salon :

- **Créer un salon** : Entre un nom unique
- **Rejoindre un salon existant** : Clique sur un salon dans la liste
- **Connexion rapide** : Entre directement le code d'un salon

### 2. Inviter des Amis

```
1. Recherche un joueur (minimum 2 lettres)
2. Envoie une demande d'ami
3. Une fois acceptée, partage le code de ton salon
```

### 3. Lancer la Partie

```
1. Tous les joueurs cliquent sur "Prêt"
2. Le compte à rebours démarre automatiquement
3. Jouez ensemble !
```

### 4. Contrôles

**PC :**
- Flèches ou ZQSD/WASD : Déplacement
- Microphone : Toujours actif

**Mobile :**
- Swipe : Déplacement
- Microphone : Toujours actif

## 📊 API REST

### Salons

```bash
# Liste des salons
GET /api/rooms/

# Créer un salon
POST /api/rooms/
{
  "name": "ma-partie",
  "max_players": 20
}

# Rejoindre un salon
POST /api/rooms/{id}/join/
{
  "session_id": "abc123",
  "nickname": "Joueur1"
}

# Joueurs dans un salon
GET /api/rooms/{id}/players/
```

### Amis

```bash
# Rechercher des joueurs
GET /api/profiles/search/?q=jou

# Envoyer demande d'ami
POST /api/friends/send_request/
{
  "from_nickname": "Joueur1",
  "to_nickname": "Joueur2"
}

# Mes amis
GET /api/friends/my_friends/?nickname=Joueur1

# Demandes en attente
GET /api/friends/pending_requests/?nickname=Joueur1

# Accepter
POST /api/friends/{id}/accept/

# Refuser
POST /api/friends/{id}/reject/
```

### Profils

```bash
# Classement
GET /api/profiles/leaderboard/?limit=10

# Profil d'un joueur
GET /api/profiles/{nickname}/
```

## 🏗️ Architecture

```
network_pacman_v2/
├── backend/                 # Django + Channels
│   ├── game/
│   │   ├── consumers.py    # WebSocket (jeu + vocal)
│   │   ├── models.py       # DB (salons, joueurs, amis)
│   │   ├── views.py        # API REST
│   │   └── serializers.py
│   └── pacman_server/      # Config Django
│
├── src/                     # Frontend (jeu original + réseau)
│   ├── js/
│   │   ├── NetworkManager.js      # Gestion WebSocket
│   │   ├── NetworkPlayer.js       # Joueurs distants
│   │   ├── VoiceChatManager.js    # Chat vocal WebRTC
│   │   ├── RoomSelector.js        # Interface salons
│   │   ├── Game.js                # Jeu principal (original)
│   │   ├── Pacman.js              # (original)
│   │   ├── Ghost.js               # (original)
│   │   └── ...                    # Tous les fichiers originaux
│   ├── img/                # Images originales
│   ├── audio/              # Sons originaux
│   └── index.html
│
├── docker-compose.yml       # 3 conteneurs
├── Dockerfile.backend
├── Dockerfile.frontend
└── requirements.txt
```

## 🔒 Sécurité

✅ **Validation des entrées** - Tous les messages WebSocket validés  
✅ **Sanitisation** - Pas d'injection XSS/SQL  
✅ **Limitation de taille** - Protection DoS  
✅ **CORS configuré** - Origines contrôlées  
✅ **Recherche sécurisée** - Minimum 2 caractères  

## 🎨 Crédits

- **Jeu original** : [MadamePacman/jsPacman](https://github.com/8tentaculos/jsPacman) par 8tentaculos
- **Adaptation multijoueur** : Système de salons, amis, chat vocal, synchronisation temps réel
- **Technologies** : Django Channels, WebRTC, WebSocket, Canvas

## 📝 TODO / Améliorations

- [ ] Implémenter la logique complète d'accouplement
- [ ] Ajouter les fruits sur la carte
- [ ] Système de niveaux progressifs
- [ ] Notifications en temps réel (ami connecté, invitation salon)
- [ ] Messages privés entre amis
- [ ] Salons privés avec mot de passe
- [ ] Replay des parties
- [ ] Statistiques détaillées par joueur

## 🐛 Dépannage

**Les joueurs ne se voient pas :**
- Vérifier que tous sont dans le même salon
- Regarder les logs : `docker compose logs -f backend`

**Pas de son dans le chat vocal :**
- Autoriser le microphone dans le navigateur
- Utiliser Chrome ou Firefox (meilleur support WebRTC)

**Compte à rebours ne démarre pas :**
- Vérifier que tous les joueurs ont cliqué sur "Prêt"

---

**Bon jeu ! 🎮👾**
