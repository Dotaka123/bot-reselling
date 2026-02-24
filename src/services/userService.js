const User = require('../models/User');
const Proxy = require('../models/Proxy');

async function getUserByPsid(psid) {
    try {
        return await User.findOne({ psid });
    } catch (err) {
        console.error('Error getting user by PSID:', err);
        return null;
    }
}

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

async function getUserByEmail(email) {
    try {
        return await User.findOne({ email });
    } catch (err) {
        console.error('Error getting user by email:', err);
        return null;
    }
}

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

async function getActiveProxies(userId) {
    try {
        return await Proxy.find({ userId, status: 'ACTIVE' });
    } catch (err) {
        console.error('Error getting active proxies:', err);
        return [];
    }
}

async function getExpiredProxies(userId) {
    try {
        return await Proxy.find({ userId, status: 'EXPIRED' });
    } catch (err) {
        console.error('Error getting expired proxies:', err);
        return [];
    }
}

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

async function getUserProfile(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return null;
        
        const activeProxies = await getActiveProxies(userId);
        const expiredProxies = await getExpiredProxies(userId);
        
        return { user, activeProxies, expiredProxies };
    } catch (err) {
        console.error('Error getting user profile:', err);
        return null;
    }
}

module.exports = {
    getUserByPsid, createUser, createUserWithCredentials, getUserByEmail,
    setState, getActiveProxies, getExpiredProxies, addBalance, deductBalance, getUserProfile
};
