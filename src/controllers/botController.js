const { sendText } = require('../utils/messenger');
const { parseInput, isValidEmail } = require('../utils/validators');
const userService = require('../services/userService');
const proxyApi    = require('../services/proxyApiService');
const proxyService = require('../services/proxyService');
const SupportMessage = require('../models/SupportMessage');
const TopUpRequest   = require('../models/TopUpRequest');

const PAGE_SIZE = 8;
const FACEBOOK_PAGE_URL = process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com/yourpage';

// ── CUSTOM PRICES (match your website) ───────────────────────────────────────
// Format: { packageId: { 'label from API': price_in_USD } }
// Labels used by the reseller API (French): '2 heures', '12 heures', '1 jour',
//   '2 jours', '3 jours', '7 jours', '15 jours', '30 jours'
const CUSTOM_PRICES = {
    '1': { // Golden Package
        '2 heures':  0.30,
        '12 heures': 0.60,
        '3 jours':   2.50,
        '7 jours':   4.50,
        '15 jours':  10.00,
        '30 jours':  18.00,
    },
    '2': { // Silver Package
        '2 jours':   1.50,
        '7 jours':   4.00,
        '30 jours':  12.00,
    }
};

/**
 * Overrides API prices with our custom prices.
 * Falls back to API price if no custom price defined for that label/duration.
 */
function applyCustomPrices(prices) {
    const result = {};
    for (const [pkgId, priceList] of Object.entries(prices)) {
        const customMap = CUSTOM_PRICES[pkgId] || {};
        result[pkgId] = priceList.map(p => {
            const override = p.label && customMap[p.label] !== undefined
                ? customMap[p.label]
                : null;
            return override !== null ? { ...p, price: override } : p;
        });
    }
    return result;
}

// States where "9" = next page, NOT main menu
const PAGINATED_STATES = ['BUY_COUNTRY', 'BUY_CITY', 'BUY_PROVIDER', 'BUY_PARENT'];

// Proxy credentials: lowercase letters, digits, _ and -
const CRED_PATTERN = /^[a-z0-9_-]+$/;

// ── HELPERS ───────────────────────────────────────────────────────────────────

function generateCaptcha() {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { a, b, answer: a + b };
}

function getPage(items, page) {
    return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

function totalPages(items) {
    return Math.max(1, Math.ceil(items.length / PAGE_SIZE));
}

function isCancelCommand(input) {
    const t = input?.raw?.toLowerCase().trim();
    return t === 'cancel' || t === 'c' || t === '0' || (input?.type === 'number' && input?.value === 0);
}

function isMenuCommand(input, state) {
    if (PAGINATED_STATES.includes(state)) return false;
    const t = input?.raw?.toLowerCase().trim();
    return t === '9' || t === 'menu' || (input?.type === 'number' && input?.value === 9);
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

async function handleMessage(psid, messageText) {
    try {
        let user = await userService.getUserByPsid(psid);
        if (!user) user = await userService.createUser(psid);

        // Guard: if user creation failed (e.g. DB error), abort gracefully
        if (!user) {
            console.error(`handleMessage: createUser returned null for psid ${psid}`);
            await sendText(psid, '❌ A server error occurred. Please try again in a moment.');
            return;
        }

        // 1. FACEBOOK SUBSCRIPTION GATE
        if (!user.isPageSubscriber && user.state !== 'FB_VERIFICATION') {
            await userService.setState(user, 'FB_VERIFICATION');
            await sendText(psid,
                `👋 Welcome to ProxyBot!\n\n` +
                `📌 Step 1: Subscribe to our page\n🔗 ${FACEBOOK_PAGE_URL}\n\n` +
                `📌 Step 2: Come back and type "done"`
            );
            return;
        }

        const input = parseInput(messageText);

        // 2. GLOBAL CANCEL
        if (isCancelCommand(input)) {
            if (user.isLoggedIn && user.state !== 'MAIN_MENU') {
                await userService.setState(user, 'MAIN_MENU');
                return await showMainMenu(psid);
            } else if (!user.isLoggedIn && user.state !== 'WELCOME') {
                await userService.setState(user, 'WELCOME');
                return await handleWelcome(user, psid, input);
            }
            return;
        }

        // 3. GLOBAL MENU (disabled in paginated states)
        if (isMenuCommand(input, user.state) && user.isLoggedIn) {
            await userService.setState(user, 'MAIN_MENU');
            return await showMainMenu(psid);
        }

        // 4. ROUTE
        try {
            switch (user.state) {
                case 'FB_VERIFICATION':   return await handleFBVerification(user, psid, input);
                case 'WELCOME':           return await handleWelcome(user, psid, input);
                case 'CAPTCHA':           return await handleCaptcha(user, psid, input);
                case 'LOGIN_EMAIL':       return await handleLoginEmail(user, psid, input);
                case 'LOGIN_PASSWORD':    return await handleLoginPassword(user, psid, input, messageText);
                case 'REG_EMAIL':         return await handleRegEmail(user, psid, input);
                case 'REG_PASSWORD':      return await handleRegPassword(user, psid, input, messageText);
                case 'MAIN_MENU':         return await handleMainMenu(user, psid, input);
                case 'BUY_PKG':           return await handleBuyPkg(user, psid, input);
                case 'BUY_PROTO':         return await handleBuyProto(user, psid, input);   // step 2 — right after package
                case 'BUY_DURATION':      return await handleBuyDuration(user, psid, input);
                case 'BUY_COUNTRY':       return await handleBuyCountry(user, psid, input);
                case 'BUY_CITY':          return await handleBuyCity(user, psid, input);
                case 'BUY_PROVIDER':      return await handleBuyProvider(user, psid, input);
                case 'BUY_PARENT':        return await handleBuyParent(user, psid, input);
                case 'BUY_CREDENTIALS':   return await handleBuyCredentials(user, psid, input, messageText);
                case 'BUY_CONFIRM':       return await handleBuyConfirm(user, psid, input);
                case 'TOPUP':             return await handleTopUp(user, psid, input, messageText);
                case 'SUPPORT':           return await handleSupport(user, psid, input, messageText);
                case 'MANAGE_PROXY':      return await handleManageProxy(user, psid, input);
                case 'CHANGE_COUNTRY':    return await handleChangeCountry(user, psid, input);
                case 'CHANGE_CITY':       return await handleChangeCity(user, psid, input);
                case 'CHANGE_PARENT':     return await handleChangeParent(user, psid, input);
                default:
                    await userService.setState(user, 'WELCOME');
                    return await handleWelcome(user, psid, input);
            }
        } catch (err) {
            console.error(`Handler error [state=${user.state}]:`, err);
            await sendText(psid, `⚠️ An error occurred.\n\n💡 Type 0 to go back, 9 for menu, CANCEL to restart`);
        }
    } catch (err) {
        console.error('handleMessage fatal error:', err);
        await sendText(psid, '❌ Server error. Please try again later.');
    }
}

// ── FB VERIFICATION ───────────────────────────────────────────────────────────

async function handleFBVerification(user, psid, input) {
    const t = input?.raw?.toLowerCase().trim();
    if (t === 'done' || t === 'd') {
        user.isPageSubscriber = true;
        await user.save();
        await userService.setState(user, 'WELCOME');
        await sendText(psid, '✅ Subscription verified! Welcome!');
        return await handleWelcome(user, psid, { type: 'text', raw: '' });
    }
    await sendText(psid, `⚠️ Please subscribe first:\n🔗 ${FACEBOOK_PAGE_URL}\n\n➡️ Then type "done"`);
}

// ── WELCOME ───────────────────────────────────────────────────────────────────

async function handleWelcome(user, psid, input) {
    if (user.isLoggedIn) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    if (input?.type === 'number') {
        if (input.value === 1) {
            const nc = generateCaptcha();
            await userService.setState(user, 'CAPTCHA', { captcha: nc, next: 'LOGIN_EMAIL' });
            return await sendText(psid, `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n(or 0 to go back)`);
        }
        if (input.value === 2) {
            const nc = generateCaptcha();
            await userService.setState(user, 'CAPTCHA', { captcha: nc, next: 'REG_EMAIL' });
            return await sendText(psid, `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n(or 0 to go back)`);
        }
    }
    await sendText(psid,
        `👋 WELCOME TO PROXYBOT!\n\n1️⃣  🔓 Login\n2️⃣  📝 Create account\n\n💡 Type 1 or 2`
    );
}

// ── CAPTCHA ───────────────────────────────────────────────────────────────────

async function handleCaptcha(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha?.answer) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA', { captcha: nc, next: user.stateData.next });
        return await sendText(psid, `❌ Wrong answer.\n\n🤖 Try again:\n➕ ${nc.a} + ${nc.b} = ?\n\n(or 0 to go back)`);
    }
    const next = user.stateData.next;
    await userService.setState(user, next);
    if (next === 'LOGIN_EMAIL') return await sendText(psid, `📧 LOGIN — Step 1/2\n\n✉️ Enter your EMAIL:\n\n(0 = Back)`);
    if (next === 'REG_EMAIL')   return await sendText(psid, `📧 CREATE ACCOUNT — Step 1/2\n\n✉️ Enter an EMAIL:\n\n(0 = Back, 1 = Login instead)`);
}

