# 📥 Guide d'installation détaillé

## Prérequis

- Node.js 14+ (`node --version`)
- MongoDB (local ou Atlas)
- Compte Facebook Developer
- Un serveur pour l'hébergement

---

## Étape 1: Préparer l'environnement

```bash
# 1. Créer le dossier du projet
mkdir proxybot
cd proxybot

# 2. Extraire le ZIP
unzip BOT_COMPLET_FINAL.zip

# 3. Entrer dans le dossier
cd BOT_COMPLET_FINAL

# 4. Créer le fichier .env
cp .env.example .env
```

---

## Étape 2: Obtenir les tokens Facebook

### Sur developers.facebook.com:

1. **Créer une application**
   - Aller sur https://developers.facebook.com/apps
   - Cliquer "Créer application"
   - Type: "Commercial" ou "Consumer"

2. **Ajouter Messenger**
   - Dans l'app, cliquer "Ajouter produit"
   - Chercher "Messenger"
   - Cliquer "Configurer"

3. **Obtenir les tokens**
   - Aller à Messenger → Paramètres
   - Générer "Page Access Token"
   - Copier dans .env: `PAGE_ACCESS_TOKEN=...`

4. **Obtenir App Secret**
   - Aller à Paramètres → Basique
   - Copier "App Secret"
   - Copier dans .env: `APP_SECRET=...`

5. **Créer Verify Token**
   - N'importe quelle chaîne aléatoire
   - Ex: `VERIFY_TOKEN=abc123xyz`

---

## Étape 3: Configurer .env

```bash
nano .env
```

Remplir avec:
```
PAGE_ACCESS_TOKEN=EAAx...
VERIFY_TOKEN=abc123xyz
APP_SECRET=secret123
FACEBOOK_PAGE_URL=https://www.facebook.com/yourpage
FACEBOOK_PAGE_ID=123456789
MONGODB_URI=mongodb://localhost:27017/proxybot
PORT=3000
NODE_ENV=development
```

---

## Étape 4: MongoDB

### Option A: Local
```bash
# Démarrer MongoDB localement
mongod

# Dans un autre terminal:
# Le bot devrait connecter avec MONGODB_URI=mongodb://localhost:27017/proxybot
```

### Option B: Atlas (Cloud - gratuit)
```bash
# 1. Aller sur mongodb.com/cloud/atlas
# 2. Créer un cluster gratuit
# 3. Obtenir la connection string
# 4. Remplacer dans .env:
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/proxybot
```

---

## Étape 5: Installation

```bash
npm install
```

Devrait installer:
- express
- mongoose
- dotenv
- axios
- nodemon (dev)

---

## Étape 6: Démarrer

```bash
npm start
```

Vous devriez voir:
```
✅ MongoDB connecté
🚀 ProxyBot en ligne → http://localhost:3000
📡 Webhook URL → http://localhost:3000/webhook
🏥 Health check → http://localhost:3000/health
```

---

## Étape 7: Tester en local

```bash
# Dans un autre terminal:
curl http://localhost:3000/health

# Réponse:
{"status":"OK","service":"ProxyBot Messenger","time":"..."}
```

---

## Étape 8: Configurer Webhook dans Facebook

1. Aller à https://developers.facebook.com/apps/YOUR_APP_ID
2. Messenger → Paramètres
3. Webhooks → "Modifier les rappels"

Si vous testez en local, utiliser un tunnel:
```bash
# Terminal 1: Le bot
npm start

# Terminal 2: Tunnel (ex: ngrok)
ngrok http 3000
# Copier l'URL: https://xxxx.ngrok.io
```

4. Dans Facebook Webhooks:
   - **Callback URL:** `https://xxxx.ngrok.io/webhook` (ou votre URL)
   - **Verify Token:** Votre `VERIFY_TOKEN`

5. Sélectionner les événements:
   - ✅ messages
   - ✅ messaging_postbacks
   - ✅ message_echoes

6. Sauvegarder

---

## Étape 9: Souscrire la page

1. Dans Webhooks, cliquer "Ajouter une souscription de page"
2. Sélectionner votre page
3. Confirmer

---

## ✅ Vérification

Test 1: Webhook vérifié
```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=abc123xyz&hub.challenge=test"
# Réponse: test
```

Test 2: Envoyer un message
- Ouvrir votre page Facebook
- Envoyer un message au bot
- Le bot devrait répondre

---

## 🆘 Troubleshooting

### "Cannot find module 'mongoose'"
```bash
npm install mongoose
```

### "MONGODB_URI not configured"
- Vérifier que .env existe
- Vérifier que MONGODB_URI est rempli

### "Webhook validation failed"
- Vérifier que VERIFY_TOKEN est correct
- Vérifier que callback URL est exacte

### "Bot doesn't respond"
1. Vérifier PAGE_ACCESS_TOKEN
2. Vérifier les logs (chercher "Error")
3. Vérifier que le webhook est configuré dans Facebook

---

## 🚀 Déploiement

### Heroku
```bash
npm install -g heroku
heroku login
heroku create mybot
git push heroku main
```

### Render
1. Push le code sur GitHub
2. Créer un service sur render.com
3. Configurer les variables d'environnement
4. Déployer

### DigitalOcean
1. Créer une App
2. Connecter le repo GitHub
3. Configurer l'environnement
4. Déployer

---

## ✅ Ready to go!

Si tout fonctionne, votre bot est prêt pour:
- ✅ Tester avec des utilisateurs
- ✅ Recevoir des messages
- ✅ Effectuer des achats
- ✅ Gérer les utilisateurs

Bonne chance! 🎉
