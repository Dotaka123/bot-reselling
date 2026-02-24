const { sendText }      = require('../utils/messenger');
const { parseInput, isValidEmail, isValidPassword } = require('../utils/validators');
const M                 = require('../utils/messages');
const userService       = require('../services/userService');
const proxyService      = require('../services/proxyService');
const proxyApiService   = require('../services/proxyApiService');
const SupportMessage    = require('../models/SupportMessage');
const TopUpRequest      = require('../models/TopUpRequest');
const crypto            = require('crypto');

// ✅ CORRECTION 1: Définir les constantes manquantes
const PAGE = M.PAGE_SIZE || 8;  // Nombre d'items par page
const FACEBOOK_PAGE_URL = process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com/yourpage';

// ── Helper Functions ──────────────────────────────────

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

// ✅ CORRECTION 5: handlePaginatedInput retourne maintenant un objet
async function handlePaginatedInput({ user, psid, input, items, page, tp, stateName, statePageKey, showFn, onBack, messageText = '' }) {
    const n = input.type === 'number' ? input.value : null;
    if (n === 0) {
        if (page > 1) {
            const newPage = page - 1;
            await userService.setState(user, stateName, { ...user.stateData, [statePageKey]: newPage });
            await showFn(getPage(items, newPage), newPage, tp);
        } else { await onBack(); }
        return null;
    }
    if (n === 9) {
        if (page < tp) {
            const newPage = page + 1;
            await userService.setState(user, stateName, { ...user.stateData, [statePageKey]: newPage });
            await showFn(getPage(items, newPage), newPage, tp);
        } else {
            await sendText(psid, `⚠️ Last page reached.\n(0 = back)`);
            await showFn(getPage(items, page), page, tp);
        }
        return null;
    }
    const pageItems = getPage(items, page);
    const idx = (n || 0) - 1;
    if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
        await sendText(psid, "❌ Invalid option. Please try again.");
        await showFn(pageItems, page, tp);
        return null;
    }

    // ✅ CORRECTION 5: Retourner l'élément sélectionné
    return { selectedItem: pageItems[idx], index: idx, pageItems, page };
}

