const mongoose = require('mongoose');

const TopUpRequestSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'BotUser', required: true },
  psid:      { type: String, required: true },
  email:     { type: String },
  amount:    { type: Number, required: true },   // montant demandé en $
  status:    { type: String, default: 'PENDING', enum: ['PENDING', 'APPROVED', 'REJECTED'] },
  note:      { type: String, default: '' },       // note admin (optionnelle)
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});

module.exports = mongoose.model('TopUpRequest', TopUpRequestSchema);
