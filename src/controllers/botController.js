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
            await sendText(psid, `👋 Bienvenue!\n\nPour utiliser ce bot, vous devez d'abord:\n\n1️⃣ Vous abonner à notre page:\n🔗 ${FACEBOOK_PAGE_URL}\n\n2️⃣ Revenir ici et taper "done" (ou "fait")`);
            return;
        }

        const input = parseInput(messageText);

        // 2. COMMANDE CANCEL GLOBALE
        if (isCancelCommand(input)) {
            await userService.setState(user, 'MAIN_MENU');
            await showMainMenu(psid);
            return;
        }

        // 3. COMMANDE MENU GLOBALE
        if (isMainMenuCommand(input) && user.state !== 'MAIN_MENU' && user.isLoggedIn) {
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
            await sendText(psid, "⚠️ Une erreur est survenue. Tapez ANNULER pour recommencer.");
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
        await sendText(psid, "✅ Abonnement vérifié!");
        await userService.setState(user, 'WELCOME');
        return await handleWelcome(user, psid, input);
    }
    await sendText(psid, `⚠️ Veuillez d'abord vous abonner à:\n${FACEBOOK_PAGE_URL}\n\nPuis tapez "done" (ou "fait")`);
}

async function handleWelcome(user, psid, input) {
    if (!user.isLoggedIn) {
        if (input.type === 'number') {
            if (input.value === 1) {
                const nc = generateCaptcha();
                await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
                return await sendText(psid, `🤖 Sécurité: ${nc.a} + ${nc.b} = ?\n\n(Tapez le résultat)`);
            }
            if (input.value === 2) {
                const nc = generateCaptcha();
                await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
                return await sendText(psid, `🤖 Sécurité: ${nc.a} + ${nc.b} = ?\n\n(Tapez le résultat)`);
            }
        }
        await sendText(psid, "👋 Bienvenue chez ProxyBot!\n\n1. 🔓 Connexion\n2. 📝 Créer un compte\n\n(ANNULER pour quitter)");
    } else {
        await userService.setState(user, 'MAIN_MENU');
        await showMainMenu(psid);
    }
}

async function showMainMenu(psid) {
    await sendText(psid, "📋 MENU PRINCIPAL\n\n1. 🛒 Acheter un proxy\n2. 👤 Mon profil\n3. 💳 Recharger solde\n4. 💬 Support\n5. 🚪 Déconnexion\n\n(0 = Annuler, 9 = Menu)");
}

// ── LOGIN ────────────────────────────────────────

async function handleCaptchaLogin(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha?.answer) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
        return await sendText(psid, `❌ Mauvaise réponse.\n\n🤖 ${nc.a} + ${nc.b} = ?`);
    }
    await userService.setState(user, 'LOGIN_EMAIL');
    await sendText(psid, "📧 Entrez votre email:\n\n(ANNULER pour retour)");
}

async function handleLoginEmail(user, psid, input) {
    if (!isValidEmail(input.raw)) {
        return await sendText(psid, "❌ Email invalide. Format: user@email.com");
    }
    const existing = await userService.getUserByEmail(input.raw);
    if (!existing) {
        return await sendText(psid, "❌ Compte non trouvé. Créez un compte d'abord (tapez 2).");
    }
    await userService.setState(user, 'LOGIN_PASSWORD', { email: input.raw });
    await sendText(psid, "🔑 Entrez votre mot de passe:\n\n(ANNULER pour retour)");
}

async function handleLoginPassword(user, psid, input, rawMessage) {
    const { email } = user.stateData;
    const existingUser = await userService.getUserByEmail(email);
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    if (!existingUser || existingUser.passwordHash !== hash) {
        await userService.setState(user, 'LOGIN_EMAIL', { email });
        return await sendText(psid, "❌ Email ou mot de passe incorrect.\n\n📧 Réessayez l'email:");
    }
    
    user.isLoggedIn = true;
    user.email = email;
    await user.save();
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, `✅ Connexion réussie!\n📧 ${email}`);
    await showMainMenu(psid);
}

// ── REGISTER ─────────────────────────────────────

