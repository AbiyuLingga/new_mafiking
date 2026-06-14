const { execFileSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const allowedRootFiles = new Set([
  '.env.example',
  '.gitattributes',
  '.gitignore',
  '.semgrep.yml',
  'AGENTS.md',
  'ARCHITECTURE.md',
  'MAFIKING.html',
  'README.md',
  'deploy.ps1',
  'deploy.sh',
  'ecosystem.config.js',
  'index.html',
  'package-lock.json',
  'package.json',
  'postcss.config.js',
  'server.js',
  'tailwind.config.js',
  'vite.config.js',
]);

const allowedSrcRootFiles = new Set([
  'src/main.css',
  'src/main.jsx',
  'src/styles.css',
]);

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const violations = [];
for (const file of trackedFiles) {
  if (!file.includes('/') && !allowedRootFiles.has(file)) {
    violations.push(`${file}: file root tidak dikenal`);
  }
  if (/^scripts\/test-.*\.js$/.test(file)) {
    violations.push(`${file}: test harus berada di tests/`);
  }
  if (/^(lib|middleware|routes)\//.test(file)) {
    violations.push(`${file}: backend harus berada di server/`);
  }
  if (/^src\/[^/]+$/.test(file) && !allowedSrcRootFiles.has(file)) {
    violations.push(`${file}: source frontend harus berada di core/pages/features`);
  }
  if (
    /(^|\/)database\.sqlite(?:$|-)/.test(file)
    || /(^|\/).*\.sqlite-(?:shm|wal)$/.test(file)
    || /(^|\/).*\.backup-/.test(file)
    || /^logs\//.test(file)
    || /^dist\//.test(file)
    || /^profile-media\//.test(file)
    || /(^|\/).*_cookie\.txt$/.test(file)
  ) {
    violations.push(`${file}: artefak runtime tidak boleh tracked`);
  }
}

if (violations.length > 0) {
  console.error('Layout repository tidak valid:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Layout repository valid (${trackedFiles.length} tracked files).`);
