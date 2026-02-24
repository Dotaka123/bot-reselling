const { sendText } = require('../utils/messenger');
const { parseInput, isValidEmail, isValidPassword } = require('../utils/validators');
const userService = require('../services/userService');
const proxyApiService = require('../services/proxyApiService');
const proxyService = require('../services/proxyService');
const SupportMessage = require('../models/SupportMessage');
const TopUpRequest = require('../models/TopUpRequest');
const crypto = require('crypto');

const PAGE_SIZE = 8;
const FACEBOOK_PAGE_URL = process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com/yourpage';

// ── BUY FLOW STATES that use "9" for pagination (must not be intercepted by global menu command)
const PAGINATED_STATES = ['BUY_COUNTRY', 'BUY_CITY', 'BUY_PROVIDER', 'BUY_PARENT'];

const DURATION_OPTIONS = [
    { label: '2 hours',   price: 0.30, duration: 2 },
    { label: '12 hours',  price: 0.60, duration: 12 },
    { label: '3 days',    price: 2.50, duration: 72 },
    { label: '7 days',    price: 4.50, duration: 168 },
    { label: '30 days',   price: 18.00, duration: 720 }
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function generateCaptcha() {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { a, b, answer: a + b };
}

function getPage(allItems, page) {
    const start = (page - 1) * PAGE_SIZE;
    return allItems.slice(start, start + PAGE_SIZE);
}

function totalPages(allItems) {
    return Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
}

function isCancelCommand(input) {
    if (!input) return false;
    const text = input.raw ? input.raw.toLowerCase().trim() : '';
    return text === 'cancel' || text === 'c' || text === '0' ||
           (input.type === 'number' && input.value === 0);
}

// BUG FIX: Only intercept "9" as main menu when NOT in paginated buy states
function isMainMenuCommand(input, userState) {
    if (PAGINATED_STATES.includes(userState)) return false;
    const text = input.raw ? input.raw.toLowerCase().trim() : '';
    return text === '9' || text === 'menu' || (input.type === 'number' && input.value === 9);
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

async function handleMessage(psid, messageText) {
    try {
        let user = await userService.getUserByPsid(psid);
        if (!user) {
            user = await userService.createUser(psid);
        }

        // 1. FACEBOOK PAGE SUBSCRIPTION GATE
        if (!user.isPageSubscriber && user.state !== 'FB_VERIFICATION') {
            await userService.setState(user, 'FB_VERIFICATION');
            await sendText(psid,
                `👋 Welcome to ProxyBot!\n\n` +
                `📌 Step 1: Subscribe to our page\n🔗 ${FACEBOOK_PAGE_URL}\n\n` +
                `📌 Step 2: Come back and type "done"\n\nℹ️ Type "cancel" or "0" to go back`
            );
            return;
        }

        const input = parseInput(messageText);

        // 2. GLOBAL CANCEL COMMAND
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

        // 3. GLOBAL MENU COMMAND (BUG FIX: not intercepted in paginated states)
        if (isMainMenuCommand(input, user.state) && user.isLoggedIn && user.state !== 'MAIN_MENU') {
            await userService.setState(user, 'MAIN_MENU');
            return await showMainMenu(psid);
        }

        // 4. ROUTE TO STATE HANDLERS
        try {
            switch (user.state) {
                case 'FB_VERIFICATION':    return await handleFBVerification(user, psid, input);
                case 'WELCOME':            return await handleWelcome(user, psid, input);
                case 'CAPTCHA_LOGIN':      return await handleCaptchaLogin(user, psid, input);
                case 'CAPTCHA_REGISTER':   return await handleCaptchaRegister(user, psid, input);
                case 'LOGIN_EMAIL':        return await handleLoginEmail(user, psid, input);
                case 'LOGIN_PASSWORD':     return await handleLoginPassword(user, psid, input, messageText);
                case 'REGISTER_EMAIL':     return await handleRegisterEmail(user, psid, input);
                case 'REGISTER_PASSWORD':  return await handleRegisterPassword(user, psid, input, messageText);
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
                    return await handleWelcome(user, psid, input);
            }
        } catch (err) {
            console.error(`Handler error [state=${user.state}]:`, err);
            await sendText(psid,
                `⚠️ An error occurred.\n\n` +
                `💡 Tips:\n• Type 0 to go back\n• Type 9 for main menu\n• Type CANCEL to restart`
            );
        }
    } catch (err) {
        console.error(`handleMessage fatal error:`, err);
        await sendText(psid, '❌ Server error. Please try again later.');
    }
}

// ── FACEBOOK VERIFICATION ─────────────────────────────────────────────────────

async function handleFBVerification(user, psid, input) {
    const text = (input && input.raw) ? input.raw.toLowerCase().trim() : '';
    if (text === 'done' || text === 'd') {
        user.isPageSubscriber = true;
        await user.save();
        await sendText(psid, '✅ Subscription verified! Welcome!');
        await userService.setState(user, 'WELCOME');
        return await handleWelcome(user, psid, input);
    }
    await sendText(psid,
        `⚠️ Please subscribe to our page first:\n\n🔗 ${FACEBOOK_PAGE_URL}\n\n` +
        `➡️ Then come back and type:\n"done"\n\nℹ️ Need help? Type "cancel"`
    );
}

// ── WELCOME ───────────────────────────────────────────────────────────────────

async function handleWelcome(user, psid, input) {
    if (!user.isLoggedIn) {
        if (input.type === 'number') {
            if (input.value === 1) {
                const nc = generateCaptcha();
                await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
                return await sendText(psid,
                    `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Type the result:\n(or 0 to go back)`
                );
            }
            if (input.value === 2) {
                const nc = generateCaptcha();
                await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
                return await sendText(psid,
                    `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Type the result:\n(or 0 to go back)`
                );
            }
        }
        await sendText(psid,
            `👋 WELCOME TO PROXYBOT!\n\n` +
            `📋 MAIN MENU\n\n` +
            `1️⃣  🔓 LOGIN\n` +
            `2️⃣  📝 CREATE ACCOUNT\n\n` +
            `💡 Type 1 or 2\n(0 = Back, CANCEL = Restart)`
        );
    } else {
        await userService.setState(user, 'MAIN_MENU');
        await showMainMenu(psid);
    }
}

// ── MAIN MENU ─────────────────────────────────────────────────────────────────

async function showMainMenu(psid) {
    await sendText(psid,
        `📋 MAIN MENU\n\n` +
        `1️⃣  🛒 Buy a proxy\n` +
        `2️⃣  👤 My profile\n` +
        `3️⃣  💳 Top up balance\n` +
        `4️⃣  💬 Support\n` +
        `5️⃣  🚪 Logout\n\n` +
        `💡 Type 1–5\n(0 = Back, 9 = Menu, CANCEL = Restart)`
    );
}

async function handleMainMenu(user, psid, input) {
    if (input.type !== 'number') return await showMainMenu(psid);

    switch (input.value) {
        case 1:
            await userService.setState(user, 'BUY_PKG');
            return await sendText(psid,
                `📦 BUY A PROXY — Step 1/7\n\n🎯 Choose a PACKAGE:\n\n1️⃣  🥇 Golden (Premium)\n2️⃣  🥈 Silver (Standard)\n\n(0 = Back, 9 = Menu)`
            );

        case 2: {
            const profile = await userService.getUserProfile(user._id);
            if (!profile) return await sendText(psid, '❌ Error loading profile.');
            let msg = `👤 MY PROFILE\n\n`;
            msg += `📧 Email: ${user.email}\n`;
            msg += `💳 Balance: $${(user.balance || 0).toFixed(2)}\n\n`;
            msg += `✅ Active proxies: ${profile.activeProxies.length}\n`;
            msg += `❌ Expired proxies: ${profile.expiredProxies.length}\n`;
            if (profile.activeProxies.length > 0) {
                msg += `\n🌐 Active proxies:\n`;
                profile.activeProxies.slice(0, 3).forEach((p, i) => {
                    msg += `${i + 1}. ${p.ip}:${p.httpPort} (${p.country})\n`;
                });
                if (profile.activeProxies.length > 3) {
                    msg += `... and ${profile.activeProxies.length - 3} more\n`;
                }
            }
            msg += `\n(0 = Back, 9 = Menu)`;
            return await sendText(psid, msg);
        }

        case 3:
            await userService.setState(user, 'TOPUP');
            return await sendText(psid,
                `💳 TOP UP BALANCE\n\n` +
                `Current balance: $${(user.balance || 0).toFixed(2)}\n\n` +
                `📲 PAYMENT METHODS:\n\n` +
                `🔸 Binance\n   ID: 909914646\n\n` +
                `🔸 Bkash\n   Number: 01567906551\n\n` +
                `🔸 Nagad\n   Number: 01567906551\n\n` +
                `➡️ Type the amount (e.g. 50)\n(0 = Back)`
            );

        case 4:
            await userService.setState(user, 'SUPPORT');
            return await sendText(psid,
                `💬 CUSTOMER SUPPORT\n\n📝 Describe your issue:\n\n💡 Minimum 3 characters\n(0 = Back, 9 = Menu)`
            );

        case 5:
            user.isLoggedIn = false;
            await user.save();
            await userService.setState(user, 'WELCOME');
            return await sendText(psid, `🚪 LOGGED OUT!\n\n👋 See you soon!\n\n💡 Type anything to log back in.`);

        default:
            return await showMainMenu(psid);
    }
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

async function handleCaptchaLogin(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha?.answer) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
        return await sendText(psid,
            `❌ Wrong answer.\n\n🤖 New attempt:\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Type the result (or 0 to go back)`
        );
    }
    await userService.setState(user, 'LOGIN_EMAIL');
    await sendText(psid,
        `📧 LOGIN — Step 1/2\n\n✉️ Enter your EMAIL:\n\n💡 Format: user@email.com\n(0 = Back, 2 = Create account, CANCEL = Restart)`
    );
}

async function handleLoginEmail(user, psid, input) {
    if (input.type === 'number' && input.value === 2) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
        return await sendText(psid,
            `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Type the result:\n(or 0 to go back)`
        );
    }

    const email = input.raw ? input.raw.trim() : '';
    if (!isValidEmail(email)) {
        return await sendText(psid, `❌ Invalid email!\n\n📝 Expected format: user@email.com\n\n📧 Try again (or 0 to go back):`);
    }

    const existing = await userService.getUserByEmail(email);
    if (!existing) {
        return await sendText(psid,
            `❌ Account not found!\n\n💡 Options:\n• Type 2 to CREATE an account\n• Type 0 to go BACK\n• Type CANCEL to RESTART`
        );
    }

    await userService.setState(user, 'LOGIN_PASSWORD', { email });
    await sendText(psid, `🔑 LOGIN — Step 2/2\n\n🔒 Enter your PASSWORD:\n\n(0 = Back)`);
}

