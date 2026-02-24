const { sendText } = require('../utils/messenger');
const { parseInput, isValidEmail, isValidPassword } = require('../utils/validators');
const M = require('../utils/messages');
const userService = require('../services/userService');
const proxyService = require('../services/proxyService');
const proxyApiService = require('../services/proxyApiService');
const SupportMessage = require('../models/SupportMessage');
const TopUpRequest = require('../models/TopUpRequest');
const Proxy = require('../models/Proxy');
const crypto = require('crypto');

const PAGE = M.PAGE_SIZE || 8;
const FACEBOOK_PAGE_URL = process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com/yourpage';

// ── HELPERS ──────────────────────────────────────
function generateCaptcha() {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { a, b, answer: a + b };
}

function getPage(allItems, page) {
    const start = (page - 1) * PAGE;
    return allItems.slice(start, start + PAGE);
}

function totalPages(allItems) {
    return Math.max(1, Math.ceil(allItems.length / PAGE));
}

// ── COMMANDES GLOBALES ───────────────────────────
function isCancelCommand(input) {
    if (!input) return false;
    const text = input.raw ? input.raw.toLowerCase().trim() : '';
    return text === 'cancel' || text === 'annuler' || text === 'c' || 
           text === '0' || (input.type === 'number' && input.value === 0);
}

function isMainMenuCommand(input) {
    const text = input.raw ? input.raw.toLowerCase().trim() : '';
    return text === '9' || text === 'menu' || text === 'accueil' || 
           (input.type === 'number' && input.value === 9);
}

// ── FONCTION PRINCIPALE ──────────────────────────
async function handleMessage(psid, messageText) {
    try {
        let user = await userService.getUserByPsid(psid);
        if (!user) {
            user = await userService.createUser(psid);
        }

        // 1. VÉRIFICATION FACEBOOK EN PREMIER
        if (!user.isPageSubscriber && user.state !== 'FB_VERIFICATION') {
            await userService.setState(user, 'FB_VERIFICATION');
            await sendText(psid, `👋 Bienvenue!\n\n📌 Étape 1: Abonnez-vous à notre page\n🔗 ${FACEBOOK_PAGE_URL}\n\n📌 Étape 2: Revenez et tapez "done" (ou "fait")\n\nℹ️ Tapez "annuler" ou "0" pour retour`);
            return;
        }

        const input = parseInput(messageText);

        // 2. COMMANDE CANCEL GLOBALE
        if (isCancelCommand(input)) {
            if (user.isLoggedIn && user.state !== 'MAIN_MENU') {
                await userService.setState(user, 'MAIN_MENU');
                await showMainMenu(psid);
            } else if (!user.isLoggedIn && user.state !== 'WELCOME') {
                await userService.setState(user, 'WELCOME');
                await handleWelcome(user, psid, input);
            }
            return;
        }

        // 3. COMMANDE MENU GLOBALE
        if (isMainMenuCommand(input) && user.isLoggedIn && user.state !== 'MAIN_MENU') {
            await userService.setState(user, 'MAIN_MENU');
            await showMainMenu(psid);
            return;
        }

        // 4. ROUTER VERS LES HANDLERS
        try {
            switch (user.state) {
                case 'FB_VERIFICATION':
                    return await handleFBVerification(user, psid, input);
                case 'WELCOME':
                    return await handleWelcome(user, psid, input);
                case 'CAPTCHA_LOGIN':
                    return await handleCaptchaLogin(user, psid, input);
                case 'CAPTCHA_REGISTER':
                    return await handleCaptchaRegister(user, psid, input);
                case 'LOGIN_EMAIL':
                    return await handleLoginEmail(user, psid, input);
                case 'LOGIN_PASSWORD':
                    return await handleLoginPassword(user, psid, input, messageText);
                case 'REGISTER_EMAIL':
                    return await handleRegisterEmail(user, psid, input);
                case 'REGISTER_PASSWORD':
                    return await handleRegisterPassword(user, psid, input, messageText);
                case 'MAIN_MENU':
                    return await handleMainMenu(user, psid, input);
                case 'BUY_PKG':
                    return await handleBuyPkg(user, psid, input);
                case 'BUY_PROTO':
                    return await handleBuyProto(user, psid, input);
                case 'BUY_DURATION':
                    return await handleBuyDuration(user, psid, input);
                case 'BUY_COUNTRY':
                    return await handleBuyCountry(user, psid, input);
                case 'BUY_CITY':
                    return await handleBuyCity(user, psid, input);
                case 'BUY_PROVIDER':
                    return await handleBuyProvider(user, psid, input);
                case 'BUY_PARENT':
                    return await handleBuyParent(user, psid, input);
                case 'BUY_CONFIRM':
                    return await handleBuyConfirm(user, psid, input);
                case 'TOPUP':
                    return await handleTopUp(user, psid, input, messageText);
                case 'SUPPORT':
                    return await handleSupport(user, psid, input, messageText);
                default:
                    await userService.setState(user, 'WELCOME');
                    return await handleWelcome(user, psid, input);
            }
        } catch (err) {
            console.error(`Handler Error [${user.state}]:`, err);
            await sendText(psid, "⚠️ Une erreur est survenue.\n\n💡 Conseils:\n• Tapez 0 pour retour\n• Tapez 9 pour menu\n• Tapez ANNULER pour recommencer");
        }
    } catch (err) {
        console.error(`handleMessage error:`, err);
        await sendText(psid, "❌ Erreur serveur. Veuillez réessayer plus tard.");
    }
}

