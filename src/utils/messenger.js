const axios = require('axios');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GRAPH_URL = 'https://graph.facebook.com/v19.0/me/messages';

/**
 * Envoie un message texte simple à un utilisateur Messenger
 * @param {string} psid - Page-Scoped ID du destinataire
 * @param {string} text - Texte à envoyer (max 2000 chars)
 */
async function sendText(psid, text) {
  // Facebook limite à 2000 caractères par message
  // Si le texte est long, on le découpe
  const chunks = chunkText(text, 1900);
  for (const chunk of chunks) {
    await _sendRequest(psid, { text: chunk });
    // Petit délai pour respecter l'ordre
    if (chunks.length > 1) await delay(300);
  }
}

/**
 * Envoie une "action" (typing indicator)
 * @param {string} psid
 * @param {'typing_on'|'typing_off'|'mark_seen'} action
 */
async function sendAction(psid, action = 'typing_on') {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        recipient:      { id: psid },
        sender_action:  action
      },
      {
        params:  { access_token: PAGE_ACCESS_TOKEN },
        timeout: 5000
      }
    );
  } catch (e) {
    // Non critique, on ignore
  }
}

/**
 * Récupère le profil Facebook d'un utilisateur
 */
async function getUserProfile(psid) {
  try {
    const r = await axios.get(
      `https://graph.facebook.com/v19.0/${psid}`,
      {
        params:  { fields: 'first_name,last_name', access_token: PAGE_ACCESS_TOKEN },
        timeout: 5000
      }
    );
    return r.data;
  } catch (e) {
    return { first_name: 'Utilisateur', last_name: '' };
  }
}

// ── Fonction interne ──────────────────────────────────────────────
async function _sendRequest(psid, message) {
  try {
    await sendAction(psid, 'typing_on');
    await delay(400); // simule la frappe

    await axios.post(
      GRAPH_URL,
      {
        recipient: { id: psid },
        message,
        messaging_type: 'RESPONSE'
      },
      {
        params:  { access_token: PAGE_ACCESS_TOKEN },
        timeout: 10000
      }
    );

    await sendAction(psid, 'typing_off');
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`❌ Messenger send error [${psid}]: ${msg}`);
    throw new Error(`Échec envoi message: ${msg}`);
  }
}

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    // Découpe proprement sur un saut de ligne si possible
    let end = i + maxLen;
    if (end < text.length) {
      const lastNl = text.lastIndexOf('\n', end);
      if (lastNl > i) end = lastNl + 1;
    }
    chunks.push(text.slice(i, end).trim());
    i = end;
  }
  return chunks.filter(Boolean);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { sendText, sendAction, getUserProfile };