async function handleCaptchaRegister(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha?.answer) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
        return await sendText(psid, `❌ Mauvaise réponse.\n\n🤖 ${nc.a} + ${nc.b} = ?`);
    }
    await userService.setState(user, 'REGISTER_EMAIL');
    await sendText(psid, "📧 Entrez un email:\n\n(ANNULER pour retour)");
}

async function handleRegisterEmail(user, psid, input) {
    if (!isValidEmail(input.raw)) {
        return await sendText(psid, "❌ Email invalide. Format: user@email.com");
    }
    const existing = await userService.getUserByEmail(input.raw);
    if (existing) {
        return await sendText(psid, "❌ Email déjà utilisé. Connectez-vous ou utilisez un autre email.");
    }
    await userService.setState(user, 'REGISTER_PASSWORD', { email: input.raw });
    await sendText(psid, "🔑 Créez un mot de passe (min 6 caractères):\n\n(ANNULER pour retour)");
}

async function handleRegisterPassword(user, psid, input, rawMessage) {
    if (!isValidPassword(rawMessage)) {
        return await sendText(psid, "❌ Mot de passe trop court (min 6 caractères).");
    }
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    
    const newUser = await userService.createUserWithCredentials(
        user.psid,
        user.stateData.email,
        hash
    );
    
    if (!newUser) {
        return await sendText(psid, "❌ Erreur lors de la création du compte.");
    }
    
    user.isLoggedIn = true;
    user.email = user.stateData.email;
    user.passwordHash = hash;
    await user.save();
    
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, `✅ Compte créé!\n📧 ${user.stateData.email}`);
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
            await sendText(psid, "📦 Choisissez un package:\n\n1. 🥇 Golden (Premium)\n2. 🥈 Silver (Standard)\n\n0. Annuler");
            break;

        case 2:
            const profile = await userService.getUserProfile(user._id);
            if (!profile) {
                return await sendText(psid, "❌ Erreur lors du chargement du profil.");
            }
            let msg = `👤 MON PROFIL\n\n📧 Email: ${user.email}\n💳 Solde: $${(user.balance || 0).toFixed(2)}\n\n`;
            msg += `✅ Proxies actifs: ${profile.activeProxies.length}\n`;
            msg += `❌ Proxies expirés: ${profile.expiredProxies.length}\n\n`;
            if (profile.activeProxies.length > 0) {
                msg += "🌐 Vos proxies:\n";
                profile.activeProxies.slice(0, 3).forEach((p, i) => {
                    msg += `${i+1}. ${p.ip}:${p.port} (${p.country})\n`;
                });
                if (profile.activeProxies.length > 3) {
                    msg += `... et ${profile.activeProxies.length - 3} de plus\n`;
                }
            }
            await sendText(psid, msg);
            break;

        case 3:
            await userService.setState(user, 'TOPUP');
            await sendText(psid, `💳 RECHARGER SOLDE\n\nSolde actuel: $${(user.balance || 0).toFixed(2)}\n\nMéthodes:\n🔸 Binance ID: 909914646\n🔸 Bkash: 01567906551\n\nTapez le montant à recharger:\n(0 = Annuler)`);
            break;

        case 4:
            await userService.setState(user, 'SUPPORT');
            await sendText(psid, "💬 SUPPORT CLIENT\n\nDécrivez votre problème (min 3 caractères):\n\n(0 = Annuler)");
            break;

        case 5:
            user.isLoggedIn = false;
            await user.save();
            await userService.setState(user, 'WELCOME');
            await sendText(psid, "🚪 Déconnecté!\n\n👋 À bientôt!");
            break;

        default:
            await showMainMenu(psid);
    }
}

// ── ACHAT ────────────────────────────────────────

async function handleBuyPkg(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "Tapez 1, 2 ou 0.");
    if (input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    if (![1, 2].includes(input.value)) return await sendText(psid, "Choix invalide.");
    
    await userService.setState(user, 'BUY_PROTO', { pkgId: input.value, pkgName: input.value === 1 ? 'Golden' : 'Silver' });
    await sendText(psid, "📡 Protocole:\n\n1. HTTP/HTTPS\n2. SOCKS5\n\n0. Annuler");
}

