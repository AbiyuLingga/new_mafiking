function isAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') {
        return next();
    }
    res.status(403).json({ error: 'Akses admin diperlukan' });
}

module.exports = { isAdmin };
