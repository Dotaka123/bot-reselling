const { sendText }      = require('../utils/messenger');
const { parseInput, isValidEmail, isValidPassword } = require('../utils/validators');
const M                 = require('../utils/messages');
const userService       = require('../services/userService');
const proxyService      = require('../services/proxyService');
const proxyApiService   = require('../services/proxyApiService');
const SupportMessage    = require('../models/SupportMessage');
const TopUpRequest      = require('../models/TopUpRequest');

/**
 * ═══════════════════════════════════════════════════════════════
 *  STATE MACHINE
 *  WELCOME → FB_VERIFICATION → (1) CAPTCHA_REGISTER → REGISTER_EMAIL → REGISTER_PASSWORD
 *          → (2) CAPTCHA_LOGIN → LOGIN_EMAIL → LOGIN_PASSWORD
 *  MAIN_MENU
 *  BUY_PKG → BUY_PROTO → BUY_DURATION → BUY_COUNTRY →
 *    BUY_CITY → BUY_PROVIDER → BUY_PARENT → BUY_CONFIRM
 *  PROFILE → PROFILE_RENEW
 *  TOPUP
 *  SUPPORT | PRICES
 * ═══════════════════════════════════════════════════════════════
 */

const PAGE = M.PAGE_SIZE;
const FACEBOOK_PAGE_URL = process.env.FACEBOOK_PAGE_URL || 'https://www.facebook.com/profile.php?id=61552396135882';

// ── Captcha generator ────────────────────────────────────────
function generateCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

// ── Pagination helpers ───────────────────────────────────────
function getPage(allItems, page) {
  const start = (page - 1) * PAGE;
  return allItems.slice(start, start + PAGE);
}
function totalPages(allItems) {
  return Math.max(1, Math.ceil(allItems.length / PAGE));
}

/**
 * Generic paginated helper.
 * Handles 0 (back/previous page) and 9 (next page) reliably,
 * BEFORE any index calculation. Returns null if pagination action was performed,
 * or { idx, pageItems } if an item was selected.
 */
async function handlePaginatedInput({ user, psid, input, items, page, tp,
  stateName, statePageKey, showFn, onBack }) {
  const n = input.type === 'number' ? input.value : null;

  // 0 → previous page or back
  if (n === 0) {
    if (page > 1) {
      const newPage = page - 1;
      await userService.setState(user, stateName, { ...user.stateData, [statePageKey]: newPage });
      await showFn(getPage(items, newPage), newPage, tp);
    } else {
      await onBack();
    }
    return null;
  }

  // 9 → next page (or message if already on last page)
  if (n === 9) {
    if (page < tp) {
      const newPage = page + 1;
      await userService.setState(user, stateName, { ...user.stateData, [statePageKey]: newPage });
      await showFn(getPage(items, newPage), newPage, tp);
    } else {
      await sendText(psid, `⚠️ You are already on the last page.\n(0 = back)`);
      await showFn(getPage(items, page), page, tp);
    }
    return null;
  }

  // Item selection
  const pageItems = getPage(items, page);
  const idx = (n || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
    await sendText(psid, M.INVALID_OPTION(pageItems.length));
    await showFn(pageItems, page, tp);
    return null;
  }

  return { idx, pageItems };
}

