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
 *  WELCOME → REGISTER_EMAIL → REGISTER_PASSWORD
 *  MAIN_MENU
 *  BUY_PKG → BUY_PROTO → BUY_DURATION → BUY_COUNTRY →
 *    BUY_CITY → BUY_PROVIDER → BUY_PARENT → BUY_CONFIRM
 *  PROFILE → PROFILE_RENEW
 *  TOPUP
 *  SUPPORT | PRICES
 * ═══════════════════════════════════════════════════════════════
 */

const PAGE = M.PAGE_SIZE; // items par page

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

  // Commandes globales (hors inscription)
  if (!['WELCOME', 'REGISTER_EMAIL', 'REGISTER_PASSWORD'].includes(user.state)) {
    if (input.type === 'command') {
      if (input.value === 'ANNULER') {
        await userService.setState(user, 'MAIN_MENU');
        await sendText(psid, M.CANCELLED);
        await sendText(psid, M.MAIN_MENU);
        return;
      }
    }
    // "9" = menu principal depuis n'importe où (sauf dans le flow d'achat où 9 = page suivante)
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
      case 'REGISTER_EMAIL':     return handleRegisterEmail(user, psid, input);
      case 'REGISTER_PASSWORD':  return handleRegisterPassword(user, psid, input);
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
//  HELPERS PAGINATION
// ═══════════════════════════════════════════════════════════════

function getPage(allItems, page) {
  const start = (page - 1) * PAGE;
  return allItems.slice(start, start + PAGE);
}
function totalPages(allItems) {
  return Math.max(1, Math.ceil(allItems.length / PAGE));
}

// ═══════════════════════════════════════════════════════════════
//  WELCOME / REGISTER
// ═══════════════════════════════════════════════════════════════

async function handleWelcome(user, psid, input) {
  if (user.isRegistered) {
    user.isLoggedIn = true;
    await user.save();
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.WELCOME_BACK(user.email));
    await sendText(psid, M.MAIN_MENU);
    return;
  }
  if (input.type === 'number' && input.value === 1) {
    await userService.setState(user, 'REGISTER_EMAIL');
    await sendText(psid, M.REGISTER_ASK_EMAIL);
    return;
  }
  await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
}

async function handleRegisterEmail(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }
  const email = (input.value || '').trim();
  if (!isValidEmail(email)) { await sendText(psid, M.REGISTER_EMAIL_INVALID); return; }
  if (await userService.isEmailTaken(email)) { await sendText(psid, M.REGISTER_EMAIL_TAKEN); return; }
  await userService.setState(user, 'REGISTER_PASSWORD', { pendingEmail: email.toLowerCase() });
  await sendText(psid, M.REGISTER_ASK_PASSWORD);
}

async function handleRegisterPassword(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }
  const password = input.value || '';
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

// ── 4. Pays ─────────────────────────────────────────────────────
async function handleBuyCountry(user, psid, input) {
  const { pkgId, proto, duration, durationLabel, price, countries } = user.stateData;
  let page = user.stateData.countryPage || 1;
  const tp = totalPages(countries);

  // 0 = retour si page 1, sinon page précédente
  if (input.type === 'number' && input.value === 0) {
    if (page > 1) {
      page--;
      await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, countryPage: page });
      await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, page), page, tp));
    } else {
      await userService.setState(user, 'BUY_DURATION', { pkgId, prices: proxyApiService.getPricesForPkg(pkgId), proto });
      await sendText(psid, M.BUY_SELECT_DURATION(proxyApiService.getPricesForPkg(pkgId)));
    }
    return;
  }

  // 9 = page suivante
  if (input.type === 'number' && input.value === 9 && page < tp) {
    page++;
    await userService.setState(user, 'BUY_COUNTRY', { ...user.stateData, countryPage: page });
    await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, page), page, tp));
    return;
  }

  const pageItems = getPage(countries, page);
  const idx = (input.value || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
    await sendText(psid, M.INVALID_OPTION(pageItems.length));
    await sendText(psid, M.BUY_SELECT_COUNTRY(pageItems, page, tp));
    return;
  }

  const country = pageItems[idx];
  await sendText(psid, '⏳ Chargement des villes...');
  try {
    const cities = await proxyApiService.getCities(country.id, pkgId);
    if (!cities || !cities.length) throw new Error(`Aucune ville disponible pour ${country.country_name}. Choisissez un autre pays.`);
    const cityPage = 1;
    const ctp = totalPages(cities);
    await userService.setState(user, 'BUY_CITY', {
      pkgId, proto, duration, durationLabel, price, countries,
      country: country.country_name, countryId: country.id,
      cities, cityPage
    });
    await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, cityPage), cityPage, ctp));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR(e.message));
    await sendText(psid, M.BUY_SELECT_COUNTRY(pageItems, page, tp));
  }
}

