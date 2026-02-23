/**
 * Centralisation de tous les messages du bot
 * Facile à modifier / traduire
 */

const SEP = '━━━━━━━━━━━━━━━━━━';

const M = {

  // ── Bienvenue ──────────────────────────────
  WELCOME: (name) =>
`👋 Bienvenue ${name} sur ProxyBot !

Ce bot vous permet d'acheter des proxies mobiles facilement.

${SEP}
Vous n'avez pas encore de compte.

Tapez 1 pour créer votre compte
Tapez 0 pour annuler`,

  WELCOME_BACK: (email) =>
`👋 Bon retour, ${email} !

${SEP}
Tapez 9 pour accéder au menu principal`,

  // ── Inscription ────────────────────────────
  REGISTER_ASK_EMAIL:
`📧 CRÉATION DE COMPTE — Étape 1/2

Entrez votre adresse email :

(Tapez "annuler" pour annuler)`,

  REGISTER_EMAIL_INVALID:
`❌ Format d'email invalide.

Exemple valide : utilisateur@gmail.com

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
Tapez 9 pour accéder au menu principal`,

  // ── Menu principal ─────────────────────────
  MAIN_MENU:
`${SEP}
📋 MENU PRINCIPAL
${SEP}

1 - 🛒 Acheter un proxy
2 - 👤 Mon profil
3 - 🚪 Se déconnecter
4 - 💬 Contacter le support
5 - 💰 Voir les prix

${SEP}
Répondez avec un chiffre :`,

  // ── Achat ──────────────────────────────────
  BUY_SELECT_PKG:
`${SEP}
🛒 ACHETER UN PROXY — Étape 1/5
Package
${SEP}

1 - 🥇 Golden (IP Mobile Premium)
2 - 🥈 Silver (IP Mobile Standard)

0 - ↩ Retour`,

  BUY_SELECT_PROTO:
`${SEP}
🛒 ACHETER UN PROXY — Étape 2/5
Protocole
${SEP}

1 - HTTP / HTTPS
2 - SOCKS5

0 - ↩ Retour`,

  BUY_SELECT_DURATION: (options) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 3/5\nDurée\n${SEP}\n\n`;
    options.forEach((o, i) => {
      msg += `${i + 1} - ${o.label}  💵 $${o.price.toFixed(2)}\n`;
    });
    msg += `\n0 - ↩ Retour`;
    return msg;
  },

  BUY_SELECT_COUNTRY: (countries) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 4/5\nPays\n${SEP}\n\n`;
    countries.forEach((c, i) => {
      msg += `${i + 1} - ${c.country_name}\n`;
    });
    msg += `\n0 - ↩ Retour`;
    return msg;
  },

  BUY_SELECT_PARENT: (parents) => {
    let msg = `${SEP}\n🛒 ACHETER UN PROXY — Étape 5/5\nChoisir un serveur\n${SEP}\n\n`;
    parents.slice(0, 10).forEach((p, i) => {
      msg += `${i + 1} - ${p.technology || 'Standard'} | Usage: ${p.usage < 0 ? 'N/A' : p.usage + '%'}\n`;
    });
    msg += `\n0 - ↩ Retour`;
    return msg;
  },

  BUY_CONFIRM: (data) =>
`${SEP}
✅ CONFIRMATION D'ACHAT
${SEP}

📦 Package  : ${data.pkg}
📡 Protocole: ${data.proto.toUpperCase()}
⏱  Durée    : ${data.duration}
🌍 Pays     : ${data.country}
💵 Prix     : $${data.price}
💳 Solde    : $${data.balance}
💳 Après    : $${(data.balance - data.price).toFixed(2)}

${SEP}
1 - ✅ Confirmer l'achat
2 - ❌ Annuler

0 - ↩ Retour`,

  BUY_INSUFFICIENT_BALANCE: (price, balance) =>
`❌ Solde insuffisant.

💵 Prix requis   : $${price.toFixed(2)}
💳 Votre solde  : $${balance.toFixed(2)}

Contactez le support pour recharger votre solde.
Tapez 4 depuis le menu ou tapez 9.`,

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
📡 Proto   : ${proxy.protocol.toUpperCase()}
🌍 Pays    : ${proxy.country}
⏱  Expire  : ${proxy.expiresAt ? new Date(proxy.expiresAt).toLocaleDateString('fr-FR') : 'N/A'}

📋 Proxy complet :
${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}

