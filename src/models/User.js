const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    psid:             { type: String, unique: true, required: true, index: true },
    email:            { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash:     { type: String },
    state:            { type: String, default: 'WELCOME' },
    stateData:        { type: Object, default: {} },
    isLoggedIn:       { type: Boolean, default: false },
    isPageSubscriber: { type: Boolean, default: false },
    // Local balance — admin credits this manually via the reselling panel
    balance:          { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
