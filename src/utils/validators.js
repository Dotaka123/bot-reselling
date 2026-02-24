/**
 * Parser l'input utilisateur
 * Retourne { type, value, raw }
 * - type: 'number' | 'command' | 'text'
 * - value: la valeur parsée
 * - raw: le texte original
 */
function parseInput(text) {
    const trimmed = text.trim();
    
    // Vérifier si c'est un nombre
    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) {
        return {
            type: 'number',
            value: num,
            raw: trimmed
        };
    }
    
    // Vérifier les commandes
    const lowerText = trimmed.toLowerCase();
    if (lowerText === 'cancel' || lowerText === 'annuler') {
        return {
            type: 'command',
            value: 'CANCEL',
            raw: trimmed
        };
    }
    
    if (lowerText === 'done' || lowerText === 'fait') {
        return {
            type: 'command',
            value: 'DONE',
            raw: trimmed
        };
    }
    
    // Sinon c'est du texte
    return {
        type: 'text',
        value: trimmed,
        raw: trimmed
    };
}

/**
 * Valider un email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Valider un mot de passe
 * Minimum 6 caractères
 */
function isValidPassword(password) {
    return password && password.length >= 6;
}

/**
 * Valider une URL
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Valider un nombre positif
 */
function isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0;
}

/**
 * Nettoyer une chaîne de texte
 */
function sanitizeText(text) {
    return text.trim().replace(/[<>]/g, '');
}

module.exports = {
    parseInput,
    isValidEmail,
    isValidPassword,
    isValidUrl,
    isValidAmount,
    sanitizeText
};
