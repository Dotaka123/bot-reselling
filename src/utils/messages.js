const SEP = '━━━━━━━━━━━━━━━━━━';
const PAGE_SIZE = 8; // items par page

// Helper pagination
function buildPagedList({ title, step, items, page, totalPages, keyField, labelField, hasNext, hasPrev }) {
  let msg = `${SEP}\n🛒 ${title}\n${SEP}\n\n`;
  if (totalPages > 1) msg += `📄 Page ${page}/${totalPages}\n\n`;
  items.forEach((item, i) => {
    msg += `${i + 1} - ${item[labelField]}\n`;
  });
  msg += '\n';
  if (hasNext) msg += `9 - ➡️ Suite\n`;
  msg += `0 - ↩ Retour`;
  return msg;
}

const M = {

  PAGE_SIZE,

  // ── Bienvenue ──────────────────────────────
  WELCOME: (name) =>
`👋 Bienvenue ${name} sur ProxyBot !

Ce bot vous permet d'acheter des proxies mobiles 4G facilement.

${SEP}
1 - 📝 Créer un compte
2 - 🔓 Se connecter`,

  WELCOME_BACK: (name) =>
`👋 Bon retour ${name} !

${SEP}
1 - 🔓 Se connecter
2 - 📝 Créer un nouveau compte

(Tapez \"annuler\" pour revenir)`,

  // ── Login ──────────────────────────────────
  LOGIN_ASK_EMAIL:
`🔐 CONNEXION — Étape 1/2

Entrez votre adresse email :

(Tapez "annuler" pour annuler)`,

  LOGIN_ASK_PASSWORD:
`🔐 CONNEXION — Étape 2/2

Entrez votre mot de passe :

(Tapez "annuler" pour annuler)`,

  LOGIN_WRONG:
`❌ Email ou mot de passe incorrect.

Réessayez ou tapez "annuler" pour revenir.`,

  LOGIN_SUCCESS: (email) =>
`✅ Connecté avec succès !

📧 ${email}

${SEP}
Tapez 9 pour le menu principal`,

  // ── Captcha ────────────────────────────────
  CAPTCHA: (a, b) =>
`🤖 Vérification anti-robot

Combien font ${a} + ${b} ?

(Tapez le résultat)`,

  CAPTCHA_FAIL:
`❌ Mauvaise réponse. Réessayez.`,

  // ── Inscription ────────────────────────────
  REGISTER_ASK_EMAIL:
`📧 CRÉATION DE COMPTE — Étape 1/2

Entrez votre adresse email :

(Tapez "annuler" pour annuler)`,

  REGISTER_EMAIL_INVALID:
`❌ Format d'email invalide.

Exemple : utilisateur@gmail.com

Veuillez réessayer :`,

  REGISTER_EMAIL_TAKEN:
`❌ Cet email est déjà utilisé.

Essayez un autre email ou tapez "annuler".`,

  REGISTER_ASK_PASSWORD:
`🔑 CRÉATION DE COMPTE — Étape 2/2

Choisissez un mot de passe :
(minimum 6 caractères)

(Tapez "annuler" pour annuler)`,

  REGISTER_PASSWORD_WEAK:
`❌ Mot de passe trop court (minimum 6 caractères).

Veuillez réessayer :`,

  REGISTER_SUCCESS: (email) =>
`✅ Compte créé avec succès !

📧 Email : ${email}

${SEP}
Tapez 9 pour le menu principal`,

  // ── Menu principal ─────────────────────────
  MAIN_MENU:
`${SEP}
📋 MENU PRINCIPAL
${SEP}

1 - 🛒 Acheter un proxy
2 - 👤 Mon profil & proxies
3 - 💳 Recharger mon compte
4 - 💬 Contacter le support
5 - 💰 Voir les prix
6 - 🚪 Se déconnecter

${SEP}
Répondez avec un chiffre :`,

  // ── Achat ──────────────────────────────────
  BUY_SELECT_PKG:
`${SEP}
🛒 ACHETER UN PROXY — Étape 1/7
📦 Package
${SEP}

1 - 🥇 Golden (IP Mobile Premium)
2 - 🥈 Silver (IP Mobile Standard)

0 - ↩ Retour`,

  BUY_SELECT_PROTO:
`${SEP}
🛒 ACHETER UN PROXY — Étape 2/7
📡 Protocole
${SEP}

1 - HTTP / HTTPS
2 - SOCKS5

0 - ↩ Retour`,

  BUY_SELECT_DURATION: (options) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 3/7\n⏱ Durée\n${SEP}\n\n`;
    options.forEach((o, i) => {
      msg += `${i + 1} - ${o.label.padEnd(12)} 💵 $${o.price.toFixed(2)}\n`;
    });
    msg += `\n0 - ↩ Retour`;
    return msg;
  },

  // Pays — paginé
  BUY_SELECT_COUNTRY: (countries, page, totalPages) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 4/7\n🌍 Pays\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    countries.forEach((c, i) => {
      msg += `${i + 1} - ${c.country_name}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Suite\n`;
    msg += `0 - ↩ Retour`;
    return msg;
  },

  // Villes — paginé
  BUY_SELECT_CITY: (cities, page, totalPages) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 5/7\n🏙 Ville\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    cities.forEach((c, i) => {
      msg += `${i + 1} - ${c.city_name}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Suite\n`;
    msg += `0 - ↩ Retour`;
    return msg;
  },

  // Opérateurs — paginé
  BUY_SELECT_PROVIDER: (providers, page, totalPages) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 6/7\n📶 Opérateur mobile\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    providers.forEach((p, i) => {
      msg += `${i + 1} - ${p.service_provider_name}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Suite\n`;
    msg += `0 - ↩ Retour`;
    return msg;
  },

  // Proxies parents — paginé (uniquement is_available + ACTIVE)
  BUY_SELECT_PARENT: (parents, page, totalPages) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 7/7\n🖥 Choisir un serveur\n${SEP}\n`;
    if (totalPages > 1) msg += `\n📄 Page ${page}/${totalPages}\n`;
    msg += '\n';
    parents.forEach((p, i) => {
      const tech = p.technology || '4G';
      const port = p.http_port || p.socks_port || '—';
      msg += `${i + 1} - ${tech} | Port: ${port}\n`;
    });
    msg += '\n';
    if (page < totalPages) msg += `9 - ➡️ Suite\n`;
    msg += `0 - ↩ Retour`;
    return msg;
  },

  BUY_CONFIRM: (data) => {
    const balLine = (data.balance !== null && data.balance !== undefined)
      ? `\n💳 Solde    : $${(+data.balance).toFixed(2)}\n💳 Après    : $${(data.balance - data.price).toFixed(2)}`
      : '';
    return `${SEP}
✅ CONFIRMATION D'ACHAT
${SEP}

📦 Package  : ${data.pkg}
📡 Protocole: ${data.proto.toUpperCase()}
⏱  Durée    : ${data.duration}
🌍 Pays     : ${data.country}
🏙  Ville    : ${data.city || 'N/A'}
📶 Opérateur: ${data.provider || 'N/A'}
💵 Prix     : $${data.price}${balLine}

${SEP}
1 - ✅ Confirmer l'achat
2 - ❌ Annuler

0 - ↩ Retour`;
  },

  BUY_INSUFFICIENT_BALANCE: (price, balance) =>
