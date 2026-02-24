# 🔧 GUIDE DE CORRECTION - ÉTAPES À SUIVRE

## 📋 RÉSUMÉ DES FICHIERS FOURNIS

Vous avez reçu 4 fichiers de correction :

1. **ERREURS_RAPPORT.md** - Détail complet des 12 erreurs trouvées
2. **botController.CORRECTED.js** - Version corrigée du contrôleur 
3. **.env.example** - Exemple de fichier variables d'environnement
4. **userService_FONCTIONS_MANQUANTES.js** - Fonctions à ajouter au service utilisateur

---

## ✅ ÉTAPES DE CORRECTION

### ÉTAPE 1: Sauvegarder vos fichiers actuels
```bash
# Créer une sauvegarde
cp src/controllers/botController.js src/controllers/botController.js.backup
cp src/services/userService.js src/services/userService.js.backup
cp .env .env.backup
```

### ÉTAPE 2: Remplacer botController.js
```bash
# Option A: Copier le fichier corrigé
cp botController.CORRECTED.js src/controllers/botController.js

# Option B: Si vous avez déjà du code personnalisé, faire un merge manuel
# (comparer avec ERREURS_RAPPORT.md pour les corrections)
```

### ÉTAPE 3: Vérifier/Ajouter les fonctions manquantes dans userService.js

Ouvrir `src/services/userService.js` et vérifier que ces fonctions existent:

- ✅ `getUserByPsid(psid)`
- ✅ `createUser(psid)`
- ✅ `createUserWithCredentials(psid, email, passwordHash)`
- ✅ `getUserByEmail(email)`
- ✅ `setState(user, stateName, stateData)`
- ✅ `getActiveProxies(userId)`
- ✅ `getExpiredProxies(userId)`
- ✅ `addBalance(userId, amount)`
- ✅ `deductBalance(userId, amount)`

Si certaines manquent, copier les implémentations depuis `userService_FONCTIONS_MANQUANTES.js`

### ÉTAPE 4: Configurer le fichier .env

```bash
# Copier le template
cp .env.example .env

# Éditer .env et remplir avec vos vraies valeurs:
# - PAGE_ACCESS_TOKEN (de votre app Facebook)
# - VERIFY_TOKEN (votre token de vérification)
# - APP_SECRET (secret de votre app)
# - FACEBOOK_PAGE_URL (URL de votre page)
# - MONGODB_URI (votre connection string)
# - etc.
```

### ÉTAPE 5: Vérifier les modèles (models/)

Ouvrir `src/models/User.js` et vérifier que le schéma contient:

```javascript
{
    psid: { type: String, unique: true, required: true },
    email: { type: String, unique: true, sparse: true },
    passwordHash: String,
    state: { type: String, default: 'WELCOME' },
    stateData: { type: Object, default: {} },
    isLoggedIn: { type: Boolean, default: false },
    isPageSubscriber: { type: Boolean, default: false },
    balance: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
}
```

### ÉTAPE 6: Vérifier validators.js

Ouvrir `src/utils/validators.js` et vérifier que la fonction `parseInput` existe:

```javascript
function parseInput(text) {
    const num = parseInt(text.trim(), 10);
    if (!isNaN(num)) {
        return { type: 'number', value: num, raw: text.trim() };
    }
    if (text.trim().toLowerCase() === 'cancel') {
        return { type: 'command', value: 'CANCEL', raw: text.trim() };
    }
    return { type: 'text', value: text.trim(), raw: text.trim() };
}
```

### ÉTAPE 7: Vérifier les dépendances

Vérifier que `package.json` contient:

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "mongoose": "^7.0.0",
    "dotenv": "^16.0.0",
    "crypto": "builtin"
  }
}
```

Si manquant, installer:
```bash
npm install express mongoose dotenv
```

### ÉTAPE 8: Tester en développement

```bash
# Démarrer le serveur
npm start

# Ou avec nodemon pour auto-reload:
npm install --save-dev nodemon
npx nodemon src/app.js
```

Vous devriez voir:
```
🚀 ProxyBot en ligne       → http://localhost:3000
📡 Webhook URL             → http://localhost:3000/webhook
🏥 Health check            → http://localhost:3000/health
🛡️  Admin dashboard         → http://localhost:3000/admin
```

### ÉTAPE 9: Tester avec un utilisateur

1. Envoyer un message à votre bot Messenger
2. Le bot devrait répondre sans erreur
3. Vérifier les logs pour des erreurs

### ÉTAPE 10: Déployer en production

Une fois testé en dev:
```bash
NODE_ENV=production npm start
```

---

## 🔍 CHECKLIST FINALE

- [ ] botController.js remplacé ou corrigé
- [ ] userService.js contient toutes les fonctions nécessaires
- [ ] .env configuré avec les bonnes valeurs
- [ ] Modèles vérifiés (User, Proxy, TopUpRequest, SupportMessage)
- [ ] validators.js contient parseInput
- [ ] Package.json a les bonnes dépendances
- [ ] Serveur démarre sans erreur
- [ ] Bot répond aux messages
- [ ] Pas d'erreurs "undefined" dans les logs

---

## ⚠️ ERREURS COURANTES APRÈS CORRECTION

### "Cannot find module"
→ Vérifier les chemins d'import (relatifs avec `../`)
→ Vérifier que les fichiers existent

### "TypeError: X is not a function"
→ La fonction n'existe pas ou n'est pas exportée
→ Vérifier module.exports à la fin du fichier

### "ReferenceError: X is not defined"
→ Variable non déclarée
→ Vérifier qu'elle est en haut du fichier avec `const X = ...`

### "Cannot read property of undefined"
→ Un objet n'a pas la propriété attendue
→ Vérifier la structure des données retournées par les fonctions

---

## 🆘 BESOIN D'AIDE ?

Si vous rencontrez encore des erreurs après ces corrections:

1. Consultez ERREURS_RAPPORT.md pour les détails de chaque erreur
2. Vérifiez que toutes les 10 étapes ci-dessus sont complètement finies
3. Regardez la console pour le message d'erreur exact
4. Recherchez le message d'erreur dans ERREURS_RAPPORT.md

---

## 📞 POINTS DE CONTACT

- **Pour erreurs de syntaxe** → Regarder la ligne indiquée dans l'erreur
- **Pour erreurs logique** → Vérifier la section correspondante dans ERREURS_RAPPORT.md
- **Pour questions .env** → Voir .env.example pour template
- **Pour questions structure** → Vérifier le modèle de fichier fourni

Bonne chance! 🚀