// ── Main entry point ────────────────────────────────────────
async function handleMessage(psid, messageText) {
  if (!messageText) return;

  let user;
  try {
    user = await userService.getOrCreateUser(psid);
  } catch (err) {
    console.error('getOrCreateUser error:', err);
    await sendText(psid, M.ERROR_GENERIC);
    return;
  }

  const input = parseInput(messageText);

  // Global commands (outside of registration/login/captcha flows)
  const FLOW_STATES = ['WELCOME','FB_VERIFICATION','CAPTCHA_REGISTER','CAPTCHA_LOGIN','REGISTER_EMAIL','REGISTER_PASSWORD','LOGIN_EMAIL','LOGIN_PASSWORD'];
  if (!FLOW_STATES.includes(user.state)) {
    if (input.type === 'command' && input.value === 'CANCEL') {
      await userService.setState(user, 'MAIN_MENU');
      await sendText(psid, M.CANCELLED);
      await sendText(psid, M.MAIN_MENU);
      return;
    }
    // 9 = main menu, EXCEPT in BUY states where 9 = next page
    const BUY_STATES = ['BUY_PKG','BUY_PROTO','BUY_DURATION','BUY_COUNTRY','BUY_CITY','BUY_PROVIDER','BUY_PARENT','BUY_CONFIRM'];
    if (input.type === 'number' && input.value === 9 && !BUY_STATES.includes(user.state)) {
      await userService.setState(user, 'MAIN_MENU');
      await sendText(psid, M.MAIN_MENU);
      return;
    }
  }

  try {
    switch (user.state) {
      case 'WELCOME':            return handleWelcome(user, psid, input);
      case 'FB_VERIFICATION':    return handleFBVerification(user, psid, input);
      case 'CAPTCHA_REGISTER':   return handleCaptchaRegister(user, psid, input);
      case 'CAPTCHA_LOGIN':      return handleCaptchaLogin(user, psid, input);
      case 'LOGIN_EMAIL':        return handleLoginEmail(user, psid, input);
      case 'LOGIN_PASSWORD':     return handleLoginPassword(user, psid, input, messageText);
      case 'REGISTER_EMAIL':     return handleRegisterEmail(user, psid, input);
      case 'REGISTER_PASSWORD':  return handleRegisterPassword(user, psid, input, messageText);
      case 'MAIN_MENU':          return handleMainMenu(user, psid, input);
      case 'BUY_PKG':            return handleBuyPkg(user, psid, input);
      case 'BUY_PROTO':          return handleBuyProto(user, psid, input);
      case 'BUY_DURATION':       return handleBuyDuration(user, psid, input);
      case 'BUY_COUNTRY':        return handleBuyCountry(user, psid, input);
      case 'BUY_CITY':           return handleBuyCity(user, psid, input);
      case 'BUY_PROVIDER':       return handleBuyProvider(user, psid, input);
      case 'BUY_PARENT':         return handleBuyParent(user, psid, input);
      case 'BUY_CONFIRM':        return handleBuyConfirm(user, psid, input);
      case 'PROFILE':            return handleProfile(user, psid, input);
      case 'PROFILE_RENEW':      return handleProfileRenew(user, psid, input);
      case 'TOPUP':              return handleTopUp(user, psid, input, messageText);
      case 'SUPPORT':            return handleSupport(user, psid, input, messageText);
      case 'PRICES':             return handlePrices(user, psid, input);
      default:
        await userService.setState(user, 'WELCOME');
        await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    }
  } catch (err) {
    console.error(`❌ State [${user.state}] error:`, err);
    await sendText(psid, M.ERROR_GENERIC);
  }
}

// ═══════════════════════════════════════════════════════════════
//  WELCOME / FACEBOOK VERIFICATION / CAPTCHA / LOGIN / REGISTER
// ═══════════════════════════════════════════════════════════════

async function handleWelcome(user, psid, input) {
  // Send welcome message and ask to verify Facebook subscription
  await sendText(psid, M.FACEBOOK_VERIFICATION_PENDING);
  await userService.setState(user, 'FB_VERIFICATION', { step: 1 });
}

async function handleFBVerification(user, psid, input) {
  const normalizedText = input.type === 'text' ? input.value.trim().toLowerCase() : '';

  // Check if user typed "done"
  if ((input.type === 'command' && input.value === 'DONE') || normalizedText === 'done') {
    // "done" now unlocks the bot directly (no external subscription check)
    await sendText(psid, '✅ Done received! Access granted.');
    await user.updateOne({ isPageSubscriber: true });
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }

  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }

  // User didn't type "done"
  await sendText(psid, M.FACEBOOK_VERIFICATION_ERROR);
  await sendText(psid, `Visit: ${FACEBOOK_PAGE_URL}`);
  await sendText(psid, M.FACEBOOK_VERIFICATION_PENDING);
}

async function handleCaptchaRegister(user, psid, input) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }
  const { captcha } = user.stateData;
  if (input.type !== 'number' || input.value !== captcha.answer) {
    const nc = generateCaptcha();
    await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
    await sendText(psid, M.CAPTCHA_FAIL);
    await sendText(psid, M.CAPTCHA(nc.a, nc.b));
    return;
  }
  await userService.setState(user, 'REGISTER_EMAIL');
  await sendText(psid, '✅ Verification successful!');
  await sendText(psid, M.REGISTER_ASK_EMAIL);
}

async function handleCaptchaLogin(user, psid, input) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }
  const { captcha } = user.stateData;
  if (input.type !== 'number' || input.value !== captcha.answer) {
    const nc = generateCaptcha();
    await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
    await sendText(psid, M.CAPTCHA_FAIL);
    await sendText(psid, M.CAPTCHA(nc.a, nc.b));
    return;
  }
  await userService.setState(user, 'LOGIN_EMAIL');
  await sendText(psid, '✅ Verification successful!');
  await sendText(psid, M.LOGIN_ASK_EMAIL);
}