// ── 5. Ville ────────────────────────────────────────────────────
async function handleBuyCity(user, psid, input) {
  const { pkgId, proto, duration, durationLabel, price, countries, country, countryId, cities } = user.stateData;
  let page = user.stateData.cityPage || 1;
  const tp = totalPages(cities);

  if (input.type === 'number' && input.value === 0) {
    if (page > 1) {
      page--;
      await userService.setState(user, 'BUY_CITY', { ...user.stateData, cityPage: page });
      await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, page), page, tp));
    } else {
      // Retour vers pays
      const ctp = totalPages(countries);
      const cp  = user.stateData.countryPage || 1;
      await userService.setState(user, 'BUY_COUNTRY', { pkgId, proto, duration, durationLabel, price, countries, countryPage: cp });
      await sendText(psid, M.BUY_SELECT_COUNTRY(getPage(countries, cp), cp, ctp));
    }
    return;
  }

  if (input.type === 'number' && input.value === 9 && page < tp) {
    page++;
    await userService.setState(user, 'BUY_CITY', { ...user.stateData, cityPage: page });
    await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, page), page, tp));
    return;
  }

  const pageItems = getPage(cities, page);
  const idx = (input.value || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
    await sendText(psid, M.INVALID_OPTION(pageItems.length));
    await sendText(psid, M.BUY_SELECT_CITY(pageItems, page, tp));
    return;
  }

  const city = pageItems[idx];
  await sendText(psid, '⏳ Chargement des opérateurs...');
  try {
    const providers = await proxyApiService.getServiceProviders(city.id, pkgId);
    if (!providers || !providers.length) throw new Error(`Aucun opérateur disponible pour ${city.city_name}. Choisissez une autre ville.`);
    const provPage = 1;
    const ptp = totalPages(providers);
    await userService.setState(user, 'BUY_PROVIDER', {
      ...user.stateData,
      city: city.city_name, cityId: city.id,
      providers, providerPage: provPage
    });
    await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, provPage), provPage, ptp));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR(e.message));
    await sendText(psid, M.BUY_SELECT_CITY(pageItems, page, tp));
  }
}

// ── 6. Opérateur ────────────────────────────────────────────────
async function handleBuyProvider(user, psid, input) {
  const { pkgId, cities, providers } = user.stateData;
  let page = user.stateData.providerPage || 1;
  const tp = totalPages(providers);

  if (input.type === 'number' && input.value === 0) {
    if (page > 1) {
      page--;
      await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, providerPage: page });
      await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, page), page, tp));
    } else {
      // Retour vers ville
      const cp  = user.stateData.cityPage || 1;
      const ctp = totalPages(cities);
      await userService.setState(user, 'BUY_CITY', { ...user.stateData, cityPage: cp });
      await sendText(psid, M.BUY_SELECT_CITY(getPage(cities, cp), cp, ctp));
    }
    return;
  }

  if (input.type === 'number' && input.value === 9 && page < tp) {
    page++;
    await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, providerPage: page });
    await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, page), page, tp));
    return;
  }

  const pageItems = getPage(providers, page);
  const idx = (input.value || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
    await sendText(psid, M.INVALID_OPTION(pageItems.length));
    await sendText(psid, M.BUY_SELECT_PROVIDER(pageItems, page, tp));
    return;
  }

  const provider = pageItems[idx];
  await sendText(psid, '⏳ Chargement des serveurs disponibles...');
  try {
    const parents = await proxyApiService.getParentProxies(pkgId, provider.id);
    // getParentProxies filtre déjà is_available=true ET status=ACTIVE
    if (!parents || !parents.length) throw new Error(`Aucun serveur disponible chez ${provider.service_provider_name}. Choisissez un autre opérateur.`);
    const parentPage = 1;
    const ptp = totalPages(parents);
    await userService.setState(user, 'BUY_PARENT', {
      ...user.stateData,
      provider: provider.service_provider_name, providerId: provider.id,
      parents, parentPage
    });
    await sendText(psid, M.BUY_SELECT_PARENT(getPage(parents, parentPage), parentPage, ptp));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR(e.message));
    await sendText(psid, M.BUY_SELECT_PROVIDER(pageItems, page, tp));
  }
}