// ✅ CORRECTION 3: Créer la fonction handleMessage qui était manquante
async function handleMessage(psid, messageText) {
    try {
        // Récupérer ou créer l'utilisateur
        let user = await userService.getUserByPsid(psid);
        if (!user) {
            user = await userService.createUser(psid);
        }

        // ✅ CORRECTION 9: Vérification Facebook AVANT toute logique
        if (!user.isPageSubscriber && user.state !== 'FB_VERIFICATION') {
            await userService.setState(user, 'FB_VERIFICATION');
            await sendText(psid, `👋 Welcome! To use this bot, you must subscribe to our Facebook page:\n\n🔗 ${FACEBOOK_PAGE_URL}\n\nAfter subscribing, type "Done" to continue.`);
            return;
        }

        // Parser l'input
        const input = parseInput(messageText);

        // Global Cancel
        if (input.type === 'command' && input.value === 'CANCEL') {
            await userService.setState(user, 'MAIN_MENU');
            await sendText(psid, "🏠 Operation cancelled. Returning to Main Menu.");
            await sendText(psid, "1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
            return;
        }

        // Route vers les différents handlers selon l'état
        try {
            switch (user.state) {
                case 'FB_VERIFICATION':   return await handleFBVerification(user, psid, input);
                case 'WELCOME':            return await handleWelcome(user, psid, input);
                case 'CAPTCHA_REGISTER':   return await handleCaptchaRegister(user, psid, input);
                case 'CAPTCHA_LOGIN':      return await handleCaptchaLogin(user, psid, input);
                case 'REGISTER_EMAIL':     return await handleRegisterEmail(user, psid, input);
                case 'REGISTER_PASSWORD':  return await handleRegisterPassword(user, psid, input, messageText);
                case 'LOGIN_EMAIL':        return await handleLoginEmail(user, psid, input);
                case 'LOGIN_PASSWORD':     return await handleLoginPassword(user, psid, input, messageText);
                case 'MAIN_MENU':          return await handleMainMenu(user, psid, input);
                case 'BUY_PKG':            return await handleBuyPkg(user, psid, input);
                case 'BUY_PROTO':          return await handleBuyProto(user, psid, input);
                case 'BUY_DURATION':       return await handleBuyDuration(user, psid, input);
                case 'BUY_COUNTRY':        return await handleBuyCountry(user, psid, input);
                case 'BUY_CITY':           return await handleBuyCity(user, psid, input);
                case 'BUY_PROVIDER':       return await handleBuyProvider(user, psid, input);
                case 'BUY_PARENT':         return await handleBuyParent(user, psid, input);
                case 'BUY_CONFIRM':        return await handleBuyConfirm(user, psid, input);
                case 'TOPUP':              return await handleTopUp(user, psid, input, messageText);
                case 'SUPPORT':            return await handleSupport(user, psid, input, messageText);
                default:
                    await userService.setState(user, 'WELCOME');
                    await handleWelcome(user, psid, input);
            }
        } catch (err) {
            console.error(`State Error [${user.state}]:`, err);
            await sendText(psid, "⚠️ An error occurred. Type CANCEL to restart.");
        }
    } catch (err) {
        console.error(`handleMessage error:`, err);
        await sendText(psid, "⚠️ An unexpected error occurred. Please try again.");
    }
}

// ── Handlers ────────────────────────────────────────────────

async function handleFBVerification(user, psid, input) {
    const text = (input && input.raw) ? input.raw.toLowerCase().trim() : "";
    if (text === 'done' || text === 'fait') {
        user.isPageSubscriber = true;
        await user.save();
        await sendText(psid, "✅ Subscription verified!");
        await userService.setState(user, 'WELCOME');
        return await handleWelcome(user, psid, input);
    }
    await sendText(psid, `⚠️ Access Denied. Please follow our page first:\n${FACEBOOK_PAGE_URL}\n\nThen type "Done".`);
}

async function handleWelcome(user, psid, input) {
    if (!user.isLoggedIn) {
        if (input.type === 'number' && input.value === 1) {
            const nc = generateCaptcha();
            await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
            return await sendText(psid, `Security: What is ${nc.a} + ${nc.b}?`);
        }
        if (input.type === 'number' && input.value === 2) {
            const nc = generateCaptcha();
            await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
            return await sendText(psid, `Security: What is ${nc.a} + ${nc.b}?`);
        }
        await sendText(psid, "Welcome to Proxy Service!\n\n1. Login\n2. Register");
    } else {
        await userService.setState(user, 'MAIN_MENU');
        await sendText(psid, "Welcome back!\n1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
    }
}

// ✅ CORRECTION 6: Créer handleCaptchaRegister
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

// ✅ CORRECTION 6: Créer handleRegisterEmail
async function handleRegisterEmail(user, psid, input) {
    if (!isValidEmail(input.raw)) return await sendText(psid, "Invalid email format.");
    const existing = await userService.getUserByEmail(input.raw);
    if (existing) return await sendText(psid, "Email already in use.");
    await userService.setState(user, 'REGISTER_PASSWORD', { email: input.raw });
    await sendText(psid, "Choose a password (min 6 chars):");
}

// ✅ CORRECTION 6: Créer handleRegisterPassword
async function handleRegisterPassword(user, psid, input, rawMessage) {
    if (!isValidPassword(rawMessage)) return await sendText(psid, "Password too short (min 6 chars).");
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    
    // Créer le nouvel utilisateur avec les credentials
    const newUser = await userService.createUserWithCredentials(
        user.psid,
        user.stateData.email,
        hash
    );
    
    user.isLoggedIn = true;
    user.email = user.stateData.email;
    user.passwordHash = hash;
    await user.save();
    
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, "✅ Account created successfully!");
    await sendText(psid, "1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
}

// ── LOGIN HANDLERS ─────────────────────────────────────

async function handleCaptchaLogin(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha.answer) {
        await sendText(psid, "Wrong captcha. Try again.");
        await userService.setState(user, 'WELCOME');
        return;
    }
    await userService.setState(user, 'LOGIN_EMAIL');
    return await sendText(psid, "Enter your Email:");
}

async function handleLoginEmail(user, psid, input) {
    if (!isValidEmail(input.raw)) return await sendText(psid, "Invalid email format.");
    const existing = await userService.getUserByEmail(input.raw);
    if (!existing) return await sendText(psid, "Account not found.");
    await userService.setState(user, 'LOGIN_PASSWORD', { email: input.raw });
    await sendText(psid, "Enter your Password:");
}

async function handleLoginPassword(user, psid, input, rawMessage) {
    const { email } = user.stateData;
    const existingUser = await userService.getUserByEmail(email);
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    if (existingUser.passwordHash !== hash) return await sendText(psid, "Wrong password.");
    
    user.isLoggedIn = true;
    user.email = email;
    await user.save();
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, "✅ Login Successful!");
    await sendText(psid, "1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
}

// ── PURCHASE LOGIC ─────────────────────────────────────

async function handleBuyPkg(user, psid, input) {
    if (input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await sendText(psid, "Main Menu loaded.");
    }
    if (input.value !== 1 && input.value !== 2) return await sendText(psid, "Choose 1 or 2 (0 to back):");
    await userService.setState(user, 'BUY_PROTO', { pkgId: input.value });
    await sendText(psid, "Select Protocol:\n1. HTTP\n2. SOCKS5\n0. Back");
}

async function handleBuyProto(user, psid, input) {
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PKG');
        return await sendText(psid, "Select Package:\n1. Golden\n2. Silver\n0. Back");
    }
    const proto = input.value === 1 ? 'http' : 'socks5';
    const options = [
        { label: '2 hours', price: 0.30, duration: 2 },
        { label: '12 hours', price: 0.60, duration: 12 },
        { label: '3 days', price: 2.50, duration: 3 },
        { label: '7 days', price: 4.50, duration: 7 },
        { label: '15 days', price: 10.00, duration: 15 },
        { label: '30 days', price: 18.00, duration: 30 }
    ];
    await userService.setState(user, 'BUY_DURATION', { ...user.stateData, proto });
    let msg = "Select Duration:\n";
    options.forEach((o, i) => msg += `${i + 1}. ${o.label} - $${o.price}\n`);
    msg += "0. Back";
    await sendText(psid, msg);
}

