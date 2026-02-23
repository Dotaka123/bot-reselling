const Proxy    = require('../models/Proxy');
const proxyApi = require('./proxyApiService');

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

async function purchaseProxy(user, purchaseData) {
  const { packageId, protocol, duration, durationLabel, price, parentProxyId, country, countryCode } = purchaseData;

  // Génère credentials (underscore autorisé: a-z 0-9 _ -)
  const creds = proxyApi.generateCredentials(`u${user.psid.slice(-4)}`);
  console.log(`🔑 Credentials: ${creds.username} / ${creds.password}`);

  // buyProxy retourne directement l'objet proxy (res.proxy) après le fix
  const p = await proxyApi.buyProxy({
    parentProxyId,
    packageId,
    protocol,
    duration,
    username: creds.username,
    password: creds.password
  });

  // Calcul expiration
  let expiresAt;
  if (p.expire_at) {
    expiresAt = new Date(p.expire_at);
  } else {
    expiresAt = new Date(Date.now() + parseFloat(duration) * 24 * 3600 * 1000);
  }

  const proxy = await Proxy.create({
    userId:       user._id,
    psid:         user.psid,
    ip:           p.ip_addr,
    port:         p.port,
    username:     p.username || creds.username,
    password:     p.password || creds.password,
    protocol:     p.type || protocol,
    country:      p.country_name || country,
    countryCode,
    city:         p.city_name,
    provider:     p.service_provider,
    apiProxyId:   p.id,
    packageId,
    duration,
    packageLabel: durationLabel,
    price,
    expiresAt,
    status:       'ACTIF',
    rawData:      p
  });

  return proxy;
}

async function expireOldProxies() {
  const result = await Proxy.updateMany(
    { status: 'ACTIF', expiresAt: { $lt: new Date() } },
    { $set: { status: 'EXPIRÉ' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🔄 Cron: ${result.modifiedCount} proxy(s) marqué(s) EXPIRÉ`);
  }
  return result.modifiedCount;
}

module.exports = { getUserProxies, purchaseProxy, expireOldProxies };