async function handleLoginPassword(user, psid, input, rawMessage) {
    const { email } = user.stateData;
    const existingUser = await userService.getUserByEmail(email);
    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');

    if (!existingUser || existingUser.passwordHash !== hash) {
        await userService.setState(user, 'LOGIN_EMAIL', { email });
        return await sendText(psid,
            `❌ Incorrect email or password!\n\n📝 Try again or:\n• Type 0 to go BACK\n• Type 2 to CREATE an account\n• Type CANCEL to RESTART\n\n📧 Email:`
        );
    }

    user.isLoggedIn = true;
    user.email = email;
    await user.save();
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, `✅ LOGIN SUCCESSFUL!\n\n📧 ${email}\n\n👋 Welcome back!`);
    await showMainMenu(psid);
}

// ── REGISTER ──────────────────────────────────────────────────────────────────

async function handleCaptchaRegister(user, psid, input) {
    if (input.type !== 'number' || input.value !== user.stateData.captcha?.answer) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
        return await sendText(psid,
            `❌ Wrong answer.\n\n🤖 New attempt:\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Type the result (or 0 to go back)`
        );
    }
    await userService.setState(user, 'REGISTER_EMAIL');
    await sendText(psid,
        `📧 CREATE ACCOUNT — Step 1/2\n\n✉️ Enter an EMAIL:\n\n💡 Format: user@email.com\n(0 = Back, 1 = Login, CANCEL = Restart)`
    );
}

