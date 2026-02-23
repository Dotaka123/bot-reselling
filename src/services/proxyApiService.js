const axios = require('axios');

/**
 * Service de connexion à l'API de reselling de proxies
 * Gère l'authentification auto-refresh du token master
 */

const API_BASE     = process.env.PROXY_API_BASE;
const API_EMAIL    = process.env.PROXY_API_EMAIL;
const API_PASSWORD = process.env.PROXY_API_PASSWORD;

let masterToken    = null;
let masterTokenExp = 0;

// Prix configurables depuis les variables d'environnement
const PROXY_PRICES = {
  1: [ // Golden
    { duration: 0.02,  label: '2 heures',   price: parseFloat(process.env.PRICE_1_2H  || '0.35') },
    { duration: 0.12,  label: '12 heures',  price: parseFloat(process.env.PRICE_1_12H || '0.80') },
    { duration: 1,     label: '1 jour',     price: parseFloat(process.env.PRICE_1_1D  || '1.50') },
    { duration: 3,     label: '3 jours',    price: parseFloat(process.env.PRICE_1_3D  || '3.50') },
    { duration: 7,     label: '7 jours',    price: parseFloat(process.env.PRICE_1_7D  || '7.00') },
    { duration: 15,    label: '15 jours',   price: parseFloat(process.env.PRICE_1_15D || '13.00') },
    { duration: 30,    label: '30 jours',   price: parseFloat(process.env.PRICE_1_30D || '24.00') },
  ],
  2: [ // Silver
    { duration: 2,     label: '2 jours',    price: parseFloat(process.env.PRICE_2_2D  || '2.00') },
    { duration: 7,     label: '7 jours',    price: parseFloat(process.env.PRICE_2_7D  || '5.50') },
    { duration: 30,    label: '30 jours',   price: parseFloat(process.env.PRICE_2_30D || '15.00') },
  ]
};

// ── Auth ──────────────────────────────────────────────────────────
async function getMasterToken() {
  const now = Date.now() / 1000;
  if (masterToken && masterTokenExp > now + 300) return masterToken;

  const res = await axios.post(
    `${API_BASE}/login`,
    { email: API_EMAIL, password: API_PASSWORD },
    { timeout: 10000 }
  );

  masterToken    = res.data.token;
  masterTokenExp = res.data.expire_at;
  console.log('🔑 Token master renouvelé');
  return masterToken;
}

async function call(method, endpoint, data = null, params = null, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const token = await getMasterToken();
      const cfg = {
        method,
        url:     `${API_BASE}${endpoint}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000
      };
      if (data)   cfg.data   = data;
      if (params) cfg.params = params;

      try {
        return (await axios(cfg)).data;
      } catch (err) {
        if (err.response?.status === 401) {
          masterToken = null;
          const t2 = await getMasterToken();
          cfg.headers.Authorization = `Bearer ${t2}`;
          return (await axios(cfg)).data;
        }
        throw err;
      }
    } catch (err) {
      lastErr = err;
      const isRetryable = !err.response || err.response.status >= 500
        || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET';
      if (isRetryable && attempt < retries) {
        const delay = attempt * 1500;
        console.warn(`⚠️  API ${endpoint} tentative ${attempt}/${retries} – retry dans ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }
  throw new Error(lastErr.response?.data?.message || lastErr.message);
}

// ── Méthodes publiques ────────────────────────────────────────────

async function getCountries(pkgId) {
  return call('GET', '/countries', null, { pkg_id: pkgId });
}

async function getCities(countryId, pkgId) {
  return call('GET', '/cities', null, { country_id: countryId, pkg_id: pkgId });
}

async function getServiceProviders(cityId, pkgId) {
  return call('GET', '/service-providers', null, { city_id: cityId, pkg_id: pkgId });
}

async function getParentProxies(pkgId, spCityId) {
  const data = await call('GET', '/parent-proxies', null, {
    pkg_id: pkgId,
    service_provider_city_id: spCityId
  });
  const list = Array.isArray(data) ? data : (data?.list || data?.data || []);
  return list.filter(p => p.is_available);
}

async function buyProxy({ parentProxyId, packageId, protocol, duration, username, password }) {
  const proto = protocol === 'socks5' ? 'socks' : protocol;
  return call('POST', '/proxies', {
    parent_proxy_id: parseInt(parentProxyId),
    package_id:      parseInt(packageId),
    protocol:        proto,
    duration:        parseFloat(duration),
    username:        username.toLowerCase(),
    password:        password.toLowerCase()
  });
}

async function getBalance() {
  return call('GET', '/balance');
}

function getPrices() {
  return PROXY_PRICES;
}

function getPricesForPkg(pkgId) {
  return PROXY_PRICES[pkgId] || [];
}

// Génère username/password aléatoires valides
function generateCredentials(prefix = 'user') {
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    username: `${prefix}_${rand}`,
    password: `pass_${rand}`
  };
}

module.exports = {
  getCountries,
  getCities,
  getServiceProviders,
  getParentProxies,
  buyProxy,
  getBalance,
  getPrices,
  getPricesForPkg,
  generateCredentials
};
