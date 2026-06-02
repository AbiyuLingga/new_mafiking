function isAuthenticated(req, res, next) {
    if (req.userId) {
        return next();
    }
    if (req.session && req.session.userId) {
        return next();
    }
    res.status(401).json({ error: 'Login diperlukan' });
}

function isRegisteredUser(db, userId) {
    if (!db || !userId) return false;
    const user = db.prepare('SELECT password_hash, clerk_id, auth_provider FROM users WHERE id = ?').get(userId);
    if (!user) return false;

    const passwordHash = String(user.password_hash || '');
    if (passwordHash && passwordHash !== 'none') return true;

    const clerkId = String(user.clerk_id || '').trim();
    const authProvider = String(user.auth_provider || '').trim();
    return Boolean(clerkId && (authProvider === 'clerk' || authProvider === 'linked'));
}

function requireRegisteredUser(req, res, next) {
    if (req.session && isRegisteredUser(req.app.locals.db, req.session.userId)) {
        return next();
    }
    res.status(401).json({ error: 'Login diperlukan' });
}

module.exports = { isAuthenticated, isRegisteredUser, requireRegisteredUser };