async function handleRegisterEmail(user, psid, input) {
    if (input.type === 'number' && input.value === 1) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
        return await sendText(psid,
            `🤖 ANTI-BOT CHECK\n\n➕ ${nc.a} + ${nc.b} = ?\n\n➡️ Type the result:\n(or 0 to go back)`
        );
    }

    const email = input.raw ? input.raw.trim() : '';
    if (!isValidEmail(email)) {
        return await sendText(psid, `❌ Invalid email!\n\n📝 Expected format: user@email.com\n\n📧 Try again (or 0 to go back):`);
    }

    const existing = await userService.getUserByEmail(email);
    if (existing) {
        return await sendText(psid,
            `❌ Email already in use!\n\n💡 Options:\n• Type 1 to LOGIN\n• Type 0 to go BACK\n• Type CANCEL to RESTART`
        );
    }

    await userService.setState(user, 'REGISTER_PASSWORD', { email });
    await sendText(psid, `🔑 CREATE ACCOUNT — Step 2/2\n\n🔒 Choose a PASSWORD:\n\n📋 Minimum 6 characters\n(0 = Back)`);
}

async function handleRegisterPassword(user, psid, input, rawMessage) {
    if (!isValidPassword(rawMessage)) {
        return await sendText(psid,
            `❌ Password too short!\n\n📋 Minimum: 6 characters\n\n🔒 Try again (or 0 to go back):`
        );
    }

    const hash = crypto.createHash('sha256').update(rawMessage).digest('hex');
    const email = user.stateData.email;

    // BUG FIX: Update the existing user record instead of creating a duplicate
    const saved = await userService.setUserCredentials(user, email, hash);
    if (!saved) {
        return await sendText(psid, '❌ Error creating account.\n\n💡 Try again or type CANCEL');
    }

    await sendText(psid, `✅ ACCOUNT CREATED!\n\n📧 ${email}\n\n👋 Welcome!`);
    await showMainMenu(psid);
}

