const { doubleCsrf } = require('csrf-csrf');
const { loadCsrfSecret } = require('./csrf-secret');

const CSRF_EXEMPT_PATHS = new Set([
  '/api/payment/callback',
  '/api/webhooks/clerk',
  '/api/csp-report',
  '/api/csp-report/',
  '/api/performance/vitals',
]);

function isProductionEnv(env = process.env) {
  return env.NODE_ENV === 'production';
}

function csrfCookieName(env = process.env) {
  return isProductionEnv(env) ? '__Host-mafiking.csrf-token' : 'mafiking.csrf-token';
}

function shouldSkipCsrf(req) {
  const path = String(req.path || '');
  if (!path.startsWith('/api/')) return true;
  return CSRF_EXEMPT_PATHS.has(path);
}

function createCsrfProtection(options = {}) {
  const env = options.env || process.env;
  const secret = options.secret || loadCsrfSecret(env);
  const isProduction = isProductionEnv(env);
  const utilities = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (req) => String(req.sessionID || req.session?.id || ''),
    cookieName: options.cookieName || csrfCookieName(env),
    cookieOptions: {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
      path: '/',
    },
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
    skipCsrfProtection: shouldSkipCsrf,
  });

  function csrfTokenRoute(req, res) {
    if (req.session) req.session.csrfIssuedAt = Date.now();
    const csrfToken = utilities.generateCsrfToken(req, res);
    res.json({ csrfToken });
  }

  function csrfProtection(req, res, next) {
    utilities.doubleCsrfProtection(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'EBADCSRFTOKEN' || err.statusCode === 403) {
        return res.status(403).json({
          code: 'EBADCSRFTOKEN',
          error: 'CSRF token tidak valid. Muat ulang halaman lalu coba lagi.',
        });
      }
      return next(err);
    });
  }

  return {
    csrfProtection,
    csrfTokenRoute,
    generateCsrfToken: utilities.generateCsrfToken,
  };
}

module.exports = {
  CSRF_EXEMPT_PATHS,
  createCsrfProtection,
  csrfCookieName,
  shouldSkipCsrf,
};
