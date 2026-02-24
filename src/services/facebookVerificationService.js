/**
 * Facebook Verification Service
 * Vérifie si un utilisateur est abonné à la page Facebook
 */

const axios = require('axios');

/**
 * Vérifier si l'utilisateur (PSID) est fan/abonné de la page Facebook
 * @param {string} psid - Facebook Sender ID (User PSID)
 * @returns {Promise<boolean>} - true si abonné, false sinon
 */
async function verifyFacebookPageSubscription(psid) {
  try {
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
      console.warn('❌ Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN');
      return false;
    }

    // Méthode 1: Vérifier via l'endpoint /me/friends
    // Remarque: Cela ne fonctionne que si l'utilisateur a donné la permission
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${pageId}/subscribers`,
      {
        params: {
          fields: 'id',
          access_token: accessToken
        },
        timeout: 5000
      }
    );

    if (!response.data || !response.data.data) {
      console.warn('❌ Invalid Facebook API response');
      return false;
    }

    // Chercher le PSID dans la liste des abonnés
    const isSubscriber = response.data.data.some(
      subscriber => subscriber.id === psid
    );

    console.log(`✅ Subscription check for ${psid}: ${isSubscriber ? 'VERIFIED' : 'NOT FOUND'}`);
    return isSubscriber;

  } catch (error) {
    console.error('❌ Facebook subscription verification error:', error.message);
    
    // En cas d'erreur, on peut décider de:
    // - Retourner false (strict: utilisateur doit vraiment être abonné)
    // - Retourner true (permissif: laisser passer en cas d'erreur)
    // Par défaut: false (strict)
    
    return false;
  }
}

/**
 * Méthode alternative: Vérifier via Webhooks (plus fiable)
 * Cette méthode détecte automatiquement les abonnements/désabonnements
 * 
 * Dans votre webhook, vous devriez écouter les événements:
 * - messaging_optins: L'utilisateur s'abonne
 * - messaging_optouts: L'utilisateur se désabonne
 * 
 * Stocker l'état dans la base de données:
 * User.isPageSubscriber = true/false
 */

/**
 * Vérifier l'abonnement basé sur la base de données (méthode webhook)
 * @param {string} userId - ID utilisateur MongoDB
 * @returns {Promise<boolean>}
 */
async function verifySubscriptionFromDatabase(userId) {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      console.warn(`User not found: ${userId}`);
      return false;
    }

    return user.isPageSubscriber === true;
  } catch (error) {
    console.error('❌ Database subscription check error:', error.message);
    return false;
  }
}

/**
 * Marquer l'utilisateur comme abonné (via webhook)
 * @param {string} userId - ID utilisateur MongoDB
 * @param {boolean} subscribed - true/false
 */
async function updateSubscriptionStatus(userId, subscribed) {
  try {
    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(
      userId,
      { isPageSubscriber: subscribed },
      { new: true }
    );
    
    console.log(`✅ Updated subscription status for ${userId}: ${subscribed}`);
    return user;
  } catch (error) {
    console.error('❌ Error updating subscription status:', error.message);
    return null;
  }
}

module.exports = {
  verifyFacebookPageSubscription,
  verifySubscriptionFromDatabase,
  updateSubscriptionStatus
};