async function handleLoginEmail(user, psid, input) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }
  if (!isValidEmail(input.raw)) {
    await sendText(psid, M.LOGIN_ASK_EMAIL);
    return;
  }
  const existingUser = await userService.getUserByEmail(input.raw);
  if (!existingUser) {
    await sendText(psid, M.LOGIN_WRONG);
    await sendText(psid, M.LOGIN_ASK_EMAIL);
    return;
  }
  await userService.setState(user, 'LOGIN_PASSWORD', { email: input.raw });
  await sendText(psid, M.LOGIN_ASK_PASSWORD);
}

async function handleLoginPassword(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }
  const { email } = user.stateData;
  const existingUser = await userService.getUserByEmail(email);
  if (!existingUser || existingUser.passwordHash !== require('crypto').createHash('sha256').update(rawMessage || '').digest('hex')) {
    await sendText(psid, M.LOGIN_WRONG);
    await sendText(psid, M.LOGIN_ASK_PASSWORD);
    return;
  }
  user.isLoggedIn = true;
  await user.save();
  await userService.setState(user, 'MAIN_MENU');
  await sendText(psid, M.LOGIN_SUCCESS(email));
  await sendText(psid, M.MAIN_MENU);
}

async function handleRegisterEmail(user, psid, input) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }
  if (!isValidEmail(input.raw)) {
    await sendText(psid, M.REGISTER_EMAIL_INVALID);
    await sendText(psid, M.REGISTER_ASK_EMAIL);
    return;
  }
  const existing = await userService.getUserByEmail(input.raw);
  if (existing) {
    await sendText(psid, M.REGISTER_EMAIL_TAKEN);
    await sendText(psid, M.REGISTER_ASK_EMAIL);
    return;
  }
  await userService.setState(user, 'REGISTER_PASSWORD', { email: input.raw });
  await sendText(psid, M.REGISTER_ASK_PASSWORD);
}

async function handleRegisterPassword(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'friend'));
    return;
  }
  if (!isValidPassword(rawMessage || '')) {
    await sendText(psid, M.REGISTER_PASSWORD_WEAK);
    await sendText(psid, M.REGISTER_ASK_PASSWORD);
    return;
  }
  const { email } = user.stateData;
  user.email = email;
  user.passwordHash = require('crypto').createHash('sha256').update(rawMessage).digest('hex');
  user.isLoggedIn = true;
  await user.save();
  await userService.setState(user, 'MAIN_MENU');
  await sendText(psid, M.REGISTER_SUCCESS(email));
  await sendText(psid, M.MAIN_MENU);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN MENU
// ═══════════════════════════════════════════════════════════════

async function handleMainMenu(user, psid, input) {
  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_INPUT);
    return;
  }
  switch (input.value) {
    case 1:
      await userService.setState(user, 'BUY_PKG');
      await sendText(psid, M.BUY_SELECT_PKG);
      break;
    case 2:
      await userService.setState(user, 'PROFILE');
      await showProfile(user, psid);
      break;
    case 3:
      await userService.setState(user, 'TOPUP');
      await sendText(psid, M.TOPUP_MENU(user.balance || 0));
      break;
    case 4:
      await userService.setState(user, 'SUPPORT');
      await sendText(psid, M.SUPPORT_ASK);
      break;
    case 5:
      await userService.setState(user, 'PRICES');
      await sendText(psid, M.PRICES);
      break;
    case 6:
      await userService.setState(user, 'WELCOME');
      await sendText(psid, M.LOGOUT);
      break;
    default:
      await sendText(psid, M.INVALID_OPTION(6));
  }
}

// ═══════════════════════════════════════════════════════════════
//  PURCHASE FLOW
// ═══════════════════════════════════════════════════════════════

async function handleBuyPkg(user, psid, input) {
  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_INPUT);
    return;
  }
  if (input.value === 0) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  if (input.value !== 1 && input.value !== 2) {
    await sendText(psid, M.INVALID_OPTION(2));
    return;
  }
  await userService.setState(user, 'BUY_PROTO', { pkgId: input.value });
  await sendText(psid, M.BUY_SELECT_PROTO);
}

