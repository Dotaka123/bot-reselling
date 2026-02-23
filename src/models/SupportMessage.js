const mongoose = require('mongoose');

const SupportMessageSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'BotUser' },
  psid:    { type: String },
  email:   { type: String },
  message: { type: String, required: true },
  status:  { type: String, default: 'OPEN', enum: ['OPEN', 'IN_PROGRESS', 'CLOSED'] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SupportMessage', SupportMessageSchema);
