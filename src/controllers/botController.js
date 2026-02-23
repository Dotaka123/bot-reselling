const { sendText }       = require('../utils/messenger');
const { parseInput, isValidEmail, isValidPassword } = require('../utils/validators');
const M                  = require('../utils/messages');
const userService        = require('../services/userService');
const proxyService       = require('../services/proxyService');
const proxyApiService    = require('../services/proxyApiService');
const SupportMessage     = require('../models/SupportMessage');

/**
 * ═══════════════════════════════════════════════════════════════
 *  STATE MACHINE PRINCIPALE DU BOT
 *
 *  États disponibles :
 *  WELCOME              → Accueil (utilisateur inconnu)
 *  REGISTER_EMAIL       → Saisie email
 *  REGISTER_PASSWORD    → Saisie mot de passe
 *  MAIN_MENU            → Menu principal
 *  BUY_PKG              → Choix package
 *  BUY_PROTO            → Choix protocole
 *  BUY_DURATION         → Choix durée
 *  BUY_COUNTRY          → Choix pays
 *  BUY_PARENT           → Choix serveur
 *  BUY_CONFIRM          → Confirmation achat
 *  PROFILE              → Profil utilisateur
 *  PROFILE_RENEW        → Renouvellement proxy
 *  SUPPORT              → Message au support
 *  PRICES               → Affichage des prix
 * ═══════════════════════════════════════════════════════════════
 */

// Point d'entrée principal — appelé par le webhook
async function handleMessage(psid, messageText) {
  if (!messageText) return;

  let user;
  try {
    user = await userService.getOrCreateUser(psid);
  } catch (err) {
    console.error('handleMessage getOrCreateUser error:', err);
    await sendText(psid, M.ERROR_GENERIC);
    return;
  }

  const input = parseInput(messageText);

  // ── Commandes globales (sauf pendant l'inscription) ────────────
  if (!['WELCOME', 'REGISTER_EMAIL', 'REGISTER_PASSWORD'].includes(user.state)) {
    if (input.type === 'command') {
      switch (input.value) {
        case 'ANNULER':
          await userService.setState(user, 'MAIN_MENU');
          await sendText(psid, M.CANCELLED);
          await sendText(psid, M.MAIN_MENU);
          return;
        case 'MAIN_MENU':
          if (!user.isLoggedIn) { await sendText(psid, M.NOT_LOGGED_IN); return; }
          await userService.setState(user, 'MAIN_MENU');
          await sendText(psid, M.MAIN_MENU);
          return;
        case 'RETOUR':
          return handleRetour(user, psid);
      }
    }
  }

  // ── Dispatch selon l'état ──────────────────────────────────────
  try {
    switch (user.state) {
      case 'WELCOME':           return handleWelcome(user, psid, input);
      case 'REGISTER_EMAIL':    return handleRegisterEmail(user, psid, input);
      case 'REGISTER_PASSWORD': return handleRegisterPassword(user, psid, input);
      case 'MAIN_MENU':         return handleMainMenu(user, psid, input);
      case 'BUY_PKG':           return handleBuyPkg(user, psid, input);
      case 'BUY_PROTO':         return handleBuyProto(user, psid, input);
      case 'BUY_DURATION':      return handleBuyDuration(user, psid, input);
      case 'BUY_COUNTRY':       return handleBuyCountry(user, psid, input);
      case 'BUY_PARENT':        return handleBuyParent(user, psid, input);
      case 'BUY_CONFIRM':       return handleBuyConfirm(user, psid, input);
      case 'PROFILE':           return handleProfile(user, psid, input);
      case 'PROFILE_RENEW':     return handleProfileRenew(user, psid, input);
      case 'SUPPORT':           return handleSupport(user, psid, input, messageText);
      case 'PRICES':            return handlePrices(user, psid, input);
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
//  HANDLERS — CHAQUE ÉTAT
// ═══════════════════════════════════════════════════════════════

// ── WELCOME ────────────────────────────────────────────────────
async function handleWelcome(user, psid, input) {
  // Si déjà inscrit et connecté
  if (user.isRegistered && user.isLoggedIn) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.WELCOME_BACK(user.email));
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  // Si déjà inscrit mais déconnecté
  if (user.isRegistered && !user.isLoggedIn) {
    user.isLoggedIn = true;
    await user.save();
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.WELCOME_BACK(user.email));
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  // Nouvel utilisateur
  if (input.type === 'number' && input.value === 1) {
    await userService.setState(user, 'REGISTER_EMAIL');
    await sendText(psid, M.REGISTER_ASK_EMAIL);
    return;
  }

  await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
}

// ── REGISTER EMAIL ─────────────────────────────────────────────
async function handleRegisterEmail(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }

  const email = input.value || '';

  if (!isValidEmail(email)) {
    await sendText(psid, M.REGISTER_EMAIL_INVALID);
    return;
  }

  const taken = await userService.isEmailTaken(email);
  if (taken) {
    await sendText(psid, M.REGISTER_EMAIL_TAKEN);
    return;
  }

  // Email valide → demander mot de passe
  await userService.setState(user, 'REGISTER_PASSWORD', { pendingEmail: email.toLowerCase() });
  await sendText(psid, M.REGISTER_ASK_PASSWORD);
}

// ── REGISTER PASSWORD ──────────────────────────────────────────
async function handleRegisterPassword(user, psid, input) {
  if (input.type === 'command' && input.value === 'ANNULER') {
    await userService.setState(user, 'WELCOME');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.WELCOME(user.facebookName || 'ami'));
    return;
  }

  const password = input.value || '';

  if (!isValidPassword(password)) {
    await sendText(psid, M.REGISTER_PASSWORD_WEAK);
    return;
  }

  // Créer le compte
  const email = user.stateData?.pendingEmail;
  user.email        = email;
  user.password     = password; // sera hashé par le pre-save hook
  user.isRegistered = true;
  user.isLoggedIn   = true;
  user.state        = 'MAIN_MENU';
  user.stateData    = {};
  user.lastActivity = new Date();
  await user.save();

  await sendText(psid, M.REGISTER_SUCCESS(email));
  await sendText(psid, M.MAIN_MENU);
}