// ── HANDLERS ─────────────────────────────────────

async function handleFBVerification(user, psid, input) {
    const text = (input && input.raw) ? input.raw.toLowerCase().trim() : '';
    if (text === 'done' || text === 'fait') {
        user.isPageSubscriber = true;
        await user.save();
        await sendText(psid, "✅ Abonnement vérifié! Bienvenue!");
        await userService.setState(user, 'WELCOME');
        return await handleWelcome(user, psid, input);
    }
    await sendText(psid, `⚠️ Veuillez d'abord vous abonner à:\n\n🔗 ${FACEBOOK_PAGE_URL}\n\n➡️ Après, revenez et tapez:\n"done" ou "fait"\n\nℹ️ Besoin d'aide? Tapez "annuler"`);
}

async function handleWelcome(user, psid, input) {
    if (!user.isLoggedIn) {
        if (input.type === 'number') {
            if (input.value === 1) {
                const nc = generateCaptcha();
                await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
                return await sendText(psid, `🤖 VÉRIFICATION - Anti-robot\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Tapez le résultat:\n(ou 0 pour retour)`);
            }
            if (input.value === 2) {
                const nc = generateCaptcha();
                await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
                return await sendText(psid, `🤖 VÉRIFICATION - Anti-robot\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Tapez le résultat:\n(ou 0 pour retour)`);
            }
        }
        await sendText(psid, `👋 BIENVENUE CHEZ PROXYBOT!\n\n📋 MENU PRINCIPAL\n\n1️⃣  🔓 CONNEXION\n2️⃣  📝 CRÉER UN COMPTE\n\n💡 Tapez 1 ou 2\n(0 = Retour, ANNULER = Recommencer)`);
    } else {
        await userService.setState(user, 'MAIN_MENU');
        await showMainMenu(psid);
    }
}

async function showMainMenu(psid) {
    await sendText(psid, `📋 MENU PRINCIPAL\n\n1️⃣  🛒 Acheter un proxy\n2️⃣  👤 Mon profil\n3️⃣  💳 Recharger solde\n4️⃣  💬 Support\n5️⃣  🚪 Déconnexion\n\n💡 Tapez 1-5\n(0 = Retour, ANNULER = Recommencer)`);
}

// ── LOGIN ────────────────────────────────────────