// ✅ CORRECTION 11: Ajouter try-catch pour les appels API
async function handleBuyDuration(user, psid, input) {
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PROTO');
        return await sendText(psid, "Select Protocol:\n1. HTTP\n2. SOCKS5\n0. Back");
    }
    const options = [
        { label: '2 hours', price: 0.30, duration: 2 },
        { label: '12 hours', price: 0.60, duration: 12 },
        { label: '3 days', price: 2.50, duration: 3 },
        { label: '7 days', price: 4.50, duration: 7 },
        { label: '15 days', price: 10.00, duration: 15 },
        { label: '30 days', price: 18.00, duration: 30 }
    ];
    const sel = options[input.value - 1];
    if (!sel) return await sendText(psid, "Invalid choice.");
    
    try {
        await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, duration: sel.duration, price: sel.price });
        const countries = await proxyApiService.getCountries();
        const tp = totalPages(countries);
        await sendText(psid, `Select Country (Page 1/${tp}):\n` + getPage(countries, 1).map((c, i) => `${i + 1}. ${c.country_name}`).join('\n') + "\n9. Next\n0. Back");
    } catch (err) {
        console.error('Error fetching countries:', err);
        await sendText(psid, "❌ Error loading countries. Try again later.");
        await userService.setState(user, 'BUY_PROTO');
    }
}

async function handleBuyCountry(user, psid, input) {
    try {
        const countries = await proxyApiService.getCountries();
        const page = user.stateData.countryPage || 1;
        const tp = totalPages(countries);

        const result = await handlePaginatedInput({
            user, psid, input, items: countries, page, tp,
            stateName: 'BUY_COUNTRY', statePageKey: 'countryPage',
            showFn: async (items, p, t) => await sendText(psid, `Select Country (${p}/${t}):\n` + items.map((c, i) => `${i + 1}. ${c.country_name}`).join('\n') + "\n9. Next\n0. Back"),
            onBack: async () => { await userService.setState(user, 'BUY_PROTO'); await sendText(psid, "Back to Protocol selection."); }
        });

        if (!result) return;
        
        const country = result.selectedItem;
        const cities = await proxyApiService.getCities(country.country_code);
        const cityPage = 1;
        const cityTp = totalPages(cities);
        
        await userService.setState(user, 'BUY_CITY', { ...user.stateData, countryId: country.country_code, cityPage });
        await sendText(psid, `Select City (Page ${cityPage}/${cityTp}):\n` + getPage(cities, cityPage).map((c, i) => `${i + 1}. ${c.city_name}`).join('\n') + "\n9. Next\n0. Back");
    } catch (err) {
        console.error('Error in handleBuyCountry:', err);
        await sendText(psid, "❌ Error loading countries. Try again.");
        await userService.setState(user, 'BUY_PKG');
    }
}

