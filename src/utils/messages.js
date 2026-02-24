const SEP = '━━━━━━━━━━━━━━━━━━';
const PAGE_SIZE = 8; // items per page

// Helper pagination
function buildPagedList({ title, step, items, page, totalPages, keyField, labelField, hasNext, hasPrev }) {
  let msg = `${SEP}\n🛒 ${title}\n${SEP}\n\n`;
  if (totalPages > 1) msg += `📄 Page ${page}/${totalPages}\n\n`;
  items.forEach((item, i) => {
    msg += `${i + 1} - ${item[labelField]}\n`;
  });
  msg += '\n';
  if (hasNext) msg += `9 - ➡️ Next\n`;
  msg += `0 - ↩ Back`;
  return msg;
}

const M = {

  PAGE_SIZE,

  // ── Welcome ──────────────────────────────────
  WELCOME: (name) =>
`👋 Welcome ${name} to ProxyBot!

This bot allows you to easily purchase 4G mobile proxies.

Please follow these steps:
1️⃣ Subscribe to our Facebook page
2️⃣ Click "Done" below to proceed

Once subscribed, select an option:

${SEP}
1 - 📝 Create Account
2 - 🔓 Sign In`,

  WELCOME_BACK: (name) =>
`👋 Welcome back ${name}!

${SEP}
1 - 🔓 Sign In
2 - 📝 Create New Account

(Type "cancel" to go back)`,

  FACEBOOK_VERIFICATION_PENDING:
`📱 Please Subscribe to Our Facebook Page

To use ProxyBot, you must first:
1. Subscribe to our Facebook page
2. Then click "Done" button

This helps us stay connected with our community.

(Type "done" when you've subscribed)`,

  FACEBOOK_VERIFICATION_ERROR:
`❌ Verification Failed

Please make sure you have subscribed to our Facebook page.
Visit: https://www.facebook.com/profile.php?id=61552396135882

Then type "done" to try again.`,

  // ── Login ──────────────────────────────────────
  LOGIN_ASK_EMAIL:
`🔐 SIGN IN — Step 1/2

Enter your email address:

(Type "cancel" to cancel)`,

  LOGIN_ASK_PASSWORD:
`🔐 SIGN IN — Step 2/2

Enter your password:

(Type "cancel" to cancel)`,

  LOGIN_WRONG:
`❌ Email or password incorrect.

Try again or type "cancel" to go back.`,

  LOGIN_SUCCESS: (email) =>
`✅ Signed in successfully!

📧 ${email}

${SEP}
Type 9 for main menu`,

  // ── Captcha ────────────────────────────────
  CAPTCHA: (a, b) =>
`🤖 Anti-robot Verification

What is ${a} + ${b} ?

(Type the result)`,

  CAPTCHA_FAIL:
`❌ Wrong answer. Try again.`,

  // ── Registration ────────────────────────────
  REGISTER_ASK_EMAIL:
`📧 CREATE ACCOUNT — Step 1/2

Enter your email address:

(Type "cancel" to cancel)`,

  REGISTER_EMAIL_INVALID:
`❌ Invalid email format.

Example: user@gmail.com

Please try again:`,

  REGISTER_EMAIL_TAKEN:
`❌ This email is already in use.

Try another email or type "cancel".`,

  REGISTER_ASK_PASSWORD:
`🔑 CREATE ACCOUNT — Step 2/2

Choose a password:
(minimum 6 characters)

(Type "cancel" to cancel)`,

  REGISTER_PASSWORD_WEAK:
`❌ Password too short (minimum 6 characters).

Please try again:`,

  REGISTER_SUCCESS: (email) =>
`✅ Account created successfully!

📧 Email: ${email}

${SEP}
Type 9 for main menu`,

  // ── Main Menu ─────────────────────────
  MAIN_MENU:
`${SEP}
📋 MAIN MENU
${SEP}

1 - 🛒 Buy Proxy
2 - 👤 My Profile & Proxies
3 - 💳 Add Balance
4 - 💬 Contact Support
5 - 💰 View Prices
6 - 🚪 Sign Out

${SEP}
Reply with a number:`,

  // ── Purchase ──────────────────────────────────
  BUY_SELECT_PKG:
`${SEP}
🛒 BUY PROXY — Step 1/7
📦 Package
${SEP}

1 - 🥇 Golden (Premium Mobile IP)
2 - 🥈 Silver (Standard Mobile IP)

0 - ↩ Back`,

  BUY_SELECT_PROTO:
`${SEP}
🛒 BUY PROXY — Step 2/7
📡 Protocol
${SEP}

1 - HTTP / HTTPS
2 - SOCKS5

0 - ↩ Back`,

  BUY_SELECT_DURATION: (options) => {
    let msg = `${SEP}\n🛒 BUY PROXY — Step 3/7\n⏱ Duration\n${SEP}\n\n`;
    options.forEach((o, i) => {
      msg += `${i + 1} - ${o.label.padEnd(12)} 💵 $${o.price.toFixed(2)}\n`;
    });
    msg += `\n0 - ↩ Back`;
    return msg;
  },

  // Countries — paginated
  BUY_SELECT_COUNTRY: (countries, page, totalPages) => {
    let msg = `${SEP}\n🛒 BUY PROXY — Step 4/7\n🌍 Country\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    countries.forEach((c, i) => {
      msg += `${i + 1} - ${c.country_name}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Next\n`;
    msg += `0 - ↩ Back`;
    return msg;
  },

  // Cities — paginated
  BUY_SELECT_CITY: (cities, page, totalPages) => {
    let msg = `${SEP}\n🛒 BUY PROXY — Step 5/7\n🏙 City\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    cities.forEach((c, i) => {
      msg += `${i + 1} - ${c.city_name}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Next\n`;
    msg += `0 - ↩ Back`;
    return msg;
  },

  // Mobile Operators — paginated
  BUY_SELECT_PROVIDER: (providers, page, totalPages) => {
    let msg = `${SEP}\n🛒 BUY PROXY — Step 6/7\n📶 Mobile Operator\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    providers.forEach((p, i) => {
      msg += `${i + 1} - ${p.service_provider_name}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Next\n`;
    msg += `0 - ↩ Back`;
    return msg;
  },

  // Parent proxies — paginated (only is_available + ACTIVE)
  BUY_SELECT_PARENT: (parents, page, totalPages) => {
    let msg = `${SEP}\n🛒 BUY PROXY — Step 7/7\n🖥 Choose Server\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    parents.forEach((p, i) => {
      const tech = p.technology || '4G';
      const port = p.http_port || p.socks_port || '—';
      msg += `${i + 1} - ${tech} | Port: ${port}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Next\n`;
    msg += `0 - ↩ Back`;
    return msg;
  },

  BUY_CONFIRM: (data) => {
    const balLine = (data.balance !== null && data.balance !== undefined)
      ? `\n💳 Balance   : $${(+data.balance).toFixed(2)}\n💳 After     : $${(data.balance - data.price).toFixed(2)}`
      : '';
    return `${SEP}
✅ CONFIRM PURCHASE
${SEP}

📦 Package  : ${data.pkg}
📡 Protocol : ${data.proto.toUpperCase()}
⏱  Duration : ${data.duration}
🌍 Country  : ${data.country}
🏙  City     : ${data.city || 'N/A'}
📶 Operator : ${data.provider || 'N/A'}
💵 Price    : $${data.price}${balLine}

${SEP}
1 - ✅ Confirm Purchase
2 - ❌ Cancel

0 - ↩ Back`;
  },

  BUY_INSUFFICIENT_BALANCE: (price, balance) =>
`❌ Insufficient Balance

💵 Price Required : $${(+price).toFixed(2)}
💳 Your Balance   : $${(+balance).toFixed(2)}

To add balance, type 9 then select 3.`,

  BUY_LOADING:
`⏳ Processing purchase, please wait...`,

  BUY_SUCCESS: (proxy) =>
`${SEP}
🎉 PROXY PURCHASED SUCCESSFULLY!
${SEP}

🌐 IP      : ${proxy.ip}
🔌 Port    : ${proxy.port}
👤 Login   : ${proxy.username}
🔑 Pass    : ${proxy.password}
📡 Proto   : ${(proxy.protocol || '').toUpperCase()}
🌍 Country : ${proxy.country || 'N/A'}
⏱  Expires  : ${proxy.expiresAt ? new Date(proxy.expiresAt).toLocaleDateString('en-US') : 'N/A'}

📋 Proxy String:
${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}

${SEP}
Type 9 for menu`,

  BUY_ERROR: (msg) =>
`❌ Purchase Error:
${msg}

Try again or contact support (menu → 4).
Type 9 for menu.`,

  // ── Top Up ─────────────────────────────────
  TOPUP_MENU: (balance) =>
`${SEP}
💳 ADD BALANCE
${SEP}

💰 Current Balance: $${(+balance).toFixed(2)}

To add balance, enter the desired amount in $
(ex: 10 for $10.00)

${SEP}
PAYMENT METHODS:

🔸 Binance
   Recharge ID: 909914646

🔸 Bkash
   Recharge Number: 01567906551

🔸 Nogod
   Recharge Number: 01567906551

🔸 Rocket
   Recharge Number: 01567906551

${SEP}
(Type "cancel" to go back to menu)`,

  TOPUP_INVALID:
`❌ Invalid amount. Enter a positive number (ex: 5, 10, 20).`,

  TOPUP_PENDING: (amount) =>
`✅ Top-up request sent!

💵 Requested Amount: $${(+amount).toFixed(2)}

${process.env.PAYMENT_INFO || '📲 Contact support to complete the payment.'}

Our team will credit your account after confirming payment.

${SEP}
Type 9 for menu`,

  TOPUP_APPROVED: (amount, newBalance) =>
`✅ Top-up Approved!

💵 Amount Credited : $${(+amount).toFixed(2)}
💳 New Balance     : $${(+newBalance).toFixed(2)}

${SEP}
Type 9 for menu`,

  // ── Profile ─────────────────────────────────
  PROFILE: (user, proxies) => {
    const active  = proxies.filter(p => p.status === 'ACTIVE');
    const expired = proxies.filter(p => p.status === 'EXPIRED');
    let msg = `${SEP}\n👤 MY PROFILE\n${SEP}\n\n`;
    msg += `📧 Email    : ${user.email}\n`;
    msg += `💳 Balance  : $${(+(user.balance || 0)).toFixed(2)}\n`;
    msg += `📅 Joined   : ${new Date(user.createdAt).toLocaleDateString('en-US')}\n\n`;

    msg += `${SEP}\n✅ ACTIVE PROXIES (${active.length})\n${SEP}\n`;
    if (!active.length) {
      msg += `No active proxies.\n`;
    } else {
      active.slice(0, 5).forEach((p, i) => {
        const days = p.daysLeft();
        msg += `\n${i + 1}. ${p.ip}:${p.port}\n`;
        msg += `   📡 ${(p.protocol||'').toUpperCase()} | 🌍 ${p.country || '—'}\n`;
        msg += `   ⏱ ${p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('en-US') : 'N/A'}`;
        msg += ` (${days !== null ? days + 'd' : 'N/A'})\n`;
      });
      if (active.length > 5) msg += `\n... and ${active.length - 5} more\n`;
    }

    msg += `\n${SEP}\n❌ EXPIRED (${expired.length})\n${SEP}\n`;
    if (!expired.length) {
      msg += `No expired proxies.\n`;
    } else {
      expired.slice(0, 3).forEach((p, i) => {
        msg += `\n${i + 1}. ${p.ip}:${p.port} — ${p.country || '—'}\n`;
      });
      if (expired.length > 3) msg += `... and ${expired.length - 3} more\n`;
    }

    msg += `\n${SEP}\n1 - 🔄 Renew Proxy\n0 - ↩ Back\n9 - 🏠 Menu`;
    return msg;
  },

  // ── Prices ───────────────────────────────────
  PRICES:
`${SEP}
💰 PRICING
${SEP}

🥇 GOLDEN (Premium Mobile IP)
• 2 hours    → $0.30
• 12 hours   → $0.60
• 3 days     → $2.50
• 7 days     → $4.50
• 15 days    → $10.00
• 30 days    → $18.00

🥈 SILVER (Standard Mobile IP)
• 2 days     → $1.50
• 7 days     → $4.00
• 30 days    → $12.00

${SEP}
0 - ↩ Back | 9 - 🏠 Menu`,

  // ── Support ────────────────────────────────
  SUPPORT_ASK:
`${SEP}
💬 SUPPORT
${SEP}

Write your message. Our team will respond quickly.

(Type "cancel" to cancel)`,

  SUPPORT_SENT:
`✅ Message sent to support!

${SEP}
Type 9 for menu`,

  // ── Misc ─────────────────────────────────
  LOGOUT:
`🚪 Signed out successfully.
See you soon! Type anything to get started.`,

  INVALID_INPUT:
`⚠️ Invalid input.
Reply with a number from the options.
(0 = back, 9 = menu)`,

  INVALID_OPTION: (max) =>
`⚠️ Invalid option (1 to ${max}).
(0 = back, 9 = menu)`,

  CANCELLED:
`🚫 Action cancelled.
Type 9 for menu.`,

  ERROR_GENERIC:
`❌ An error occurred. Try again or type 9 for menu.`,

  NOT_LOGGED_IN:
`🔒 You are not logged in.
Type anything to create or access your account.`
};

module.exports = M;