// ── LOGIN (local) ─────────────────────────────────────────────────────────────

async function handleLoginEmail(user, psid, input) {
    // Allow switching to register
    if (input.type === 'number' && input.value === 2) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA', { captcha: nc, next: 'REG_EMAIL' });
        return await sendText(psid, `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n(or 0 to go back)`);
    }
    const email = input.raw?.trim() || '';
    if (!isValidEmail(email)) return await sendText(psid, `❌ Invalid email.\n\n📧 Try again (or 0 to go back):`);

    await userService.setState(user, 'LOGIN_PASSWORD', { email });
    await sendText(psid, `🔑 LOGIN — Step 2/2\n\n🔒 Enter your PASSWORD:\n\n(0 = Back)`);
}

async function handleLoginPassword(user, psid, input, rawMessage) {
    const { email } = user.stateData;
    const result = await userService.loginUser(user, email, rawMessage);

    if (result.error === 'NOT_FOUND') {
        await userService.setState(user, 'LOGIN_EMAIL', { email });
        return await sendText(psid, `❌ Account not found.\n\n💡 Type 2 to create an account\n(or 0 to go back)\n\n📧 Email:`);
    }
    if (result.error === 'WRONG_PASSWORD') {
        await userService.setState(user, 'LOGIN_EMAIL', { email });
        return await sendText(psid, `❌ Incorrect password.\n\n📧 Try again:\n(or 0 to go back)\n\n📧 Email:`);
    }

    await sendText(psid,
        `✅ LOGIN SUCCESSFUL!\n\n📧 ${email}\n💳 Balance: $${(user.balance || 0).toFixed(2)}\n\n👋 Welcome back!`
    );
    return await showMainMenu(psid);
}

// ── REGISTER (local) ──────────────────────────────────────────────────────────

async function handleRegEmail(user, psid, input) {
    if (input.type === 'number' && input.value === 1) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA', { captcha: nc, next: 'LOGIN_EMAIL' });
        return await sendText(psid, `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n(or 0 to go back)`);
    }
    const email = input.raw?.trim() || '';
    if (!isValidEmail(email)) return await sendText(psid, `❌ Invalid email.\n\n📧 Try again (or 0 to go back):`);

    const existing = await userService.getUserByEmail(email);
    if (existing) {
        return await sendText(psid, `❌ Email already taken.\n\n💡 Type 1 to login\n(or 0 to go back)`);
    }

    await userService.setState(user, 'REG_PASSWORD', { email });
    await sendText(psid, `🔑 CREATE ACCOUNT — Step 2/2\n\n🔒 Choose a PASSWORD:\n📋 Minimum 6 characters\n\n(0 = Back)`);
}

async function handleRegPassword(user, psid, input, rawMessage) {
    if (!rawMessage || rawMessage.trim().length < 6) {
        return await sendText(psid, `❌ Password too short!\n📋 Minimum: 6 characters\n\n🔒 Try again (or 0 to go back):`);
    }
    const result = await userService.registerUser(user, user.stateData.email, rawMessage.trim());
    if (result.error === 'EMAIL_TAKEN') {
        return await sendText(psid, `❌ Email already taken.\n\n💡 Type 1 to login\n(or 0 to go back)`);
    }
    await sendText(psid, `✅ ACCOUNT CREATED!\n\n📧 ${user.email}\n💳 Balance: $0.00\n\n👋 Welcome!`);
    return await showMainMenu(psid);
}

// ── MAIN MENU ─────────────────────────────────────────────────────────────────