async function handleBuyProto(user, psid, input) {
  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_INPUT);
    return;
  }
  if (input.value === 0) {
    await userService.setState(user, 'BUY_PKG');
    await sendText(psid, M.BUY_SELECT_PKG);
    return;
  }
  if (input.value !== 1 && input.value !== 2) {
    await sendText(psid, M.INVALID_OPTION(2));
    return;
  }
  const proto = input.value === 1 ? 'http' : 'socks5';
  const options = [
    { label: '2 hours', price: 0.30, duration: 2, durationLabel: '2 hours' },
    { label: '12 hours', price: 0.60, duration: 12, durationLabel: '12 hours' },
    { label: '3 days', price: 2.50, duration: 3, durationLabel: '3 days' },
    { label: '7 days', price: 4.50, duration: 7, durationLabel: '7 days' },
    { label: '15 days', price: 10.00, duration: 15, durationLabel: '15 days' },
    { label: '30 days', price: 18.00, duration: 30, durationLabel: '30 days' }
  ];
  await userService.setState(user, 'BUY_DURATION', { pkgId: user.stateData.pkgId, proto });
  await sendText(psid, M.BUY_SELECT_DURATION(options));
}

async function handleBuyDuration(user, psid, input) {
  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_INPUT);
    return;
  }
  if (input.value === 0) {
    await userService.setState(user, 'BUY_PROTO');
    await sendText(psid, M.BUY_SELECT_PROTO);
    return;
  }
  const options = [
    { label: '2 hours', price: 0.30, duration: 2, durationLabel: '2 hours' },
    { label: '12 hours', price: 0.60, duration: 12, durationLabel: '12 hours' },
    { label: '3 days', price: 2.50, duration: 3, durationLabel: '3 days' },
    { label: '7 days', price: 4.50, duration: 7, durationLabel: '7 days' },
    { label: '15 days', price: 10.00, duration: 15, durationLabel: '15 days' },
    { label: '30 days', price: 18.00, duration: 30, durationLabel: '30 days' }
  ];
  if (input.value < 1 || input.value > options.length) {
    await sendText(psid, M.INVALID_OPTION(options.length));
    return;
  }
  const selected = options[input.value - 1];
  await userService.setState(user, 'BUY_COUNTRY', {
    ...user.stateData,
    duration: selected.duration,
    durationLabel: selected.durationLabel,
    price: selected.price
  });
  const countries = await proxyApiService.getCountries();
  const page = 1;
  const tp = totalPages(countries);
  await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, page), page, tp));
}

async function handleBuyCountry(user, psid, input) {
  const countries = await proxyApiService.getCountries();
  const page = user.stateData.countryPage || 1;
  const tp = totalPages(countries);

  const result = await handlePaginatedInput({
    user, psid, input, items: countries, page, tp,
    stateName: 'BUY_COUNTRY', statePageKey: 'countryPage',
    showFn: async (items, p, tp) => await sendText(psid, M.BUY_SELECT_COUNTRY(items, p, tp)),
    onBack: async () => {
      await userService.setState(user, 'BUY_DURATION');
      await sendText(psid, M.BUY_SELECT_DURATION([
        { label: '2 hours', price: 0.30, duration: 2, durationLabel: '2 hours' },
        { label: '12 hours', price: 0.60, duration: 12, durationLabel: '12 hours' },
        { label: '3 days', price: 2.50, duration: 3, durationLabel: '3 days' },
        { label: '7 days', price: 4.50, duration: 7, durationLabel: '7 days' },
        { label: '15 days', price: 10.00, duration: 15, durationLabel: '15 days' },
        { label: '30 days', price: 18.00, duration: 30, durationLabel: '30 days' }
      ]));
    }
  });
  if (!result) return;

  const country = result.pageItems[result.idx];
  const cities = await proxyApiService.getCities(country.country_code);
  const newPage = 1;
  const newTp = totalPages(cities);

  await userService.setState(user, 'BUY_CITY', {
    ...user.stateData,
    country: country.country_name,
    countryId: country.country_code,
    cityPage: newPage,
    cities: cities.map(c => ({ city_name: c.city_name }))
  });
  await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, newPage), newPage, newTp));
}