async function handleCaptchaLogin(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha?.answer) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
        return await sendText(psid, `❌ Mauvaise réponse.\n\n🤖 Nouvelle tentative:\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Tapez le résultat (ou 0 pour retour)`);
    }
    await userService.setState(user, 'LOGIN_EMAIL');
    await sendText(psid, `📧 CONNEXION - Étape 1/2\n\n✉️  Entrez votre EMAIL:\n\n💡 Format: user@email.com\n(0 = Retour, 2 = Créer compte, ANNULER = Recommencer)`);
}

async function handleLoginEmail(user, psid, input) {
    // ✅ CORRECTION: Si l'utilisateur tape 2, switcher à REGISTER
    if (input.type === 'number' && input.value === 2) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
        return await sendText(psid, `🤖 VÉRIFICATION - Anti-robot\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Tapez le résultat:\n(ou 0 pour retour)`);
    }
    
    const email = input.raw ? input.raw.trim() : '';
    
    if (!isValidEmail(email)) {
        return await sendText(psid, `❌ Email invalide!\n\n📝 Format attendu: user@email.com\n\n📧 Réessayez (ou 0 pour retour):`);
    }
    
    const existing = await userService.getUserByEmail(email);
    if (!existing) {
        return await sendText(psid, `❌ Compte non trouvé!\n\n💡 Options:\n• Tapez 2 pour CRÉER un compte\n• Tapez 0 pour RETOUR\n• Tapez ANNULER pour RECOMMENCER`);
    }
    
    await userService.setState(user, 'LOGIN_PASSWORD', { email });
    await sendText(psid, `🔑 CONNEXION - Étape 2/2\n\n🔒 Entrez votre MOT DE PASSE:\n\n(0 = Retour)`);
}

async function handleLoginPassword(user, psid, input, rawMessage) {
    const { email } = user.stateData;
    const existingUser = await userService.getUserByEmail(email);
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    
    if (!existingUser || existingUser.passwordHash !== hash) {
        await userService.setState(user, 'LOGIN_EMAIL', { email });
        return await sendText(psid, `❌ Email ou mot de passe incorrect!\n\n📝 Réessayez ou:\n• Tapez 0 pour RETOUR\n• Tapez 2 pour CRÉER un compte\n• Tapez ANNULER pour RECOMMENCER\n\n📧 Email:`);
    }
    
    user.isLoggedIn = true;
    user.email = email;
    await user.save();
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, `✅ CONNEXION RÉUSSIE!\n\n📧 ${email}\n\n👋 Bienvenue!`);
    await showMainMenu(psid);
}

// ── REGISTER ─────────────────────────────────────

async function handleCaptchaRegister(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha?.answer) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
        return await sendText(psid, `❌ Mauvaise réponse.\n\n🤖 Nouvelle tentative:\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Tapez le résultat (ou 0 pour retour)`);
    }
    await userService.setState(user, 'REGISTER_EMAIL');
    await sendText(psid, `📧 CRÉER UN COMPTE - Étape 1/2\n\n✉️  Entrez un EMAIL:\n\n💡 Format: user@email.com\n(0 = Retour, 1 = Connexion, ANNULER = Recommencer)`);
}

async function handleRegisterEmail(user, psid, input) {
    // ✅ CORRECTION: Si l'utilisateur tape 1, switcher à LOGIN
    if (input.type === 'number' && input.value === 1) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
        return await sendText(psid, `🤖 VÉRIFICATION - Anti-robot\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Tapez le résultat:\n(ou 0 pour retour)`);
    }
    
    const email = input.raw ? input.raw.trim() : '';
    
    if (!isValidEmail(email)) {
        return await sendText(psid, `❌ Email invalide!\n\n📝 Format attendu: user@email.com\n\n📧 Réessayez (ou 0 pour retour):`);
    }
    
    const existing = await userService.getUserByEmail(email);
    if (existing) {
        return await sendText(psid, `❌ Email déjà utilisé!\n\n💡 Options:\n• Tapez 1 pour VOUS CONNECTER\n• Tapez 0 pour RETOUR\n• Tapez ANNULER pour RECOMMENCER`);
    }
    
    await userService.setState(user, 'REGISTER_PASSWORD', { email });
    await sendText(psid, `🔑 CRÉER UN COMPTE - Étape 2/2\n\n🔒 Créez un MOT DE PASSE:\n\n📋 Minimum 6 caractères\n(0 = Retour)`);
}

