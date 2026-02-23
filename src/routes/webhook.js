const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { handleMessage } = require('../controllers/botController');

/**
 * GET /webhook — Vérification du webhook Facebook
 */
router.get('/', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook Facebook vérifié !');
    return res.status(200).send(challenge);
  }

  console.error('❌ Échec de vérification webhook');
  res.sendStatus(403);
});

/**
 * POST /webhook — Réception des messages Messenger
 */
router.post('/', verifySignature, async (req, res) => {
  // Répondre immédiatement à Facebook (évite le timeout de 5s)
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'page') return;

  for (const entry of (body.entry || [])) {
    for (const event of (entry.messaging || [])) {
      const psid = event.sender?.id;
      if (!psid) continue;

      // Message texte entrant
      if (event.message && event.message.text && !event.message.is_echo) {
        const text = event.message.text;
        console.log(`📨 [${psid}] : "${text}"`);
        handleMessage(psid, text).catch(err => {
          console.error(`❌ handleMessage error [${psid}]:`, err);
        });
      }

      // Postback
      if (event.postback) {
        const payload = event.postback.payload;
        console.log(`🔘 Postback [${psid}] : ${payload}`);
        handleMessage(psid, payload).catch(() => {});
      }
    }
  }
});

/**
 * Middleware de vérification de signature X-Hub-Signature-256
 *
 * req.rawBody = Buffer fourni par l'option verify de express.json()
 * C'est la bonne façon — pas de double-lecture du stream.
 */
function verifySignature(req, res, next) {
  const APP_SECRET = process.env.APP_SECRET;
  if (!APP_SECRET) return next(); // skip si non configuré

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.warn('⚠️  Requête sans signature Facebook');
    // En prod on rejette, en dev on passe
    if (process.env.NODE_ENV === 'production') return res.sendStatus(403);
    return next();
  }

  // req.rawBody est un Buffer (capturé via verify option de express.json)
  const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));

  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expected) {
    console.error('❌ Signature Facebook invalide — requête rejetée');
    return res.sendStatus(403);
  }

  next();
}

module.exports = router;
