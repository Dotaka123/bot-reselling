# 🚀 Déploiement sur Back4App — Guide Complet

---

## ✅ Prérequis

- Compte [Back4App](https://back4app.com) (gratuit)
- Compte [GitHub](https://github.com) (pour connecter le repo)
- Compte [MongoDB Atlas](https://mongodb.com/atlas) (base de données gratuite)
- Token Facebook Messenger configuré

---

## ÉTAPE 1 — Préparer MongoDB Atlas (base de données)

Back4App n'inclut pas MongoDB natif pour les containers.
Utilise **MongoDB Atlas** gratuitement.

1. Va sur [mongodb.com/atlas](https://mongodb.com/atlas) → **Create free account**
2. Créer un cluster → choisir **M0 (Free)**
3. Région : la plus proche de tes utilisateurs
4. Dans **Database Access** → Add New User :
   - Username : `proxybot`
   - Password : (génère un mot de passe fort)
   - Role : **Atlas admin**
5. Dans **Network Access** → Add IP Address → **Allow Access from Anywhere** (`0.0.0.0/0`)
6. Dans **Database** → Connect → **Compass** → copie l'URI :
   ```
   mongodb+srv://proxybot:<password>@cluster0.xxxxx.mongodb.net/proxybot
   ```
   ⚠️ Remplace `<password>` par ton vrai mot de passe

---

## ÉTAPE 2 — Pousser le code sur GitHub

```bash
# Dans le dossier proxybot/
git init
git add .
git commit -m "Initial commit — ProxyBot Messenger"

# Créer un repo sur github.com puis :
git remote add origin https://github.com/TON-USERNAME/proxybot.git
git branch -M main
git push -u origin main
```

---

## ÉTAPE 3 — Créer l'app sur Back4App

1. Va sur [back4app.com](https://back4app.com) → **Dashboard**
2. Clique **Create new app**
3. Choisis **Back4App Containers** (pas "Parse Platform")
4. Clique **Connect GitHub** → autorise l'accès → sélectionne ton repo `proxybot`
5. Branche : `main`
6. Back4App va détecter automatiquement ton `Dockerfile` ✅

---

## ÉTAPE 4 — Configurer les variables d'environnement

Dans Back4App → ton app → **Environment Variables**, ajoute :

| Variable | Valeur |
|----------|--------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `MONGODB_URI` | `mongodb+srv://proxybot:PASS@cluster0.xxxxx.mongodb.net/proxybot` |
| `PAGE_ACCESS_TOKEN` | Ton token de page Facebook |
| `VERIFY_TOKEN` | Un mot secret de ton choix (ex: `monbot_secret_2024`) |
| `APP_SECRET` | Secret de ton App Facebook |
| `PROXY_API_BASE` | URL de ton API reselling |
| `PROXY_API_EMAIL` | `tonnyignace86@gmail.com` |
| `PROXY_API_PASSWORD` | `rakotoniaina16` |
| `ADMIN_PSID` | Ton PSID Facebook (pour recevoir les messages support) |

**Variables de prix (optionnel) :**

| Variable | Valeur par défaut |
|----------|-------------------|
| `PRICE_1_2H` | `0.35` |
| `PRICE_1_12H` | `0.80` |
| `PRICE_1_1D` | `1.50` |
| `PRICE_1_3D` | `3.50` |
| `PRICE_1_7D` | `7.00` |
| `PRICE_1_15D` | `13.00` |
| `PRICE_1_30D` | `24.00` |
| `PRICE_2_2D` | `2.00` |
| `PRICE_2_7D` | `5.50` |
| `PRICE_2_30D` | `15.00` |

---

## ÉTAPE 5 — Déployer

1. Dans Back4App → clique **Deploy**
2. Attends ~2-3 minutes que le build se termine
3. Tu verras le statut passer à **Running** ✅
4. Back4App te donne une URL publique :
   ```
   https://proxybot-xxxx.b4a.run
   ```

---

## ÉTAPE 6 — Configurer le Webhook Facebook

1. Va sur [developers.facebook.com](https://developers.facebook.com)
2. Ton App → **Messenger** → **Paramètres** → **Webhooks**
3. Clique **Modifier le rappel**
4. URL de rappel :
   ```
   https://proxybot-xxxx.b4a.run/webhook
   ```
5. Token de vérification : ton `VERIFY_TOKEN` (ex: `monbot_secret_2024`)
6. Clique **Vérifier et enregistrer** ✅
7. Dans **Abonnements** → cocher :
   - ✅ `messages`
   - ✅ `messaging_postbacks`
   - ✅ `messaging_referrals`
8. Abonne ta **Page** au webhook

---

## ÉTAPE 7 — Vérifier que tout fonctionne

```bash
# Test du health check
curl https://proxybot-xxxx.b4a.run/health

# Réponse attendue :
# {"status":"OK","service":"ProxyBot Messenger","time":"..."}
```

Envoie un message à ta page Facebook → le bot doit répondre ! 🎉

---

## 🔄 Mettre à jour le bot

```bash
# Modifier le code puis :
git add .
git commit -m "Mise à jour du bot"
git push origin main

# Back4App redéploie automatiquement ! ✅
```

---

## 🐛 Déboguer

### Voir les logs en temps réel
Dans Back4App → ton app → **Logs**

### Vérifier la connexion MongoDB
Les logs montreront :
```
✅ MongoDB connecté : cluster0.xxxxx.mongodb.net
🚀 ProxyBot en ligne → http://localhost:3000
⏰ Cron de vérification des expirations démarré
```

### Erreurs fréquentes

| Erreur | Solution |
|--------|----------|
| `MongoDB connection failed` | Vérifier l'URI et le whitelist IP dans Atlas |
| `Webhook verification failed` | VERIFY_TOKEN doit être identique côté Facebook et .env |
| `PAGE_ACCESS_TOKEN invalid` | Régénérer le token dans Facebook Developers |
| `Container failing health check` | Vérifier les logs pour l'erreur de démarrage |

---

## 💡 Trouver ton ADMIN_PSID

Pour recevoir les messages du support sur Messenger :

1. Va sur [messenger.com](https://messenger.com)
2. Envoie un message à ta propre page
3. Dans les logs Back4App, tu verras ton PSID affiché
4. Ou utilise : `https://graph.facebook.com/me?access_token=PAGE_TOKEN`

---

## 📊 Plan Back4App recommandé

| Plan | RAM | CPU | Prix | Recommandation |
|------|-----|-----|------|----------------|
| Free | 512MB | Shared | $0/mois | ✅ Pour tester |
| Starter | 1GB | 1 vCPU | ~$5/mois | ✅ Pour production |
| Pro | 2GB | 2 vCPU | ~$15/mois | 🚀 Pour scale |

Le plan **Free** est suffisant pour démarrer !
