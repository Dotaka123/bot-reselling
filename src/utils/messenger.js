const axios = require('axios');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

async function sendText(psid, text) {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn('⚠️ PAGE_ACCESS_TOKEN is not configured');
        return false;
    }

    try {
        await axios.post(`https://graph.facebook.com/v12.0/me/messages`, {
            recipient: { id: psid },
            message: { text }
        }, {
            params: { access_token: PAGE_ACCESS_TOKEN }
        });
        return true;
    } catch (err) {
        console.error('Error sending message:', err.message);
        return false;
    }
}

async function getUserName(psid) {
    if (!PAGE_ACCESS_TOKEN) return 'User';
    try {
        const res = await axios.get(`https://graph.facebook.com/v12.0/${psid}`, {
            params: { fields: 'first_name,last_name', access_token: PAGE_ACCESS_TOKEN }
        });
        return res.data.first_name || 'User';
    } catch {
        return 'User';
    }
}

module.exports = { sendText, getUserName };
