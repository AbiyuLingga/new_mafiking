// CSP configuration factory for new_mafiking.
//
// Goals:
// - Remove the broad `https:` allowlist that effectively disabled CSP for XSS.
// - Keep `'unsafe-inline'` for now because Tailwind CDN injects runtime styles
//   and Babel transforms inline `<script type="text/babel">` blocks. A nonce
//   migration is planned in a follow-up.
// - Ship in `reportOnly: true` first (CSP_REPORT_ONLY=1, default) so violations
//   can be observed without breaking the app. Flip to enforced after 7 days
//   of clean reports.
//
// Allowlist source: lib/csp.js (this file), driven by external resources
// referenced from the production Vite bundle and legacy development fallback.

function frontendApiFromPublishableKey(publishableKey) {
  try {
    const encoded = String(publishableKey || '').split('_')[2];
    if (!encoded) return '';
    return Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
  } catch (_) {
    return '';
  }
}

function resolveClerkOrigins(env = process.env) {
  const publishable = String(env.VITE_CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY || '').trim();
  if (!publishable) return [];
  const frontendApi = frontendApiFromPublishableKey(publishable);
  if (!frontendApi) return [];
  return [`https://${frontendApi}`];
}

function resolveReportUri(env = process.env) {
  return String(env.CSP_REPORT_URI || '/api/csp-report').trim() || '/api/csp-report';
}

function resolveReportToName() {
  return 'csp-endpoint';
}

function buildDirectives(env = process.env) {
  const clerkOrigins = resolveClerkOrigins(env);

  // Static third-party origins. Add new ones here only after verifying the
  // resource is actually used by the running app.
  const tailwind = 'https://cdn.tailwindcss.com';
  const jsdelivr = 'https://cdn.jsdelivr.net';
  const unpkg = 'https://unpkg.com';
  const googleFontsCss = 'https://fonts.googleapis.com';
  const googleFontsFiles = 'https://fonts.gstatic.com';
  const unsplash = 'https://images.unsplash.com';
  const clerkTelemetry = 'https://clerk-telemetry.com';

  const scriptSrc = ["'self'", "'unsafe-inline'", jsdelivr, unpkg, tailwind, ...clerkOrigins];
  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    googleFontsCss,
    jsdelivr,
    tailwind,
  ];
  const imgSrc = ["'self'", 'data:', unsplash, ...clerkOrigins];
  const fontSrc = ["'self'", googleFontsFiles, jsdelivr];
  const connectSrc = ["'self'", unpkg, jsdelivr, clerkTelemetry, ...clerkOrigins];
  const frameSrc = ["'self'", ...clerkOrigins];
  const workerSrc = ["'self'", 'blob:'];
  const objectSrc = ["'none'"];

  return {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc,
    imgSrc,
    fontSrc,
    connectSrc,
    frameSrc,
    workerSrc,
    objectSrc,
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    reportUri: resolveReportUri(env),
    reportTo: resolveReportToName(),
  };
}

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isReportOnly(env = process.env) {
  // Default: report-only. Override with CSP_REPORT_ONLY=0 in production after
  // the report window is clean.
  if (isTruthyEnv(env.CSP_ENFORCE)) return false;
  return env.CSP_REPORT_ONLY === undefined ? true : isTruthyEnv(env.CSP_REPORT_ONLY);
}

function helmetCspOptions(env = process.env) {
  const directives = buildDirectives(env);
  return {
    useDefaults: false,
    directives,
    reportOnly: isReportOnly(env),
  };
}

module.exports = {
  buildDirectives,
  frontendApiFromPublishableKey,
  helmetCspOptions,
  isReportOnly,
  resolveClerkOrigins,
  resolveReportUri,
};
