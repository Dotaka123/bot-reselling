const cron = require('node-cron');
const { expireOldProxies } = require('../services/proxyService');

/**
 * Cron job — Vérification des proxies expirés
 * S'exécute toutes les heures
 */
function startExpiryCheck() {
  cron.schedule('0 * * * *', async () => {
    console.log('🔄 Cron : vérification des expirations...');
    try {
      const count = await expireOldProxies();
      if (count > 0) {
        console.log(`✅ Cron : ${count} proxy(s) marqué(s) EXPIRÉ`);
      }
    } catch (err) {
      console.error('❌ Cron expiry error:', err.message);
    }
  });

  console.log('⏰ Cron de vérification des expirations démarré (toutes les heures)');
}

module.exports = { startExpiryCheck };
