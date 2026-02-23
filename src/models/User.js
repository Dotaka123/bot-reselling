const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  psid:         { type: String, required: true, unique: true, index: true },
  facebookName: { type: String, default: '' },

  email:        { type: String, lowercase: true, sparse: true, default: null },
  password:     { type: String, default: null },
  isRegistered: { type: Boolean, default: false },

  // Balance du wallet utilisateur (en $, rechargée par l'admin)
  balance:      { type: Number, default: 0 },

  state:         { type: String, default: 'WELCOME' },
  stateData:     { type: Object, default: {} },
  previousState: { type: String, default: null },

  isLoggedIn:   { type: Boolean, default: false },
  lastActivity: { type: Date,    default: Date.now },
  createdAt:    { type: Date,    default: Date.now }
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.verifyPassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

UserSchema.methods.touch = function () {
  this.lastActivity = new Date();
  return this.save();
};

module.exports = mongoose.model('BotUser', UserSchema);
