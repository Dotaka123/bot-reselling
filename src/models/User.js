const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    psid: { type: String, unique: true, required: true, index: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: String,
    state: { type: String, default: 'WELCOME' },
    stateData: { type: Object, default: {} },
    isLoggedIn: { type: Boolean, default: false },
    isPageSubscriber: { type: Boolean, default: false },
    balance: { type: Number, default: 0, min: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

UserSchema.index({ psid: 1 });
UserSchema.index({ email: 1 });

module.exports = mongoose.model('User', UserSchema);
