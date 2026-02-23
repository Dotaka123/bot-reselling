const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ Erreur MongoDB :', err.message);
    process.exit(1);
  }
};

// Événements de connexion
mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB déconnecté'));
mongoose.connection.on('reconnected',  () => console.log('🔄 MongoDB reconnecté'));

module.exports = connectDB;
