const User = require('../models/User');
const { getUserProfile } = require('../utils/messenger');

/**
 * Récupère ou crée un utilisateur Messenger
 */
async function getOrCreateUser(psid) {
  let user = await User.findOne({ psid });
  if (!user) {
    // Récupère le nom Facebook
    const profile = await getUserProfile(psid);
    user = await User.create({
      psid,
      facebookName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      state: 'WELCOME'
    });
    console.log(`👤 Nouvel utilisateur créé : ${psid}`);
  }
  return user;
}

/**
 * Met à jour l'état de l'utilisateur
 */
async function setState(user, newState, data = {}) {
  user.previousState = user.state;
  user.state         = newState;
  user.stateData     = data;
  user.lastActivity  = new Date();
  return user.save();
}

/**
 * Vérifie si l'email est déjà pris
 */
async function isEmailTaken(email) {
  const exists = await User.findOne({ email: email.toLowerCase() });
  return !!exists;
}

module.exports = { getOrCreateUser, setState, isEmailTaken };