async function showMainMenu(psid) {
    await sendText(psid,
        `📋 MAIN MENU\n\n` +
        `1️⃣  🛒 Buy a proxy\n` +
        `2️⃣  👤 My profile & balance\n` +
        `3️⃣  📦 My proxies\n` +
        `4️⃣  💰 Top-up balance\n` +
        `5️⃣  💬 Contact support\n` +
        `6️⃣  🚪 Logout\n\n` +
        `(0 = Back, 9 = Menu, CANCEL = Restart)`
    );
}

async function handleMainMenu(user, psid, input) {
    if (input.type !== 'number') return await showMainMenu(psid);

    switch (input.value) {
        case 1: {
            try {
                // Load prices via the SINGLE reseller token (not user's)
                const rawPrices = await proxyApi.getPrices();
                const prices = applyCustomPrices(rawPrices);
                const packages = Object.keys(prices).map(pkgId => ({
                    id:   pkgId,
                    name: pkgId === '1' ? '🥇 Golden (Mobile)' : pkgId === '2' ? '🥈 Silver (Mobile)' : `Package ${pkgId}`
                }));
                await userService.setState(user, 'BUY_PKG', { prices, packages });
                let msg = `📦 BUY A PROXY — Step 1\n\n🎯 Choose a PACKAGE:\n\n`;
                packages.forEach((p, i) => msg += `${i + 1}️⃣  ${p.name}\n`);
                msg += `\n(0 = Back, 9 = Menu)`;
                return await sendText(psid, msg);
            } catch (err) {
                console.error('getPrices error:', err.message);
                return await sendText(psid, '❌ Error loading packages. Please try again.');
            }
        }

        case 2: {
            return await sendText(psid,
                `👤 MY PROFILE\n\n` +
                `📧 Email:   ${user.email}\n` +
                `💳 Balance: $${(user.balance || 0).toFixed(2)}\n\n` +
                `💡 To top up your balance, choose option 4 from the menu.\n\n` +
                `(9 = Menu)`
            );
        }

        case 3:
            return await showMyProxies(user, psid);

        case 4:
            return await handleTopUpStart(user, psid);

        case 5:
            await userService.setState(user, 'SUPPORT');
            return await sendText(psid,
                `💬 CONTACT SUPPORT\n\n` +
                `Type your message below and our team will reply shortly.\n\n` +
                `(0 = Back, 9 = Menu)`
            );

        case 6:
            user.isLoggedIn = false;
            await user.save();
            await userService.setState(user, 'WELCOME');
            return await sendText(psid, `🚪 LOGGED OUT!\n\n👋 See you soon!`);

        default:
            return await showMainMenu(psid);
    }
}

// ── BUY FLOW ──────────────────────────────────────────────────────────────────

async function handleBuyPkg(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');
    if (input.value === 0) { await userService.setState(user, 'MAIN_MENU'); return await showMainMenu(psid); }

    const { packages, prices } = user.stateData;
    const idx = input.value - 1;
    if (idx < 0 || idx >= packages.length) return await sendText(psid, `❌ Invalid. Type 1–${packages.length}:`);

    const pkg = packages[idx];
    const pkgPrices = prices[pkg.id];
    if (!pkgPrices || pkgPrices.length === 0) return await sendText(psid, '❌ No prices available for this package.');

    // ── Step 2: protocol BEFORE duration/geography
    await userService.setState(user, 'BUY_PROTO', { prices, packages, pkgId: pkg.id, pkgName: pkg.name, pkgPrices });
    return await sendText(psid,
        `📡 BUY A PROXY — Step 2\n\n🎯 Choose a PROTOCOL:\n\n1️⃣  HTTP / HTTPS\n2️⃣  SOCKS5\n\n(0 = Back, 9 = Menu)`
    );
}

async function handleBuyDuration(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');

    // Back = return to protocol selection
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PROTO', { ...user.stateData, countries: undefined, countryPage: undefined });
        return await sendText(psid,
            `📡 Choose a PROTOCOL:\n\n1️⃣  HTTP / HTTPS\n2️⃣  SOCKS5\n\n(0 = Back)`
        );
    }

    const { pkgPrices } = user.stateData;
    const idx = input.value - 1;
    if (idx < 0 || idx >= pkgPrices.length) return await sendText(psid, `❌ Invalid. Type 1–${pkgPrices.length}:`);

    const priceObj = pkgPrices[idx];
    if (typeof priceObj.price !== 'number') return await sendText(psid, '❌ Invalid price data. Please try again.');

    try {
        const countries = await proxyApi.getCountries(user.stateData.pkgId);
        if (!countries || countries.length === 0) return await sendText(psid, '❌ No countries available.');
        const tp = totalPages(countries);
        await userService.setState(user, 'BUY_COUNTRY', {
            ...user.stateData,
            duration: priceObj.duration,
            price: priceObj.price,
            durationLabel: formatDurationLabel(priceObj),
            countries, countryPage: 1
        });
        const pageC = getPage(countries, 1);
        let msg = `🌍 BUY A PROXY — Step 4\n\n🎯 Choose a COUNTRY (Page 1/${tp}):\n\n`;
        pageC.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
        if (tp > 1) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    } catch (err) {
        console.error('getCountries error:', err.message);
        return await sendText(psid, '❌ Error loading countries. Please try again.');
    }
}

// ── GENERIC PAGINATED STEP ────────────────────────────────────────────────────

async function paginatedStep(user, psid, input, {
    stateKey, pageKey, items, labelFn,
    onSelect, onBack, stepTitle
}) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');

    let page = user.stateData[pageKey] || 1;
    const tp  = totalPages(items);

    if (input.value === 0) return await onBack();

    if (input.value === 9) { if (page < tp) page++; }
    else if (input.value === 8) { if (page > 1) page--; }
    else {
        const pageItems = getPage(items, page);
        const idx = input.value - 1;
        if (idx < 0 || idx >= pageItems.length) return await sendText(psid, `❌ Invalid. Type 1–${pageItems.length}:`);
        return await onSelect(pageItems[idx], page);
    }

    // Re-render page after navigation
    await userService.setState(user, stateKey, { ...user.stateData, [pageKey]: page });
    const pageItems = getPage(items, page);
    let msg = `${stepTitle} (Page ${page}/${tp}):\n\n`;
    pageItems.forEach((item, i) => msg += `${i + 1}️⃣  ${labelFn(item)}\n`);
    if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
    if (page > 1)  msg += `\n8️⃣  ⬅️  Prev page`;
    msg += `\n0️⃣  Back`;
    return await sendText(psid, msg);
}

// ── BUY COUNTRY ───────────────────────────────────────────────────────────────

