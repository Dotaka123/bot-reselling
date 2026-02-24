// Service mock pour les APIs de proxy
async function getCountries() {
    return [
        { country_code: 'US', country_name: 'États-Unis' },
        { country_code: 'FR', country_name: 'France' },
        { country_code: 'GB', country_name: 'Royaume-Uni' },
        { country_code: 'DE', country_name: 'Allemagne' },
        { country_code: 'JP', country_name: 'Japon' }
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
            { city_code: 'LON', city_name: 'Londres' }
        ],
        'DE': [
            { city_code: 'BER', city_name: 'Berlin' }
        ],
        'JP': [
            { city_code: 'TYO', city_name: 'Tokyo' }
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

module.exports = { getCountries, getCities, getProviders, getParents };
