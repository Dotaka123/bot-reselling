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
 * Commandes globales: '0', '9', 'annuler'
 */
function parseInput(text) {
  if (!text) return { type: 'text', value: '' };
  const trimmed = text.trim().toLowerCase();

  // Commandes globales
  if (trimmed === 'annuler') return { type: 'command', value: 'ANNULER' };
  if (trimmed === '9')       return { type: 'command', value: 'MAIN_MENU' };
  if (trimmed === '0')       return { type: 'command', value: 'RETOUR' };

  // Nombre
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && String(num) === trimmed) return { type: 'number', value: num };

  return { type: 'text', value: text.trim() };
}

module.exports = { isValidEmail, isValidPassword, parseInput };