// ── MAIN MENU ──────────────────────────────────────────────────
async function handleMainMenu(user, psid, input) {
  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_INPUT);
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  switch (input.value) {
    case 1: // Acheter un proxy
      await userService.setState(user, 'BUY_PKG');
      await sendText(psid, M.BUY_SELECT_PKG);
      break;

    case 2: // Profil
      await userService.setState(user, 'PROFILE');
      await showProfile(user, psid);
      break;

    case 3: // Déconnexion
      user.isLoggedIn   = false;
      user.state        = 'WELCOME';
      user.stateData    = {};
      await user.save();
      await sendText(psid, M.LOGOUT);
      break;

    case 4: // Support
      await userService.setState(user, 'SUPPORT');
      await sendText(psid, M.SUPPORT_ASK);
      break;

    case 5: // Prix
      await userService.setState(user, 'PRICES');
      await sendText(psid, M.PRICES);
      break;

    default:
      await sendText(psid, M.INVALID_OPTION(5));
      await sendText(psid, M.MAIN_MENU);
  }
}

// ── BUY — PACKAGE ──────────────────────────────────────────────
async function handleBuyPkg(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  if (input.type !== 'number' || ![1, 2].includes(input.value)) {
    await sendText(psid, M.INVALID_OPTION(2));
    await sendText(psid, M.BUY_SELECT_PKG);
    return;
  }

  const pkgId = input.value;
  const prices = proxyApiService.getPricesForPkg(pkgId);

  await userService.setState(user, 'BUY_PROTO', { pkgId, prices });
  await sendText(psid, M.BUY_SELECT_PROTO);
}

// ── BUY — PROTOCOLE ────────────────────────────────────────────
async function handleBuyProto(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
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

// ── BUY — DURÉE ────────────────────────────────────────────────
async function handleBuyDuration(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
    await userService.setState(user, 'BUY_PROTO', user.stateData);
    await sendText(psid, M.BUY_SELECT_PROTO);
    return;
  }

  const { pkgId, prices, proto } = user.stateData;
  const idx = (input.value || 0) - 1;

  if (input.type !== 'number' || idx < 0 || idx >= prices.length) {
    await sendText(psid, M.INVALID_OPTION(prices.length));
    await sendText(psid, M.BUY_SELECT_DURATION(prices));
    return;
  }

  const pick = prices[idx];

  // Chargement des pays
  await sendText(psid, '⏳ Chargement des pays disponibles...');
  try {
    const countries = await proxyApiService.getCountries(pkgId);
    await userService.setState(user, 'BUY_COUNTRY', {
      pkgId, proto,
      duration:      pick.duration,
      durationLabel: pick.label,
      price:         pick.price,
      countries
    });
    await sendText(psid, M.BUY_SELECT_COUNTRY(countries.slice(0, 15)));
  } catch (e) {
    await sendText(psid, M.BUY_ERROR('Impossible de charger les pays. Réessayez.'));
    await userService.setState(user, 'BUY_DURATION', user.stateData);
    await sendText(psid, M.BUY_SELECT_DURATION(prices));
  }
}