// ── BUY FLOW ──────────────────────────────────────────────────────────────────

async function handleBuyPkg(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type 1 or 2 (or 0 to go back)');
    if (input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }
    if (![1, 2].includes(input.value)) return await sendText(psid, '❌ Invalid choice (1, 2 or 0)');

    const pkgName = input.value === 1 ? 'Golden' : 'Silver';
    await userService.setState(user, 'BUY_PROTO', { pkgId: input.value, pkgName });
    await sendText(psid,
        `📡 BUY A PROXY — Step 2/7\n\n🎯 Choose a PROTOCOL:\n\n1️⃣  HTTP/HTTPS\n2️⃣  SOCKS5\n\n(0 = Back, 9 = Menu)`
    );
}

async function handleBuyProto(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type 1 or 2');
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PKG');
        return await sendText(psid, `📦 Package:\n\n1️⃣  Golden\n2️⃣  Silver\n\n(0 = Back)`);
    }
    if (![1, 2].includes(input.value)) return await sendText(psid, '❌ Invalid choice');

    const proto = input.value === 1 ? 'http' : 'socks5';
    await userService.setState(user, 'BUY_DURATION', { ...user.stateData, proto });

    let msg = `⏱️ BUY A PROXY — Step 3/7\n\n🎯 Choose a DURATION:\n\n`;
    DURATION_OPTIONS.forEach((o, i) => {
        msg += `${i + 1}️⃣  ${o.label.padEnd(12)} - $${o.price.toFixed(2)}\n`;
    });
    msg += `\n(0 = Back, 9 = Menu)`;
    await sendText(psid, msg);
}

async function handleBuyDuration(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');
    if (input.value === 0) {
        await userService.setState(user, 'BUY_PROTO', { pkgId: user.stateData.pkgId, pkgName: user.stateData.pkgName });
        return await sendText(psid, `📡 Protocol:\n\n1️⃣  HTTP\n2️⃣  SOCKS5\n\n(0 = Back)`);
    }

    const sel = DURATION_OPTIONS[input.value - 1];
    if (!sel) return await sendText(psid, '❌ Invalid choice. Type 1–5:');

    try {
        const countries = await proxyApiService.getCountries();
        if (!countries || countries.length === 0) {
            await sendText(psid, '❌ Error loading countries.');
            return;
        }
        const tp = totalPages(countries);
        const pageCountries = getPage(countries, 1);

        await userService.setState(user, 'BUY_COUNTRY', {
            ...user.stateData,
            duration: sel.duration,
            price: sel.price,
            durationLabel: sel.label,
            countryPage: 1,
            countries // cache to avoid re-fetching on every page turn
        });

        let msg = `🌍 BUY A PROXY — Step 4/7\n\n🎯 Choose a COUNTRY (Page 1/${tp}):\n\n`;
        pageCountries.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
        if (tp > 1) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyDuration:', err);
        await sendText(psid, '❌ Error. Please try again.');
    }
}

