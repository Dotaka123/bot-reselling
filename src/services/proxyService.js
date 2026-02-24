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

async function saveProxy(userId, psid, proxyData) {
    try {
        const proxy = new Proxy({
            userId,
            psid,
            ip: proxyData.ip,
            httpPort: proxyData.http_port,
            socksPort: proxyData.socks_port,
            username: proxyData.username,
            password: proxyData.password,
            country: proxyData.country,
            city: proxyData.city,
            protocol: proxyData.protocol,
            package: proxyData.package,
            status: 'ACTIVE',
            expiresAt: proxyData.expiresAt
        });
        await proxy.save();
        return proxy;
    } catch (err) {
        console.error('Error saving proxy:', err);
        return null;
    }
}

module.exports = { getUserProxies, getActiveProxies, saveProxy };
