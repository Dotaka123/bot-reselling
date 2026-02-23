# 🤖 ProxyBot — Bot Facebook Messenger

Bot Messenger professionnel pour l'achat de proxies mobiles.  
Navigation **100% par chiffres** — zéro bouton interactif.

---

## 📁 Structure du projet

```
proxybot/
├── src/
│   ├── app.js                    ← Point d'entrée Express
│   ├── controllers/
│   │   └── botController.js      ← STATE MACHINE (logique principale)
│   ├── services/
│   │   ├── userService.js        ← Gestion utilisateurs
│   │   ├── proxyService.js       ← Achat & sauvegarde proxies
│   │   └── proxyApiService.js    ← Connexion API de reselling
│   ├── models/
│   │   ├── User.js               ← Modèle utilisateur Messenger
│   │   ├── Proxy.js              ← Modèle proxy acheté
│   │   └── SupportMessage.js     ← Messages support
│   ├── routes/
│   │   └── webhook.js            ← Route Facebook Webhook
│   ├── utils/
│   │   ├── messenger.js          ← Envoi de messages Facebook
│   │   ├── validators.js         ← Validation des entrées
│   │   └── messages.js           ← Tous les textes du bot
│   └── cron/
│       └── expiryCron.js         ← Job auto d'expiration
├── config/
│   └── database.js               ← Connexion MongoDB
├── .env.example
└── package.json
```

---

## ⚙️ Installation

### 1. Cloner et installer

```bash
git clone ...
cd proxybot
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
# Éditer .env avec vos vraies valeurs
```

Variables obligatoires dans `.env` :
```
PAGE_ACCESS_TOKEN=   # Token de la page Facebook
VERIFY_TOKEN=        # Token webhook personnalisé
APP_SECRET=          # Secret de l'app Facebook
MONGODB_URI=         # mongodb://localhost:27017/proxybot
PROXY_API_BASE=      # URL de ton API reselling
PROXY_API_EMAIL=     # Email API reselling
PROXY_API_PASSWORD=  # Mot de passe API reselling
ADMIN_PSID=          # Ton PSID Facebook (pour recevoir les messages support)
```

### 3. Démarrer

```bash
# Production
npm start

# Développement (avec auto-reload)
npm run dev
```

---

## 🌐 Configuration Facebook

### Étape 1 — Créer une App Facebook
1. Aller sur [developers.facebook.com](https://developers.facebook.com)
2. Créer une nouvelle app → Type : **Business**
3. Ajouter le produit **Messenger**

### Étape 2 — Configurer le Webhook
1. Dans votre app → Messenger → Paramètres
2. Webhook URL : `https://votre-domaine.com/webhook`
3. Token de vérification : le `VERIFY_TOKEN` de votre `.env`
4. Abonnements : cocher `messages`, `messaging_postbacks`

### Étape 3 — Obtenir les tokens
- **PAGE_ACCESS_TOKEN** : Messenger → Tokens d'accès → Générer
- **APP_SECRET** : Paramètres de l'app → Secret

### Étape 4 — Exposer localement (développement)
```bash
# Avec ngrok
ngrok http 3000
# URL HTTPS à copier dans le webhook Facebook
```

---

## 🗺️ Flow de navigation (State Machine)

```
START
  │
  ▼
WELCOME ──► [1] ──► REGISTER_EMAIL ──► REGISTER_PASSWORD ──► MAIN_MENU
                                                                   │
                    ┌──────────────────────────────────────────────┤
                    │                                              │
                   [1]                 [2]         [3]       [4]  [5]
                    │               PROFILE     LOGOUT    SUPPORT PRICES
                    ▼
                 BUY_PKG
                    │
                 BUY_PROTO
                    │
                 BUY_DURATION
                    │
                 BUY_COUNTRY
                    │
                 BUY_PARENT
                    │
                 BUY_CONFIRM
                    │
               [Achat API] ──► BUY_SUCCESS ──► MAIN_MENU
```

---

## 🎮 Commandes globales

À tout moment :
| Commande | Action |
|----------|--------|
| `0` | Retour à l'étape précédente |
| `9` | Menu principal |
| `annuler` | Annuler l'action en cours |

---

## 💬 Exemple de conversation

```
Bot: 👋 Bienvenue sur ProxyBot !
     Tapez 1 pour créer votre compte

User: 1

Bot: 📧 Entrez votre adresse email :

User: jean@gmail.com

Bot: 🔑 Choisissez un mot de passe (min 6 caractères) :

User: monpass123

Bot: ✅ Compte créé !
     📋 MENU PRINCIPAL
     1 - Acheter un proxy
     2 - Mon profil ...

User: 1

Bot: 📦 Choisissez un package :
     1 - Golden
     2 - Silver

User: 1

Bot: ⏱ Choisissez une durée :
     1 - 2 heures  $0.35
     2 - 12 heures $0.80
     ...

User: 3

Bot: 🌍 Choisissez un pays :
     1 - France
     2 - USA
     3 - Canada ...

User: 2

Bot: ✅ CONFIRMATION :
     Package: Golden | Durée: 1 jour | Prix: $1.50
     1 - Confirmer  2 - Annuler

User: 1

Bot: 🎉 PROXY ACHETÉ !
     🌐 IP: 45.xxx.xxx.xxx
     🔌 Port: 8080
     ...
```

---

## 🔧 Personnalisation

### Modifier les prix
Dans `.env` :
```
PRICE_1_2H=0.35
PRICE_1_7D=7.00
PRICE_2_30D=15.00
```

### Modifier les textes
Tous les messages sont dans `src/utils/messages.js`.

### Ajouter un état
1. Ajouter le case dans `botController.js` → `handleMessage` (dispatch)
2. Créer la fonction `handleNouvelEtat`
3. Ajouter l'entrée dans `handleRetour`

---

## 📊 Base de données

### Collection `botusers`
```json
{
  "psid": "123456789",
  "email": "user@gmail.com",
  "facebookName": "Jean Dupont",
  "isRegistered": true,
  "isLoggedIn": true,
  "state": "MAIN_MENU",
  "stateData": {},
  "previousState": "PROFILE"
}
```

### Collection `proxies`
```json
{
  "userId": "...",
  "ip": "45.xxx.xxx.xxx",
  "port": 8080,
  "username": "user_abc123",
  "password": "pass_abc123",
  "protocol": "http",
  "country": "USA",
  "expiresAt": "2024-02-15T00:00:00Z",
  "status": "ACTIF",
  "price": 7.00
}
```

---

## 🚀 Déploiement (Railway / Render / VPS)

```bash
# Variables d'environnement à configurer sur la plateforme
# PORT sera automatiquement assigné par Railway/Render

# Sur VPS avec PM2
npm install -g pm2
pm2 start src/app.js --name proxybot
pm2 save
pm2 startup
```