async function handleBuyCountry(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');

    const countries = user.stateData.countries || await proxyApiService.getCountries();
    let page = user.stateData.countryPage || 1;
    const tp = totalPages(countries);

    if (input.value === 0) {
        await userService.setState(user, 'BUY_DURATION', {
            pkgId: user.stateData.pkgId, pkgName: user.stateData.pkgName, proto: user.stateData.proto
        });
        let msg = `⏱️ Duration:\n\n`;
        DURATION_OPTIONS.forEach((o, i) => msg += `${i + 1}️⃣  ${o.label} - $${o.price.toFixed(2)}\n`);
        msg += `\n(0 = Back)`;
        return await sendText(psid, msg);
    }

    // "9" = next page (not intercepted globally when in BUY_COUNTRY)
    if (input.value === 9) {
        if (page < tp) page++;
        await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, countryPage: page, countries });
        const pageCountries = getPage(countries, page);
        let msg = `🌍 Countries (Page ${page}/${tp}):\n\n`;
        pageCountries.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    // "8" = prev page
    if (input.value === 8) {
        if (page > 1) page--;
        await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, countryPage: page, countries });
        const pageCountries = getPage(countries, page);
        let msg = `🌍 Countries (Page ${page}/${tp}):\n\n`;
        pageCountries.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    const pageCountries = getPage(countries, page);
    const idx = input.value - 1;
    if (idx < 0 || idx >= pageCountries.length) {
        return await sendText(psid, `❌ Invalid choice. Type 1–${pageCountries.length}:`);
    }

    const country = pageCountries[idx];
    try {
        const cities = await proxyApiService.getCities(country.country_code);
        if (!cities || cities.length === 0) {
            return await sendText(psid, `❌ No cities available for ${country.country_name}. Please choose another country.`);
        }
        const cityTp = totalPages(cities);
        const pageCities = getPage(cities, 1);

        await userService.setState(user, 'BUY_CITY', {
            ...user.stateData,
            countryId: country.country_code,
            countryName: country.country_name,
            cities,
            cityPage: 1
        });

        let msg = `🏙️ BUY A PROXY — Step 5/7\n\n🎯 Choose a CITY (Page 1/${cityTp}):\n\n`;
        pageCities.forEach((c, i) => msg += `${i + 1}️⃣  ${c.city_name}\n`);
        if (cityTp > 1) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyCountry:', err);
        await sendText(psid, '❌ Error loading cities. Please try again.');
    }
}