async function handleBuyProto(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "Tapez 1, 2 ou 0.");
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PKG');
        return await sendText(psid, "📦 Package:\n\n1. Golden\n2. Silver\n\n0. Annuler");
    }
    if (![1, 2].includes(input.value)) return await sendText(psid, "Choix invalide.");

    const proto = input.value === 1 ? 'http' : 'socks5';
    const options = [
        { label: '2 heures', price: 0.30, duration: 2 },
        { label: '12 heures', price: 0.60, duration: 12 },
        { label: '3 jours', price: 2.50, duration: 72 },
        { label: '7 jours', price: 4.50, duration: 168 },
        { label: '30 jours', price: 18.00, duration: 720 }
    ];
    
    await userService.setState(user, 'BUY_DURATION', { ...user.stateData, proto });
    let msg = "⏱️ Durée:\n\n";
    options.forEach((o, i) => msg += `${i + 1}. ${o.label} - $${o.price.toFixed(2)}\n`);
    msg += "\n0. Annuler";
    await sendText(psid, msg);
}

async function handleBuyDuration(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "Tapez un nombre ou 0.");
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PROTO');
        return await sendText(psid, "📡 Protocole:\n\n1. HTTP\n2. SOCKS5\n\n0. Annuler");
    }

    const options = [
        { label: '2 heures', price: 0.30, duration: 2 },
        { label: '12 heures', price: 0.60, duration: 12 },
        { label: '3 jours', price: 2.50, duration: 72 },
        { label: '7 jours', price: 4.50, duration: 168 },
        { label: '30 jours', price: 18.00, duration: 720 }
    ];
    
    const sel = options[input.value - 1];
    if (!sel) return await sendText(psid, "Choix invalide.");
    
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
        let msg = `🌍 Pays (Page 1/${tp}):\n\n`;
        pageCountries.forEach((c, i) => msg += `${i + 1}. ${c.country_name}\n`);
        msg += "\n9. Suivant\n0. Annuler";
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyDuration:', err);
        await sendText(psid, "❌ Erreur. Réessayez.");
        await userService.setState(user, 'BUY_PROTO');
    }
}

async function handleBuyCountry(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "Tapez un nombre.");
    
    try {
        const countries = await proxyApiService.getCountries();
        let page = user.stateData.countryPage || 1;
        const tp = totalPages(countries);

        if (input.value === 0) {
            await userService.setState(user, 'BUY_PROTO');
            return await sendText(psid, "📡 Protocole:\n\n1. HTTP\n2. SOCKS5\n\n0. Annuler");
        }

        if (input.value === 9) {
            if (page < tp) {
                page++;
                await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, countryPage: page });
                const pageCountries = getPage(countries, page);
                let msg = `🌍 Pays (Page ${page}/${tp}):\n\n`;
                pageCountries.forEach((c, i) => msg += `${i + 1}. ${c.country_name}\n`);
                msg += "\n9. Suivant\n0. Annuler";
                return await sendText(psid, msg);
            } else {
                return await sendText(psid, "⚠️ Dernière page atteinte.");
            }
        }

        const pageCountries = getPage(countries, page);
        const idx = input.value - 1;
        if (idx < 0 || idx >= pageCountries.length) {
            return await sendText(psid, "❌ Choix invalide.");
        }

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
        let msg = `🏙️  Villes (Page 1/${cityTp}):\n\n`;
        pageCities.forEach((c, i) => msg += `${i + 1}. ${c.city_name}\n`);
        msg += "\n9. Suivant\n0. Annuler";
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyCountry:', err);
        await sendText(psid, "❌ Erreur. Réessayez.");
    }
}

