// Mock proxy API service - replace with real API calls when ready

async function getCountries() {
    return [
        { country_code: 'US', country_name: 'United States' },
        { country_code: 'FR', country_name: 'France' },
        { country_code: 'GB', country_name: 'United Kingdom' },
        { country_code: 'DE', country_name: 'Germany' },
        { country_code: 'JP', country_name: 'Japan' },
        { country_code: 'CA', country_name: 'Canada' },
        { country_code: 'AU', country_name: 'Australia' },
        { country_code: 'BR', country_name: 'Brazil' },
        { country_code: 'IN', country_name: 'India' },
        { country_code: 'SG', country_name: 'Singapore' }
    ];
}

async function getCities(countryCode) {
    const cities = {
        'US': [
            { city_code: 'NYC', city_name: 'New York' },
            { city_code: 'LAX', city_name: 'Los Angeles' },
            { city_code: 'CHI', city_name: 'Chicago' }
        ],
        'FR': [
            { city_code: 'PAR', city_name: 'Paris' },
            { city_code: 'LYN', city_name: 'Lyon' }
        ],
        'GB': [
            { city_code: 'LON', city_name: 'London' },
            { city_code: 'MAN', city_name: 'Manchester' }
        ],
        'DE': [
            { city_code: 'BER', city_name: 'Berlin' },
            { city_code: 'MUN', city_name: 'Munich' }
        ],
        'JP': [
            { city_code: 'TYO', city_name: 'Tokyo' },
            { city_code: 'OSA', city_name: 'Osaka' }
        ],
        'CA': [
            { city_code: 'TOR', city_name: 'Toronto' },
            { city_code: 'VAN', city_name: 'Vancouver' }
        ],
        'AU': [
            { city_code: 'SYD', city_name: 'Sydney' },
            { city_code: 'MEL', city_name: 'Melbourne' }
        ],
        'BR': [
            { city_code: 'SAO', city_name: 'Sao Paulo' },
            { city_code: 'RIO', city_name: 'Rio de Janeiro' }
        ],
        'IN': [
            { city_code: 'MUM', city_name: 'Mumbai' },
            { city_code: 'DEL', city_name: 'Delhi' }
        ],
        'SG': [
            { city_code: 'SGP', city_name: 'Singapore' }
        ]
    };
    return cities[countryCode] || [];
}

async function getProviders(countryCode, cityCode) {
    return [
        { service_provider_id: '1', service_provider_name: 'Provider 1 (4G)' },
        { service_provider_id: '2', service_provider_name: 'Provider 2 (LTE)' },
        { service_provider_id: '3', service_provider_name: 'Provider 3 (Mobile)' }
    ];
}

async function getParents(countryCode, cityCode, providerId) {
    return [
        { parent_proxy_id: 'P1', ip: '192.168.1.1', http_port: 8080, socks_port: 1080, technology: '4G' },
        { parent_proxy_id: 'P2', ip: '192.168.1.2', http_port: 8080, socks_port: 1080, technology: 'LTE' }
    ];
}

async function purchaseProxy(params) {
    // TODO: Replace with real API call
    // Returns a mock proxy object on success
    return {
        success: true,
        proxy: {
            ip: '185.12.34.' + Math.floor(Math.random() * 255),
            http_port: 8080,
            socks_port: 1080,
            username: 'user_' + Math.random().toString(36).substr(2, 8),
            password: Math.random().toString(36).substr(2, 12),
            expiresAt: new Date(Date.now() + params.durationHours * 3600 * 1000)
        }
    };
}

module.exports = { getCountries, getCities, getProviders, getParents, purchaseProxy };
