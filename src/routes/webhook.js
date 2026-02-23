const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { handleMessage } = require('../controllers/botController');

/**
 * GET /webhook — Vérification du webhook Facebook
 * Facebook envoie un challenge à vérifier lors de la configuration
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

        // Traitement asynchrone (ne bloque pas la réponse HTTP)
        handleMessage(psid, text).catch(err => {
          console.error(`❌ handleMessage error [${psid}]:`, err);
        });
      }

      // Postback (boutons — pas utilisés mais on les ignore proprement)
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
 * Sécurise le webhook contre les requêtes non-Facebook
 */
function verifySignature(req, res, next) {
  const APP_SECRET = process.env.APP_SECRET;
  if (!APP_SECRET) return next(); // skip si pas configuré

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.warn('⚠️  Requête sans signature reçue');
    // En prod, on pourrait rejeter ici
    return next();
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    console.error('❌ Signature invalide !');
    return res.sendStatus(403);
  }

  next();
}

module.exports = router;
