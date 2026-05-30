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
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    return Boolean(user && user.password_hash && user.password_hash !== 'none');
}

function requireRegisteredUser(req, res, next) {
    if (req.session && isRegisteredUser(req.app.locals.db, req.session.userId)) {
        return next();
    }
    res.status(401).json({ error: 'Login diperlukan' });
}

module.exports = { isAuthenticated, isRegisteredUser, requireRegisteredUser };