async function handleBuyCountry(user, psid, input) {
    return await paginatedStep(user, psid, input, {
        stateKey: 'BUY_COUNTRY', pageKey: 'countryPage',
        items: user.stateData.countries || [],
        labelFn: c => c.country_name,
        stepTitle: '🌍 Countries',
        onSelect: async (country, page) => {
            try {
                const cities = await proxyApi.getCities(country.id, user.stateData.pkgId);
                if (!cities || cities.length === 0) return await sendText(psid, `❌ No cities in ${country.country_name}. Choose another.`);
                const tp = totalPages(cities);
                await userService.setState(user, 'BUY_CITY', {
                    ...user.stateData, countryId: country.id, countryName: country.country_name,
                    countryPage: page, cities, cityPage: 1
                });
                const pageC = getPage(cities, 1);
                let msg = `🏙️ BUY A PROXY — Step 5\n\n🎯 Choose a CITY (Page 1/${tp}):\n\n`;
                pageC.forEach((c, i) => msg += `${i + 1}️⃣  ${c.city_name}\n`);
                if (tp > 1) msg += `\n9️⃣  ➡️  Next page`;
                msg += `\n0️⃣  Back`;
                return await sendText(psid, msg);
            } catch (err) {
                console.error('getCities error:', err.message);
                return await sendText(psid, '❌ Error loading cities.');
            }
        },
        onBack: async () => {
            const { pkgPrices } = user.stateData;
            await userService.setState(user, 'BUY_DURATION', { ...user.stateData, countries: undefined, countryPage: undefined });
            let msg = `⏱️ Choose a DURATION:\n\n`;
            pkgPrices.forEach((p, i) => {
                const label = formatDurationLabel(p);
                const price = (typeof p.price === 'number') ? p.price.toFixed(2) : '?';
                msg += `${i + 1}️⃣  ${label.padEnd(12)} - $${price}\n`;
            });
            msg += `\n(0 = Back)`;
            return await sendText(psid, msg);
        }
    });
}

// ── BUY CITY ──────────────────────────────────────────────────────────────────

async function handleBuyCity(user, psid, input) {
    return await paginatedStep(user, psid, input, {
        stateKey: 'BUY_CITY', pageKey: 'cityPage',
        items: user.stateData.cities || [],
        labelFn: c => c.city_name,
        stepTitle: '🏙️ Cities',
        onSelect: async (city, page) => {
            try {
                const providers = await proxyApi.getProviders(city.id, user.stateData.pkgId);
                if (!providers || providers.length === 0) return await sendText(psid, `❌ No providers in ${city.city_name}. Choose another.`);
                const tp = totalPages(providers);
                await userService.setState(user, 'BUY_PROVIDER', {
                    ...user.stateData, cityId: city.id, cityName: city.city_name,
                    cityPage: page, providers, providerPage: 1
                });
                const pageP = getPage(providers, 1);
                let msg = `📡 BUY A PROXY — Step 6\n\n🎯 Choose a PROVIDER (Page 1/${tp}):\n\n`;
                pageP.forEach((p, i) => msg += `${i + 1}️⃣  ${p.service_provider_name}\n`);
                if (tp > 1) msg += `\n9️⃣  ➡️  Next page`;
                msg += `\n0️⃣  Back`;
                return await sendText(psid, msg);
            } catch (err) {
                console.error('getProviders error:', err.message);
                return await sendText(psid, '❌ Error loading providers.');
            }
        },
        onBack: async () => {
            const countries = user.stateData.countries || [];
            const cPage = user.stateData.countryPage || 1;
            await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, cities: undefined, cityPage: undefined, cityId: undefined, cityName: undefined });
            const pageC = getPage(countries, cPage);
            const tp = totalPages(countries);
            let msg = `🌍 Countries (Page ${cPage}/${tp}):\n\n`;
            pageC.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
            if (cPage < tp) msg += `\n9️⃣  ➡️  Next page`;
            msg += `\n0️⃣  Back`;
            return await sendText(psid, msg);
        }
    });
}

// ── BUY PROVIDER ──────────────────────────────────────────────────────────────

async function handleBuyProvider(user, psid, input) {
    return await paginatedStep(user, psid, input, {
        stateKey: 'BUY_PROVIDER', pageKey: 'providerPage',
        items: user.stateData.providers || [],
        labelFn: p => p.service_provider_name,
        stepTitle: '📡 Providers',
        onSelect: async (provider, page) => {
            try {
                const allParents = await proxyApi.getParents(user.stateData.pkgId, 0, null, provider.id);
                const parents = allParents.filter(p => p.is_available && p.status === 'ACTIVE');
                if (!parents || parents.length === 0) return await sendText(psid, `❌ No available nodes for ${provider.service_provider_name}. Choose another.`);
                const tp = totalPages(parents);
                await userService.setState(user, 'BUY_PARENT', {
                    ...user.stateData,
                    serviceProviderCityId: provider.id, providerName: provider.service_provider_name,
                    providerPage: page, parents, parentPage: 1
                });
                const pageP = getPage(parents, 1);
                let msg = `🖥️ BUY A PROXY — Step 7\n\n🎯 Choose a NODE (Page 1/${tp}):\n\n`;
                pageP.forEach((p, i) => {
                    msg += `${i + 1}️⃣  ${formatParentLabel(p)}\n`;
                });
                if (tp > 1) msg += `\n9️⃣  ➡️  Next page`;
                msg += `\n0️⃣  Back`;
                return await sendText(psid, msg);
            } catch (err) {
                console.error('getParents error:', err.message);
                return await sendText(psid, '❌ Error loading nodes.');
            }
        },
        onBack: async () => {
            const cities = user.stateData.cities || [];
            const cPage = user.stateData.cityPage || 1;
            await userService.setState(user, 'BUY_CITY', { ...user.stateData, providers: undefined, providerPage: undefined, providerId: undefined, providerName: undefined });
            const pageC = getPage(cities, cPage);
            const tp = totalPages(cities);
            let msg = `🏙️ Cities (Page ${cPage}/${tp}):\n\n`;
            pageC.forEach((c, i) => msg += `${i + 1}️⃣  ${c.city_name}\n`);
            if (cPage < tp) msg += `\n9️⃣  ➡️  Next page`;
            msg += `\n0️⃣  Back`;
            return await sendText(psid, msg);
        }
    });
}

// ── BUY PARENT ────────────────────────────────────────────────────────────────

