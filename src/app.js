require('dotenv').config();

const express = require('express');
const path = require('path');
const connectDB = require('../config/database');
const webhookRouter = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

app.use('/webhook', webhookRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'ProxyBot Messenger', time: new Date().toISOString() });
});

async function start() {
    await connectDB();
    
    app.listen(PORT, () => {
        console.log(`\n🚀 ProxyBot en ligne → http://localhost:${PORT}`);
        console.log(`📡 Webhook URL → http://localhost:${PORT}/webhook`);
        console.log(`🏥 Health check → http://localhost:${PORT}/health\n`);
    });
}

start().catch(err => {
    console.error('❌ Erreur au démarrage:', err);
    process.exit(1);
});

module.exports = app;