`❌ Solde insuffisant.

💵 Prix requis  : $${(+price).toFixed(2)}
💳 Votre solde : $${(+balance).toFixed(2)}

Pour recharger votre compte, tapez 9 puis choisissez 3.`,

  BUY_LOADING:
`⏳ Achat en cours, veuillez patienter...`,

  BUY_SUCCESS: (proxy) =>
`${SEP}
🎉 PROXY ACHETÉ AVEC SUCCÈS !
${SEP}

🌐 IP      : ${proxy.ip}
🔌 Port    : ${proxy.port}
👤 Login   : ${proxy.username}
🔑 Pass    : ${proxy.password}
📡 Proto   : ${(proxy.protocol || '').toUpperCase()}
🌍 Pays    : ${proxy.country || 'N/A'}
⏱  Expire  : ${proxy.expiresAt ? new Date(proxy.expiresAt).toLocaleDateString('fr-FR') : 'N/A'}

📋 Chaîne proxy :
${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}

${SEP}
Tapez 9 pour le menu`,

  BUY_ERROR: (msg) =>
`❌ Erreur lors de l'achat :
${msg}

Réessayez ou contactez le support (menu → 4).
Tapez 9 pour le menu.`,

  // ── Top Up ─────────────────────────────────
  TOPUP_MENU: (balance) =>
`${SEP}
💳 RECHARGER MON COMPTE
${SEP}

💰 Solde actuel : $${(+balance).toFixed(2)}

Pour recharger, entrez le montant souhaité en $
(ex: 10 pour $10.00)

${process.env.PAYMENT_INFO || '📲 Contactez le support pour les instructions de paiement.'}

${SEP}
(Tapez "annuler" pour revenir au menu)`,

  TOPUP_INVALID:
