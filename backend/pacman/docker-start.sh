#!/bin/bash

echo "🐳 Démarrage de Network Pacman v2 avec Docker"
echo ""

# Arrêter les conteneurs existants
echo "🛑 Arrêt des conteneurs existants..."
docker compose down 2>/dev/null || true

# Construire et démarrer
echo "🔨 Construction des images Docker..."
docker compose build

echo "🚀 Démarrage des conteneurs..."
docker compose up -d

# Attendre
echo "⏳ Attente du démarrage des services..."
sleep 10

# Statut
echo ""
echo "📊 Statut des conteneurs:"
docker compose ps

echo ""
echo "✨ Application démarrée avec succès !"
echo ""
echo "🌐 Frontend : http://localhost:3000"
echo "🔧 Backend  : http://localhost:8000"
echo "📡 Redis    : localhost:6379"
echo ""
echo "📝 Commandes utiles:"
echo "  - Voir les logs      : docker compose logs -f"
echo "  - Arrêter            : docker compose down"
echo "  - Redémarrer         : docker compose restart"
echo ""