${SEP}
Tapez 9 pour revenir au menu`,

  BUY_ERROR: (msg) =>
`❌ Erreur lors de l'achat :
${msg}

Veuillez réessayer ou contacter le support (tapez 4 depuis le menu).
Tapez 9 pour le menu.`,

  // ── Profil ─────────────────────────────────
  PROFILE: (user, proxies) => {
    const active  = proxies.filter(p => p.status === 'ACTIF');
    const expired = proxies.filter(p => p.status === 'EXPIRÉ');

    let msg = `${SEP}\n👤 MON PROFIL\n${SEP}\n\n`;
    msg += `📧 Email   : ${user.email}\n`;
    msg += `📅 Inscrit : ${new Date(user.createdAt).toLocaleDateString('fr-FR')}\n\n`;

    msg += `${SEP}\n✅ PROXIES ACTIFS (${active.length})\n${SEP}\n`;
    if (active.length === 0) {
      msg += `Aucun proxy actif.\n`;
    } else {
      active.forEach((p, i) => {
        const days = p.daysLeft();
        msg += `\n${i + 1}. ${p.ip}:${p.port}\n`;
        msg += `   📡 ${p.protocol.toUpperCase()} | 🌍 ${p.country || '—'}\n`;
        msg += `   ⏱  Expire : ${p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('fr-FR') : 'N/A'}\n`;
        msg += `   📆 Restant : ${days !== null ? days + ' jour(s)' : 'N/A'}\n`;
      });
    }

    msg += `\n${SEP}\n❌ PROXIES EXPIRÉS (${expired.length})\n${SEP}\n`;
    if (expired.length === 0) {
      msg += `Aucun proxy expiré.\n`;
    } else {
      expired.slice(0, 5).forEach((p, i) => {
        msg += `\n${i + 1}. ${p.ip}:${p.port} — EXPIRÉ\n`;
        msg += `   🌍 ${p.country || '—'} | acheté le ${new Date(p.purchasedAt).toLocaleDateString('fr-FR')}\n`;
      });
    }

    msg += `\n${SEP}\n1 - 🔄 Renouveler un proxy\n0 - ↩ Retour\n9 - 🏠 Menu principal`;
    return msg;
  },

  // ── Prix ───────────────────────────────────
  PRICES:
`${SEP}
💰 GRILLE TARIFAIRE
${SEP}

🥇 PACKAGE GOLDEN (Mobile Premium)
━━━━━━━━━━━━
• 2 heures    → $0.35
• 12 heures   → $0.80
• 1 jour      → $1.50
• 3 jours     → $3.50
• 7 jours     → $7.00
• 15 jours    → $13.00
• 30 jours    → $24.00

🥈 PACKAGE SILVER (Mobile Standard)
━━━━━━━━━━━━
• 2 jours     → $2.00
• 7 jours     → $5.50
• 30 jours    → $15.00

${SEP}
Pour acheter, tapez 9 puis choisissez 1.

0 - ↩ Retour | 9 - 🏠 Menu`,

  // ── Support ────────────────────────────────
  SUPPORT_ASK:
`${SEP}
💬 CONTACTER LE SUPPORT
${SEP}

Écrivez votre message ci-dessous et notre équipe vous répondra rapidement.

(Tapez "annuler" pour annuler)`,

  SUPPORT_SENT:
`✅ Message envoyé au support !

Notre équipe vous répondra dès que possible.

${SEP}
Tapez 9 pour revenir au menu`,

  // ── Déconnexion ────────────────────────────
  LOGOUT:
`🚪 Vous avez été déconnecté avec succès.

À bientôt !
Tapez n'importe quoi pour recommencer.`,

  // ── Erreurs globales ───────────────────────
  INVALID_INPUT:
`⚠️ Entrée invalide.

Répondez avec un chiffre parmi les options proposées.
(Tapez 0 pour retour, 9 pour le menu principal)`,

  INVALID_OPTION: (max) =>
`⚠️ Option invalide. Choisissez entre 1 et ${max}.
(Tapez 0 pour retour, 9 pour le menu)`,

  CANCELLED:
`🚫 Action annulée.

Tapez 9 pour le menu principal.`,

  ERROR_GENERIC:
`❌ Une erreur s'est produite.

Veuillez réessayer ou tapez 9 pour le menu principal.`,

  NOT_LOGGED_IN:
`🔒 Vous n'êtes pas connecté.

Tapez n'importe quoi pour créer ou retrouver votre compte.`
};

module.exports = M;