`❌ Montant invalide. Entrez un nombre entier positif (ex: 5, 10, 20).`,

  TOPUP_PENDING: (amount) =>
`✅ Demande de recharge envoyée !

💵 Montant demandé : $${(+amount).toFixed(2)}

${process.env.PAYMENT_INFO || '📲 Contactez le support pour finaliser le paiement.'}

Notre équipe créditera votre compte après confirmation du paiement.

${SEP}
Tapez 9 pour le menu`,

  TOPUP_APPROVED: (amount, newBalance) =>
`✅ Recharge approuvée !

💵 Montant crédité : $${(+amount).toFixed(2)}
💳 Nouveau solde   : $${(+newBalance).toFixed(2)}

${SEP}
Tapez 9 pour le menu`,

  // ── Profil ─────────────────────────────────
  PROFILE: (user, proxies) => {
    const active  = proxies.filter(p => p.status === 'ACTIF');
    const expired = proxies.filter(p => p.status === 'EXPIRÉ');
    let msg = `${SEP}\n👤 MON PROFIL\n${SEP}\n\n`;
    msg += `📧 Email   : ${user.email}\n`;
    msg += `💳 Solde   : $${(+(user.balance || 0)).toFixed(2)}\n`;
    msg += `📅 Inscrit : ${new Date(user.createdAt).toLocaleDateString('fr-FR')}\n\n`;

    msg += `${SEP}\n✅ PROXIES ACTIFS (${active.length})\n${SEP}\n`;
    if (!active.length) {
      msg += `Aucun proxy actif.\n`;
    } else {
      active.slice(0, 5).forEach((p, i) => {
        const days = p.daysLeft();
        msg += `\n${i + 1}. ${p.ip}:${p.port}\n`;
        msg += `   📡 ${(p.protocol||'').toUpperCase()} | 🌍 ${p.country || '—'}\n`;
        msg += `   ⏱ ${p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('fr-FR') : 'N/A'}`;
        msg += ` (${days !== null ? days + 'j' : 'N/A'})\n`;
      });
      if (active.length > 5) msg += `\n... et ${active.length - 5} autre(s)\n`;
    }

    msg += `\n${SEP}\n❌ EXPIRÉS (${expired.length})\n${SEP}\n`;
    if (!expired.length) {
      msg += `Aucun proxy expiré.\n`;
    } else {
      expired.slice(0, 3).forEach((p, i) => {
        msg += `\n${i + 1}. ${p.ip}:${p.port} — ${p.country || '—'}\n`;
      });
      if (expired.length > 3) msg += `... et ${expired.length - 3} autre(s)\n`;
    }

    msg += `\n${SEP}\n1 - 🔄 Renouveler un proxy\n0 - ↩ Retour\n9 - 🏠 Menu`;
    return msg;
  },

  // ── Prix ───────────────────────────────────
  PRICES:
`${SEP}
💰 GRILLE TARIFAIRE
${SEP}

🥇 GOLDEN (Mobile Premium)
• 2 heures   → $0.30
• 12 heures  → $0.60
• 3 jours    → $2.50
• 7 jours    → $4.50
• 15 jours   → $10.00
• 30 jours   → $18.00

🥈 SILVER (Mobile Standard)
• 2 jours    → $1.50
• 7 jours    → $4.00
• 30 jours   → $12.00

${SEP}
0 - ↩ Retour | 9 - 🏠 Menu`,

  // ── Support ────────────────────────────────
  SUPPORT_ASK:
`${SEP}
💬 SUPPORT
${SEP}

Écrivez votre message, notre équipe vous répondra rapidement.

(Tapez "annuler" pour annuler)`,

  SUPPORT_SENT:
`✅ Message envoyé au support !

${SEP}
Tapez 9 pour le menu`,

  // ── Divers ─────────────────────────────────
  LOGOUT:
`🚪 Déconnecté avec succès.
À bientôt ! Tapez n'importe quoi pour recommencer.`,

  INVALID_INPUT:
`⚠️ Entrée invalide.
Répondez avec un chiffre parmi les options.
(0 = retour, 9 = menu)`,

  INVALID_OPTION: (max) =>
`⚠️ Option invalide (1 à ${max}).
(0 = retour, 9 = menu)`,

  CANCELLED:
`🚫 Action annulée.
Tapez 9 pour le menu.`,

  ERROR_GENERIC:
`❌ Une erreur s'est produite. Réessayez ou tapez 9 pour le menu.`,

  NOT_LOGGED_IN:
`🔒 Vous n'êtes pas connecté.
Tapez n'importe quoi pour créer ou retrouver votre compte.`
};

module.exports = M;
