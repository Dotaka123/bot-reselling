/**
 * fix-indexes.js
 *
 * Run ONCE to drop the stale `username_1` index from the users collection.
 * This index was created by an old schema and conflicts with new users
 * (who have no `username` field, causing duplicate key errors on null).
 *
 * Usage:
 *   node fix-indexes.js
 *
 * Or with a custom MONGODB_URI:
 *   MONGODB_URI=mongodb://... node fix-indexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/proxybot';

async function run() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected:', MONGODB_URI.replace(/:\/\/.*@/, '://***@'));

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // List current indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes on users collection:');
    indexes.forEach(idx => console.log(' -', JSON.stringify(idx.key), idx.unique ? '(unique)' : ''));

    // Drop stale indexes
    const toDrop = ['username_1'];
    for (const indexName of toDrop) {
        const exists = indexes.some(idx => idx.name === indexName);
        if (exists) {
            try {
                await collection.dropIndex(indexName);
                console.log(`\n✅ Dropped index: ${indexName}`);
            } catch (err) {
                console.error(`❌ Failed to drop ${indexName}:`, err.message);
            }
        } else {
            console.log(`\nℹ️  Index "${indexName}" not found — already clean.`);
        }
    }

    // Show remaining indexes
    const remaining = await collection.indexes();
    console.log('\n📋 Remaining indexes:');
    remaining.forEach(idx => console.log(' -', JSON.stringify(idx.key), idx.unique ? '(unique)' : ''));

    await mongoose.disconnect();
    console.log('\n🎉 Done. You can now restart your bot.');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
