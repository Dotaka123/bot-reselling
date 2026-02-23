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
 *  WELCOME → (1) CAPTCHA_REGISTER → REGISTER_EMAIL → REGISTER_PASSWORD
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

// ── Générateur de captcha ────────────────────────────────────────
function generateCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

// ── Helpers pagination ───────────────────────────────────────────
function getPage(allItems, page) {
  const start = (page - 1) * PAGE;
  return allItems.slice(start, start + PAGE);
}
function totalPages(allItems) {
  return Math.max(1, Math.ceil(allItems.length / PAGE));
}

/**
 * Helper paginé générique.
 * Gère 0 (retour/page précédente) et 9 (page suivante) de façon fiable,
 * AVANT tout calcul d'index. Retourne null si une action pagination a été
 * effectuée, ou { idx, pageItems } si un item a été choisi.
 */
async function handlePaginatedInput({ user, psid, input, items, page, tp,
  stateName, statePageKey, showFn, onBack }) {
  const n = input.type === 'number' ? input.value : null;

  // 0 → page précédente ou retour
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

  // 9 → page suivante (ou message si déjà dernière page)
  if (n === 9) {
    if (page < tp) {
      const newPage = page + 1;
      await userService.setState(user, stateName, { ...user.stateData, [statePageKey]: newPage });
      await showFn(getPage(items, newPage), newPage, tp);
    } else {
      await sendText(psid, `⚠️ Vous êtes déjà sur la dernière page.\n(0 = retour)`);
      await showFn(getPage(items, page), page, tp);
    }
    return null;
  }

  // Sélection d'item
  const pageItems = getPage(items, page);
  const idx = (n || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
    await sendText(psid, M.INVALID_OPTION(pageItems.length));
    await showFn(pageItems, page, tp);
    return null;
  }

  return { idx, pageItems };
}

// ── Entrée principale ────────────────────────────────────────────
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

  // Commandes globales (hors états de flux d'inscription/login/captcha)
  const FLOW_STATES = ['WELCOME','CAPTCHA_REGISTER','CAPTCHA_LOGIN','REGISTER_EMAIL','REGISTER_PASSWORD','LOGIN_EMAIL','LOGIN_PASSWORD'];
  if (!FLOW_STATES.includes(user.state)) {
    if (input.type === 'command' && input.value === 'ANNULER') {
      await userService.setState(user, 'MAIN_MENU');
      await sendText(psid, M.CANCELLED);
      await sendText(psid, M.MAIN_MENU);
      return;
    }
    // 9 = menu principal, SAUF dans les états BUY où 9 = page suivante
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
        await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    }
  } catch (err) {
    console.error(`❌ State [${user.state}] error:`, err);
    await sendText(psid, M.ERROR_GENERIC);
  }
}

// ═══════════════════════════════════════════════════════════════
//  WELCOME / CAPTCHA / LOGIN / REGISTER
// ═══════════════════════════════════════════════════════════════

async function handleWelcome(user, psid, input) {
  // Option 1 : créer un compte
  if (input.type === 'number' && input.value === 1) {
    const captcha = generateCaptcha();
    await userService.setState(user, 'CAPTCHA_REGISTER', { captcha });
    await sendText(psid, M.CAPTCHA(captcha.a, captcha.b));
    return;
  }
  // Option 2 : se connecter (avec ou sans compte existant sur ce PSID)
  if (input.type === 'number' && input.value === 2) {
    const captcha = generateCaptcha();
    await userService.setState(user, 'CAPTCHA_LOGIN', { captcha });
    await sendText(psid, M.CAPTCHA(captcha.a, captcha.b));
    return;
  }
  // Utilisateur inscrit sur ce PSID → afficher quand même le menu d'accueil
  await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
}

async function handleCaptchaRegister(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
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
  await sendText(psid, '✅ Vérification réussie !');
  await sendText(psid, M.REGISTER_ASK_EMAIL);
}

async function handleCaptchaLogin(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
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
  await sendText(psid, '✅ Vérification réussie !');
  await sendText(psid, M.LOGIN_ASK_EMAIL);
}

async function handleLoginEmail(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }
  const email = (typeof input.value === 'string' ? input.value : '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    await sendText(psid, M.REGISTER_EMAIL_INVALID);
    await sendText(psid, M.LOGIN_ASK_EMAIL);
    return;
  }
  await userService.setState(user, 'LOGIN_PASSWORD', { loginEmail: email });
  await sendText(psid, M.LOGIN_ASK_PASSWORD);
}

