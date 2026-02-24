require('dotenv').config();

const express    = require('express');
const path       = require('path');
const connectDB  = require('../config/database');
const webhookRouter = require('./routes/webhook');
const adminRouter   = require('./routes/admin');
const { startExpiryCheck } = require('./cron/expiryCron');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares ───────────────────────────────────────────────────
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────
app.use('/webhook', webhookRouter);

// Admin API (protégé par ADMIN_SECRET_TOKEN)
app.use('/admin/api', adminRouter);

// Admin HTML dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Fichiers statiques
app.use('/static', express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'ProxyBot Messenger', time: new Date().toISOString() });
});

// ── Démarrage ─────────────────────────────────────────────────────
async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`\n🚀 ProxyBot en ligne       → http://localhost:${PORT}`);
    console.log(`📡 Webhook URL             → http://localhost:${PORT}/webhook`);
    console.log(`🏥 Health check            → http://localhost:${PORT}/health`);
    console.log(`🛡️  Admin dashboard         → http://localhost:${PORT}/admin\n`);
  });

  startExpiryCheck();
}

start().catch(err => {
  console.error('❌ Erreur au démarrage :', err);
  process.exit(1);
});

module.exports = app;