async function handleBuyCity(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, "Tapez un nombre.");
    
    try {
        const { countryId } = user.stateData;
        const cities = await proxyApiService.getCities(countryId);
        let page = user.stateData.cityPage || 1;
        const tp = totalPages(cities);

        if (input.value === 0) {
            await userService.setState(user, 'BUY_COUNTRY');
            return await sendText(psid, "🌍 Pays...");
        }

        if (input.value === 9) {
            if (page < tp) {
                page++;
                await userService.setState(user, 'BUY_CITY', { ...user.stateData, cityPage: page });
                const pageCities = getPage(cities, page);
                let msg = `🏙️  Villes (Page ${page}/${tp}):\n\n`;
                pageCities.forEach((c, i) => msg += `${i + 1}. ${c.city_name}\n`);
                msg += "\n9. Suivant\n0. Annuler";
                return await sendText(psid, msg);
            }
            return await sendText(psid, "⚠️ Dernière page.");
        }

        const pageCities = getPage(cities, page);
        const idx = input.value - 1;
        if (idx < 0 || idx >= pageCities.length) {
            return await sendText(psid, "❌ Choix invalide.");
        }

        const city = pageCities[idx];
        const providers = await proxyApiService.getProviders(countryId, city.city_code);
        const providerTp = totalPages(providers);
        
        await userService.setState(user, 'BUY_PROVIDER', { 
            ...user.stateData, 
            cityId: city.city_code,
            cityName: city.city_name,
            providerPage: 1
        });
        
        const pageProviders = getPage(providers, 1);
        let msg = `📶 Opérateurs (Page 1/${providerTp}):\n\n`;
        pageProviders.forEach((p, i) => msg += `${i + 1}. ${p.service_provider_name}\n`);
        msg += "\n9. Suivant\n0. Annuler";
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyCity:', err);
        await sendText(psid, "❌ Erreur.");
    }
}

async function handleBuyProvider(user, psid, input) {
    if (input.type !== 'number') return;
    
    try {
        const { countryId, cityId } = user.stateData;
        const providers = await proxyApiService.getProviders(countryId, cityId);
        let page = user.stateData.providerPage || 1;
        const tp = totalPages(providers);

        if (input.value === 0) {
            await userService.setState(user, 'BUY_CITY');
            return;
        }

        if (input.value === 9) {
            if (page < tp) page++;
            await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, providerPage: page });
            return;
        }

        const pageProviders = getPage(providers, page);
        const provider = pageProviders[input.value - 1];
        if (!provider) return await sendText(psid, "❌ Invalide.");

        const parents = await proxyApiService.getParents(countryId, cityId, provider.service_provider_id);
        const parentTp = totalPages(parents);
        
        await userService.setState(user, 'BUY_PARENT', { 
            ...user.stateData, 
            providerId: provider.service_provider_id,
            providerName: provider.service_provider_name,
            parentPage: 1
        });
        
        const pageParents = getPage(parents, 1);
        let msg = `🖥️  Serveurs (Page 1/${parentTp}):\n\n`;
        pageParents.forEach((p, i) => msg += `${i + 1}. ${p.technology || '4G'} | Port: ${p.http_port || p.socks_port}\n`);
        msg += "\n9. Suivant\n0. Annuler";
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyProvider:', err);
    }
}

async function handleBuyParent(user, psid, input) {
    if (input.type !== 'number') return;
    
    try {
        const { countryId, cityId, providerId } = user.stateData;
        const parents = await proxyApiService.getParents(countryId, cityId, providerId);
        let page = user.stateData.parentPage || 1;
        const tp = totalPages(parents);

        if (input.value === 0) {
            await userService.setState(user, 'BUY_PROVIDER');
            return;
        }

        if (input.value === 9) {
            if (page < tp) page++;
            await userService.setState(user, 'BUY_PARENT', { ...user.stateData, parentPage: page });
            return;
        }

        const pageParents = getPage(parents, page);
        const parent = pageParents[input.value - 1];
        if (!parent) return;

        await userService.setState(user, 'BUY_CONFIRM', { 
            ...user.stateData, 
            parentId: parent.parent_proxy_id,
            parentData: parent
        });

        let msg = `✅ CONFIRMER\n\n`;
        msg += `📦 Package: ${user.stateData.pkgName}\n`;
        msg += `📡 Protocole: ${user.stateData.proto.toUpperCase()}\n`;
        msg += `🌍 Pays: ${user.stateData.countryName}\n`;
        msg += `🏙️  Ville: ${user.stateData.cityName}\n`;
        msg += `📶 Opérateur: ${user.stateData.providerName}\n`;
        msg += `💵 Prix: $${user.stateData.price.toFixed(2)}\n`;
        msg += `💳 Solde: $${user.balance.toFixed(2)}\n\n`;
        msg += `1. ✅ Acheter\n2. ❌ Annuler\n\n0. Menu`;
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyParent:', err);
    }
}

