const Proxy = require('../models/Proxy');

async function getUserProxies(userId) {
    try {
        return await Proxy.find({ userId }).sort({ createdAt: -1 });
    } catch (err) {
        console.error('Error getting proxies:', err);
        return [];
    }
}

async function getActiveProxies(userId) {
    try {
        return await Proxy.find({ userId, status: 'ACTIVE' });
    } catch (err) {
        return [];
    }
}

module.exports = { getUserProxies, getActiveProxies };
