// Shadow API endpoint discovery.
//
// Walks server.js + server/routes/*.js and lists every HTTP route the app exposes.
// Resolves `app.use('/api/foo', require('./server/routes/foo'))` mount prefixes so
// the reported paths match the real URLs the client sees. Cross-references
// against docs/security/api-inventory.md and reports any route that is
// mounted in code but not mentioned in the inventory.
//
// This is the cheap half of "improper inventory management" (OWASP API
// Security #9): we want to know when a new endpoint sneaks in undocumented.
// The expensive half is the manual review that follows.
//
// Run via `node scripts/security/discover-shadow-routes.js` or as part of
// `npm run check`.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const ROUTES_DIR = path.join(ROOT, 'server', 'routes');
const INVENTORY = path.join(ROOT, 'docs', 'security', 'api-inventory.md');

function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

// Map a router file path to the mount prefix used in server.js. We look
// for `app.use('/api/...', require('./server/routes/<name>'))` (with optional
// subpath like `/api/admin/import`).
function buildMountMap() {
  const text = readFile(path.join(ROOT, 'server.js'));
  const mountRegex = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*require\(\s*['"]\.\/server\/routes\/([\w-]+)['"]\s*\)\s*\)/g;
  const map = new Map(); // file basename -> mount prefix
  let m;
  while ((m = mountRegex.exec(text)) !== null) {
    const mount = m[1];
    const name = m[2];
    map.set(`${name}.js`, mount);
  }
  return map;
}

function discoverFromRouter(file, mount) {
  const text = readFile(file);
  const routes = [];
  const regex = /router\.(get|post|put|patch|delete)\(\s*['"\[\`]([^'"]+)['"\]\`]/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const method = m[1].toUpperCase();
    const relPath = m[2].replace(/^\/+/, '/');
    const fullPath = (mount ? mount.replace(/\/$/, '') : '') + relPath;
    routes.push({ method, mount: mount || '(none)', relPath, fullPath, file: path.relative(ROOT, file) });
  }
  return routes;
}

function discoverFromServer(file) {
  // Top-level app.X(...) mounts in server.js (not inside a router file).
  const text = readFile(file);
  const routes = [];
  const regex = /app\.(get|post|put|patch|delete)\(\s*(?:\[[^\]]+\]\s*,\s*)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const method = m[1].toUpperCase();
    const fullPath = m[2];
    routes.push({ method, mount: '(server.js)', relPath: fullPath, fullPath, file: path.relative(ROOT, file) });
  }
  return routes;
}

const mountMap = buildMountMap();

const routeFiles = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js')).map((f) => path.join(ROUTES_DIR, f));
const fromRouters = routeFiles.flatMap((f) => discoverFromRouter(f, mountMap.get(path.basename(f))));
const fromServer = discoverFromServer(path.join(ROOT, 'server.js'));
const discovered = [...fromRouters, ...fromServer].sort((a, b) => a.fullPath.localeCompare(b.fullPath));

// Cross-reference with the inventory.
const inventory = readFile(INVENTORY);
const inventoryPaths = new Set();
for (const line of inventory.split('\n')) {
  // Capture any backticked path that looks like /api/... OR /file.{jsx,md,css,html}
  // OR bare file.{jsx,md,css,html}.
  const matches = line.matchAll(/`(\/[^`\s]+|[^`\s]*\.(jsx?|md|css|html))`/g);
  for (const m of matches) inventoryPaths.add(m[1]);
}

const shadow = discovered.filter((r) => {
  // Allowlist for routes that exist in code but are intentionally
  // unmounted (tracked in the audit). Keep this list short and always
  // point to a finding in docs/security/audit-2026-06.md.
  const KNOWN_DEAD = [
    { method: 'POST', path: '/' }, // server/routes/webhooks.js:55 — see F-9
    { method: 'POST', path: '/clerk' }, // server/routes/webhooks.js:56 — see F-9
  ];
  if (KNOWN_DEAD.some((d) => d.method === r.method && d.path === r.relPath)) return false;

  // Normalize: inventory sometimes lists paths without a leading slash
  // (e.g. `src/core/tweaks-panel.jsx` instead of `/tweaks-panel.jsx`).
  const candidates = new Set([r.fullPath, r.fullPath.replace(/^\/+/, ''), '/' + r.fullPath.replace(/^\/+/, '')]);
  for (const c of candidates) {
    if (inventoryPaths.has(c)) return false;
    // Strip :param segments and try again.
    const stripped = c.replace(/:[a-zA-Z]+/g, ':');
    if (inventoryPaths.has(stripped)) return false;
    // Also try the param-substituted pattern.
    const pattern = new RegExp(
      '^' +
        c.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]+/g, ':[a-zA-Z]+') +
        '$'
    );
    for (const p of inventoryPaths) {
      if (pattern.test(p)) return false;
    }
  }
  return true;
});

if (shadow.length > 0) {
  console.error('Shadow route discovery: routes mounted in code but not mentioned in the inventory:');
  for (const s of shadow) {
    console.error(`  ${s.method.padEnd(6)} ${s.fullPath.padEnd(60)}  [${s.file} via ${s.mount}]`);
  }
  console.error(`\n${shadow.length} route(s) need to be added to docs/security/api-inventory.md`);
  process.exit(1);
}

console.log(`Shadow route discovery: ${discovered.length} routes mounted across ${routeFiles.length + 1} files, all referenced in api-inventory.md.`);
