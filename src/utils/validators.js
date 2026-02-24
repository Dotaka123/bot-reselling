function parseInput(text) {
    const trimmed = text.trim();
    const num = parseInt(trimmed, 10);
    
    if (!isNaN(num)) {
        return { type: 'number', value: num, raw: trimmed };
    }
    
    const lower = trimmed.toLowerCase();
    if (['cancel', 'annuler', 'c'].includes(lower)) {
        return { type: 'command', value: 'CANCEL', raw: trimmed };
    }
    if (['done', 'fait', 'd'].includes(lower)) {
        return { type: 'command', value: 'DONE', raw: trimmed };
    }
    if (['menu', '9'].includes(lower)) {
        return { type: 'command', value: 'MENU', raw: trimmed };
    }
    
    return { type: 'text', value: trimmed, raw: trimmed };
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email && email.toLowerCase());
}

function isValidPassword(password) {
    return password && password.length >= 6;
}

function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0;
}

function sanitizeText(text) {
    return text.trim().replace(/[<>]/g, '').substring(0, 500);
}

module.exports = {
    parseInput, isValidEmail, isValidPassword, isValidUrl, isValidAmount, sanitizeText
};