async function handleBuyParent(user, psid, input) {
    return await paginatedStep(user, psid, input, {
        stateKey: 'BUY_PARENT', pageKey: 'parentPage',
        items: user.stateData.parents || [],
        labelFn: formatParentLabel,   // null-safe helper
        stepTitle: '🖥️ Nodes',
        onSelect: async (parent, page) => {
            // Protocol was already chosen at step 2 — go straight to credentials
            const sd = user.stateData;
            const port = sd.protocol === 'socks5'
                ? (parent.socks_port || parent.http_port || '?')
                : (parent.http_port  || '?');

            await userService.setState(user, 'BUY_CREDENTIALS', {
                ...sd,
                parentId: parent.id,
                parentTech: parent.technology || 'N/A',
                httpPort: parent.http_port, socksPort: parent.socks_port,
                parentPort: port, parentPage: page
            });
            await sendText(psid,
                `🔐 BUY A PROXY — Step 7\n\n` +
                `Set YOUR PROXY credentials:\n\n` +
                `📝 Format: username password\n` +
                `   Example: myuser mypass123\n\n` +
                `⚠️ Rules: lowercase letters, digits, _ and - only\n` +
                `   Min 3 characters each\n\n` +
                `(0 = Back)`
            );
        },
        onBack: async () => {
            const providers = user.stateData.providers || [];
            const pPage = user.stateData.providerPage || 1;
            await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, parents: undefined, parentPage: undefined });
            const pageP = getPage(providers, pPage);
            const tp = totalPages(providers);
            let msg = `📡 Providers (Page ${pPage}/${tp}):\n\n`;
            pageP.forEach((p, i) => msg += `${i + 1}️⃣  ${p.service_provider_name}\n`);
            if (pPage < tp) msg += `\n9️⃣  ➡️  Next page`;
            msg += `\n0️⃣  Back`;
            return await sendText(psid, msg);
        }
    });
}

// ── BUY PROTO ─────────────────────────────────────────────────────────────────
// Now step 2: PKG → PROTO → DURATION → COUNTRY → ... → PARENT → CREDENTIALS

function formatDurationLabel(p) {
    // Translate French labels from reseller server + handle missing label
    if (!p) return 'N/A';
    if (p.label) {
        const fr = { '2 heures': '2 hours', '12 heures': '12 hours', '1 jour': '1 day',
                     '3 jours': '3 days', '7 jours': '7 days', '15 jours': '15 days',
                     '30 jours': '30 days', '2 jours': '2 days', '2 days': '2 days',
                     '1 day': '1 day', '7 days': '7 days', '30 days': '30 days' };
        return fr[p.label] || p.label;
    }
    // Fallback: compute from duration float
    if (p.duration < 1) return `${Math.round(p.duration * 100)}h`;
    return `${p.duration} day${p.duration > 1 ? 's' : ''}`;
}

function formatParentLabel(p) {
    const tech     = p.technology     || 'N/A';
    const rotation = p.rotation_time  != null ? `${p.rotation_time}min` : 'N/A';
    const usage    = p.usage === -1 || p.usage == null ? 'N/A' : `${p.usage}%`;
    return `${tech} | Usage: ${usage} | Rotation: ${rotation}`;
}

async function handleBuyProto(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type 1 (HTTP) or 2 (SOCKS5)');

    // Back = return to package selection
    if (input.value === 0) {
        const { packages, prices } = user.stateData;
        await userService.setState(user, 'BUY_PKG', { packages, prices });
        let msg = `📦 Choose a PACKAGE:\n\n`;
        packages.forEach((p, i) => msg += `${i + 1}️⃣  ${p.name}\n`);
        msg += `\n(0 = Back)`;
        return await sendText(psid, msg);
    }
    if (![1, 2].includes(input.value)) return await sendText(psid, '❌ Type 1 (HTTP) or 2 (SOCKS5)');

    const protocol = input.value === 1 ? 'http' : 'socks5';

    // Forward = show duration list (step 3)
    const { pkgPrices } = user.stateData;
    await userService.setState(user, 'BUY_DURATION', { ...user.stateData, protocol });

    let msg = `⏱️ BUY A PROXY — Step 3\n\n🎯 Choose a DURATION:\n\n`;
    pkgPrices.forEach((p, i) => {
        const label = formatDurationLabel(p);
        const price = (typeof p.price === 'number') ? p.price.toFixed(2) : '?';
        msg += `${i + 1}️⃣  ${label.padEnd(12)} - $${price}\n`;
    });
    msg += `\n(0 = Back, 9 = Menu)`;
    return await sendText(psid, msg);
}

// ── BUY CREDENTIALS ───────────────────────────────────────────────────────────

async function handleBuyCredentials(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        // Back = return to node selection
        const parents = user.stateData.parents || [];
        const parentPage = user.stateData.parentPage || 1;
        await userService.setState(user, 'BUY_PARENT', { ...user.stateData, proxyUsername: undefined, proxyPassword: undefined });
        const pageP = getPage(parents, parentPage);
        const tp = totalPages(parents);
        let msg = `🖥️ Nodes (Page ${parentPage}/${tp}):\n\n`;
        pageP.forEach((p, i) => msg += `${i + 1}️⃣  ${formatParentLabel(p)}\n`);
        if (parentPage < tp) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    const parts = (rawMessage || '').trim().split(/\s+/);
    if (parts.length < 2) {
        return await sendText(psid, `❌ Type both username and password separated by a space.\n\nExample: myuser mypass123\n\n(0 = Back)`);
    }
    const [username, password] = parts;
    if (!CRED_PATTERN.test(username) || !CRED_PATTERN.test(password)) {
        return await sendText(psid, `❌ Invalid characters!\n⚠️ Only: lowercase letters, digits, _ and -\n\nTry again (or 0 to go back):`);
    }
    if (username.length < 3 || password.length < 3) {
        return await sendText(psid, `❌ Must be at least 3 characters each.\n\nTry again (or 0 to go back):`);
    }

    const sd = user.stateData;
    await userService.setState(user, 'BUY_CONFIRM', { ...sd, proxyUsername: username, proxyPassword: password });

    const hasBalance = (user.balance || 0) >= sd.price;
    await sendText(psid,
        `✅ ORDER SUMMARY\n\n` +
        `📦 Package:   ${sd.pkgName}\n` +
        `⏱️  Duration:  ${sd.durationLabel}\n` +
        `🌍 Country:   ${sd.countryName}\n` +
        `🏙️  City:      ${sd.cityName}\n` +
        `📡 Provider:  ${sd.providerName}\n` +
        `🖥️  Node:      ${sd.parentTech}\n` +
        `📡 Protocol:  ${sd.protocol.toUpperCase()}\n` +
        `👤 Username:  ${username}\n` +
        `🔑 Password:  ${password}\n` +
        `💰 Price:     $${sd.price.toFixed(2)}\n` +
        `💳 Balance:   $${(user.balance || 0).toFixed(2)}\n\n` +
        (hasBalance
            ? `1️⃣  ✅ CONFIRM & BUY\n0️⃣  ❌ Cancel`
            : `❌ Insufficient balance!\nRequired: $${sd.price.toFixed(2)}\nYours: $${(user.balance || 0).toFixed(2)}\n\n4️⃣  💰 Top-up balance\n5️⃣  💬 Contact support\n0️⃣  Cancel`)
    );
}

