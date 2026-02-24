const validator = require('validator');

/**
 * Valide un email
 */
function isValidEmail(email) {
  return typeof email === 'string' && validator.isEmail(email.trim());
}

/**
 * Valide un mot de passe (min 6 chars)
 */
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

/**
 * Parse l'input utilisateur
 * Retourne { type, value, raw }
 * type: 'number' | 'command' | 'text'
 * Commandes globales: '0', '9', 'annuler', 'cancel', 'done'
 */
function parseInput(text) {
  if (!text) return { type: 'text', value: '', raw: '' };
  const normalized = text.trim();
  const trimmed = normalized.toLowerCase();

  // Commandes texte
  if (trimmed === 'annuler' || trimmed === 'cancel') return { type: 'command', value: 'CANCEL', raw: normalized };
  if (/\bdone\b/i.test(normalized)) return { type: 'command', value: 'DONE', raw: normalized };

  // Nombre
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && String(num) === trimmed) return { type: 'number', value: num, raw: normalized };

  return { type: 'text', value: normalized, raw: normalized };
}

module.exports = { isValidEmail, isValidPassword, parseInput };