// ── 7. Proxy parent ─────────────────────────────────────────────
async function handleBuyParent(user, psid, input) {
  const { providers, parents } = user.stateData;
  let page = user.stateData.parentPage || 1;
  const tp = totalPages(parents);

  if (input.type === 'number' && input.value === 0) {
    if (page > 1) {
      page--;
      await userService.setState(user, 'BUY_PARENT', { ...user.stateData, parentPage: page });
      await sendText(psid, M.BUY_SELECT_PARENT(getPage(parents, page), page, tp));
    } else {
      // Retour vers opérateur
      const pp  = user.stateData.providerPage || 1;
      const ptp = totalPages(providers);
      await userService.setState(user, 'BUY_PROVIDER', { ...user.stateData, providerPage: pp });
      await sendText(psid, M.BUY_SELECT_PROVIDER(getPage(providers, pp), pp, ptp));
    }
    return;
  }

  if (input.type === 'number' && input.value === 9 && page < tp) {
    page++;
    await userService.setState(user, 'BUY_PARENT', { ...user.stateData, parentPage: page });
    await sendText(psid, M.BUY_SELECT_PARENT(getPage(parents, page), page, tp));
    return;
  }

  const pageItems = getPage(parents, page);
  const idx = (input.value || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
    await sendText(psid, M.INVALID_OPTION(pageItems.length));
    await sendText(psid, M.BUY_SELECT_PARENT(pageItems, page, tp));
    return;
  }

  const parentProxy = pageItems[idx];
  const { pkgId, proto, duration, durationLabel, price, country, city, provider } = user.stateData;
  const balance = user.balance || 0;

  await userService.setState(user, 'BUY_CONFIRM', {
    ...user.stateData,
    parentProxyId: parentProxy.id,
    balance
  });

  await sendText(psid, M.BUY_CONFIRM({
    pkg:      pkgId === 1 ? 'Golden (Mobile Premium)' : 'Silver (Mobile Standard)',
    proto, duration: durationLabel, country, city, provider, price, balance
  }));
}

// ── 8. Confirmation ─────────────────────────────────────────────
async function handleBuyConfirm(user, psid, input) {
  const { parents, parentPage } = user.stateData;

  if (input.type === 'number' && input.value === 0) {
    const page = parentPage || 1;
    const tp   = totalPages(parents);
    await userService.setState(user, 'BUY_PARENT', user.stateData);
    await sendText(psid, M.BUY_SELECT_PARENT(getPage(parents, page), page, tp));
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

  // Vérification du solde utilisateur (wallet MongoDB)
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

    // Débite le wallet utilisateur
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
    let msg = `${'-'.repeat(18)}\n🔄 RENOUVELER UN PROXY\n${'-'.repeat(18)}\n\n`;
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
  if ((input.type === 'command' && input.value === 'RETOUR') || (input.type === 'number' && input.value === 0)) {
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

  const amount = parseFloat(rawMessage?.trim());
  if (isNaN(amount) || amount <= 0) {
    await sendText(psid, M.TOPUP_INVALID);
    await sendText(psid, M.TOPUP_MENU(user.balance || 0));
    return;
  }

  // Crée la demande en base
  await TopUpRequest.create({
    userId: user._id,
    psid:   user.psid,
    email:  user.email,
    amount
  });

  // Notifie l'admin
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
  const message = rawMessage?.trim();
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
