const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI not configured');
        
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log(`✅ MongoDB connecté`);
    } catch (err) {
        console.error('❌ Erreur MongoDB:', err.message);
        process.exit(1);
    }
};

mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB déconnecté'));
mongoose.connection.on('reconnected', () => console.log('🔄 MongoDB reconnecté'));

module.exports = connectDB;
