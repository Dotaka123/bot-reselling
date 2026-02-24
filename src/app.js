require('dotenv').config();

const express = require('express');
const path = require('path');
const connectDB = require('../config/database');
const webhookRouter = require('./routes/webhook');
const adminRouter  = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

// ── Static files (admin panel) ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/webhook', webhookRouter);
app.use('/api/admin', adminRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'ProxyBot Messenger', time: new Date().toISOString() });
});

// Root landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

async function start() {
    await connectDB();
    
    app.listen(PORT, () => {
        console.log(`\n🚀 ProxyBot en ligne → http://localhost:${PORT}`);
        console.log(`📡 Webhook URL → http://localhost:${PORT}/webhook`);
        console.log(`🔐 Admin Panel → http://localhost:${PORT}/admin`);
        console.log(`🏥 Health check → http://localhost:${PORT}/health\n`);
    });
}

start().catch(err => {
    console.error('❌ Erreur au démarrage:', err);
    process.exit(1);
});

module.exports = app;
