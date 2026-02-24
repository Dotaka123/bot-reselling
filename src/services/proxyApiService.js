/**
 * proxyApiService.js
 *
 * ONE reseller token for ALL calls.
 * Bot users are local only (MongoDB). They never touch this API directly.
 * All purchases go through the single reseller account.
 */
const axios = require('axios');

const BASE = process.env.RESELLER_API_URL || 'http://localhost:4000';

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
    const now = Date.now() / 1000;
    if (_token && _tokenExpiry > now + 300) return _token;

    const email    = process.env.RESELLER_EMAIL;
    const password = process.env.RESELLER_PASSWORD;

    if (!email || !password) throw new Error('RESELLER_EMAIL and RESELLER_PASSWORD must be set in .env');

    const res = await axios.post(`${BASE}/api/reseller/login`, { email, password }, { timeout: 10000 });
    _token       = res.data.token;
    // Reselling server issues JWT for 7 days
    _tokenExpiry = now + 7 * 24 * 3600;
    console.log('🔑 Reseller token refreshed');
    return _token;
}

async function api(method, endpoint, data = null, params = null) {
    const token = await getToken();
    const cfg = {
        method,
        url: `${BASE}${endpoint}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000
    };
    if (data)   cfg.data   = data;
    if (params) cfg.params = params;

    try {
        return (await axios(cfg)).data;
    } catch (err) {
        // Token expired — force refresh and retry once
        if (err.response?.status === 401) {
            _token = null;
            const newToken = await getToken();
            cfg.headers.Authorization = `Bearer ${newToken}`;
            return (await axios(cfg)).data;
        }
        throw err;
    }
}

// ── CATALOGUE ─────────────────────────────────────────────────────────────────

/** Returns { "1": [{duration, label, price}, ...], "2": [...] } */
async function getPrices() {
    return api('GET', '/api/reseller/prices');
}

/** Returns [{ id, country_name }, ...] */
async function getCountries(pkgId) {
    return api('GET', '/api/reseller/countries', null, { pkg_id: pkgId });
}

/** Returns [{ id, country_id, city_name }, ...] */
async function getCities(countryId, pkgId) {
    return api('GET', '/api/reseller/cities', null, { country_id: countryId, pkg_id: pkgId });
}

/** Returns [{ id, city_name, service_provider_name }, ...] */
async function getProviders(cityId, pkgId) {
    return api('GET', '/api/reseller/service-providers', null, { city_id: cityId, pkg_id: pkgId });
}

/** Returns [{ id, http_port, socks_port, technology, is_available, status, usage, rotation_time }, ...] */
async function getParents(pkgId, offset = 0, cityId = null, serviceProviderCityId = null) {
    const params = { pkg_id: pkgId, offset };
    if (cityId)                params.city_id                  = cityId;
    if (serviceProviderCityId) params.service_provider_city_id = serviceProviderCityId;
    const data = await api('GET', '/api/reseller/parent-proxies', null, params);
    return Array.isArray(data) ? data : [];
}

// ── PURCHASE ──────────────────────────────────────────────────────────────────

/**
 * Buy a proxy using the reseller account.
 * { parentProxyId, packageId, protocol, duration, username, password }
 * Returns { success, proxy, price, balance, proxyRecord }
 */
async function buyProxy({ parentProxyId, packageId, protocol, duration, username, password }) {
    return api('POST', '/api/reseller/buy-proxy', {
        parent_proxy_id: parseInt(parentProxyId),
        package_id:      parseInt(packageId),
        protocol:        protocol === 'socks5' ? 'socks' : 'http',
        duration:        parseFloat(duration),
        username:        username.toLowerCase().trim(),
        password:        password.toLowerCase().trim()
    });
}

module.exports = { getPrices, getCountries, getCities, getProviders, getParents, buyProxy };