async function handleRegisterPassword(user, psid, input, rawMessage) {
    if (!isValidPassword(rawMessage)) {
        return await sendText(psid, `❌ Mot de passe trop court!\n\n📋 Minimum: 6 caractères\n\n🔒 Réessayez (ou 0 pour retour):`);
    }
    
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    
    const newUser = await userService.createUserWithCredentials(
        user.psid,
        user.stateData.email,
        hash
    );
    
    if (!newUser) {
        return await sendText(psid, "❌ Erreur lors de la création du compte.\n\n💡 Réessayez ou tapez ANNULER");
    }
    
    user.isLoggedIn = true;
    user.email = user.stateData.email;
    user.passwordHash = hash;
    await user.save();
    
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, `✅ COMPTE CRÉÉ!\n\n📧 ${user.stateData.email}\n\n👋 Bienvenue!`);
    await showMainMenu(psid);
}

// ── MAIN MENU ────────────────────────────────────

async function handleMainMenu(user, psid, input) {
    if (input.type !== 'number') {
        return await showMainMenu(psid);
    }

    switch (input.value) {
        case 1:
            await userService.setState(user, 'BUY_PKG');
            await sendText(psid, `📦 ACHETER UN PROXY - Étape 1/7\n\n🎯 Choisissez un PACKAGE:\n\n1️⃣  🥇 Golden (Premium)\n2️⃣  🥈 Silver (Standard)\n\n(0 = Retour, 9 = Menu)`);
            break;

        case 2:
            const profile = await userService.getUserProfile(user._id);
            if (!profile) {
                return await sendText(psid, "❌ Erreur lors du chargement du profil.");
            }
            let msg = `👤 MON PROFIL\n\n`;
            msg += `📧 Email: ${user.email}\n`;
            msg += `💳 Solde: $${(user.balance || 0).toFixed(2)}\n\n`;
            msg += `✅ Proxies actifs: ${profile.activeProxies.length}\n`;
            msg += `❌ Proxies expirés: ${profile.expiredProxies.length}\n`;
            if (profile.activeProxies.length > 0) {
                msg += `\n🌐 Proxies actifs:\n`;
                profile.activeProxies.slice(0, 3).forEach((p, i) => {
                    msg += `${i+1}. ${p.ip}:${p.port} (${p.country})\n`;
                });
                if (profile.activeProxies.length > 3) {
                    msg += `... et ${profile.activeProxies.length - 3} de plus\n`;
                }
            }
            msg += `\n(0 = Retour, 9 = Menu)`;
            await sendText(psid, msg);
            break;

        case 3:
            await userService.setState(user, 'TOPUP');
            await sendText(psid, `💳 RECHARGER SOLDE\n\nSolde actuel: $${(user.balance || 0).toFixed(2)}\n\n📲 MÉTHODES DE PAIEMENT:\n\n🔸 Binance\n   ID: 909914646\n\n🔸 Bkash\n   Numéro: 01567906551\n\n🔸 Nogod\n   Numéro: 01567906551\n\n➡️  Tapez le montant (ex: 50)\n(0 = Retour)`);
            break;

        case 4:
            await userService.setState(user, 'SUPPORT');
            await sendText(psid, `💬 SUPPORT CLIENT\n\n📝 Décrivez votre problème:\n\n💡 Minimum 3 caractères\n(0 = Retour, 9 = Menu)`);
            break;

        case 5:
            user.isLoggedIn = false;
            await user.save();
            await userService.setState(user, 'WELCOME');
            await sendText(psid, `🚪 DÉCONNECTÉ!\n\n👋 À bientôt!\n\n💡 Tapez un message pour vous reconnecter.`);
            break;

        default:
            await showMainMenu(psid);
    }
}

