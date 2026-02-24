const axios = require('axios');

const BASE         = process.env.PROXY_API_BASE; // ex: https://proxyshop-api-v1.onrender.com
const API_EMAIL    = process.env.PROXY_API_EMAIL;
const API_PASSWORD = process.env.PROXY_API_PASSWORD;
const API_PREFIX   = '/api/reseller'; // TOUS les endpoints ont ce préfixe

let masterToken    = null;
let masterTokenExp = 0;
let cachedBalance  = null; // balance récupérée au dernier login, mise à jour après chaque achat

// Prix locaux configurables via env (miroir de /api/reseller/prices)
const PROXY_PRICES = {
  1: [
    { duration: 0.02, label: '2 heures',  price: parseFloat(process.env.PRICE_1_2H  || '0.30') },
    { duration: 0.12, label: '12 heures', price: parseFloat(process.env.PRICE_1_12H || '0.60') },
    { duration: 3,    label: '3 jours',   price: parseFloat(process.env.PRICE_1_3D  || '2.50') },
    { duration: 7,    label: '7 jours',   price: parseFloat(process.env.PRICE_1_7D  || '4.50') },
    { duration: 15,   label: '15 jours',  price: parseFloat(process.env.PRICE_1_15D || '10.00') },
    { duration: 30,   label: '30 jours',  price: parseFloat(process.env.PRICE_1_30D || '18.00') },
  ],
  2: [
    { duration: 2,  label: '2 jours',  price: parseFloat(process.env.PRICE_2_2D  || '1.50') },
    { duration: 7,  label: '7 jours',  price: parseFloat(process.env.PRICE_2_7D  || '4.00') },
    { duration: 30, label: '30 jours', price: parseFloat(process.env.PRICE_2_30D || '12.00') },
  ]
};

// ── Auth ──────────────────────────────────────────────────────────
async function getMasterToken() {
  const now = Date.now() / 1000;
  if (masterToken && masterTokenExp > now + 300) return masterToken;

  console.log('🔑 Login API reseller...');
  const res = await axios.post(
    `${BASE}${API_PREFIX}/login`,
    { email: API_EMAIL, password: API_PASSWORD },
    { timeout: 20000 }
  );

  const data = res.data;
  masterToken    = data.token;
  // Token valide 7 jours selon la doc
  masterTokenExp = now + (7 * 24 * 3600) - 300;

  // La réponse de login contient aussi la balance
  if (data.reseller?.balance !== undefined) {
    cachedBalance = data.reseller.balance;
    console.log(`🔑 Token renouvelé — Balance API: $${cachedBalance}`);
  } else {
    console.log('🔑 Token master renouvelé');
  }

  return masterToken;
}

// ── Appel API générique avec retry ────────────────────────────────
async function call(method, endpoint, data = null, params = null, retries = 3) {
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const token = await getMasterToken();
      const cfg = {
        method,
        url:     `${BASE}${API_PREFIX}${endpoint}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 25000
      };
      if (data)   cfg.data   = data;
      if (params) cfg.params = params;

      const response = await axios(cfg).catch(async (err) => {
        if (err.response?.status === 401) {
          masterToken = null;
          const t2 = await getMasterToken();
          cfg.headers.Authorization = `Bearer ${t2}`;
          return axios(cfg);
        }
        throw err;
      });

      return response.data;

    } catch (err) {
      lastErr = err;
      const status  = err.response?.status;
      const errData = err.response?.data;
      const errMsg  = (typeof errData === 'object')
        ? (errData?.message || errData?.error || JSON.stringify(errData))
        : (errData || err.message);

      console.error(`❌ API ${method} ${endpoint} [tentative ${attempt}/${retries}]: ${errMsg}`);

      // Ne pas retry sur les erreurs 4xx (erreur client, pas réseau)
      const isClientErr = status && status >= 400 && status < 500;
      if (isClientErr || attempt >= retries) {
        throw new Error(errMsg || err.message);
      }

      const delay = attempt * 2000;
      console.warn(`   ↩ Retry dans ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(lastErr.response?.data?.message || lastErr.message);
}

// ── Endpoints ─────────────────────────────────────────────────────

// GET /api/reseller/me → { id, email, name, balance }
async function getMe() {
  const data = await call('GET', '/me');
  if (data?.balance !== undefined) cachedBalance = data.balance;
  return data;
}

// Alias pratique pour la balance
async function getBalance() {
  const me = await getMe();
  return { balance: me.balance };
}

// GET /api/reseller/countries?pkg_id=1
async function getCountries(pkgId) {
  return call('GET', '/countries', null, { pkg_id: pkgId });
}

// GET /api/reseller/cities?country_id=X&pkg_id=1
async function getCities(countryId, pkgId) {
  return call('GET', '/cities', null, { country_id: countryId, pkg_id: pkgId });
}

// GET /api/reseller/service-providers?city_id=X&pkg_id=1
async function getServiceProviders(cityId, pkgId) {
  return call('GET', '/service-providers', null, { city_id: cityId, pkg_id: pkgId });
}

// GET /api/reseller/parent-proxies?pkg_id=1&service_provider_city_id=X&offset=0
async function getParentProxies(pkgId, spCityId) {
  const params = { pkg_id: pkgId, offset: 0 };
  if (spCityId) params.service_provider_city_id = spCityId;

  const data = await call('GET', '/parent-proxies', null, params);
  const list = Array.isArray(data) ? data : (data?.list || data?.data || []);

  return list.filter(p => p.is_available === true && p.status === 'ACTIVE');
}

// POST /api/reseller/buy-proxy → { success: true, proxy: {...}, price, balance }
async function buyProxy({ parentProxyId, packageId, protocol, duration, username, password }) {
  // Protocole : "http" ou "socks" (pas "socks5")
  const proto = (protocol === 'socks5') ? 'socks' : protocol;

  const body = {
    parent_proxy_id: parseInt(parentProxyId),
    package_id:      parseInt(packageId),   // obligatoire selon la doc
    protocol:        proto,
    duration:        parseFloat(duration),
    username:        username,
    password:        password
  };

  console.log('🛒 buy-proxy payload:', JSON.stringify(body));

  // Pas de retry sur les POST (évite double débit)
  const res = await call('POST', '/buy-proxy', body, null, 1);

  console.log('✅ buy-proxy réponse:', JSON.stringify(res));

  // La réponse est { success: true, proxy: {...}, price, balance }
  if (!res.success) {
    throw new Error(res.message || res.error || 'Achat échoué (success: false)');
  }

  // Met à jour la balance locale
  if (res.balance !== undefined) cachedBalance = res.balance;

  // Retourne directement l'objet proxy (comme attendu par proxyService)
  return res.proxy;
}

// Génère credentials valides : a-z 0-9 _ - (autorisés selon la doc)
function generateCredentials(prefix = 'px') {
  const ts   = Date.now().toString(36).slice(-5);
  const rand = Math.random().toString(36).slice(2, 7);
  const safe = (prefix + ts + rand).replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 16);
  return {
    username: safe,
    password: 'pw' + rand + ts  // ex: pwab3cd12x4
  };
}

// Retourne la balance en cache (sans appel réseau)
function getCachedBalance() { return cachedBalance; }

function getPricesForPkg(pkgId) { return PROXY_PRICES[pkgId] || []; }
function getPricesLocal()        { return PROXY_PRICES; }

module.exports = {
  getMe,
  getBalance,
  getCachedBalance,
  getCountries,
  getCities,
  getServiceProviders,
  getParentProxies,
  buyProxy,
  getPricesForPkg,
  getPricesLocal,
  generateCredentials
};
