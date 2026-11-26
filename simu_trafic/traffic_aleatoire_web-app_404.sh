#!/bin/sh

echo "Démarrage de la génération de trafic aléatoire. Appuie sur Ctrl+C pour arrêter."

while true; do
  # Choisir un port aléatoire entre 1 et 3
  port=$(( (RANDOM % 3) + 1 ))
  url="http://localhost:300$port/testerror"
  
  # Générer un délai aléatoire
  delay=$(( (RANDOM % 20)))
  
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] Requête vers $url (prochaine dans ${delay}s)..."
  
  curl -s "$url" > /dev/null
  
  sleep "$delay"
done
