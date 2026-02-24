# 🔴 RAPPORT DES ERREURS - ProxyBot Messenger

## Résumé
Votre application Node.js/Express présente **12 erreurs majeure et critiques** qui empêcheront le code de fonctionner correctement.

---

## ⚠️ ERREURS CRITIQUES

### 1. **PAGE non défini** (botController.js, lignes 19-24)
**Localisation:** `src/controllers/botController.js`
```javascript
// ERREUR: PAGE n'est pas défini
function getPage(allItems, page) {
    const start = (page - 1) * PAGE;  // ❌ PAGE undefined
    return allItems.slice(start, start + PAGE);
}
```

**Solution:**
```javascript
const PAGE = require('../utils/messages').PAGE_SIZE;  // Importer PAGE_SIZE
// OU ajouter en haut du fichier:
const PAGE = 8; // Doit correspondre à PAGE_SIZE dans messages.js
```

---

### 2. **FACEBOOK_PAGE_URL non défini** (botController.js, lignes 60, 114)
**Localisation:** `src/controllers/botController.js`
```javascript
// Ligne 60 et 114 - ERREUR: FACEBOOK_PAGE_URL n'existe pas
await sendText(psid, `👋 Welcome! To use this bot, you must subscribe to our Facebook page:\n\n🔗 ${FACEBOOK_PAGE_URL}\n\nAfter subscribing, type "Done" to continue.`);
```

**Solution:**
Ajouter en haut du fichier botController.js:
```javascript
const FACEBOOK_PAGE_URL = process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com/yourpage';
```

Et dans votre `.env`:
```
FACEBOOK_PAGE_URL=https://www.facebook.com/votrepageici
```

---

### 3. **handleMessage n'existe pas** (botController.js, ligne 292)
**Localisation:** `src/controllers/botController.js`
```javascript
// Ligne 292 - ERREUR: handleMessage n'est jamais défini!
module.exports = { handleMessage };
```

**Problème:** Le webhook.js importe `handleMessage` mais cette fonction n'existe pas dans botController.js.

**Solution:** Créer la fonction `handleMessage` manquante:
```javascript
async function handleMessage(psid, messageText) {
    // Récupérer l'utilisateur
    let user = await userService.getUserByPsid(psid);
    if (!user) {
        user = await userService.createUser(psid);
    }

    // Parser l'input
    const input = parseInput(messageText);

    // Appeler le handler principal
    return await handlePaginatedInput({
        user, 
        psid, 
        input, 
        items: [], 
        page: 1,
        tp: 1,
        stateName: user.state,
        statePageKey: 'page',
        showFn: async () => {},
        onBack: async () => {}
    });
}
```

---

### 4. **Paramètres manquants dans les appels de fonction** (botController.js, lignes 79-92)
**Localisation:** `src/controllers/botController.js`
```javascript
// Lignes 79-92: messageText n'est pas passé en paramètre
case 'REGISTER_PASSWORD':  return await handleRegisterPassword(user, psid, input, messageText);
case 'LOGIN_PASSWORD':     return await handleLoginPassword(user, psid, input, messageText);
case 'TOPUP':              return await handleTopUp(user, psid, input, messageText);
case 'SUPPORT':            return await handleSupport(user, psid, input, messageText);
```

**Problème:** `handlePaginatedInput` ne reçoit pas `messageText` en paramètre, donc il ne peut pas le passer aux handlers.

**Solution:** Modifier la signature de `handlePaginatedInput`:
```javascript
async function handlePaginatedInput({ user, psid, input, items, page, tp, stateName, statePageKey, showFn, onBack, messageText = '' }) {
    // ... puis passer messageText aux handlers appropriés
}
```

---

### 5. **handlePaginatedInput ne retourne rien** (botController.js, lignes 27-55)
**Localisation:** `src/controllers/botController.js`
```javascript
// Ligne 204: On essaie de destructurer un résultat qui n'existe pas
const result = await handlePaginatedInput({...});
if (!result) return;
const country = result.pageItems[result.idx];  // ❌ result est undefined!
```

**Solution:** Faire retourner l'objet sélectionné par `handlePaginatedInput`:
```javascript
async function handlePaginatedInput({...}) {
    // ... code existant ...
    const pageItems = getPage(items, page);
    const idx = (n || 0) - 1;
    
    // ✅ Retourner l'élément sélectionné à la fin:
    return { selectedItem: pageItems[idx], index: idx, pageItems, page };
}
```

---

### 6. **Fonctions handlers manquantes** (botController.js)
**Localisation:** `src/controllers/botController.js`

Les fonctions suivantes sont référencées mais n'existent pas:
- ❌ `handleCaptchaRegister` (ligne 76)
- ❌ `handleRegisterEmail` (ligne 78)
- ❌ `handleRegisterPassword` (ligne 79)
- ❌ `handleBuyCity` (ligne 87)
- ❌ `handleBuyProvider` (ligne 88)
- ❌ `handleBuyParent` (ligne 89)
- ❌ `handleBuyConfirm` (ligne 90)