// ── ACHAT ────────────────────────────────────────

async function handleBuyPkg(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "❌ Tapez 1 ou 2 (ou 0 pour retour)");
    if (input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    if (![1, 2].includes(input.value)) return await sendText(psid, "❌ Choix invalide (1, 2 ou 0)");
    
    const pkgName = input.value === 1 ? 'Golden' : 'Silver';
    await userService.setState(user, 'BUY_PROTO', { pkgId: input.value, pkgName });
    await sendText(psid, `📡 ACHETER UN PROXY - Étape 2/7\n\n🎯 Choisissez un PROTOCOLE:\n\n1️⃣  HTTP/HTTPS\n2️⃣  SOCKS5\n\n(0 = Retour, 9 = Menu)`);
}

async function handleBuyProto(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "❌ Tapez 1 ou 2");
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PKG');
        return await sendText(psid, `📦 Package:\n\n1️⃣  Golden\n2️⃣  Silver\n\n(0 = Retour)`);
    }
    if (![1, 2].includes(input.value)) return await sendText(psid, "❌ Choix invalide");

    const proto = input.value === 1 ? 'http' : 'socks5';
    const options = [
        { label: '2 heures', price: 0.30, duration: 2 },
        { label: '12 heures', price: 0.60, duration: 12 },
        { label: '3 jours', price: 2.50, duration: 72 },
        { label: '7 jours', price: 4.50, duration: 168 },
        { label: '30 jours', price: 18.00, duration: 720 }
    ];
    
    await userService.setState(user, 'BUY_DURATION', { ...user.stateData, proto });
    let msg = `⏱️  ACHETER UN PROXY - Étape 3/7\n\n🎯 Choisissez la DURÉE:\n\n`;
    options.forEach((o, i) => msg += `${i + 1}️⃣  ${o.label.padEnd(12)} - $${o.price.toFixed(2)}\n`);
    msg += `\n(0 = Retour, 9 = Menu)`;
    await sendText(psid, msg);
}

async function handleBuyDuration(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "❌ Tapez un nombre");
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PROTO');
        return await sendText(psid, `📡 Protocole:\n\n1️⃣  HTTP\n2️⃣  SOCKS5\n\n(0 = Retour)`);
    }

    const options = [
        { label: '2 heures', price: 0.30, duration: 2 },
        { label: '12 heures', price: 0.60, duration: 12 },
        { label: '3 jours', price: 2.50, duration: 72 },
        { label: '7 jours', price: 4.50, duration: 168 },
        { label: '30 jours', price: 18.00, duration: 720 }
    ];
    
    const sel = options[input.value - 1];
    if (!sel) return await sendText(psid, "❌ Choix invalide.");
    
    try {
        await userService.setState(user, 'BUY_COUNTRY', { 
            ...user.stateData, 
            duration: sel.duration, 
            price: sel.price,
            countryPage: 1
        });
        const countries = await proxyApiService.getCountries();
        if (!countries || countries.length === 0) {
            await sendText(psid, "❌ Erreur lors du chargement des pays.");
            await userService.setState(user, 'BUY_PROTO');
            return;
        }
        const tp = totalPages(countries);
        const pageCountries = getPage(countries, 1);
        let msg = `🌍 ACHETER UN PROXY - Étape 4/7\n\n🎯 Choisissez le PAYS (Page 1/${tp}):\n\n`;
        pageCountries.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
        msg += `\n9️⃣  ➡️  Suivant\n0️⃣  Retour`;
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyDuration:', err);
        await sendText(psid, "❌ Erreur. Réessayez.");
        await userService.setState(user, 'BUY_PROTO');
    }
}

