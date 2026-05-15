function isAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') {
        return next();
    }
    if (isLocalAdminMode(req)) {
        return next();
    }
    res.status(403).json({ error: 'Akses admin diperlukan' });
}

function isLocalAdminMode(req) {
    if (process.env.NODE_ENV === 'production') return false;
    if (process.env.LOCAL_ADMIN_MODE === 'false') return false;

    const remoteAddress = req.socket && req.socket.remoteAddress;
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const candidates = [req.ip, remoteAddress, forwardedFor].filter(Boolean);
    return candidates.some((value) => (
        value === '127.0.0.1' ||
        value === '::1' ||
        value === '::ffff:127.0.0.1'
    ));
}

module.exports = { isAdmin };