// ✅ CORRECTION 6: Créer handleBuyCity
async function handleBuyCity(user, psid, input) {
    try {
        const country = user.stateData.countryId;
        const cities = await proxyApiService.getCities(country);
        const page = user.stateData.cityPage || 1;
        const tp = totalPages(cities);

        const result = await handlePaginatedInput({
            user, psid, input, items: cities, page, tp,
            stateName: 'BUY_CITY', statePageKey: 'cityPage',
            showFn: async (items, p, t) => await sendText(psid, `Select City (${p}/${t}):\n` + items.map((c, i) => `${i + 1}. ${c.city_name}`).join('\n') + "\n9. Next\n0. Back"),
            onBack: async () => { await userService.setState(user, 'BUY_COUNTRY'); await sendText(psid, "Back to Country selection."); }
        });

        if (!result) return;
        
        const city = result.selectedItem;
        const providers = await proxyApiService.getProviders(country, city.city_code);
        const providerPage = 1;
        const providerTp = totalPages(providers);
        
        await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, cityId: city.city_code, providerPage });
        await sendText(psid, `Select Provider (Page ${providerPage}/${providerTp}):\n` + getPage(providers, providerPage).map((p, i) => `${i + 1}. ${p.service_provider_name}`).join('\n') + "\n9. Next\n0. Back");
    } catch (err) {
        console.error('Error in handleBuyCity:', err);
        await sendText(psid, "❌ Error loading cities. Try again.");
        await userService.setState(user, 'BUY_COUNTRY');
    }
}

// ✅ CORRECTION 6: Créer handleBuyProvider
async function handleBuyProvider(user, psid, input) {
    try {
        const { countryId, cityId } = user.stateData;
        const providers = await proxyApiService.getProviders(countryId, cityId);
        const page = user.stateData.providerPage || 1;
        const tp = totalPages(providers);

        const result = await handlePaginatedInput({
            user, psid, input, items: providers, page, tp,
            stateName: 'BUY_PROVIDER', statePageKey: 'providerPage',
            showFn: async (items, p, t) => await sendText(psid, `Select Provider (${p}/${t}):\n` + items.map((p, i) => `${i + 1}. ${p.service_provider_name}`).join('\n') + "\n9. Next\n0. Back"),
            onBack: async () => { await userService.setState(user, 'BUY_CITY'); await sendText(psid, "Back to City selection."); }
        });

        if (!result) return;
        
        const provider = result.selectedItem;
        const parents = await proxyApiService.getParents(countryId, cityId, provider.service_provider_id);
        const parentPage = 1;
        const parentTp = totalPages(parents);
        
        await userService.setState(user, 'BUY_PARENT', { ...user.stateData, providerId: provider.service_provider_id, parentPage });
        await sendText(psid, `Select Server (Page ${parentPage}/${parentTp}):\n` + getPage(parents, parentPage).map((p, i) => `${i + 1}. ${p.technology || '4G'} | Port: ${p.http_port || p.socks_port || '—'}`).join('\n') + "\n9. Next\n0. Back");
    } catch (err) {
        console.error('Error in handleBuyProvider:', err);
        await sendText(psid, "❌ Error loading providers. Try again.");
        await userService.setState(user, 'BUY_CITY');
    }
}

// ✅ CORRECTION 6: Créer handleBuyParent
async function handleBuyParent(user, psid, input) {
    try {
        const { countryId, cityId, providerId } = user.stateData;
        const parents = await proxyApiService.getParents(countryId, cityId, providerId);
        const page = user.stateData.parentPage || 1;
        const tp = totalPages(parents);

        const result = await handlePaginatedInput({
            user, psid, input, items: parents, page, tp,
            stateName: 'BUY_PARENT', statePageKey: 'parentPage',
            showFn: async (items, p, t) => await sendText(psid, `Select Server (${p}/${t}):\n` + items.map((p, i) => `${i + 1}. ${p.technology || '4G'} | Port: ${p.http_port || p.socks_port || '—'}`).join('\n') + "\n9. Next\n0. Back"),
            onBack: async () => { await userService.setState(user, 'BUY_PROVIDER'); await sendText(psid, "Back to Provider selection."); }
        });

        if (!result) return;
        
        const parent = result.selectedItem;
        const country = user.stateData.countryId;
        
        await userService.setState(user, 'BUY_CONFIRM', { 
            ...user.stateData, 
            parentId: parent.parent_proxy_id,
            parentData: parent
        });

        // Afficher la confirmation
        await sendText(psid, `✅ CONFIRM PURCHASE\n\n📦 Package: ${user.stateData.pkgId === 1 ? 'Golden' : 'Silver'}\n📡 Protocol: ${user.stateData.proto.toUpperCase()}\n⏱ Duration: ${user.stateData.duration} days\n💵 Price: $${user.stateData.price}\n\n1. Confirm\n2. Cancel\n0. Back`);
    } catch (err) {
        console.error('Error in handleBuyParent:', err);
        await sendText(psid, "❌ Error loading servers. Try again.");
        await userService.setState(user, 'BUY_PROVIDER');
    }
}

