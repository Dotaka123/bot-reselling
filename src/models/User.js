const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

/**
 * Modèle utilisateur du bot Messenger
 * psid = Page-Scoped ID Facebook (identifiant unique par utilisateur)
 */
const UserSchema = new mongoose.Schema({

  // ── Identité Facebook ──────────────────────
  psid: {
    type:     String,
    required: true,
    unique:   true,
    index:    true
  },
  facebookName: { type: String, default: '' },

  // ── Compte créé sur le bot ─────────────────
  email: {
    type:      String,
    lowercase: true,
    sparse:    true,   // null autorisé mais unique si présent
    default:   null
  },
  password: {
    type:    String,
    default: null
  },
  isRegistered: { type: Boolean, default: false },

  // ── État conversationnel (state machine) ───
  state: {
    type:    String,
    default: 'WELCOME'   // WELCOME | REGISTER_EMAIL | REGISTER_PASSWORD | MAIN_MENU | ...
  },
  stateData: {
    type:    Object,    // données temporaires liées à l'état courant
    default: {}
  },
  previousState: { type: String, default: null },

  // ── Session ────────────────────────────────
  isLoggedIn:  { type: Boolean, default: false },
  lastActivity: { type: Date,  default: Date.now },

  // ── Métadonnées ────────────────────────────
  createdAt: { type: Date, default: Date.now }
});

// Hash du mot de passe avant sauvegarde
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Vérification du mot de passe
UserSchema.methods.verifyPassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Mise à jour de l'activité
UserSchema.methods.touch = function () {
  this.lastActivity = new Date();
  return this.save();
};

module.exports = mongoose.model('BotUser', UserSchema);
