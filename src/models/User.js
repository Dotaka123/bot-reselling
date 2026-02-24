const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // Identifiant Messenger
    psid: {
        type: String,
        unique: true,
        required: true,
        index: true
    },
    
    // Credentials
    email: {
        type: String,
        unique: true,
        sparse: true,  // Permet null values sans violation unique
        lowercase: true,
        trim: true
    },
    passwordHash: String,
    
    // État de la conversation
    state: {
        type: String,
        default: 'WELCOME',
        enum: [
            'WELCOME', 'FB_VERIFICATION',
            'CAPTCHA_LOGIN', 'CAPTCHA_REGISTER',
            'LOGIN_EMAIL', 'LOGIN_PASSWORD',
            'REGISTER_EMAIL', 'REGISTER_PASSWORD',
            'MAIN_MENU',
            'BUY_PKG', 'BUY_PROTO', 'BUY_DURATION', 'BUY_COUNTRY', 'BUY_CITY', 'BUY_PROVIDER', 'BUY_PARENT', 'BUY_CONFIRM',
            'TOPUP', 'SUPPORT'
        ]
    },
    
    // Données d'état (pagination, sélections, etc)
    stateData: {
        type: Object,
        default: {}
    },
    
    // Statut d'authentification
    isLoggedIn: {
        type: Boolean,
        default: false
    },
    
    // Vérification Facebook
    isPageSubscriber: {
        type: Boolean,
        default: false
    },
    
    // Solde
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { 
    timestamps: true 
});

// Index pour des requêtes rapides
UserSchema.index({ psid: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ createdAt: -1 });

// Méthode pour obtenir les jours restants des proxies
UserSchema.methods.daysLeft = function() {
    if (!this.expiresAt) return null;
    const now = new Date();
    const expiry = new Date(this.expiresAt);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
};

module.exports = mongoose.model('User', UserSchema);
