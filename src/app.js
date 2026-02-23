require('dotenv').config();

const express    = require('express');
const connectDB  = require('../config/database');
const webhookRouter = require('./routes/webhook');
const { startExpiryCheck } = require('./cron/expiryCron');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares ───────────────────────────────────────────────────

// express.json() avec capture du rawBody via l'option verify
// C'est la SEULE façon correcte — ne jamais lire le stream manuellement avant
app.use(express.json({
  verify: (req, res, buf) => {
    // buf est un Buffer disponible AVANT le parsing JSON
    // On le stocke pour la vérification de signature Facebook (X-Hub-Signature-256)
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────
app.use('/webhook', webhookRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status:  'OK',
    service: 'ProxyBot Messenger',
    time:    new Date().toISOString()
  });
});

// ── Démarrage ─────────────────────────────────────────────────────
async function start() {
  // Connexion MongoDB
  await connectDB();

  // Démarrage du serveur
  app.listen(PORT, () => {
    console.log(`\n🚀 ProxyBot en ligne → http://localhost:${PORT}`);
    console.log(`📡 Webhook URL       → http://localhost:${PORT}/webhook`);
    console.log(`🏥 Health check      → http://localhost:${PORT}/health\n`);
  });

  // Cron d'expiration
  startExpiryCheck();
}

start().catch(err => {
  console.error('❌ Erreur au démarrage :', err);
  process.exit(1);
});

module.exports = app;