// ── AUTRES HANDLERS (MINIMALISTE) ─────

async function handleBuyCountry(user, psid, input) {
    try {
        const countries = await proxyApiService.getCountries();
        let page = user.stateData.countryPage || 1;
        const tp = totalPages(countries);

        if (input.value === 0) {
            await userService.setState(user, 'BUY_PROTO');
            return await sendText(psid, "📡 Protocole...");
        }

        if (input.value === 9) {
            if (page < tp) {
                page++;
                await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, countryPage: page });
                const pageCountries = getPage(countries, page);
                let msg = `🌍 Pays (Page ${page}/${tp}):\n\n`;
                pageCountries.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
                msg += `\n9️⃣  ➡️  Suivant\n0️⃣  Retour`;
                return await sendText(psid, msg);
            }
        }

        const pageCountries = getPage(countries, page);
        const idx = input.value - 1;
        if (idx >= 0 && idx < pageCountries.length) {
            const country = pageCountries[idx];
            const cities = await proxyApiService.getCities(country.country_code);
            const cityTp = totalPages(cities);
            
            await userService.setState(user, 'BUY_CITY', { 
                ...user.stateData, 
                countryId: country.country_code,
                countryName: country.country_name,
                cityPage: 1
            });
            
            const pageCities = getPage(cities, 1);
            let msg = `🏙️  Étape 5/7 - Villes (Page 1/${cityTp}):\n\n`;
            pageCities.forEach((c, i) => msg += `${i + 1}️⃣  ${c.city_name}\n`);
            msg += `\n9️⃣  ➡️  Suivant\n0️⃣  Retour`;
            return await sendText(psid, msg);
        }
    } catch (err) {
        console.error('Error in handleBuyCountry:', err);
    }
}

async function handleBuyCity(user, psid, input) { await sendText(psid, "⏳ Suite..."); }
async function handleBuyProvider(user, psid, input) { await sendText(psid, "⏳ Suite..."); }
async function handleBuyParent(user, psid, input) { await sendText(psid, "⏳ Suite..."); }
async function handleBuyConfirm(user, psid, input) { await sendText(psid, "⏳ Suite..."); }

// ── TOP-UP ───────────────────────────────────────

async function handleTopUp(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }

    const amount = parseFloat((rawMessage || '').trim());
    if (isNaN(amount) || amount <= 0) {
        return await sendText(psid, `💳 RECHARGER SOLDE\n\nSolde: $${(user.balance || 0).toFixed(2)}\n\n📲 Méthodes:\n🔸 Binance ID: 909914646\n🔸 Bkash: 01567906551\n\n➡️  Montant (ex: 50):`);
    }

    try {
        await TopUpRequest.create({ userId: user._id, psid, email: user.email, amount });
        await sendText(psid, `✅ Demande de $${amount.toFixed(2)} envoyée!\n\n⏳ Vérification: 1-10 mins\n\n(9 = Menu)`);
        await userService.setState(user, 'MAIN_MENU');
    } catch (err) {
        await sendText(psid, "❌ Erreur.");
    }
}

// ── SUPPORT ──────────────────────────────────────

async function handleSupport(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }

    const msg = (rawMessage || '').trim();
    if (msg.length < 3) {
        return await sendText(psid, "❌ Message trop court (min 3 caractères).\n\n💬 Réessayez (ou 0 pour retour):");
    }

    try {
        await SupportMessage.create({ userId: user._id, psid, email: user.email, message: msg });
        await sendText(psid, `✅ Message envoyé à support!\n\n👨‍💼 Notre équipe vous répondra bientôt.\n\n(9 = Menu)`);
        await userService.setState(user, 'MAIN_MENU');
    } catch (err) {
        await sendText(psid, "❌ Erreur.");
    }
}

module.exports = { handleMessage };