// ── BUY — PAYS ─────────────────────────────────────────────────
async function handleBuyCountry(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
    const { pkgId, prices, proto } = user.stateData;
    await userService.setState(user, 'BUY_DURATION', { pkgId, prices, proto });
    await sendText(psid, M.BUY_SELECT_DURATION(prices || []));
    return;
  }

  const { countries } = user.stateData;
  const list = (countries || []).slice(0, 15);
  const idx  = (input.value || 0) - 1;

  if (input.type !== 'number' || idx < 0 || idx >= list.length) {
    await sendText(psid, M.INVALID_OPTION(list.length));
    await sendText(psid, M.BUY_SELECT_COUNTRY(list));
    return;
  }

  const country = list[idx];

  // Charger les proxies parents directement (on saute villes/opérateurs
  // pour simplifier le flow conversationnel — on prend le premier dispo)
  await sendText(psid, '⏳ Chargement des serveurs disponibles...');
  try {
    const { pkgId, proto, duration, durationLabel, price } = user.stateData;

    // Récupère les villes du pays
    const cities = await proxyApiService.getCities(country.id, pkgId);
    if (!cities || !cities.length) throw new Error('Aucune ville disponible dans ce pays.');

    // Prend les providers de la première ville dispo
    let parents = [];
    for (const city of cities.slice(0, 3)) {
      const providers = await proxyApiService.getServiceProviders(city.id, pkgId);
      for (const sp of (providers || []).slice(0, 2)) {
        const pp = await proxyApiService.getParentProxies(pkgId, sp.id);
        if (pp && pp.length) { parents = pp; break; }
      }
      if (parents.length) break;
    }

    if (!parents.length) throw new Error('Aucun serveur disponible dans ce pays.');

    await userService.setState(user, 'BUY_PARENT', {
      pkgId, proto, duration, durationLabel, price,
      country:     country.country_name,
      countryId:   country.id,
      parents
    });
    await sendText(psid, M.BUY_SELECT_PARENT(parents));

  } catch (e) {
    await sendText(psid, M.BUY_ERROR(e.message));
    await sendText(psid, M.BUY_SELECT_COUNTRY(list));
  }
}

// ── BUY — SERVEUR PARENT ───────────────────────────────────────
async function handleBuyParent(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
    const { pkgId, proto, duration, durationLabel, price, countries } = user.stateData;
    await userService.setState(user, 'BUY_COUNTRY', { pkgId, proto, duration, durationLabel, price, countries: countries || [] });
    await sendText(psid, '⏳ Rechargement des pays...');
    try {
      const cts = await proxyApiService.getCountries(pkgId);
      await sendText(psid, M.BUY_SELECT_COUNTRY(cts.slice(0, 15)));
    } catch (e) {
      await sendText(psid, M.BUY_SELECT_COUNTRY([]));
    }
    return;
  }

  const { parents } = user.stateData;
  const list = (parents || []).slice(0, 10);
  const idx  = (input.value || 0) - 1;

  if (input.type !== 'number' || idx < 0 || idx >= list.length) {
    await sendText(psid, M.INVALID_OPTION(list.length));
    await sendText(psid, M.BUY_SELECT_PARENT(list));
    return;
  }

  const parentProxy = list[idx];
  const { pkgId, proto, duration, durationLabel, price, country } = user.stateData;

  // Balance en cache (mise à jour à chaque login/achat, sans appel réseau)
  const balance = proxyApiService.getCachedBalance();

  await userService.setState(user, 'BUY_CONFIRM', {
    ...user.stateData,
    parentProxyId: parentProxy.id,
    balance
  });

  await sendText(psid, M.BUY_CONFIRM({
    pkg:      pkgId === 1 ? 'Golden (Mobile Premium)' : 'Silver (Mobile Standard)',
    proto,
    duration: durationLabel,
    country,
    price,
    balance
  }));
}

// ── BUY — CONFIRMATION ─────────────────────────────────────────
async function handleBuyConfirm(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
    const { pkgId, parents } = user.stateData;
    await userService.setState(user, 'BUY_PARENT', user.stateData);
    await sendText(psid, M.BUY_SELECT_PARENT(parents || []));
    return;
  }

  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_OPTION(2));
    return;
  }

  if (input.value === 2) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.CANCELLED);
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  if (input.value !== 1) {
    await sendText(psid, M.INVALID_OPTION(2));
    return;
  }

  // ── Achat réel ────────────────────────────
  const { pkgId, proto, duration, durationLabel, price, country, countryId, parentProxyId, balance } = user.stateData;

  // Vérif solde seulement si on a pu récupérer la balance ET qu'elle est clairement insuffisante
  // Si balance = null (échec API), on tente quand même l'achat — l'API rejettera si besoin
  if (balance !== null && balance < price) {
    await sendText(psid, M.BUY_INSUFFICIENT_BALANCE(price, balance));
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  await sendText(psid, M.BUY_LOADING);

  try {
    const proxy = await proxyService.purchaseProxy(user, {
      packageId:     pkgId,
      protocol:      proto,
      duration,
      durationLabel,
      price,
      parentProxyId,
      country,
      countryCode:   countryId
    });

    await sendText(psid, M.BUY_SUCCESS(proxy));
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);

  } catch (err) {
    const errMsg = err.message || 'Erreur inconnue';
    console.error('❌ Achat échoué — message:', errMsg);
    console.error('❌ Achat échoué — stack:', err.stack);
    await sendText(psid, M.BUY_ERROR(errMsg));
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
  }
}

