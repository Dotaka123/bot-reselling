const mongoose = require('mongoose');

const TopUpRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    psid: { type: String, required: true },
    email: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    approvedAmount: { type: Number, default: 0 },
    approvedBy: String,
    approvedAt: Date,
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

TopUpRequestSchema.index({ userId: 1, status: 1 });
TopUpRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TopUpRequest', TopUpRequestSchema);