// ✅ CORRECTION 6: Créer handleBuyConfirm
async function handleBuyConfirm(user, psid, input) {
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PARENT');
        await sendText(psid, "Back to server selection.");
        return;
    }
    
    if (input.value === 2) {
        await userService.setState(user, 'MAIN_MENU');
        await sendText(psid, "❌ Purchase cancelled.\n\n1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
        return;
    }

    if (input.value === 1) {
        // Vérifier le solde
        if (user.balance < user.stateData.price) {
            await sendText(psid, `❌ Insufficient balance!\nPrice: $${user.stateData.price}\nYour balance: $${user.balance}`);
            await userService.setState(user, 'MAIN_MENU');
            return;
        }

        try {
            // Créer le proxy
            const proxy = await proxyService.createProxyOrder({
                userId: user._id,
                duration: user.stateData.duration,
                proto: user.stateData.proto,
                parentId: user.stateData.parentId
            });

            // Débiter le solde
            user.balance -= user.stateData.price;
            await user.save();

            await sendText(psid, `🎉 PROXY PURCHASED SUCCESSFULLY!\n\n🌐 IP: ${proxy.ip}\n🔌 Port: ${proxy.port}\n👤 Login: ${proxy.username}\n🔑 Password: ${proxy.password}\n📡 Protocol: ${proxy.protocol.toUpperCase()}\n⏱ Expires: ${new Date(proxy.expiresAt).toLocaleDateString()}\n\n${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`);

            await userService.setState(user, 'MAIN_MENU');
        } catch (err) {
            console.error('Error creating proxy:', err);
            await sendText(psid, "❌ Error creating proxy. Try again.");
            await userService.setState(user, 'MAIN_MENU');
        }
        return;
    }

    await sendText(psid, "Invalid option.");
}

// ── TOP UP ─────────────────────────────────────────────

async function handleTopUp(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await sendText(psid, "1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
    }

    const amount = parseFloat((rawMessage || "").trim());
    if (isNaN(amount) || amount <= 0) {
        let msg = "💳 --- TOP UP METHODS ---\n\n";
        msg += "Choose a method and send funds:\n";
        msg += "🔸 Binance Recharge ID: 909914646\n";
        msg += "🔸 Bkash Number: 01567906551\n";
        msg += "🔸 Nogod Number: 01567906551\n";
        msg += "🔸 Rocket Number: 01567906551\n\n";
        msg += "👉 After sending, type the AMOUNT you sent here to notify admin.\n";
        msg += "0. Back";
        return await sendText(psid, msg);
    }

    await TopUpRequest.create({ userId: user._id, psid, email: user.email, amount });
    await sendText(psid, `✅ Request for $${amount} sent to Admin. Processing time: 1-10 mins.`);
    await userService.setState(user, 'MAIN_MENU');
}

// ── SUPPORT ────────────────────────────────────────────

async function handleSupport(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) { 
        await userService.setState(user, 'MAIN_MENU'); 
        return; 
    }
    const msg = (rawMessage || "").trim();
    if (msg.length < 3) return await sendText(psid, "Message too short (min 3 chars).");
    await SupportMessage.create({ userId: user._id, psid, email: user.email, message: msg });
    await sendText(psid, "✅ Support request sent.");
    await userService.setState(user, 'MAIN_MENU');
}

// ── MAIN MENU ──────────────────────────────────────────

async function handleMainMenu(user, psid, input) {
    switch (input.value) {
        case 1: 
            await userService.setState(user, 'BUY_PKG'); 
            await sendText(psid, "Choose Package:\n1. Golden\n2. Silver\n0. Back"); 
            break;
        case 2:
            // Profile - show user info
            await sendText(psid, `👤 PROFILE\n\n📧 Email: ${user.email}\n💳 Balance: $${(user.balance || 0).toFixed(2)}`);
            break;
        case 3: 
            await userService.setState(user, 'TOPUP'); 
            await handleTopUp(user, psid, { type: 'number', value: 1 }, ""); 
            break;
        case 4: 
            await userService.setState(user, 'SUPPORT'); 
            await sendText(psid, "Describe your problem (min 3 chars):\n0. Back"); 
            break;
        case 5: 
            user.isLoggedIn = false; 
            await user.save(); 
            await userService.setState(user, 'WELCOME'); 
            await sendText(psid, "Logged out."); 
            break;
        default: 
            await sendText(psid, "1. Buy Proxy\n2. Profile\n3. Top Up\n4. Support\n5. Logout");
    }
}

// ✅ CORRECTION 3: Exporter la fonction handleMessage (et non une fonction vide)
module.exports = { handleMessage };
