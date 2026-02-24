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
 * Retourne { type, value }
 * type: 'number' | 'command' | 'text'
 * Commandes globales: '0', '9', 'annuler', 'cancel', 'done'
 */
function parseInput(text) {
  if (!text) return { type: 'text', value: '' };
  const normalized = text.trim();
  const trimmed = normalized.toLowerCase();

  // Commandes texte
  if (trimmed === 'annuler' || trimmed === 'cancel') return { type: 'command', value: 'CANCEL' };
  if (trimmed === 'done') return { type: 'command', value: 'DONE' };

  // Nombre
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && String(num) === trimmed) return { type: 'number', value: num };

  return { type: 'text', value: normalized };
}

module.exports = { isValidEmail, isValidPassword, parseInput };
