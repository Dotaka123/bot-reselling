const { sendText }      = require('../utils/messenger');
const { parseInput, isValidEmail, isValidPassword } = require('../utils/validators');
const M                 = require('../utils/messages');
const userService       = require('../services/userService');
const proxyService      = require('../services/proxyService');
const proxyApiService   = require('../services/proxyApiService');
const SupportMessage    = require('../models/SupportMessage');
const TopUpRequest      = require('../models/TopUpRequest');

const PAGE = M.PAGE_SIZE || 8;
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

async function handlePaginatedInput({ user, psid, input, items, page, tp,
  stateName, statePageKey, showFn, onBack }) {
  const n = input.type === 'number' ? input.value : null;

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

  const pageItems = getPage(items, page);
  const idx = (n || 0) - 1;
  if (input.type !== 'number' || idx < 0 || idx >= pageItems.length) {
    await sendText(psid, "❌ Invalid option. Please choose a number from the list.");
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
    return;
  }

  const input = parseInput(messageText);

  // --- FORCED FACEBOOK SUBSCRIPTION CHECK ---
  if (!user.isPageSubscriber && user.state !== 'FB_VERIFICATION') {
    await userService.setState(user, 'FB_VERIFICATION');
    await sendText(psid, `👋 Welcome! To use this bot, you must first subscribe to our Facebook page:\n\n🔗 ${FACEBOOK_PAGE_URL}\n\nAfter subscribing, please type "Done" to continue.`);
    return;
  }

  const FLOW_STATES = ['FB_VERIFICATION','CAPTCHA_REGISTER','CAPTCHA_LOGIN','REGISTER_EMAIL','REGISTER_PASSWORD','LOGIN_EMAIL','LOGIN_PASSWORD'];
  if (!FLOW_STATES.includes(user.state)) {
    if (input.type === 'command' && input.value === 'CANCEL') {
      await userService.setState(user, 'MAIN_MENU');
      await sendText(psid, "🏠 Returning to Main Menu.");
      await sendText(psid, M.MAIN_MENU);
      return;
    }
  }

  try {
    switch (user.state) {
      case 'FB_VERIFICATION':    return handleFBVerification(user, psid, input);
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
      case 'TOPUP':              return handleTopUp(user, psid, input, messageText);
      case 'SUPPORT':            return handleSupport(user, psid, input, messageText);
      default:
        await userService.setState(user, 'MAIN_MENU');
        await sendText(psid, M.MAIN_MENU);
    }
  } catch (err) {
    console.error(`❌ State [${user.state}] error:`, err);
    await sendText(psid, "⚠️ An error occurred. Please try again or type CANCEL.");
  }
}

// ═══════════════════════════════════════════════════════════════
//  STATES HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleFBVerification(user, psid, input) {
  const text = input.raw.toLowerCase().trim();
  
  if (text === 'done' || text === 'fait') {
    user.isPageSubscriber = true;
    await user.save();
    await sendText(psid, "✅ Thank you! Subscription verified.");
    await userService.setState(user, 'WELCOME');
    await handleWelcome(user, psid, input);
  } else {
    await sendText(psid, `⚠️ Please subscribe to our page first:\n${FACEBOOK_PAGE_URL}\n\nThen type "Done".`);
  }
}

async function handleWelcome(user, psid, input) {
  // If user is not logged in, show login/register options
  if (!user.isLoggedIn) {
    const msg = "Welcome to our Proxy Service!\n\n1. Login\n2. Register\n\nPlease select an option:";
    await sendText(psid, msg);
    // Logic to switch to Captcha based on selection...
    if (input.value === 1) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_LOGIN', { captcha: nc });
        await sendText(psid, M.CAPTCHA(nc.a, nc.b));
    } else if (input.value === 2) {
        const nc = generateCaptcha();
        await userService.setState(user, 'CAPTCHA_REGISTER', { captcha: nc });
        await sendText(psid, M.CAPTCHA(nc.a, nc.b));
    }
  } else {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
  }
}

// ═══════════════════════════════════════════════════════════════
//  TOP UP (Updated with your Payment Info)
// ═══════════════════════════════════════════════════════════════

async function handleTopUp(user, psid, input, rawMessage) {
  if (input.type === 'number' && input.value === 0) {
    await userService.setState(user, 'MAIN_MENU');
    await sendText(psid, M.MAIN_MENU);
    return;
  }

  const amount = parseFloat((rawMessage || '').trim());
  if (isNaN(amount) || amount <= 0) {
    let paymentMsg = "💳 --- TOP UP INSTRUCTIONS ---\n\n";
    paymentMsg += "Choose payment method:\n";
    paymentMsg += "🔸 Binance Recharge ID: 909914646\n";
    paymentMsg += "🔸 Bkash Number: 01567906551\n";
    paymentMsg += "🔸 Nogod Number: 01567906551\n";
    paymentMsg += "🔸 Rocket Number: 01567906551\n\n";
    paymentMsg += "Step 1: Send the amount to one of the numbers above.\n";
    paymentMsg += "Step 2: Enter the amount you sent here in the chat to notify admin.\n\n";
    paymentMsg += "0. Back";
    
    await sendText(psid, paymentMsg);
    return;
  }

  // Create request
  await TopUpRequest.create({ userId: user._id, psid: user.psid, email: user.email, amount });

  await sendText(psid, `✅ Your request for $${amount.toFixed(2)} has been sent to admin.\nIt will be processed once the payment is verified.`);
  await userService.setState(user, 'MAIN_MENU');
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