async function handleLoginPassword(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }
  const password = (rawMessage || '').trim();
  const { loginEmail } = user.stateData;
  const User = require('../models/User');
  const target = await User.findOne({ email: loginEmail });
  if (!target || !(await target.verifyPassword(password))) {
    await sendText(psid, M.LOGIN_WRONG);
    await sendText(psid, M.LOGIN_ASK_PASSWORD);
    return;
  }
  // Lier ce PSID au compte trouvé si différent
  if (target.psid !== user.psid) {
    // Réinitialiser l'ancien user fantôme
    user.state = 'WELCOME'; user.stateData = {};
    await user.save();
    target.psid = psid;
  }
  target.isLoggedIn = true;
  target.state = 'MAIN_MENU';
  target.stateData = {};
  target.lastActivity = new Date();
  await target.save();
  await sendText(psid, M.LOGIN_SUCCESS(loginEmail));
  await sendText(psid, M.MAIN_MENU);
}

async function handleRegisterEmail(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }
  const email = (typeof input.value === 'string' ? input.value : '').trim();
  if (!isValidEmail(email)) { await sendText(psid, M.REGISTER_EMAIL_INVALID); return; }
  if (await userService.isEmailTaken(email)) { await sendText(psid, M.REGISTER_EMAIL_TAKEN); return; }
  await userService.setState(user, 'REGISTER_PASSWORD', { pendingEmail: email.toLowerCase() });
  await sendText(psid, M.REGISTER_ASK_PASSWORD);
}

async function handleRegisterPassword(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }
  const password = (rawMessage || '').trim();
  if (!isValidPassword(password)) { await sendText(psid, M.REGISTER_PASSWORD_WEAK); return; }
  user.email        = user.stateData?.pendingEmail;
  user.password     = password;
  user.isRegistered = true;
  user.isLoggedIn   = true;
  user.state        = 'MAIN_MENU';
  user.stateData    = {};
  user.lastActivity = new Date();
  await user.save();
  await sendText(psid, M.REGISTER_SUCCESS(user.email));
  await sendText(psid, M.MAIN_MENU);
}

// ═══════════════════════════════════════════════════════════════
//  MAIN MENU
// ═══════════════════════════════════════════════════════════════

async function handleMainMenu(user, psid, input) {
  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_INPUT);
    await sendText(psid, M.MAIN_MENU);
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
      user.isLoggedIn = false;
      user.state      = 'WELCOME';
      user.stateData  = {};
      await user.save();
      await sendText(psid, M.LOGOUT);
      break;
    default:
      await sendText(psid, M.INVALID_OPTION(6));
      await sendText(psid, M.MAIN_MENU);
  }
}

// ═══════════════════════════════════════════════════════════════
//  BUY FLOW
// ═══════════════════════════════════════════════════════════════

// ── 1. Package ──────────────────────────────────────────────────
async function handleBuyPkg(user, psid, input) {
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  if (input.type === 'number' && input.value === 9) {
    // Pas de pagination ici, 9 = menu (déjà dans BUY_STATES donc pas intercepté globalement)
    await sendText(psid, M.INVALID_OPTION(2));
    await sendText(psid, M.BUY_SELECT_PKG);
    return;
  }
  if (input.type !== 'number' || ![1, 2].includes(input.value)) {
    await sendText(psid, M.INVALID_OPTION(2));
    await sendText(psid, M.BUY_SELECT_PKG);
    return;
  }
  const pkgId  = input.value;
  const prices = proxyApiService.getPricesForPkg(pkgId);
  await userService.setState(user, 'BUY_PROTO', { pkgId, prices });
  await sendText(psid, M.BUY_SELECT_PROTO);
}

// ── 2. Protocole ────────────────────────────────────────────────
async function handleBuyProto(user, psid, input) {
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'BUY_PKG');
    await sendText(psid, M.BUY_SELECT_PKG);
    return;
  }
  if (input.type === 'number' && input.value === 9) {
    await sendText(psid, M.INVALID_OPTION(2));
    await sendText(psid, M.BUY_SELECT_PROTO);
    return;
  }
  if (input.type !== 'number' || ![1, 2].includes(input.value)) {
    await sendText(psid, M.INVALID_OPTION(2));
    await sendText(psid, M.BUY_SELECT_PROTO);
    return;
  }
  const proto = input.value === 1 ? 'http' : 'socks5';
  const { pkgId, prices } = user.stateData;
  await userService.setState(user, 'BUY_DURATION', { pkgId, prices, proto });
  await sendText(psid, M.BUY_SELECT_DURATION(prices));
}

