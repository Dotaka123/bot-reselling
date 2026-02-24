const mongoose = require('mongoose');

const SupportMessageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    psid: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true, minlength: 3 },
    status: { type: String, enum: ['NEW', 'READING', 'REPLIED'], default: 'NEW' },
    adminReply: String,
    repliedBy: String,
    repliedAt: Date,
    category: { type: String, enum: ['BUG', 'FEATURE', 'PAYMENT', 'OTHER'], default: 'OTHER' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

SupportMessageSchema.index({ userId: 1, status: 1 });
SupportMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SupportMessage', SupportMessageSchema);
