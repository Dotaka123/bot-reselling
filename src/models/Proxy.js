const mongoose = require('mongoose');

const ProxySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    apiProxyId: { type: Number, default: null },   // ID from upstream proxy API (for modify/renew)
    ip: { type: String, required: true },
    port: { type: Number, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    protocol: { type: String, enum: ['http', 'socks5'], required: true },
    country: String,
    city: String,
    provider: String,
    duration: { type: Number, required: true },
    purchaseDate: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'SUSPENDED'], default: 'ACTIVE' },
    price: { type: Number, required: true },
    package: { type: String, default: 'SILVER' },  // e.g. 'GOLDEN', 'SILVER', or pkgName
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

ProxySchema.index({ userId: 1, status: 1 });
ProxySchema.index({ expiresAt: 1 });

ProxySchema.methods.daysLeft = function() {
    if (!this.expiresAt) return null;
    const diffTime = this.expiresAt - new Date();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
};

ProxySchema.methods.getConnectionString = function() {
    return `${this.protocol}://${this.username}:${this.password}@${this.ip}:${this.port}`;
};

module.exports = mongoose.model('Proxy', ProxySchema);