// ── 3. Durée ────────────────────────────────────────────────────
async function handleBuyDuration(user, psid, input) {
  const { pkgId, prices, proto } = user.stateData;
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'BUY_PROTO', { pkgId, prices, proto });
    await sendText(psid, M.BUY_SELECT_PROTO);
    return;
  }
  if (input.type === 'number' && input.value === 9) {
    await sendText(psid, M.INVALID_OPTION(prices.length));
    await sendText(psid, M.BUY_SELECT_DURATION(prices));
    return;
  }
  const idx = (input.value || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= prices.length) {
    await sendText(psid, M.INVALID_OPTION(prices.length));
    await sendText(psid, M.BUY_SELECT_DURATION(prices));
    return;
  }
  const pick = prices[idx];
  await sendText(psid, '⏳ Chargement des pays disponibles...');
  try {
    const countries = await proxyApiService.getCountries(pkgId);
    if (!countries || !countries.length) throw new Error('Aucun pays disponible.');
    const page = 1;
    const tp   = totalPages(countries);
    await userService.setState(user, 'BUY_COUNTRY', {
      pkgId, proto,
      duration: pick.duration, durationLabel: pick.label, price: pick.price,
      countries, countryPage: page
    });
    await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, page), page, tp));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR('Impossible de charger les pays. Réessayez.'));
    await sendText(psid, M.BUY_SELECT_DURATION(prices));
  }
}

// ── 4. Pays (paginé) ────────────────────────────────────────────
async function handleBuyCountry(user, psid, input) {
  const { pkgId, proto, duration, durationLabel, price, countries } = user.stateData;
  const page = user.stateData.countryPage || 1;
  const tp = totalPages(countries);

  const result = await handlePaginatedInput({
    user, psid, input,
    items: countries, page, tp,
    stateName: 'BUY_COUNTRY', statePageKey: 'countryPage',
    showFn: (items, p, t) => sendText(psid, M.BUY_SELECT_COUNTRY(items, p, t)),
    onBack: async () => {
      const prices = proxyApiService.getPricesForPkg(pkgId);
      await userService.setState(user, 'BUY_DURATION', { pkgId, prices, proto });
      await sendText(psid, M.BUY_SELECT_DURATION(prices));
    }
  });
  if (!result) return;

  const country = result.pageItems[result.idx];
  await sendText(psid, '⏳ Chargement des villes...');
  try {
    const cities = await proxyApiService.getCities(country.id, pkgId);
    if (!cities || !cities.length) throw new Error(`Aucune ville disponible pour ${country.country_name}. Choisissez un autre pays.`);
    const cityPage = 1;
    const ctp = totalPages(cities);
    await userService.setState(user, 'BUY_CITY', {
      pkgId, proto, duration, durationLabel, price, countries,
      country: country.country_name, countryId: country.id,
      cities, cityPage, countryPage: page
    });
    await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, cityPage), cityPage, ctp));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR(e.message));
    await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, page), page, tp));
  }
}

// ── 5. Ville (paginée) ──────────────────────────────────────────
async function handleBuyCity(user, psid, input) {
  const { pkgId, proto, duration, durationLabel, price, countries, cities } = user.stateData;
  const page = user.stateData.cityPage || 1;
  const tp = totalPages(cities);
  const countryPage = user.stateData.countryPage || 1;

  const result = await handlePaginatedInput({
    user, psid, input,
    items: cities, page, tp,
    stateName: 'BUY_CITY', statePageKey: 'cityPage',
    showFn: (items, p, t) => sendText(psid, M.BUY_SELECT_CITY(items, p, t)),
    onBack: async () => {
      const ctp = totalPages(countries);
      await userService.setState(user, 'BUY_COUNTRY', { pkgId, proto, duration, durationLabel, price, countries, countryPage });
      await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, countryPage), countryPage, ctp));
    }
  });
  if (!result) return;

  const city = result.pageItems[result.idx];
  await sendText(psid, '⏳ Chargement des opérateurs...');
  try {
    const providers = await proxyApiService.getServiceProviders(city.id, pkgId);
    if (!providers || !providers.length) throw new Error(`Aucun opérateur disponible pour ${city.city_name}. Choisissez une autre ville.`);
    const provPage = 1;
    const ptp = totalPages(providers);
    await userService.setState(user, 'BUY_PROVIDER', {
      ...user.stateData,
      city: city.city_name, cityId: city.id,
      providers, providerPage: provPage, cityPage: page
    });
    await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, provPage), provPage, ptp));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR(e.message));
    await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, page), page, tp));
  }
}