**Solution:** Créer ces fonctions. Exemple:
```javascript
async function handleCaptchaRegister(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha.answer) {
        await sendText(psid, "❌ Wrong captcha. Try again.");
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
        return await sendText(psid, `Security: What is ${nc.a} + ${nc.b}?`);
    }
    await userService.setState(user, 'REGISTER_EMAIL');
    return await sendText(psid, "Enter your Email:");
}

async function handleRegisterEmail(user, psid, input) {
    if (!isValidEmail(input.raw)) return await sendText(psid, "Invalid email format.");
    const existing = await userService.getUserByEmail(input.raw);
    if (existing) return await sendText(psid, "Email already in use.");
    await userService.setState(user, 'REGISTER_PASSWORD', { email: input.raw });
    await sendText(psid, "Choose a password (min 6 chars):");
}

async function handleRegisterPassword(user, psid, input, rawMessage) {
    if (!isValidPassword(rawMessage)) return await sendText(psid, "Password too short (min 6 chars).");
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    const newUser = await userService.createUserWithCredentials(user.psid, user.stateData.email, hash);
    user.isLoggedIn = true;
    await user.save();
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, "✅ Account created successfully!");
    await sendText(psid, "1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
}
```

---

### 7. **Fonction parseInput non importée/incomplète** (botController.js)
**Localisation:** `src/utils/validators.js`

**Problème:** `parseInput` doit convertir le texte en objet `{type, value, raw}`.

**Solution:** Vérifier que validators.js contient:
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

---

### 8. **userService.setState signature incohérente** (botController.js)
**Localisation:** À vérifier dans `src/services/userService.js`

**Problème:** `userService.setState` est appelé avec différentes signatures:
- `setState(user, 'STATE_NAME')` (ligne 59)
- `setState(user, 'STATE_NAME', { captcha: nc })` (ligne 121)

**Solution:** Assurer que setState accepte les 2 ou 3 paramètres:
```javascript
async function setState(user, stateName, stateData = {}) {
    user.state = stateName;
    user.stateData = stateData;
    await user.save();
}
```

---

### 9. **Logique de vérification Facebook incorrecte** (botController.js, lignes 57-62)
**Localisation:** `src/controllers/botController.js`

**Problème:** Cette vérification est placée APRÈS la vérification du type d'input. Elle s'exécute DANS handlePaginatedInput, ce qui n'est pas logique.

**Solution:** Déplacer cette vérification dans `handleMessage`:
```javascript
async function handleMessage(psid, messageText) {
    let user = await userService.getUserByPsid(psid);
    if (!user) {
        user = await userService.createUser(psid);
    }

    // ✅ Vérification Facebook AVANT toute logique
    if (!user.isPageSubscriber && user.state !== 'FB_VERIFICATION') {
        await userService.setState(user, 'FB_VERIFICATION');
        await sendText(psid, `👋 Welcome! To use this bot, you must subscribe to our Facebook page:\n\n🔗 ${FACEBOOK_PAGE_URL}\n\nAfter subscribing, type "Done" to continue.`);
        return;
    }

    // Reste du code...
}
```

---

### 10. **Absence de classe/modèle User correcte** 
**Localisation:** `src/models/User.js`

**À vérifier:** Le modèle User doit avoir les champs:
- `psid` (unique)
- `email`
- `passwordHash`
- `state`
- `stateData` (Object, default {})
- `isLoggedIn`
- `isPageSubscriber`
- `balance`
- `createdAt`

---

### 11. **proxyApiService jamais appelé correctement** (botController.js)
**Localisation:** `src/controllers/botController.js`

**Problème:** Ligne 187, on appelle `proxyApiService.getCountries()` mais pas de gestion d'erreur.

**Solution:** Ajouter try-catch:
```javascript
async function handleBuyDuration(user, psid, input) {
    try {
        const countries = await proxyApiService.getCountries();
        // ... reste du code
    } catch (err) {
        console.error('Error fetching countries:', err);
        await sendText(psid, "❌ Error loading countries. Try again later.");
        await userService.setState(user, 'BUY_PROTO');
    }
}
```

---

### 12. **Variable stateName pas cohérente** (botController.js, ligne 58)
**Localisation:** `src/controllers/botController.js`

**Problème:** Dans `handlePaginatedInput`, on appelle `setState` avec `user.stateData` ancien, puis on essaie de modifier la page:
```javascript
await userService.setState(user, stateName, { ...user.stateData, [statePageKey]: newPage });
```

Mais `user.stateData` pourrait ne pas avoir la clé qu'on essaie de modifier.

---

## 📋 CHECKLIST DE CORRECTIONS

- [ ] 1. Importer ou définir `PAGE` en haut de botController.js
- [ ] 2. Ajouter `FACEBOOK_PAGE_URL` dans .env et le fichier
- [ ] 3. Créer la fonction `handleMessage`
- [ ] 4. Ajouter `messageText` en paramètre de `handlePaginatedInput`
- [ ] 5. Faire retourner `handlePaginatedInput` l'objet sélectionné
- [ ] 6. Créer les 7 fonctions handlers manquantes
- [ ] 7. Vérifier/corriger `parseInput` dans validators.js
- [ ] 8. Assurer que `setState` accepte 2-3 paramètres
- [ ] 9. Déplacer la vérification Facebook dans `handleMessage`
- [ ] 10. Vérifier le schéma du modèle User
- [ ] 11. Ajouter try-catch pour les appels API
- [ ] 12. Tester avec un utilisateur de test

---

## 🚀 PROCHAINES ÉTAPES
1. Télécharger le fichier corrigé (botController.js complet)
2. Remplacer votre version actuelle
3. Vérifier vos variables d'environnement (.env)
4. Tester le bot avec un utilisateur test
5. Consulter les fichiers models et services pour d'autres erreurs

