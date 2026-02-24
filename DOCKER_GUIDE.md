# 🐳 Guide Docker - ProxyBot

## Installation Docker

### Option 1: Build et run local

```bash
# 1. Build l'image
docker build -t proxybot:latest .

# 2. Créer le fichier .env
cp .env.example .env
nano .env  # Configurer les variables

# 3. Run le conteneur
docker run -d \
  --name proxybot \
  -p 3000:3000 \
  --env-file .env \
  proxybot:latest

# 4. Vérifier les logs
docker logs -f proxybot
```

### Option 2: Docker Compose

```bash
# 1. Créer docker-compose.yml (voir ci-dessous)

# 2. Démarrer
docker-compose up -d

# 3. Logs
docker-compose logs -f
```

---

## docker-compose.yml complet

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    container_name: proxybot-mongo
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: proxybot
    networks:
      - proxybot-network

  proxybot:
    build: .
    container_name: proxybot-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MONGODB_URI=mongodb://mongodb:27017/proxybot
      - PAGE_ACCESS_TOKEN=${PAGE_ACCESS_TOKEN}
      - VERIFY_TOKEN=${VERIFY_TOKEN}
      - APP_SECRET=${APP_SECRET}
      - FACEBOOK_PAGE_URL=${FACEBOOK_PAGE_URL}
      - FACEBOOK_PAGE_ID=${FACEBOOK_PAGE_ID}
    depends_on:
      - mongodb
    networks:
      - proxybot-network
    restart: unless-stopped

volumes:
  mongodb_data:

networks:
  proxybot-network:
    driver: bridge
```

---

## Commandes Docker utiles

```bash
# Build l'image
docker build -t proxybot:latest .

# Liste les images
docker images

# Run le conteneur
docker run -p 3000:3000 --env-file .env proxybot:latest

# Liste les conteneurs
docker ps -a

# Arrêter le conteneur
docker stop proxybot

# Redémarrer
docker restart proxybot

# Supprimer
docker rm proxybot

# Logs
docker logs proxybot
docker logs -f proxybot  # Follow

# Accéder au conteneur
docker exec -it proxybot bash

# Supprimer l'image
docker rmi proxybot:latest
```

---

## docker-compose commandes

```bash
# Démarrer les services
docker-compose up -d

# Arrêter
docker-compose down

# Logs
docker-compose logs -f

# Redémarrer
docker-compose restart

# Rebuild et redémarrer
docker-compose up -d --build

# Voir les services
docker-compose ps
```

---

## Dépannage Docker

### "Cannot connect to database"
```bash
# Vérifier que MongoDB est en cours
docker-compose ps

# Vérifier les logs
docker-compose logs mongodb
```

### "Port déjà utilisé"
```bash
# Changer le port dans docker-compose.yml ou:
docker run -p 3001:3000 proxybot:latest
```

### "npm install fails"
```bash
# Ajouter --legacy-peer-deps à Dockerfile
RUN npm install --legacy-peer-deps
```

### "Permission denied"
```bash
# Sur Linux, utiliser sudo ou ajouter l'utilisateur au groupe docker
sudo usermod -aG docker $USER
```

---

## Déploiement sur Render.com

### 1. Pousser sur GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/proxybot
git push -u origin main
```

### 2. Sur Render.com
- Cliquer "New" → "Web Service"
- Connecter GitHub
- Sélectionner le repo
- Runtime: Docker
- Cliquer "Deploy"

### 3. Variables d'environnement
- Sur Render, ajouter dans "Environment":
  - PAGE_ACCESS_TOKEN
  - VERIFY_TOKEN
  - APP_SECRET
  - FACEBOOK_PAGE_URL
  - MONGODB_URI (créer une base MongoDB gratuitement sur Atlas)

---

## Déploiement sur Heroku

```bash
# 1. Login
heroku login

# 2. Créer l'app
heroku create myproxybot

# 3. Définir les variables
heroku config:set PAGE_ACCESS_TOKEN=xxx
heroku config:set VERIFY_TOKEN=yyy
heroku config:set APP_SECRET=zzz
heroku config:set FACEBOOK_PAGE_URL=https://...
heroku config:set MONGODB_URI=mongodb+srv://...

# 4. Pousser
git push heroku main

# 5. Logs
heroku logs --tail
```

---

## Checks de santé

```bash
# Vérifier que le bot répond
curl http://localhost:3000/health
# Réponse: {"status":"OK",...}

# Tester le webhook
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"
# Réponse: test
```

---

## Tips production

✅ **Utiliser docker-compose** pour gérer MongoDB + ProxyBot ensemble
✅ **Définir les variables d'environnement** correctement
✅ **Utiliser des volumes** pour persister les données MongoDB
✅ **Configurer restart policy** (unless-stopped)
✅ **Utiliser un reverse proxy** (nginx) en production
✅ **Monitorer les logs** régulièrement
✅ **Faire des backups** de MongoDB
✅ **Mettre à jour les images** régulièrement

---

## Fichier .env pour Docker

```
NODE_ENV=production
PORT=3000

PAGE_ACCESS_TOKEN=EAAx...
VERIFY_TOKEN=my_token
APP_SECRET=secret123
FACEBOOK_PAGE_URL=https://www.facebook.com/yourpage
FACEBOOK_PAGE_ID=123456789

MONGODB_URI=mongodb://mongodb:27017/proxybot

LOG_LEVEL=info
```

---

## Monitoring avec docker stats

```bash
# Voir les ressources utilisées
docker stats proxybot

# Avec docker-compose
docker-compose stats
```

---

Vous êtes prêt pour Docker! 🐳
