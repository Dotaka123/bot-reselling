/**
 * proxyApiService.js
 * Auth pattern copied exactly from the working reference server.js
 */
const axios = require('axios');

const BASE     = process.env.API_BASE_URL || 'https://bot.mega-panel.net/api/web/index.php/v1';
const EMAIL    = process.env.API_EMAIL    || 'mdraselphd6@gmail.com';
const PASSWORD = process.env.API_PASSWORD || '@phdidea6';

const GOLDEN_PKG_ID = parseInt(process.env.GOLDEN_PACKAGE_ID) || 1;
const SILVER_PKG_ID = parseInt(process.env.SILVER_PACKAGE_ID) || 2;

let authToken    = null;
let tokenExpireAt = 0;

// ── AUTH — exact copy of reference server.js ──────────────────────────────────

async function getAuthToken() {
    const now = Date.now() / 1000;

    if (authToken && tokenExpireAt > now + 300) {
        return authToken;
    }

    const response = await axios.post(`${BASE}/login`, {
        email:    EMAIL,
        password: PASSWORD
    }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
    });

    authToken     = response.data.token;
    tokenExpireAt = response.data.expire_at;
    console.log('🔑 Proxy API token OK — expires:', new Date(tokenExpireAt * 1000).toISOString());
    return authToken;
}

// ── API REQUEST — exact copy of reference server.js ───────────────────────────

async function apiRequest(method, endpoint, data = null, params = null) {
    const token = await getAuthToken();

    const config = {
        method,
        url: `${BASE}${endpoint}`,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        timeout: 15000
    };

    if (data)   config.data   = data;
    if (params) config.params = params;

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        const status  = error.response?.status;
        const errBody = JSON.stringify(error.response?.data);
        console.error(`❌ Proxy API ${method} ${endpoint} → HTTP ${status}:`, errBody);

        if (status === 401) {
            authToken = null;
            const newToken = await getAuthToken();
            config.headers['Authorization'] = `Bearer ${newToken}`;
            return (await axios(config)).data;
        }
        throw error;
    }
}

// ── PRICES (local — no API call, botController.CUSTOM_PRICES overrides anyway) ─

async function getPrices() {
    return {
        [String(GOLDEN_PKG_ID)]: [
            { duration: 0.02, price: 0.25, label: '2 hours'  },
            { duration: 0.03, price: 0.30, label: '3 hours'  },
            { duration: 0.12, price: 0.45, label: '12 hours' },
            { duration: 1,    price: 0.70, label: '1 day'    },
            { duration: 3,    price: 2.00, label: '3 days'   },
            { duration: 7,    price: 4.00, label: '7 days'   },
            { duration: 15,   price: 7.50, label: '15 days'  },
            { duration: 30,   price: 14.50,label: '30 days'  },
        ],
        [String(SILVER_PKG_ID)]: [
            { duration: 2,  price: 1.10, label: '2 days'  },
            { duration: 7,  price: 3.00, label: '7 days'  },
            { duration: 30, price: 10.00,label: '30 days' },
        ]
    };
}

async function getPackages() {
    return [
        { id: GOLDEN_PKG_ID, package_name: 'Golden' },
        { id: SILVER_PKG_ID, package_name: 'Silver'  }
    ];
}

// ── CATALOGUE ─────────────────────────────────────────────────────────────────

async function getCountries(pkgId) {
    return apiRequest('GET', '/countries', null, { pkg_id: pkgId });
}

async function getCities(countryId, pkgId) {
    return apiRequest('GET', '/cities', null, { country_id: countryId, pkg_id: pkgId });
}

async function getProviders(cityId, pkgId) {
    return apiRequest('GET', '/service-providers', null, { city_id: cityId, pkg_id: pkgId });
}

async function getParents(pkgId, offset = 0, cityId = null, serviceProviderCityId = null) {
    const params = { pkg_id: pkgId, offset };
    if (cityId)                params.city_id                  = cityId;
    if (serviceProviderCityId) params.service_provider_city_id = serviceProviderCityId;

    const data = await apiRequest('GET', '/parent-proxies', null, params);

    // Normalize response — same as reference server.js
    if (Array.isArray(data))    return data;
    if (data && data.list)      return data.list;
    if (data && data.data)      return data.data;
    if (data && data.proxies)   return data.proxies;
    return [];
}

async function getParentDetails(id, pkgId = null) {
    const params = { id };
    if (pkgId) params.pkg_id = pkgId;
    return apiRequest('GET', '/parent-proxy', null, params);
}

// ── PURCHASE ──────────────────────────────────────────────────────────────────

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

        const proxy = await apiRequest('POST', '/proxies', body);

        if (!proxy || proxy.result === false) {
            return { success: false, error: proxy?.message || 'Purchase failed' };
        }

        return { success: true, proxy };
    } catch (err) {
        const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
        return { success: false, error: errMsg };
    }
}

async function renewProxy(proxyId, duration) {
    try {
        const result = await apiRequest('POST', `/proxies/${proxyId}/renew`, { duration: parseFloat(duration) });
        if (!result || result.result === false) return { success: false, error: 'Renewal failed' };
        return { success: true, proxy: result };
    } catch (err) {
        return { success: false, error: err.response?.data?.message || err.message };
    }
}

async function modifyProxy(proxyId, changes) {
    try {
        // Normalize protocol exactly like reference server.js
        if (changes.protocol) {
            let p = changes.protocol.toLowerCase();
            if (p.includes('socks')) p = 'socks';
            if (p.includes('http'))  p = 'http';
            changes.protocol = p;
        }
        const result = await apiRequest('PUT', `/proxies/${proxyId}`, changes);
        if (!result || result.result === false) return { success: false, error: 'Modification failed' };
        return { success: true, proxy: result };
    } catch (err) {
        return { success: false, error: err.response?.data?.message || err.message };
    }
}

async function getAllProxies(offset = 0, status = null) {
    const params = { offset };
    if (status) params.status = status;
    return apiRequest('GET', '/all-proxies', null, params);
}

async function getProxyDetails(proxyId) {
    return apiRequest('GET', `/proxies/${proxyId}`);
}

async function getMasterBalance() {
    return apiRequest('GET', '/balance');
}

async function reportProxy(accountId) {
    return apiRequest('POST', '/report-proxy', { account_id: accountId });
}

module.exports = {
    getPackages, getPrices,
    getCountries, getCities, getProviders, getParents, getParentDetails,
    buyProxy, renewProxy, modifyProxy,
    getAllProxies, getProxyDetails, getMasterBalance, reportProxy
};
