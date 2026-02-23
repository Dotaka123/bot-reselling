const axios = require('axios');

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
    { timeout: 15000 }
  );

  masterToken    = res.data.token;
  masterTokenExp = res.data.expire_at;
  console.log('🔑 Token master renouvelé, expire_at:', masterTokenExp);
  return masterToken;
}

// ── Extraction d'erreur robuste ───────────────────────────────────
function extractError(err) {
  const d = err.response?.data;
  if (!d) return err.message;
  if (typeof d === 'string') return d;
  // L'API retourne parfois {"result":false} ou {"message":"..."} ou {"error":"..."}
  if (d.message) return d.message;
  if (d.error)   return d.error;
  if (d.result === false) return `Erreur API (result:false) — status ${err.response.status}`;
  return JSON.stringify(d);
}

// ── Appel API avec retry ──────────────────────────────────────────
async function call(method, endpoint, data = null, params = null, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const token = await getMasterToken();
      const cfg = {
        method,
        url:     `${API_BASE}${endpoint}`,
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

      const result = response.data;

      // Détecte {"result":false} comme erreur
      if (result && result.result === false) {
        throw Object.assign(new Error('API retourné result:false'), { apiResult: result });
      }

      return result;

    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const isRetryable = !status || status >= 500
        || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET';

      console.error(`❌ API ${method} ${endpoint} tentative ${attempt}/${retries}:`, extractError(err));

      if (isRetryable && attempt < retries) {
        const delay = attempt * 2000;
        console.warn(`   ↩ Retry dans ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }
  throw new Error(extractError(lastErr));
}

// ── Méthodes API ─────────────────────────────────────────────────

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
  // offset est obligatoire selon la doc API
  const params = { pkg_id: pkgId, offset: 0 };
  if (spCityId) params.service_provider_city_id = spCityId;

  const data = await call('GET', '/parent-proxies', null, params);
  const list = Array.isArray(data) ? data : (data?.list || data?.data || []);

  // Filtre : disponible ET statut ACTIVE
  return list.filter(p => p.is_available === true && p.status === 'ACTIVE');
}

// Vérifie si un username est disponible (endpoint /check-username)
async function checkUsername(username) {
  try {
    const res = await call('GET', '/check-username', null, { username });
    // {"result":"AVAILABLE"} ou {"result":"ALREADY_USER"}
    return res?.result === 'AVAILABLE';
  } catch {
    // En cas d'erreur on suppose disponible (le pire cas = erreur à l'achat)
    return true;
  }
}

// Génère des credentials valides : alphanumériques uniquement, pas d'underscore
function generateCredentials(prefix = 'px') {
  const ts   = Date.now().toString(36).slice(-5);          // 5 chars base36
  const rand = Math.random().toString(36).slice(2, 7);     // 5 chars base36
  const safe = (prefix + ts + rand).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16);
  return {
    username: safe,
    password: 'pw' + rand + ts
  };
}

// Achat de proxy — avec vérification username et retry auto si pris
async function buyProxy({ parentProxyId, packageId, protocol, duration, username, password }) {
  // Normalise le protocole : l'API accepte "http" ou "socks" (pas "socks5")
  const proto = (protocol === 'socks5' || protocol === 'socks') ? 'socks' : 'http';

  // Corps de la requête selon la doc (sans package_id — absent de l'exemple officiel)
  const body = {
    parent_proxy_id: parseInt(parentProxyId),
    protocol:        proto,
    duration:        parseFloat(duration),
    username:        username.toLowerCase().replace(/[^a-z0-9]/g, ''),
    password:        password.toLowerCase()
  };

  // package_id seulement si fourni et valide
  if (packageId && parseInt(packageId) > 0) {
    body.package_id = parseInt(packageId);
  }

  console.log('🛒 Achat proxy — body:', JSON.stringify(body));

  return call('POST', '/proxies', body, null, 1); // pas de retry sur les POST (débit balance)
}

async function getBalance() {
  return call('GET', '/balance');
}

async function getPrices(pkgId) {
  return call('GET', '/prices', null, pkgId ? { pkg_id: pkgId } : null);
}

function getPricesLocal() { return PROXY_PRICES; }
function getPricesForPkg(pkgId) { return PROXY_PRICES[pkgId] || []; }

module.exports = {
  getCountries,
  getCities,
  getServiceProviders,
  getParentProxies,
  checkUsername,
  buyProxy,
  getBalance,
  getPrices,
  getPricesForPkg,
  getPricesLocal,
  generateCredentials
};
