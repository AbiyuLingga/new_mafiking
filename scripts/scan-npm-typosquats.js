// Lightweight npm typosquatting scan.
//
// Reads package.json (runtime + dev) dependencies and compares each name
// against a small curated list of well-known npm packages using
// Damerau-Levenshtein distance. Flags any name that is one edit away from
// a known popular package — the most common typosquatting pattern is to
// register a name that differs by a single character from a popular one
// (e.g. `expres` vs `express`).
//
// This is intentionally not exhaustive — `npm audit` covers known-malicious
// packages in the registry, and `npm audit signatures` covers unsigned
// packages. This script catches the locally-installed-but-not-yet-flagged
// case where someone accidentally adds `axois` or `lodahs` to a
// package.json.
//
// Run via `node scripts/scan-npm-typosquats.js` or as part of
// `npm run check`.

const fs = require('node:fs');
const path = require('node:path');

const PKG = path.join(__dirname, '..', 'package.json');
const POPULAR = [
  // Top npm packages as of 2026. Keep this list curated; expanding it
  // raises the false-positive rate.
  'react', 'react-dom', 'react-router', 'react-router-dom',
  'next', 'nuxt', 'vue', 'vue-router', 'svelte', 'angular',
  'express', 'koa', 'fastify', 'hapi', 'polka', 'connect',
  'axios', 'got', 'node-fetch', 'undici', 'ky', 'superagent',
  'lodash', 'ramda', 'rxjs', 'immer', 'date-fns', 'dayjs', 'moment',
  'typescript', 'webpack', 'vite', 'rollup', 'parcel', 'esbuild', 'swc',
  'eslint', 'prettier', 'jest', 'mocha', 'chai', 'vitest', 'playwright',
  'bcrypt', 'bcryptjs', 'argon2', 'jsonwebtoken', 'jose', 'passport',
  'helmet', 'cors', 'csurf', 'cookie-parser', 'express-rate-limit',
  'multer', 'busboy', 'formidable', 'sharp', 'jimp',
  'better-sqlite3', 'sqlite3', 'pg', 'mysql', 'mysql2', 'mongoose', 'sequelize', 'prisma', 'knex',
  'dotenv', 'config', 'env-var', 'yargs', 'minimist', 'commander',
  'ws', 'socket.io', 'mqtt', 'amqplib', 'ioredis', 'redis',
  'uuid', 'nanoid', 'crypto-js', 'tweetnacl', 'bcrypt',
  'svix', 'stripe', 'paypal', 'axios',
  'tailwindcss', 'postcss', 'autoprefixer', 'sass', 'less',
  '@google/genai', '@anthropic-ai/sdk', 'openai', 'groq-sdk', 'cohere-ai',
  'pdf-parse', 'mammoth', 'multer', 'busboy', 'tesseract.js',
  'lucide-react', 'react-icons', '@mui/material', 'antd', 'chakra-ui',
  'zod', 'yup', 'joi', 'ajv', 'class-validator',
  'clsx', 'classnames', 'styled-components', 'emotion',
  'winston', 'pino', 'bunyan', 'morgan', 'debug',
  'xss', 'dompurify', 'sanitize-html',
  'cookie', 'cookies', 'cookie-session', 'express-session',
];

// Damerau-Levenshtein with transposition.
function damerauLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const inf = m + n;
  const d = [];
  const da = new Map();
  for (let i = 0; i <= m; i++) {
    d[i] = new Array(n + 1).fill(0);
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    let db = 0;
    for (let j = 1; j <= n; j++) {
      const i1 = da.get(b[j - 1]) || 0;
      const j1 = db;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      if (cost === 0) db = j;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
        d[i1 - 1] ? d[i1 - 1][j1 - 1] + (i - i1 - 1) + 1 + (j - j1 - 1) : inf
      );
    }
    da.set(a[i - 1], i);
  }
  return d[m][n];
}

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
const popularSet = new Set(POPULAR);

const findings = [];
for (const name of deps) {
  if (popularSet.has(name)) continue;
  let best = { dist: Infinity, target: null };
  for (const pop of POPULAR) {
    if (pop === name) continue;
    const dist = damerauLevenshtein(name, pop);
    if (dist < best.dist) best = { dist, target: pop };
  }
  if (best.dist === 1) {
    findings.push({ name, suspect: best.target, dist: best.dist });
  }
}

if (findings.length > 0) {
  console.error('Typosquatting scan:');
  for (const f of findings) {
    console.error(`  - ${f.name} is ${f.dist} edit from popular package "${f.suspect}" — please verify the spelling.`);
  }
  process.exit(1);
}

console.log(`Typosquatting scan: ${deps.length} packages checked, no near-matches against ${POPULAR.length} popular names.`);
