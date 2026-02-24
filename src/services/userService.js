/**
 * userService.js
 *
 * Bot users are LOCAL only — stored in MongoDB.
 * They have nothing to do with the reselling API.
 * Balance is tracked locally and deducted on each purchase.
 */
const User  = require('../models/User');
const Proxy = require('../models/Proxy');
const crypto = require('crypto');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function getUserByPsid(psid) {
    try { return await User.findOne({ psid }); }
    catch (err) { console.error('getUserByPsid:', err); return null; }
}

async function createUser(psid) {
    try {
        return await new User({
            psid, isLoggedIn: false, isPageSubscriber: false,
            state: 'WELCOME', stateData: {}, balance: 0
        }).save();
    } catch (err) { console.error('createUser:', err); return null; }
}

async function getUserByEmail(email) {
    try { return await User.findOne({ email: email.toLowerCase().trim() }); }
    catch (err) { console.error('getUserByEmail:', err); return null; }
}

/** Register a new local user account */
async function registerUser(user, email, password) {
    const existing = await getUserByEmail(email);
    if (existing) return { error: 'EMAIL_TAKEN' };

    user.email        = email.toLowerCase().trim();
    user.passwordHash = hashPassword(password);
    user.isLoggedIn   = true;
    user.balance      = 0;
    user.state        = 'MAIN_MENU';
    user.stateData    = {};
    await user.save();
    return { success: true };
}

/** Login a local user — just checks email + password hash */
async function loginUser(user, email, password) {
    const account = await getUserByEmail(email);
    if (!account) return { error: 'NOT_FOUND' };
    if (account.passwordHash !== hashPassword(password)) return { error: 'WRONG_PASSWORD' };

    // Merge the found account into this PSID's user session
    user.email        = account.email;
    user.passwordHash = account.passwordHash;
    user.balance      = account.balance;
    user.isLoggedIn   = true;
    user.state        = 'MAIN_MENU';
    user.stateData    = {};
    await user.save();
    return { success: true };
}

async function setState(user, stateName, stateData = {}) {
    try { user.state = stateName; user.stateData = stateData; await user.save(); return user; }
    catch (err) { console.error('setState:', err); return null; }
}

async function deductBalance(user, amount) {
    if ((user.balance || 0) < amount) return false;
    user.balance = parseFloat((user.balance - amount).toFixed(4));
    await user.save();
    return true;
}

async function addBalance(userId, amount) {
    const user = await User.findById(userId);
    if (!user) return null;
    user.balance = parseFloat(((user.balance || 0) + amount).toFixed(4));
    await user.save();
    return user;
}

async function getActiveProxies(userId) {
    try { return await Proxy.find({ userId, status: 'ACTIVE' }); }
    catch { return []; }
}

async function getExpiredProxies(userId) {
    try { return await Proxy.find({ userId, status: { $ne: 'ACTIVE' } }); }
    catch { return []; }
}

module.exports = {
    getUserByPsid, createUser, getUserByEmail,
    registerUser, loginUser, setState,
    deductBalance, addBalance,
    getActiveProxies, getExpiredProxies
};