async function handleBuyCity(user, psid, input) {
  const cities = user.stateData.cities || [];
  const page = user.stateData.cityPage || 1;
  const tp = totalPages(cities);

  const result = await handlePaginatedInput({
    user, psid, input, items: cities, page, tp,
    stateName: 'BUY_CITY', statePageKey: 'cityPage',
    showFn: async (items, p, tp) => await sendText(psid, M.BUY_SELECT_CITY(items, p, tp)),
    onBack: async () => {
      const countries = await proxyApiService.getCountries();
      const countryPage = user.stateData.countryPage || 1;
      const ctp = totalPages(countries);
      await userService.setState(user, 'BUY_COUNTRY', user.stateData);
      await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, countryPage), countryPage, ctp));
    }
  });
  if (!result) return;

  const city = result.pageItems[result.idx];
  const providers = await proxyApiService.getProviders(user.stateData.countryId, city.city_name);
  const newPage = 1;
  const newTp = totalPages(providers);

  await userService.setState(user, 'BUY_PROVIDER', {
    ...user.stateData,
    city: city.city_name,
    providerPage: newPage,
    providers: providers.map(p => ({ service_provider_name: p.service_provider_name, id: p.id }))
  });
  await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, newPage), newPage, newTp));
}

async function handleBuyProvider(user, psid, input) {
  const providers = user.stateData.providers || [];
  const page = user.stateData.providerPage || 1;
  const tp = totalPages(providers);

  const result = await handlePaginatedInput({
    user, psid, input, items: providers, page, tp,
    stateName: 'BUY_PROVIDER', statePageKey: 'providerPage',
    showFn: async (items, p, tp) => await sendText(psid, M.BUY_SELECT_PROVIDER(items, p, tp)),
    onBack: async () => {
      const cities = user.stateData.cities || [];
      const cityPage = user.stateData.cityPage || 1;
      const ctp = totalPages(cities);
      await userService.setState(user, 'BUY_CITY', user.stateData);
      await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, cityPage), cityPage, ctp));
    }
  });
  if (!result) return;

  const provider = result.pageItems[result.idx];
  const parentProxies = await proxyApiService.getParentProxies({
    protocol: user.stateData.proto,
    country: user.stateData.countryId,
    city: user.stateData.city,
    provider_id: provider.id
  });
  const newPage = 1;
  const newTp = totalPages(parentProxies);

  await userService.setState(user, 'BUY_PARENT', {
    ...user.stateData,
    provider: provider.service_provider_name,
    parentPage: newPage,
    parents: parentProxies.map(p => ({ id: p.id, technology: p.technology, http_port: p.http_port, socks_port: p.socks_port }))
  });
  await sendText(psid, M.BUY_SELECT_PARENT(getPage(parentProxies, newPage), newPage, newTp));
}

async function handleBuyParent(user, psid, input) {
  const parents = user.stateData.parents || [];
  const page = user.stateData.parentPage || 1;
  const tp = totalPages(parents);

  const result = await handlePaginatedInput({
    user, psid, input, items: parents, page, tp,
    stateName: 'BUY_PARENT', statePageKey: 'parentPage',
    showFn: async (items, p, tp) => await sendText(psid, M.BUY_SELECT_PARENT(items, p, tp)),
    onBack: async () => {
      const providers = user.stateData.providers || [];
      const providerPage = user.stateData.providerPage || 1;
      const ptp = totalPages(providers);
      await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, providerPage });
      await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, providerPage), providerPage, ptp));
    }
  });
  if (!result) return;

  const parentProxy = result.pageItems[result.idx];
  const { proto, durationLabel, price, country, city, provider } = user.stateData;
  const balance = user.balance || 0;

  await userService.setState(user, 'BUY_CONFIRM', {
    ...user.stateData,
    parentProxyId: parentProxy.id,
    balance,
    parentPage: page
  });

  await sendText(psid, M.BUY_CONFIRM({
    pkg: user.stateData.pkgId === 1 ? 'Golden (Premium Mobile IP)' : 'Silver (Standard Mobile IP)',
    proto, duration: durationLabel, country, city, provider, price, balance
  }));
}

