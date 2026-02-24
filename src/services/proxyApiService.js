/**
 * proxyApiService.js
 *
 * Talks to the upstream proxy API documented in Proxies_Bot_System_API_v2.
 * Auth: POST /login  →  JWT valid for 60 minutes.
 * All calls use a single master account (env vars).
 */
const axios = require('axios');
const qs    = require('querystring');

const BASE     = process.env.PROXY_API_URL || 'https://bot.mega-panel.net/api/web/index.php/v1';
const EMAIL    = process.env.PROXY_API_EMAIL    || 'mdraselphd6@gmail.com';
const PASSWORD = process.env.PROXY_API_PASSWORD || '@phdidea6';

let _token       = null;
let _tokenExpiry = 0; // unix seconds

// ── AUTH ──────────────────────────────────────────────────────────────────────

async function getToken() {
    const now = Date.now() / 1000;
    // Refresh 2 minutes before expiry (token lasts 60 min)
    if (_token && _tokenExpiry > now + 120) return _token;

    console.log(`🔐 Logging in to proxy API: ${BASE}/login as ${EMAIL}`);

    let res;
    try {
        // Try JSON first (as documented)
        res = await axios.post(
            `${BASE}/login`,
            { email: EMAIL, password: PASSWORD },
            { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (jsonErr) {
        // Fallback: some Yii2 APIs require form-urlencoded
        console.warn('⚠️  JSON login failed, retrying with form-urlencoded...');
        console.warn('   Error:', jsonErr.response?.status, JSON.stringify(jsonErr.response?.data));
        res = await axios.post(
            `${BASE}/login`,
            qs.stringify({ email: EMAIL, password: PASSWORD }),
            { timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
    }

    if (!res.data?.token) {
        console.error('❌ Login response has no token:', JSON.stringify(res.data));
        throw new Error(`Login failed: ${JSON.stringify(res.data)}`);
    }

    _token       = res.data.token;
    _tokenExpiry = res.data.expire_at || (now + 3600);
    console.log('🔑 Proxy API token refreshed (expires:', new Date(_tokenExpiry * 1000).toISOString(), ')');
    return _token;
}

async function api(method, endpoint, data = null, params = null) {
    const token = await getToken();
    const cfg = {
        method,
        url:     `${BASE}${endpoint}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000
    };
    if (data)   cfg.data   = data;
    if (params) cfg.params = params;

    try {
        return (await axios(cfg)).data;
    } catch (err) {
        const status  = err.response?.status;
        const errBody = JSON.stringify(err.response?.data);
        console.error(`❌ API ${method} ${endpoint} → ${status}:`, errBody);

        // Token expired mid-session — force refresh and retry once
        if (status === 401) {
            _token = null;
            const newToken = await getToken();
            cfg.headers.Authorization = `Bearer ${newToken}`;
            return (await axios(cfg)).data;
        }
        throw err;
    }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Convert the API price entry { price, days, hours } to the internal format
 * the bot controller expects: { duration, price, label }
 *
 * Duration encoding (from API docs):
 *   days >= 1  → duration = days       (e.g. 7  → "7 days")
 *   hours > 0  → duration = hours/100  (e.g. 12h → 0.12, 2h → 0.02)
 */
function normalizePrice(p) {
    let duration, label;
    if (p.hours > 0) {
        duration = p.hours / 100;
        label    = `${p.hours} hours`;
    } else {
        duration = p.days;
        label    = `${p.days} day${p.days !== 1 ? 's' : ''}`;
    }
    return { duration, price: p.price, label };
}

// ── CATALOGUE ─────────────────────────────────────────────────────────────────

/** Returns [{ id, package_name }] */
async function getPackages() {
    return api('GET', '/packages');
}

/**
 * Returns prices grouped by package id:
 *   { "1": [{duration, price, label}, ...], "2": [...] }
 * Calls GET /prices?pkg_id=X for every package.
 */
async function getPrices() {
    const packages = await getPackages();
    const result   = {};
    for (const pkg of packages) {
        const raw = await api('GET', '/prices', null, { pkg_id: pkg.id });
        result[String(pkg.id)] = (Array.isArray(raw) ? raw : []).map(normalizePrice);
    }
    return result;
}

/** Returns [{ id, country_name }] */
async function getCountries(pkgId) {
    return api('GET', '/countries', null, { pkg_id: pkgId });
}

/** Returns [{ id, country_id, city_name }] */
async function getCities(countryId, pkgId) {
    return api('GET', '/cities', null, { country_id: countryId, pkg_id: pkgId });
}

/** Returns [{ id, city_name, service_provider_name }] */
async function getProviders(cityId, pkgId) {
    return api('GET', '/service-providers', null, { city_id: cityId, pkg_id: pkgId });
}

/** Returns [{ id, http_port, socks_port, technology, is_available, status, usage, rotation_time }] */
async function getParents(pkgId, offset = 0, cityId = null, serviceProviderCityId = null) {
    const params = { pkg_id: pkgId, offset };
    if (cityId)                params.city_id                  = cityId;
    if (serviceProviderCityId) params.service_provider_city_id = serviceProviderCityId;
    const data = await api('GET', '/parent-proxies', null, params);
    return Array.isArray(data) ? data : [];
}

/** Returns details of a single parent proxy. Pass pkgId for correct port numbers. */
async function getParentDetails(id, pkgId = null) {
    const params = { id };
    if (pkgId) params.pkg_id = pkgId;
    return api('GET', '/parent-proxy', null, params);
}

// ── PURCHASE ──────────────────────────────────────────────────────────────────

/**
 * Create a new proxy account (user/pass type).
 * Returns { success: true, proxy } or { success: false, error }.
 * API: POST /proxies
 */
async function buyProxy({ parentProxyId, packageId, protocol, duration, username, password }) {
    try {
        const body = {
            parent_proxy_id: parseInt(parentProxyId),
            package_id:      parseInt(packageId),
            protocol:        protocol === 'socks5' ? 'socks' : 'http',
            duration:        parseFloat(duration),
            username:        username.toLowerCase().trim(),
            password:        password.toLowerCase().trim()
        };

        const proxy = await api('POST', '/proxies', body);

        if (!proxy || proxy.result === false) {
            return { success: false, error: proxy?.message || 'Purchase failed' };
        }

        return { success: true, proxy };
    } catch (err) {
        const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        return { success: false, error: errMsg };
    }
}

/**
 * Renew an existing proxy account.
 * API: POST /proxies/{id}/renew  Body: { duration }
 */
async function renewProxy(proxyId, duration) {
    try {
        const result = await api('POST', `/proxies/${proxyId}/renew`, { duration: parseFloat(duration) });
        if (!result || result.result === false) return { success: false, error: 'Renewal failed' };
        return { success: true, proxy: result };
    } catch (err) {
        return { success: false, error: err.response?.data?.message || err.message };
    }
}

/**
 * Modify an existing proxy (change parent / protocol / password / allowed IPs).
 * API: PUT /proxies/{id}
 */
async function modifyProxy(proxyId, changes) {
    try {
        const result = await api('PUT', `/proxies/${proxyId}`, changes);
        if (!result || result.result === false) return { success: false, error: 'Modification failed' };
        return { success: true, proxy: result };
    } catch (err) {
        return { success: false, error: err.response?.data?.message || err.message };
    }
}

/** All proxy accounts (paginated). API: GET /all-proxies */
async function getAllProxies(offset = 0, status = null) {
    const params = { offset };
    if (status) params.status = status;
    return api('GET', '/all-proxies', null, params);
}

/** Details of a specific proxy account. API: GET /proxies/{id} */
async function getProxyDetails(proxyId) {
    return api('GET', `/proxies/${proxyId}`);
}

/** Master account balance. API: GET /balance */
async function getMasterBalance() {
    return api('GET', '/balance');
}

/** Report a non-working proxy. API: POST /report-proxy */
async function reportProxy(accountId) {
    return api('POST', '/report-proxy', { account_id: accountId });
}

module.exports = {
    getPackages,
    getPrices,
    getCountries,
    getCities,
    getProviders,
    getParents,
    getParentDetails,
    buyProxy,
    renewProxy,
    modifyProxy,
    getAllProxies,
    getProxyDetails,
    getMasterBalance,
    reportProxy
};
