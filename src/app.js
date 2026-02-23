require('dotenv').config();

const express    = require('express');
const connectDB  = require('../config/database');
const webhookRouter = require('./routes/webhook');
const { startExpiryCheck } = require('./cron/expiryCron');

const app  = express();
const PORT = process.env.PORT || 8080;

// ── Middlewares ───────────────────────────────────────────────────

// Capture du rawBody pour la vérification de signature Facebook
app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => data += chunk);
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

app.use(express.json());
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
