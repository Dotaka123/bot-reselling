const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
    name:        { type: String, required: true },   // e.g. "Binance"
    icon:        { type: String, default: '💳' },    // emoji
    detail:      { type: String, required: true },   // e.g. "Recharge ID: 909914646"
    instructions:{ type: String, default: '' },      // optional extra instructions
    isActive:    { type: Boolean, default: true },
    order:       { type: Number, default: 0 },
    createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);