// ── BUY CONFIRM ───────────────────────────────────────────────────────────────

async function handleBuyConfirm(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type 1 to confirm or 0 to cancel');
    if (input.value === 0) { await userService.setState(user, 'MAIN_MENU'); return await showMainMenu(psid); }
    if (input.value === 4) {
        return await handleTopUpStart(user, psid);
    }
    if (input.value === 5) {
        await userService.setState(user, 'SUPPORT');
        return await sendText(psid,
            `💬 CONTACT SUPPORT\n\nType your message and our team will reply shortly.\n\n(0 = Back)`
        );
    }
    if (input.value !== 1) return await sendText(psid, '❌ Type 1 to confirm or 0 to cancel');

    const sd = user.stateData;

    // Deduct balance LOCALLY first (before calling API)
    const deducted = await userService.deductBalance(user, sd.price);
    if (!deducted) {
        return await sendText(psid,
            `❌ Insufficient balance!\nRequired: $${sd.price.toFixed(2)}\nYours: $${(user.balance || 0).toFixed(2)}\n\n4️⃣  💰 Top-up balance\n5️⃣  💬 Contact support\n0️⃣  Cancel`
        );
    }

    try {
        await sendText(psid, '⏳ Processing your order...');

        // Call API with the RESELLER token (single account)
        const result = await proxyApi.buyProxy({
            parentProxyId: sd.parentId,
            packageId:     sd.pkgId,
            protocol:      sd.protocol,
            duration:      sd.duration,
            username:      sd.proxyUsername,
            password:      sd.proxyPassword
        });

        if (!result || !result.success) {
            // Refund if API failed
            await userService.addBalance(user._id, sd.price);
            const errMsg = result?.error || 'Unknown error';
            return await sendText(psid, `❌ Purchase failed: ${errMsg}\n\nYour balance has been refunded.\n\nPlease contact support.\n(9 = Menu)`);
        }

        const proxy = result.proxy;

        // Save proxy to local DB
        await proxyService.saveProxy(user._id, user.psid, {
            apiProxyId: proxy.id,
            ip:         proxy.ip_addr,
            http_port:  proxy.port,
            socks_port: proxy.port,
            username:   proxy.username,
            password:   proxy.password,
            country:    proxy.country_name || sd.countryName,
            city:       proxy.city_name    || sd.cityName,
            protocol:   proxy.type         || sd.protocol,
            package:    sd.pkgName,
            expiresAt:  proxy.expire_at ? new Date(proxy.expire_at) : null
        });

        await userService.setState(user, 'MAIN_MENU');

        await sendText(psid,
            `🎉 PURCHASE SUCCESSFUL!\n\n` +
            `🌐 Host:     ${proxy.ip_addr}\n` +
            `🔌 Port:     ${proxy.port}\n` +
            `👤 Username: ${proxy.username}\n` +
            `🔑 Password: ${proxy.password}\n` +
            `📡 Protocol: ${proxy.type}\n` +
            `🌍 Location: ${proxy.country_name}, ${proxy.city_name}\n` +
            `📡 Provider: ${proxy.service_provider}\n` +
            `⏱️  Expires:  ${proxy.expire_at || 'N/A'}\n` +
            `💳 Balance:  $${user.balance.toFixed(2)}\n\n` +
            `✅ Proxy is ready to use!\n(9 = Menu)`
        );
    } catch (err) {
        // Refund on any exception
        await userService.addBalance(user._id, sd.price);
        const errMsg = err.response?.data?.error || err.message;
        console.error('buyProxy error:', errMsg);
        await sendText(psid, `❌ Purchase error: ${errMsg}\n\nYour balance has been refunded.\n\nContact support if the issue persists.\n(9 = Menu)`);
        await userService.setState(user, 'MAIN_MENU');
    }
}

// ── TOP-UP ────────────────────────────────────────────────────────────────────

async function handleTopUpStart(user, psid) {
    const paymentInfo = process.env.PAYMENT_INFO ||
        'Choose payment method:\n'
        + '💳 Binance - Recharge ID: 909914646\n'
        + '💳 Bkash - Recharge Number: 01567906551\n'
        + '💳 Nogod - Recharge Number: 01567906551\n'
        + '💳 Rocket - Recharge Number: 01567906551';

    await userService.setState(user, 'TOPUP');
    return await sendText(psid,
        `💰 TOP-UP BALANCE\n\n` +
        `${paymentInfo}\n\n` +
        `──────────────────────\n` +
        `After sending the payment, reply here with:\n` +
        `• Amount paid\n` +
        `• Transaction ID / reference\n\n` +
        `Your balance will be credited by an admin.\n\n` +
        `(0 = Back, 9 = Menu)`
    );
}

async function handleTopUp(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    const msg = (rawMessage || '').trim();
    if (msg.length < 3) return await sendText(psid, '❌ Message too short. Please include the amount and transaction ID.\n\n(0 = Back)');
    try {
        // Try to parse amount from message (e.g. "1$", "$1", "1.5")
        const amountMatch = msg.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*\$?/);
        const parsedAmount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0.01;
        const amount = parsedAmount > 0 ? parsedAmount : 0.01;
        await TopUpRequest.create({ userId: user._id, psid, email: user.email, amount, notes: msg });
        await sendText(psid,
            `✅ TOP-UP REQUEST SENT!\n\n` +
            `👨‍💼 An admin will verify your payment and credit your balance shortly.\n\n` +
            `(9 = Menu)`
        );
        await userService.setState(user, 'MAIN_MENU');
    } catch {
        await sendText(psid, '❌ Error sending request. Please try again.');
    }
}

