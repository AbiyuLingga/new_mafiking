// IP allowlist middleware for sensitive routes (admin payment, collector ingest).
// Phase 5 hardening: restrict who can hit financial endpoints.
//
// Env: ADMIN_IP_ALLOWLIST (comma-separated CIDR or exact IPs)
//      COLLECTOR_IP_ALLOWLIST (comma-separated CIDR or exact IPs for /reconcile/*)

function parseIpList(value) {
    if (!value) return [];
    return String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function ipMatches(ip, allowed) {
    if (!ip) return false;
    for (const entry of allowed) {
        if (entry === ip) return true;
        if (entry.includes('/')) {
            if (cidrMatch(ip, entry)) return true;
        }
    }
    return false;
}

function cidrMatch(ip, cidr) {
    try {
        const [range, bitsStr] = cidr.split('/');
        const bits = Number(bitsStr);
        if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        const ipInt = ipToInt(ip);
        const rangeInt = ipToInt(range);
        if (ipInt === null || rangeInt === null) return false;
        return (ipInt & mask) === (rangeInt & mask);
    } catch (_) {
        return false;
    }
}

function ipToInt(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let result = 0;
    for (const p of parts) {
        const n = Number(p);
        if (!Number.isInteger(n) || n < 0 || n > 255) return null;
        result = (result * 256) + n;
    }
    return result >>> 0;
}

function makeIpAllowlist(envName) {
    return function ipAllowlist(req, res, next) {
        const allowlist = parseIpList(process.env[envName]);
        if (allowlist.length === 0) return next();
        const clientIp = req.ip || req.connection?.remoteAddress || '';
        const cleanedIp = clientIp.replace(/^::ffff:/, '');
        if (ipMatches(cleanedIp, allowlist)) return next();
        return res.status(403).json({ error: 'Access denied from this network' });
    };
}

const adminIpAllowlist = makeIpAllowlist('ADMIN_IP_ALLOWLIST');
const collectorIpAllowlist = makeIpAllowlist('COLLECTOR_IP_ALLOWLIST');

module.exports = {
    adminIpAllowlist,
    collectorIpAllowlist,
    ipMatches,
    makeIpAllowlist,
    parseIpList,
};