async function handleBuyConfirm(user, psid, input) {
    if (input.type !== 'number') return;

    if (input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    
    if (input.value === 2) {
        await userService.setState(user, 'MAIN_MENU');
        await sendText(psid, "❌ Achat annulé.");
        return await showMainMenu(psid);
    }

    if (input.value !== 1) return;

    try {
        if (user.balance < user.stateData.price) {
            await sendText(psid, `❌ Solde insuffisant!\n\n💵 Prix: $${user.stateData.price.toFixed(2)}\n💳 Votre solde: $${user.balance.toFixed(2)}`);
            return;
        }

        // Créer le proxy
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + user.stateData.duration);

        const proxy = new Proxy({
            userId: user._id,
            ip: user.stateData.parentData.ip || '0.0.0.0',
            port: user.stateData.proto === 'http' ? (user.stateData.parentData.http_port || 8080) : (user.stateData.parentData.socks_port || 1080),
            username: 'user',
            password: crypto.randomBytes(8).toString('hex'),
            protocol: user.stateData.proto,
            country: user.stateData.countryName,
            city: user.stateData.cityName,
            provider: user.stateData.providerName,
            duration: user.stateData.duration,
            expiresAt,
            price: user.stateData.price,
            package: user.stateData.pkgName,
            status: 'ACTIVE'
        });

        await proxy.save();

        // Débiter solde
        user.balance -= user.stateData.price;
        await user.save();

        let msg = `🎉 ACHAT RÉUSSI!\n\n`;
        msg += `🌐 IP: ${proxy.ip}\n`;
        msg += `🔌 Port: ${proxy.port}\n`;
        msg += `👤 Login: ${proxy.username}\n`;
        msg += `🔑 Pass: ${proxy.password}\n`;
        msg += `📡 Proto: ${proxy.protocol.toUpperCase()}\n`;
        msg += `⏰ Expire: ${expiresAt.toLocaleDateString('fr-FR')}\n\n`;
        msg += `📋 Chaîne:\n${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`;
        
        await sendText(psid, msg);
        await userService.setState(user, 'MAIN_MENU');
        await showMainMenu(psid);
    } catch (err) {
        console.error('Error in handleBuyConfirm:', err);
        await sendText(psid, "❌ Erreur lors de l'achat.");
    }
}

// ── TOP-UP ───────────────────────────────────────

async function handleTopUp(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }

    const amount = parseFloat((rawMessage || '').trim());
    if (isNaN(amount) || amount <= 0) {
        return await sendText(psid, `💳 RECHARGER\n\nSolde: $${(user.balance || 0).toFixed(2)}\n\nMéthodes:\n🔸 Binance: 909914646\n🔸 Bkash: 01567906551\n\nTapez le montant:`);
    }

    try {
        await TopUpRequest.create({ userId: user._id, psid, email: user.email, amount });
        await sendText(psid, `✅ Demande de $${amount.toFixed(2)} envoyée!\n\nVérification: 1-10 mins`);
        await userService.setState(user, 'MAIN_MENU');
        await showMainMenu(psid);
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
        return await sendText(psid, "Message trop court (min 3 caractères).");
    }

    try {
        await SupportMessage.create({ userId: user._id, psid, email: user.email, message: msg });
        await sendText(psid, "✅ Message envoyé à support!");
        await userService.setState(user, 'MAIN_MENU');
        await showMainMenu(psid);
    } catch (err) {
        await sendText(psid, "❌ Erreur.");
    }
}

module.exports = { handleMessage };
