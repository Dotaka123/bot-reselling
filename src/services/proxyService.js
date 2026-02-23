const Proxy        = require('../models/Proxy');
const proxyApi     = require('./proxyApiService');

/**
 * Récupère tous les proxies d'un utilisateur avec statut à jour
 */
async function getUserProxies(userId) {
  const proxies = await Proxy.find({ userId }).sort({ purchasedAt: -1 });
  const now = new Date();
  const toSave = [];
  for (const p of proxies) {
    if (p.expiresAt && now > p.expiresAt && p.status === 'ACTIF') {
      p.status = 'EXPIRÉ';
      toSave.push(p.save());
    }
  }
  if (toSave.length) await Promise.all(toSave);
  return proxies;
}

/**
 * Achète un proxy via l'API et le sauvegarde en base
 * Gère la génération/vérification de credentials et les erreurs API
 */
async function purchaseProxy(user, purchaseData) {
  const { packageId, protocol, duration, durationLabel, price, parentProxyId, country, countryCode } = purchaseData;

  // Génère des credentials uniques et vérifie la dispo (max 5 tentatives)
  let creds;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = proxyApi.generateCredentials(`u${user.psid.slice(-4)}`);
    const available = await proxyApi.checkUsername(candidate.username);
    if (available) { creds = candidate; break; }
    console.warn(`Username ${candidate.username} déjà pris, nouvel essai...`);
  }
  if (!creds) {
    creds = proxyApi.generateCredentials('px' + Date.now().toString(36).slice(-4));
  }

  console.log(`🔑 Credentials générés: ${creds.username} / ${creds.password}`);

  // Appel API d'achat
  const apiResult = await proxyApi.buyProxy({
    parentProxyId,
    packageId,
    protocol,
    duration,
    username: creds.username,
    password: creds.password
  });

  console.log('✅ Résultat achat API:', JSON.stringify(apiResult));

  // Calcul date d'expiration
  let expiresAt;
  if (apiResult.expire_at) {
    expiresAt = new Date(apiResult.expire_at);
  } else {
    // Fallback : duration en jours (si < 1, c'est en fraction de jour = heures)
    expiresAt = new Date(Date.now() + parseFloat(duration) * 24 * 3600 * 1000);
  }

  // Sauvegarde en base
  const proxy = await Proxy.create({
    userId:       user._id,
    psid:         user.psid,
    ip:           apiResult.ip_addr,
    port:         apiResult.port,
    username:     apiResult.username || creds.username,
    password:     apiResult.password || creds.password,
    protocol:     apiResult.type || protocol,
    country:      apiResult.country_name || country,
    countryCode,
    city:         apiResult.city_name,
    provider:     apiResult.service_provider,
    apiProxyId:   apiResult.id,
    packageId,
    duration,
    packageLabel: durationLabel,
    price,
    expiresAt,
    status:       'ACTIF',
    rawData:      apiResult
  });

  return proxy;
}

/**
 * Marque les proxies expirés (appelé par le cron)
 */
async function expireOldProxies() {
  const result = await Proxy.updateMany(
    { status: 'ACTIF', expiresAt: { $lt: new Date() } },
    { $set: { status: 'EXPIRÉ' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🔄 Cron : ${result.modifiedCount} proxy(s) marqué(s) EXPIRÉ`);
  }
  return result.modifiedCount;
}

module.exports = { getUserProxies, purchaseProxy, expireOldProxies };
