const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { handleMessage } = require('../controllers/botController');

router.get('/', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook Facebook vérifié!');
        return res.status(200).send(challenge);
    }

    console.error('❌ Échec de vérification webhook');
    res.sendStatus(403);
});

router.post('/', verifySignature, async (req, res) => {
    res.sendStatus(200);

    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of (body.entry || [])) {
        for (const event of (entry.messaging || [])) {
            const psid = event.sender?.id;
            if (!psid) continue;

            if (event.message && event.message.text && !event.message.is_echo) {
                const text = event.message.text;
                console.log(`📨 [${psid}]: "${text}"`);
                handleMessage(psid, text).catch(err => {
                    console.error(`❌ handleMessage error [${psid}]:`, err);
                });
            }

            if (event.postback) {
                const payload = event.postback.payload;
                console.log(`🔘 Postback [${psid}]: ${payload}`);
                handleMessage(psid, payload).catch(() => {});
            }
        }
    }
});

function verifySignature(req, res, next) {
    const APP_SECRET = process.env.APP_SECRET;
    if (!APP_SECRET) return next();

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        if (process.env.NODE_ENV === 'production') return res.sendStatus(403);
        return next();
    }

    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');

    if (signature !== expected) {
        console.error('❌ Signature invalide');
        return res.sendStatus(403);
    }

    next();
}

module.exports = router;