// ── SUPPORT ───────────────────────────────────────────────────────────────────

async function handleSupport(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    const msg = (rawMessage || '').trim();
    if (msg.length < 3) return await sendText(psid, '❌ Message too short (min 3 chars).\n\n(0 = Back):');
    try {
        await SupportMessage.create({ userId: user._id, psid, email: user.email, message: msg });
        await sendText(psid, `✅ Message sent!\n\n👨‍💼 Our team will reply shortly.\n(9 = Menu)`);
        await userService.setState(user, 'MAIN_MENU');
    } catch {
        await sendText(psid, '❌ Error sending message. Please try again.');
    }
}


// ── MY PROXIES ────────────────────────────────────────────────────────────────

async function showMyProxies(user, psid) {
    const actives = await userService.getActiveProxies(user._id);
    const expired = await userService.getExpiredProxies(user._id);
    const all     = [...actives, ...expired];

    if (all.length === 0) {
        return await sendText(psid, `📦 MY PROXIES\n\nYou have no proxies yet.\n\n(9 = Menu)`);
    }

    await userService.setState(user, 'MANAGE_PROXY', { proxies: all.map(p => p._id.toString()) });

    let msg = `📦 MY PROXIES\n\nSelect a proxy to manage:\n\n`;
    all.forEach((p, i) => {
        const daysLeft = p.expiresAt ? Math.ceil((new Date(p.expiresAt) - Date.now()) / 86400000) : null;
        const status   = daysLeft !== null && daysLeft <= 0 ? '❌' : '✅';
        const pkg      = (p.package || '').includes('GOLDEN') || (p.package || '').includes('1') ? '🥇' : '🥈';
        msg += `${i + 1}️⃣  ${status} ${pkg} ${p.ip}:${p.port || p.httpPort || '—'}\n`;
        msg += `     📍 ${p.country || '—'} | ${daysLeft !== null && daysLeft > 0 ? daysLeft + 'd left' : 'Expired'}\n\n`;
    });
    msg += `(0 = Back, 9 = Menu)`;
    return await sendText(psid, msg);
}

async function handleManageProxy(user, psid, input) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    const { proxies } = user.stateData;
    if (!proxies) return await showMyProxies(user, psid);

    const idx = (input.value || 0) - 1;
    if (input.type !== 'number' || idx < 0 || idx >= proxies.length) {
        return await sendText(psid, `❌ Pick a number from 1 to ${proxies.length}:\n\n(0 = Back)`);
    }

    const Proxy = require('../models/Proxy');
    const proxy = await Proxy.findById(proxies[idx]);
    if (!proxy) return await sendText(psid, '❌ Proxy not found.\n\n(9 = Menu)');

    const daysLeft  = proxy.expiresAt ? Math.ceil((new Date(proxy.expiresAt) - Date.now()) / 86400000) : null;
    const isActive  = daysLeft !== null && daysLeft > 0;
    const isGolden  = (proxy.package || '').toUpperCase().includes('GOLDEN') || (proxy.package || '') === '1';

    await userService.setState(user, 'MANAGE_PROXY', {
        proxies,
        selectedProxyId: proxy._id.toString(),
        isGolden
    });

    let msg =
        `🔍 PROXY DETAILS\n\n` +
        `🌐 Host:     ${proxy.ip}:${proxy.port || proxy.httpPort || '—'}\n` +
        `👤 Username: ${proxy.username}\n` +
        `🔑 Password: ${proxy.password}\n` +
        `📡 Protocol: ${proxy.protocol}\n` +
        `📍 Location: ${proxy.country || '—'}, ${proxy.city || '—'}\n` +
        `📦 Package:  ${isGolden ? '🥇 Golden' : '🥈 Silver'}\n` +
        `⏱️  Status:   ${isActive ? '✅ Active — ' + daysLeft + ' day(s) left' : '❌ Expired'}\n\n`;

    // Handle action selection on second call (selectedProxyId already set)
    if (user.stateData.selectedProxyId && input.type === 'number' && input.value === 1 && isGolden && isActive) {
        await userService.setState(user, 'CHANGE_COUNTRY', { ...user.stateData });
        return await handleChangeCountry(user, psid, { type: 'text', value: null });
    }

    if (isGolden && isActive) {
        msg +=
            `What would you like to do?\n\n` +
            `1️⃣  🌍 Change country\n` +
            `0️⃣  ← Back to proxy list`;
    } else if (!isGolden) {
        msg +=
            `ℹ️  Silver proxies have a fixed country.\n` +
            `To get a different location, purchase a new proxy.\n\n` +
            `0️⃣  ← Back`;
    } else {
        msg += `0️⃣  ← Back`;
    }

    return await sendText(psid, msg);
}

// Golden: Change Country Flow
async function handleChangeCountry(user, psid, input) {
    if (input.type === 'number' && input.value === 0) {
        // Back to proxy detail
        await userService.setState(user, 'MANAGE_PROXY', { ...user.stateData, countries: undefined });
        const Proxy = require('../models/Proxy');
        const proxy = await Proxy.findById(user.stateData.selectedProxyId);
        if (!proxy) return await showMyProxies(user, psid);
        const isGolden = (proxy.package || '').toUpperCase().includes('GOLDEN');
        const daysLeft = proxy.expiresAt ? Math.ceil((new Date(proxy.expiresAt) - Date.now()) / 86400000) : null;
        const isActive = daysLeft !== null && daysLeft > 0;
        let msg =
            `🔍 PROXY DETAILS\n\n` +
            `🌐 ${proxy.ip}:${proxy.port || '—'}  📍 ${proxy.country || '—'}\n\n` +
            (isGolden && isActive
                ? `1️⃣  🌍 Change country\n0️⃣  ← Back`
                : `0️⃣  ← Back`);
        return await sendText(psid, msg);
    }

    const { countries, selectedProxyId } = user.stateData;

    // First call: load country list
    if (!countries) {
        try {
            await sendText(psid, '⏳ Loading countries...');
            const list = await proxyApi.getCountries('1'); // Golden = pkg 1
            if (!list || !list.length) return await sendText(psid, '❌ No countries available.\n\n(0 = Back)');

            await userService.setState(user, 'CHANGE_COUNTRY', { ...user.stateData, countries: list, countryPage: 1 });

            let msg = `🌍 CHANGE COUNTRY\n\nAvailable countries:\n\n`;
            list.slice(0, 10).forEach((c, i) => { msg += `${i + 1}️⃣  ${c.country_name}\n`; });
            if (list.length > 10) msg += `\n... and ${list.length - 10} more (type number)`;
            msg += `\n\n(0 = Back)`;
            return await sendText(psid, msg);
        } catch (err) {
            console.error('getCountries error:', err.message);
            return await sendText(psid, '❌ Error loading countries. Try again.\n\n(0 = Back)');
        }
    }

    // User picked a country number
    const idx = (input.value || 0) - 1;
    if (idx < 0 || idx >= countries.length) {
        return await sendText(psid, `❌ Pick a number from 1 to ${Math.min(countries.length, 10)}.`);
    }

    const country = countries[idx];

    // Load cities for this country
    try {
        await sendText(psid, `⏳ Loading cities in ${country.country_name}...`);
        const cities = await proxyApi.getCities(country.id, '1');

        if (!cities || !cities.length) {
            return await sendText(psid, `❌ No cities available in ${country.country_name}.\n\n(0 = Back)`);
        }

        await userService.setState(user, 'CHANGE_CITY', {
            ...user.stateData,
            selectedCountryId: country.id,
            selectedCountryName: country.country_name,
            cities
        });

        let msg = `🏙️  SELECT CITY in ${country.country_name}\n\n`;
        cities.slice(0, 10).forEach((c, i) => { msg += `${i + 1}️⃣  ${c.city_name}\n`; });
        msg += `\n(0 = Back)`;
        return await sendText(psid, msg);
    } catch (err) {
        return await sendText(psid, '❌ Error loading cities.\n\n(0 = Back)');
    }
}

