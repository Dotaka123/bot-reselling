const mongoose = require('mongoose');

/**
 * Modèle proxy acheté par un utilisateur du bot
 */
const ProxySchema = new mongoose.Schema({

  // ── Propriétaire ───────────────────────────
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'BotUser',
    required: true,
    index:    true
  },
  psid: { type: String, required: true }, // dénormalisé pour requêtes rapides

  // ── Données proxy ──────────────────────────
  ip:       { type: String, required: true },
  port:     { type: Number, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  protocol: { type: String, default: 'http', enum: ['http', 'socks', 'socks5'] },

  // ── Localisation ───────────────────────────
  country:     { type: String },
  countryCode: { type: String },
  city:        { type: String },
  provider:    { type: String },

  // ── Données de l'API externe ───────────────
  apiProxyId:   { type: Number },
  packageId:    { type: Number },
  duration:     { type: Number }, // en jours
  packageLabel: { type: String }, // ex: "7 jours"
  price:        { type: Number },
  rawData:      { type: Object, default: {} },

  // ── Durée de vie ───────────────────────────
  purchasedAt: { type: Date, default: Date.now },
  expiresAt:   { type: Date },
  status: {
    type:    String,
    default: 'ACTIF',
    enum:    ['ACTIF', 'EXPIRÉ', 'SUSPENDU']
  }
});

// Méthodes utiles
ProxySchema.methods.daysLeft = function () {
  if (!this.expiresAt) return null;
  const diff = this.expiresAt - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
};

ProxySchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Chaîne proxy complète
ProxySchema.methods.proxyString = function () {
  return `${this.protocol}://${this.username}:${this.password}@${this.ip}:${this.port}`;
};

module.exports = mongoose.model('Proxy', ProxySchema);