async function handleBuyCity(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');

    const cities = user.stateData.cities || [];
    let page = user.stateData.cityPage || 1;
    const tp = totalPages(cities);

    if (input.value === 0) {
        // Go back to country selection
        const countries = user.stateData.countries || await proxyApiService.getCountries();
        const countryPage = user.stateData.countryPage || 1;
        await userService.setState(user, 'BUY_COUNTRY', {
            ...user.stateData,
            countries,
            countryPage,
            cities: undefined,
            cityPage: undefined,
            countryId: undefined,
            countryName: undefined
        });
        const pageCountries = getPage(countries, countryPage);
        const cTp = totalPages(countries);
        let msg = `🌍 Countries (Page ${countryPage}/${cTp}):\n\n`;
        pageCountries.forEach((c, i) => msg += `${i + 1}️⃣  ${c.country_name}\n`);
        if (countryPage < cTp) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    if (input.value === 9) {
        if (page < tp) page++;
        await userService.setState(user, 'BUY_CITY', { ...user.stateData, cityPage: page });
        const pageCities = getPage(cities, page);
        let msg = `🏙️ Cities (Page ${page}/${tp}):\n\n`;
        pageCities.forEach((c, i) => msg += `${i + 1}️⃣  ${c.city_name}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    if (input.value === 8) {
        if (page > 1) page--;
        await userService.setState(user, 'BUY_CITY', { ...user.stateData, cityPage: page });
        const pageCities = getPage(cities, page);
        let msg = `🏙️ Cities (Page ${page}/${tp}):\n\n`;
        pageCities.forEach((c, i) => msg += `${i + 1}️⃣  ${c.city_name}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    const pageCities = getPage(cities, page);
    const idx = input.value - 1;
    if (idx < 0 || idx >= pageCities.length) {
        return await sendText(psid, `❌ Invalid choice. Type 1–${pageCities.length}:`);
    }

    const city = pageCities[idx];
    try {
        const providers = await proxyApiService.getProviders(user.stateData.countryId, city.city_code);
        if (!providers || providers.length === 0) {
            return await sendText(psid, `❌ No providers available for ${city.city_name}. Please choose another city.`);
        }
        const pTp = totalPages(providers);
        const pageProviders = getPage(providers, 1);

        await userService.setState(user, 'BUY_PROVIDER', {
            ...user.stateData,
            cityId: city.city_code,
            cityName: city.city_name,
            providers,
            providerPage: 1
        });

        let msg = `📡 BUY A PROXY — Step 6/7\n\n🎯 Choose a PROVIDER (Page 1/${pTp}):\n\n`;
        pageProviders.forEach((p, i) => msg += `${i + 1}️⃣  ${p.service_provider_name}\n`);
        if (pTp > 1) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyCity:', err);
        await sendText(psid, '❌ Error loading providers. Please try again.');
    }
}

async function handleBuyProvider(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');

    const providers = user.stateData.providers || [];
    let page = user.stateData.providerPage || 1;
    const tp = totalPages(providers);

    if (input.value === 0) {
        // Back to city selection
        const cities = user.stateData.cities || [];
        const cityPage = user.stateData.cityPage || 1;
        await userService.setState(user, 'BUY_CITY', {
            ...user.stateData,
            providers: undefined,
            providerPage: undefined,
            providerId: undefined,
            providerName: undefined
        });
        const pageCities = getPage(cities, cityPage);
        const cTp = totalPages(cities);
        let msg = `🏙️ Cities (Page ${cityPage}/${cTp}):\n\n`;
        pageCities.forEach((c, i) => msg += `${i + 1}️⃣  ${c.city_name}\n`);
        if (cityPage < cTp) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    if (input.value === 9) {
        if (page < tp) page++;
        await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, providerPage: page });
        const pageProviders = getPage(providers, page);
        let msg = `📡 Providers (Page ${page}/${tp}):\n\n`;
        pageProviders.forEach((p, i) => msg += `${i + 1}️⃣  ${p.service_provider_name}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    if (input.value === 8) {
        if (page > 1) page--;
        await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, providerPage: page });
        const pageProviders = getPage(providers, page);
        let msg = `📡 Providers (Page ${page}/${tp}):\n\n`;
        pageProviders.forEach((p, i) => msg += `${i + 1}️⃣  ${p.service_provider_name}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    const pageProviders = getPage(providers, page);
    const idx = input.value - 1;
    if (idx < 0 || idx >= pageProviders.length) {
        return await sendText(psid, `❌ Invalid choice. Type 1–${pageProviders.length}:`);
    }

    const provider = pageProviders[idx];
    try {
        const parents = await proxyApiService.getParents(
            user.stateData.countryId,
            user.stateData.cityId,
            provider.service_provider_id
        );
        if (!parents || parents.length === 0) {
            return await sendText(psid, `❌ No proxies available for this provider. Please choose another.`);
        }
        const pTp = totalPages(parents);
        const pageParents = getPage(parents, 1);

        await userService.setState(user, 'BUY_PARENT', {
            ...user.stateData,
            providerId: provider.service_provider_id,
            providerName: provider.service_provider_name,
            parents,
            parentPage: 1
        });

        let msg = `🖥️ BUY A PROXY — Step 7/7\n\n🎯 Choose a PROXY NODE (Page 1/${pTp}):\n\n`;
        pageParents.forEach((p, i) => {
            msg += `${i + 1}️⃣  ${p.ip} | ${p.technology}\n`;
        });
        if (pTp > 1) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        await sendText(psid, msg);
    } catch (err) {
        console.error('Error in handleBuyProvider:', err);
        await sendText(psid, '❌ Error loading proxy nodes. Please try again.');
    }
}

async function handleBuyParent(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type a number');

    const parents = user.stateData.parents || [];
    let page = user.stateData.parentPage || 1;
    const tp = totalPages(parents);

    if (input.value === 0) {
        // Back to provider selection
        const providers = user.stateData.providers || [];
        const providerPage = user.stateData.providerPage || 1;
        await userService.setState(user, 'BUY_PROVIDER', {
            ...user.stateData,
            parents: undefined,
            parentPage: undefined
        });
        const pageProviders = getPage(providers, providerPage);
        const pTp = totalPages(providers);
        let msg = `📡 Providers (Page ${providerPage}/${pTp}):\n\n`;
        pageProviders.forEach((p, i) => msg += `${i + 1}️⃣  ${p.service_provider_name}\n`);
        if (providerPage < pTp) msg += `\n9️⃣  ➡️  Next page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    if (input.value === 9) {
        if (page < tp) page++;
        await userService.setState(user, 'BUY_PARENT', { ...user.stateData, parentPage: page });
        const pageParents = getPage(parents, page);
        let msg = `🖥️ Proxy Nodes (Page ${page}/${tp}):\n\n`;
        pageParents.forEach((p, i) => msg += `${i + 1}️⃣  ${p.ip} | ${p.technology}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    if (input.value === 8) {
        if (page > 1) page--;
        await userService.setState(user, 'BUY_PARENT', { ...user.stateData, parentPage: page });
        const pageParents = getPage(parents, page);
        let msg = `🖥️ Proxy Nodes (Page ${page}/${tp}):\n\n`;
        pageParents.forEach((p, i) => msg += `${i + 1}️⃣  ${p.ip} | ${p.technology}\n`);
        if (page < tp) msg += `\n9️⃣  ➡️  Next page`;
        if (page > 1) msg += `\n8️⃣  ⬅️  Prev page`;
        msg += `\n0️⃣  Back`;
        return await sendText(psid, msg);
    }

    const pageParents = getPage(parents, page);
    const idx = input.value - 1;
    if (idx < 0 || idx >= pageParents.length) {
        return await sendText(psid, `❌ Invalid choice. Type 1–${pageParents.length}:`);
    }

    const parent = pageParents[idx];
    const sd = user.stateData;
    const proto = sd.proto || 'http';
    const port = proto === 'socks5' ? parent.socks_port : parent.http_port;

    await userService.setState(user, 'BUY_CONFIRM', {
        ...sd,
        parentId: parent.parent_proxy_id,
        parentIp: parent.ip,
        parentPort: port,
        parentTech: parent.technology
    });

    const msg =
        `✅ ORDER SUMMARY\n\n` +
        `📦 Package:   ${sd.pkgName}\n` +
        `📡 Protocol:  ${proto.toUpperCase()}\n` +
        `⏱️  Duration:  ${sd.durationLabel}\n` +
        `🌍 Country:   ${sd.countryName}\n` +
        `🏙️  City:      ${sd.cityName}\n` +
        `🖥️  Proxy:     ${parent.ip}:${port} (${parent.technology})\n` +
        `💰 Price:     $${(sd.price || 0).toFixed(2)}\n` +
        `💳 Balance:   $${(user.balance || 0).toFixed(2)}\n\n` +
        (user.balance >= sd.price
            ? `1️⃣  ✅ CONFIRM & BUY\n0️⃣  ❌ Cancel`
            : `❌ Insufficient balance!\nYour balance: $${(user.balance || 0).toFixed(2)}\nRequired: $${(sd.price || 0).toFixed(2)}\n\n3️⃣  💳 Top up\n0️⃣  Back`);

    await sendText(psid, msg);
}

async function handleBuyConfirm(user, psid, input) {
    if (input.type !== 'number') return await sendText(psid, '❌ Type 1 to confirm or 0 to cancel');

    if (input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }

    if (input.value === 3) {
        // Redirect to top up
        await userService.setState(user, 'TOPUP');
        return await sendText(psid,
            `💳 TOP UP BALANCE\n\nCurrent balance: $${(user.balance || 0).toFixed(2)}\n\n` +
            `📲 PAYMENT METHODS:\n🔸 Binance ID: 909914646\n🔸 Bkash: 01567906551\n\n` +
            `➡️ Type the amount (e.g. 50)\n(0 = Back)`
        );
    }

    if (input.value !== 1) return await sendText(psid, '❌ Type 1 to confirm or 0 to cancel');

    const sd = user.stateData;

    // Balance check
    if ((user.balance || 0) < sd.price) {
        return await sendText(psid,
            `❌ Insufficient balance!\nYour balance: $${(user.balance || 0).toFixed(2)}\nRequired: $${sd.price.toFixed(2)}\n\n3️⃣  💳 Top up\n0️⃣  Back`
        );
    }

    try {
        await sendText(psid, '⏳ Processing your order...');

        // Deduct balance
        const deducted = await userService.deductBalance(user._id, sd.price);
        if (!deducted) {
            return await sendText(psid, '❌ Payment failed. Please try again.');
        }

        // Purchase proxy via API
        const result = await proxyApiService.purchaseProxy({
            countryCode: sd.countryId,
            cityCode: sd.cityId,
            providerId: sd.providerId,
            parentId: sd.parentId,
            protocol: sd.proto,
            durationHours: sd.duration,
            package: sd.pkgName
        });

        if (!result || !result.success) {
            // Refund on failure
            await userService.addBalance(user._id, sd.price);
            return await sendText(psid, '❌ Purchase failed. Your balance has been refunded.');
        }

        const proxy = result.proxy;

        // Save proxy to database
        await proxyService.saveProxy(user._id, user.psid, {
            ip: proxy.ip,
            http_port: proxy.http_port,
            socks_port: proxy.socks_port,
            username: proxy.username,
            password: proxy.password,
            country: sd.countryName,
            city: sd.cityName,
            protocol: sd.proto,
            package: sd.pkgName,
            expiresAt: proxy.expiresAt
        });

        // Update local user balance
        user.balance = (user.balance || 0) - sd.price;

        await userService.setState(user, 'MAIN_MENU');

        const expiryStr = proxy.expiresAt
            ? new Date(proxy.expiresAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
            : 'N/A';

        await sendText(psid,
            `🎉 PURCHASE SUCCESSFUL!\n\n` +
            `🌐 IP:       ${proxy.ip}\n` +
            `🔌 Port:     ${sd.proto === 'socks5' ? proxy.socks_port : proxy.http_port}\n` +
            `👤 Username: ${proxy.username}\n` +
            `🔑 Password: ${proxy.password}\n` +
            `📡 Protocol: ${sd.proto.toUpperCase()}\n` +
            `🌍 Location: ${sd.countryName}, ${sd.cityName}\n` +
            `⏱️  Expires:  ${expiryStr}\n` +
            `💳 Balance:  $${user.balance.toFixed(2)}\n\n` +
            `✅ Proxy is ready to use!\n(9 = Menu)`
        );
    } catch (err) {
        console.error('Error in handleBuyConfirm:', err);
        await sendText(psid, '❌ Purchase error. Please contact support.');
        await userService.setState(user, 'MAIN_MENU');
    }
}

// ── TOP-UP ────────────────────────────────────────────────────────────────────

async function handleTopUp(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }

    const amount = parseFloat((rawMessage || '').trim());
    if (isNaN(amount) || amount <= 0) {
        return await sendText(psid,
            `💳 TOP UP BALANCE\n\nBalance: $${(user.balance || 0).toFixed(2)}\n\n` +
            `📲 Methods:\n🔸 Binance ID: 909914646\n🔸 Bkash: 01567906551\n\n` +
            `➡️ Amount (e.g. 50):`
        );
    }

    try {
        await TopUpRequest.create({ userId: user._id, psid, email: user.email, amount });
        await sendText(psid,
            `✅ Top-up request of $${amount.toFixed(2)} submitted!\n\n⏳ Verification: 1–10 mins\n\n(9 = Menu)`
        );
        await userService.setState(user, 'MAIN_MENU');
    } catch (err) {
        console.error('Error in handleTopUp:', err);
        await sendText(psid, '❌ Error submitting request. Please try again.');
    }
}

// ── SUPPORT ───────────────────────────────────────────────────────────────────

async function handleSupport(user, psid, input, rawMessage) {
    if (input.type === 'number' && input.value === 0) {
        await userService.setState(user, 'MAIN_MENU');
        return await showMainMenu(psid);
    }

    const msg = (rawMessage || '').trim();
    if (msg.length < 3) {
        return await sendText(psid, '❌ Message too short (min 3 characters).\n\n💬 Try again (or 0 to go back):');
    }

    try {
        await SupportMessage.create({ userId: user._id, psid, email: user.email, message: msg });
        await sendText(psid, `✅ Message sent to support!\n\n👨‍💼 Our team will reply shortly.\n\n(9 = Menu)`);
        await userService.setState(user, 'MAIN_MENU');
    } catch (err) {
        console.error('Error in handleSupport:', err);
        await sendText(psid, '❌ Error sending message. Please try again.');
    }
}

module.exports = { handleMessage };
