const User = require('../models/User');

/**
 * Récupère un utilisateur par son PSID (Messenger ID)
 */
async function getUserByPsid(psid) {
    try {
        return await User.findOne({ psid });
    } catch (err) {
        console.error('Error getting user by PSID:', err);
        return null;
    }
}

/**
 * Créer un nouvel utilisateur (sans credentials)
 */
async function createUser(psid) {
    try {
        const user = new User({
            psid,
            isLoggedIn: false,
            isPageSubscriber: false,
            state: 'WELCOME',
            stateData: {},
            balance: 0
        });
        await user.save();
        return user;
    } catch (err) {
        console.error('Error creating user:', err);
        return null;
    }
}

/**
 * Créer un utilisateur avec email et mot de passe
 */
async function createUserWithCredentials(psid, email, passwordHash) {
    try {
        const user = new User({
            psid,
            email,
            passwordHash,
            isLoggedIn: true,
            isPageSubscriber: false,
            state: 'MAIN_MENU',
            stateData: {},
            balance: 0
        });
        await user.save();
        return user;
    } catch (err) {
        console.error('Error creating user with credentials:', err);
        return null;
    }
}

/**
 * Récupère un utilisateur par son email
 */
async function getUserByEmail(email) {
    try {
        return await User.findOne({ email });
    } catch (err) {
        console.error('Error getting user by email:', err);
        return null;
    }
}

/**
 * Définir l'état de l'utilisateur
 * @param {User} user - L'objet utilisateur
 * @param {string} stateName - Le nom du nouvel état
 * @param {object} stateData - Les données associées à cet état (optionnel)
 */
async function setState(user, stateName, stateData = {}) {
    try {
        user.state = stateName;
        user.stateData = stateData;
        await user.save();
        return user;
    } catch (err) {
        console.error('Error setting user state:', err);
        return null;
    }
}

/**
 * Obtenir les proxies actifs d'un utilisateur
 */
async function getActiveProxies(userId) {
    try {
        const Proxy = require('../models/Proxy');
        return await Proxy.find({ userId, status: 'ACTIVE' });
    } catch (err) {
        console.error('Error getting active proxies:', err);
        return [];
    }
}

/**
 * Obtenir les proxies expirés d'un utilisateur
 */
async function getExpiredProxies(userId) {
    try {
        const Proxy = require('../models/Proxy');
        return await Proxy.find({ userId, status: 'EXPIRED' });
    } catch (err) {
        console.error('Error getting expired proxies:', err);
        return [];
    }
}

/**
 * Ajouter du solde à un utilisateur
 */
async function addBalance(userId, amount) {
    try {
        const user = await User.findById(userId);
        if (user) {
            user.balance = (user.balance || 0) + amount;
            await user.save();
            return user;
        }
        return null;
    } catch (err) {
        console.error('Error adding balance:', err);
        return null;
    }
}

/**
 * Débiter le solde d'un utilisateur
 */
async function deductBalance(userId, amount) {
    try {
        const user = await User.findById(userId);
        if (user && user.balance >= amount) {
            user.balance -= amount;
            await user.save();
            return true;
        }
        return false;
    } catch (err) {
        console.error('Error deducting balance:', err);
        return false;
    }
}

/**
 * Obtenir toutes les informations du profil utilisateur
 */
async function getUserProfile(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return null;
        
        const activeProxies = await getActiveProxies(userId);
        const expiredProxies = await getExpiredProxies(userId);
        
        return {
            user,
            activeProxies,
            expiredProxies,
            activeCount: activeProxies.length,
            expiredCount: expiredProxies.length
        };
    } catch (err) {
        console.error('Error getting user profile:', err);
        return null;
    }
}

module.exports = {
    getUserByPsid,
    createUser,
    createUserWithCredentials,
    getUserByEmail,
    setState,
    getActiveProxies,
    getExpiredProxies,
    addBalance,
    deductBalance,
    getUserProfile
};
