function isAdmin(req, res, next) {
    if (req.role === 'admin') {
        return next();
    }
    if (req.session && req.session.role === 'admin') {
        return next();
    }
    if (isLocalAdminMode(req)) {
        return next();
    }
    res.status(403).json({ error: 'Akses admin diperlukan' });
}

function isLoopbackAddress(value) {
    return (
        value === '127.0.0.1' ||
        value === '::1' ||
        value === '::ffff:127.0.0.1'
    );
}

function isLocalAdminMode(req) {
    if (process.env.NODE_ENV === 'production') return false;
    if (process.env.LOCAL_ADMIN_MODE !== 'true') return false;

    const remoteAddress = req.socket && req.socket.remoteAddress;
    const candidates = [req.ip, remoteAddress].filter(Boolean);
    return candidates.some(isLoopbackAddress);
}

module.exports = { isAdmin, isLocalAdminMode, isLoopbackAddress };