// ── 6. Opérateur (paginé) ───────────────────────────────────────
async function handleBuyProvider(user, psid, input) {
  const { pkgId, cities, providers } = user.stateData;
  const page = user.stateData.providerPage || 1;
  const tp = totalPages(providers);
  const cityPage = user.stateData.cityPage || 1;

  const result = await handlePaginatedInput({
    user, psid, input,
    items: providers, page, tp,
    stateName: 'BUY_PROVIDER', statePageKey: 'providerPage',
    showFn: (items, p, t) => sendText(psid, M.BUY_SELECT_PROVIDER(items, p, t)),
    onBack: async () => {
      const ctp = totalPages(cities);
      await userService.setState(user, 'BUY_CITY', { ...user.stateData, cityPage });
      await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, cityPage), cityPage, ctp));
    }
  });
  if (!result) return;

  const provider = result.pageItems[result.idx];
  await sendText(psid, '⏳ Chargement des serveurs disponibles...');
  try {
    const parents = await proxyApiService.getParentProxies(pkgId, provider.id);
    if (!parents || !parents.length) throw new Error(`Aucun serveur disponible chez ${provider.service_provider_name}. Choisissez un autre opérateur.`);
    const parentPage = 1;
    const ptp = totalPages(parents);
    await userService.setState(user, 'BUY_PARENT', {
      ...user.stateData,
      provider: provider.service_provider_name, providerId: provider.id,
      parents, parentPage, providerPage: page
    });
    await sendText(psid, M.BUY_SELECT_PARENT(getPage(parents, parentPage), parentPage, ptp));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR(e.message));
    await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, page), page, tp));
  }
}

// ── 7. Proxy parent (paginé) ────────────────────────────────────
async function handleBuyParent(user, psid, input) {
  const { pkgId, providers, parents } = user.stateData;
  const page = user.stateData.parentPage || 1;
  const tp = totalPages(parents);
  const providerPage = user.stateData.providerPage || 1;

  const result = await handlePaginatedInput({
    user, psid, input,
    items: parents, page, tp,
    stateName: 'BUY_PARENT', statePageKey: 'parentPage',
    showFn: (items, p, t) => sendText(psid, M.BUY_SELECT_PARENT(items, p, t)),
    onBack: async () => {
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
    pkg:      pkgId === 1 ? 'Golden (Mobile Premium)' : 'Silver (Mobile Standard)',
    proto, duration: durationLabel, country, city, provider, price, balance
  }));
}

// ── 8. Confirmation ─────────────────────────────────────────────
async function handleBuyConfirm(user, psid, input) {
  const { parents, parentPage } = user.stateData;

  // 0 = retour vers liste parents
  if (input.type === 'number' && input.value === 0) {
    const page = parentPage || 1;
    const tp   = totalPages(parents);
    await userService.setState(user, 'BUY_PARENT', user.stateData);
    await sendText(psid, M.BUY_SELECT_PARENT(getPage(parents, page), page, tp));
    return;
  }

  // 9 n'a pas de sens ici
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
    const errMsg = err.message || 'Erreur inconnue';
    console.error('❌ Achat échoué:', errMsg, err.stack);
    await sendText(psid, M.BUY_ERROR(errMsg));
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROFIL
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
    const expired = proxies.filter(p => p.status === 'EXPIRÉ');
    if (!expired.length) {
      await sendText(psid, '✅ Aucun proxy expiré à renouveler.');
      await showProfile(user, psid);
      return;
    }
    let msg = `${'─'.repeat(18)}\n🔄 RENOUVELER UN PROXY\n${'─'.repeat(18)}\n\n`;
    expired.slice(0, 8).forEach((p, i) => { msg += `${i + 1} - ${p.ip}:${p.port} (${p.country || '—'})\n`; });
    msg += `\n0 - ↩ Retour`;
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
  await sendText(psid, '♻️ Pour renouveler, rachetez un proxy depuis le menu principal.\n');
  await userService.setState(user, 'BUY_PKG');
  await sendText(psid, M.BUY_SELECT_PKG);
}

// ═══════════════════════════════════════════════════════════════
//  TOP UP
// ═══════════════════════════════════════════════════════════════

async function handleTopUp(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'ANNULER') {
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
        `💳 DEMANDE DE RECHARGE\n\nDe : ${user.email || psid}\nMontant : $${amount.toFixed(2)}\n\n→ Validez depuis le panel admin.`
      );
    } catch { /* ignore */ }
  }

  await userService.setState(user, 'MAIN_MENU');
  await sendText(psid, M.TOPUP_PENDING(amount));
  await sendText(psid, M.MAIN_MENU);
}

// ═══════════════════════════════════════════════════════════════
//  SUPPORT / PRIX
// ═══════════════════════════════════════════════════════════════

async function handleSupport(user, psid, input, rawMessage) {
  if (input.type === 'command' && input.value === 'ANNULER') {
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
    await sendText(psid, '⚠️ Message trop court. Décrivez votre problème.');
    return;
  }
  await SupportMessage.create({ userId: user._id, psid, email: user.email, message });
  const adminPsid = process.env.ADMIN_PSID;
  if (adminPsid && adminPsid !== psid) {
    try { await sendText(adminPsid, `📩 SUPPORT\n\nDe : ${user.email || psid}\n${message}`); } catch { /* ignore */ }
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