// ── 8. Confirmation ─────────────────────────────────────────────
async function handleBuyConfirm(user, psid, input) {
  const { parents, parentPage } = user.stateData;

  // 0 = back to parent list
  if (input.type === 'number' && input.value === 0) {
    const page = parentPage || 1;
    const tp = totalPages(parents);
    await userService.setState(user, 'BUY_PARENT', user.stateData);
    await sendText(psid, M.BUY_SELECT_PARENT(getPage(parents, page), page, tp));
    return;
  }

  // 9 doesn't make sense here
  if (input.type === 'number' && input.value === 9) {
    await sendText(psid, M.INVALID_OPTION(2));
    return;
  }

  if (input.type === 'number' && input.value === 2) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  if (input.type !== 'number' || input.value !== 1) {
    await sendText(psid, M.INVALID_OPTION(2));
    return;
  }

  const { pkgId, proto, duration, durationLabel, price, country, countryId, parentProxyId } = user.stateData;
  const balance = user.balance || 0;
  if (balance < price) {
    await sendText(psid, M.BUY_INSUFFICIENT_BALANCE(price, balance));
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  await sendText(psid, M.BUY_LOADING);
  try {
    const proxy = await proxyService.purchaseProxy(user, {
      packageId: pkgId, protocol: proto, duration, durationLabel,
      price, parentProxyId, country, countryCode: countryId
    });
    user.balance = Math.max(0, (user.balance || 0) - price);
    await user.save();
    await sendText(psid, M.BUY_SUCCESS(proxy));
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
  } catch (err) {
    const errMsg = err.message || 'Unknown error';
    console.error('❌ Purchase failed:', errMsg, err.stack);
    await sendText(psid, M.BUY_ERROR(errMsg));
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROFILE
// ═══════════════════════════════════════════════════════════════

async function showProfile(user, psid) {
  const proxies = await proxyService.getUserProxies(user._id);
  await sendText(psid, M.PROFILE(user, proxies));
}

async function handleProfile(user, psid, input) {
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  if (input.type === 'number' && input.value === 1) {
    const proxies = await proxyService.getUserProxies(user._id);
    const expired = proxies.filter(p => p.status === 'EXPIRED');
    if (!expired.length) {
      await sendText(psid, '✅ No expired proxies to renew.');
      await showProfile(user, psid);
      return;
    }
    let msg = `${'─'.repeat(18)}\n🔄 RENEW PROXY\n${'─'.repeat(18)}\n\n`;
    expired.slice(0, 8).forEach((p, i) => { msg += `${i + 1} - ${p.ip}:${p.port} (${p.country || '—'})\n`; });
    msg += `\n0 - ↩ Back`;
    await userService.setState(user, 'PROFILE_RENEW', { expiredProxies: expired.map(p => p._id.toString()) });
    await sendText(psid, msg);
    return;
  }
  await sendText(psid, M.INVALID_OPTION(1));
  await showProfile(user, psid);
}

async function handleProfileRenew(user, psid, input) {
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'PROFILE');
    await showProfile(user, psid);
    return;
  }
  await sendText(psid, '♻️ To renew, repurchase a proxy from the main menu.\n');
  await userService.setState(user, 'BUY_PKG');
  await sendText(psid, M.BUY_SELECT_PKG);
}

// ═══════════════════════════════════════════════════════════════
//  TOP UP
// ═══════════════════════════════════════════════════════════════

async function handleTopUp(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  const amount = parseFloat((rawMessage || '').trim());
  if (isNaN(amount) || amount <= 0) {
    await sendText(psid, M.TOPUP_INVALID);
    await sendText(psid, M.TOPUP_MENU(user.balance || 0));
    return;
  }

  await TopUpRequest.create({ userId: user._id, psid: user.psid, email: user.email, amount });

  const adminPsid = process.env.ADMIN_PSID;
  if (adminPsid && adminPsid !== psid) {
    try {
      await sendText(adminPsid,
        `💳 TOP-UP REQUEST\n\nFrom: ${user.email || psid}\nAmount: $${amount.toFixed(2)}\n\n→ Approve from admin panel.`
      );
    } catch { /* ignore */ }
  }

  await userService.setState(user, 'MAIN_MENU');
  await sendText(psid, M.TOPUP_PENDING(amount));
  await sendText(psid, M.MAIN_MENU);
}

// ═══════════════════════════════════════════════════════════════
//  SUPPORT / PRICES
// ═══════════════════════════════════════════════════════════════

async function handleSupport(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'CANCEL') {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  const message = (rawMessage || '').trim();
  if (!message || message.length < 3) {
    await sendText(psid, '⚠️ Message too short. Describe your problem.');
    return;
  }
  await SupportMessage.create({ userId: user._id, psid, email: user.email, message });
  const adminPsid = process.env.ADMIN_PSID;
  if (adminPsid && adminPsid !== psid) {
    try { await sendText(adminPsid, `📩 SUPPORT\n\nFrom: ${user.email || psid}\n${message}`); } catch { /* ignore */ }
  }
  await userService.setState(user, 'MAIN_MENU');
  await sendText(psid, M.SUPPORT_SENT);
  await sendText(psid, M.MAIN_MENU);
}

async function handlePrices(user, psid, input) {
  if (input.type === 'number' && (input.value === 0 || input.value === 9)) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  await sendText(psid, M.PRICES);
}

module.exports = { handleMessage };