// ── PROFIL ──────────────────────────────────────────────────────
async function showProfile(user, psid) {
  const proxies = await proxyService.getUserProxies(user._id);
  await sendText(psid, M.PROFILE(user, proxies));
}

async function handleProfile(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  if (input.type !== 'number') {
    await sendText(psid, M.INVALID_INPUT);
    await showProfile(user, psid);
    return;
  }

  if (input.value === 1) {
    // Renouvellement
    const proxies = await proxyService.getUserProxies(user._id);
    const expired = proxies.filter(p => p.status === 'EXPIRÉ');
    if (!expired.length) {
      await sendText(psid, '✅ Vous n\'avez aucun proxy expiré à renouveler.');
      await showProfile(user, psid);
      return;
    }
    let msg = `${'-'.repeat(18)}\n🔄 RENOUVELER UN PROXY\n${'–'.repeat(18)}\n\n`;
    expired.slice(0, 8).forEach((p, i) => {
      msg += `${i + 1} - ${p.ip}:${p.port} (${p.country || '—'})\n`;
    });
    msg += `\n0 - ↩ Retour`;
    await userService.setState(user, 'PROFILE_RENEW', { expiredProxies: expired.map(p => p._id.toString()) });
    await sendText(psid, msg);
    return;
  }

  if (input.value === 0) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  await sendText(psid, M.INVALID_OPTION(1));
  await showProfile(user, psid);
}

// ── PROFILE RENEW ───────────────────────────────────────────────
async function handleProfileRenew(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR' || (input.type === 'number' && input.value === 0)) {
    await userService.setState(user, 'PROFILE');
    await showProfile(user, psid);
    return;
  }

  // Redirige vers le flow d'achat pour renouvellement
  await sendText(psid, '♻️ Pour renouveler, veuillez acheter un nouveau proxy.\nVous serez redirigé vers le menu d\'achat.\n');
  await userService.setState(user, 'BUY_PKG');
  await sendText(psid, M.BUY_SELECT_PKG);
}

// ── SUPPORT ──────────────────────────────────────────────────────
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

  // Sauvegarde
  await SupportMessage.create({
    userId:  user._id,
    psid,
    email:   user.email,
    message
  });

  // Notifie l'admin si configuré
  const adminPsid = process.env.ADMIN_PSID;
  if (adminPsid && adminPsid !== psid) {
    try {
      await sendText(adminPsid,
        `📩 NOUVEAU MESSAGE SUPPORT\n\nDe : ${user.email || psid}\nMessage : ${message}`
      );
    } catch (e) { /* ignore */ }
  }

  await userService.setState(user, 'MAIN_MENU');
  await sendText(psid, M.SUPPORT_SENT);
  await sendText(psid, M.MAIN_MENU);
}

// ── PRIX ──────────────────────────────────────────────────────────
async function handlePrices(user, psid, input) {
  if (input.type === 'command' && input.value === 'RETOUR') {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  // Option 9 ou retour
  if (input.type === 'number' && input.value === 9) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  // Réafficher les prix si mauvaise entrée
  await sendText(psid, M.PRICES);
}

// ── RETOUR générique ──────────────────────────────────────────────
async function handleRetour(user, psid) {
  const prev = user.previousState;

  // Mapping état → handler de réaffichage
  const reshow = {
    BUY_PKG:    () => sendText(psid, M.BUY_SELECT_PKG),
    BUY_PROTO:  () => sendText(psid, M.BUY_SELECT_PROTO),
    PROFILE:    () => showProfile(user, psid),
    PRICES:     () => sendText(psid, M.PRICES),
    MAIN_MENU:  () => sendText(psid, M.MAIN_MENU),
  };

  if (prev && reshow[prev]) {
    await userService.setState(user, prev);
    await reshow[prev]();
  } else {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
  }
}

module.exports = { handleMessage };
