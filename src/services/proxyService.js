const Proxy        = require('../models/Proxy');
const proxyApi     = require('./proxyApiService');

/**
 * Récupère tous les proxies d'un utilisateur avec statut à jour
 */
async function getUserProxies(userId) {
  const proxies = await Proxy.find({ userId }).sort({ purchasedAt: -1 });

  // Met à jour le statut dynamiquement
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
 */
async function purchaseProxy(user, purchaseData) {
  const {
    packageId,
    protocol,
    duration,
    durationLabel,
    price,
    parentProxyId,
    country,
    countryCode
  } = purchaseData;

  // Génère des credentials uniques
  const creds = proxyApi.generateCredentials(
    `p${user.psid.slice(-4)}`
  );

  // Appel API
  const apiResult = await proxyApi.buyProxy({
    parentProxyId,
    packageId,
    protocol,
    duration,
    username: creds.username,
    password: creds.password
  });

  // Calcul date d'expiration
  let expiresAt = null;
  if (apiResult.expire_at) {
    expiresAt = new Date(apiResult.expire_at);
  } else {
    expiresAt = new Date(Date.now() + duration * 24 * 3600 * 1000);
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