async function handleChangeCity(user, psid, input) {
    if (input.type === 'number' && input.value === 0) {
        // Back to country list — reset to show countries again
        await userService.setState(user, 'CHANGE_COUNTRY', { ...user.stateData, cities: undefined, selectedCountryId: undefined });
        const { countries } = user.stateData;
        let msg = `🌍 CHANGE COUNTRY\n\nAvailable countries:\n\n`;
        (countries || []).slice(0, 10).forEach((c, i) => { msg += `${i + 1}️⃣  ${c.country_name}\n`; });
        msg += `\n\n(0 = Back)`;
        return await sendText(psid, msg);
    }

    const { cities, selectedCountryName, selectedProxyId } = user.stateData;
    const idx = (input.value || 0) - 1;
    if (!cities || idx < 0 || idx >= cities.length) {
        return await sendText(psid, `❌ Pick a number from 1 to ${(cities || []).length}.`);
    }

    const city = cities[idx];

    // Get available parents in this city
    try {
        await sendText(psid, `⏳ Finding proxy in ${city.city_name}...`);
        const parents = await proxyApi.getParents('1', 0, city.id);
        const available = parents.filter(p => p.is_available || p.status === 'active');

        if (!available.length) {
            return await sendText(psid, `❌ No proxy available in ${city.city_name}. Try another city.\n\n(0 = Back)`);
        }

        await userService.setState(user, 'CHANGE_PARENT', {
            ...user.stateData,
            selectedCityId: city.id,
            selectedCityName: city.city_name,
            parents: available
        });

        let msg = `📡 SELECT PROXY in ${city.city_name}\n\n`;
        available.slice(0, 8).forEach((p, i) => {
            msg += `${i + 1}️⃣  ${p.technology || 'N/A'} | Rotation: ${p.rotation_time != null ? p.rotation_time + 'min' : 'N/A'}\n`;
        });
        msg += `\n(0 = Back)`;
        return await sendText(psid, msg);
    } catch (err) {
        return await sendText(psid, '❌ Error loading proxies.\n\n(0 = Back)');
    }
}

async function handleChangeParent(user, psid, input) {
    if (input.type === 'number' && input.value === 0) {
        // Back to city selection
        await userService.setState(user, 'CHANGE_CITY', { ...user.stateData, parents: undefined, selectedCityId: undefined });
        const { cities, selectedCountryName } = user.stateData;
        let msg = `🏙️  SELECT CITY in ${selectedCountryName}\n\n`;
        (cities || []).slice(0, 10).forEach((c, i) => { msg += `${i + 1}️⃣  ${c.city_name}\n`; });
        msg += `\n(0 = Back)`;
        return await sendText(psid, msg);
    }

    const { parents, selectedProxyId, selectedCityName, selectedCountryName } = user.stateData;
    const idx = (input.value || 0) - 1;
    if (!parents || idx < 0 || idx >= parents.length) {
        return await sendText(psid, `❌ Pick a number from 1 to ${(parents || []).length}.`);
    }

    const parent = parents[idx];

    // Apply the country change — buy a new proxy with same credentials on the new parent
    const Proxy = require('../models/Proxy');
    const proxy = await Proxy.findById(selectedProxyId);
    if (!proxy) return await sendText(psid, '❌ Proxy not found.\n\n(9 = Menu)');

    try {
        await sendText(psid, '⏳ Changing country...');
        const result = await proxyApi.buyProxy({
            parentProxyId: parent.id,
            packageId:     '1',
            protocol:      proxy.protocol,
            duration:      proxy.duration,
            username:      proxy.username,
            password:      proxy.password
        });

        if (!result || !result.success) {
            return await sendText(psid,
                `❌ Country change failed: ${result?.error || 'Unknown error'}\n\n` +
                `Contact support if the issue persists.\n(9 = Menu)`
            );
        }

        const newProxy = result.proxy;

        // Update stored proxy with new IP / location
        proxy.ip      = newProxy.ip_addr || proxy.ip;
        proxy.port    = newProxy.port    || proxy.port;
        proxy.country = newProxy.country_name || selectedCountryName;
        proxy.city    = newProxy.city_name    || selectedCityName;
        proxy.updatedAt = new Date();
        await proxy.save();

        await userService.setState(user, 'MAIN_MENU');
        return await sendText(psid,
            `✅ COUNTRY CHANGED!\n\n` +
            `🌍 New location: ${proxy.country}, ${proxy.city}\n` +
            `🌐 New host: ${proxy.ip}:${proxy.port}\n` +
            `👤 Username: ${proxy.username}\n` +
            `🔑 Password: ${proxy.password}\n\n` +
            `(9 = Menu)`
        );
    } catch (err) {
        console.error('changeCountry error:', err.message);
        return await sendText(psid,
            `❌ Error changing country: ${err.response?.data?.error || err.message}\n\n` +
            `Contact support if the issue persists.\n(9 = Menu)`
        );
    }
}



module.exports = { handleMessage };
