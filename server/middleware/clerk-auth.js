const { getAuth } = require('@clerk/express');
const { syncClerkUserFromId } = require('../auth/clerk-user-sync');

async function clerkAuthMiddleware(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (!process.env.CLERK_SECRET_KEY) return next();

  const hasBearer = /^Bearer\s+.+/i.test(String(req.headers.authorization || ''));
  let auth;
  try {
    auth = getAuth(req);
  } catch (error) {
    if (hasBearer) return res.status(401).json({ error: 'Token Clerk tidak valid.' });
    return next();
  }

  if (!auth || !auth.userId) {
    if (hasBearer) return res.status(401).json({ error: 'Token Clerk tidak valid.' });
    return next();
  }

  try {
    const db = req.app.locals.db;
    const result = await syncClerkUserFromId(db, auth.userId);
    if (!result || !result.user) return next();

    req.userId = result.user.id;
    req.role = result.user.role;
    req.clerkUserId = auth.userId;
    req.clerkUserCreated = Boolean(result.created);
    req.clerkSuggestedDisplayName = result.suggestedDisplayName || result.user.display_name;

    if (req.session) {
      req.session.userId = result.user.id;
      req.session.role = result.user.role;
      if (result.created) {
        req.session.clerkSuggestedDisplayName = req.clerkSuggestedDisplayName;
      }
    }

    return next();
  } catch (error) {
    console.error('[clerk-auth] sync error:', error.message || error);
    if (hasBearer) return res.status(401).json({ error: 'Gagal memverifikasi akun Google.' });
    return next();
  }
}

module.exports = { clerkAuthMiddleware };
