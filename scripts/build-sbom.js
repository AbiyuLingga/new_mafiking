#!/usr/bin/env node
// SBOM (Software Bill of Materials) generator
// Phase 3: generate CycloneDX-style SBOM for QRIS/payment supply-chain tracking.
//
// Usage:
//   node scripts/build-sbom.js
//   npm run build:sbom
//
// Outputs SBOM JSON to docs/security/sbom.json and a summary to stdout.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const OUT_DIR = path.join(ROOT, 'docs', 'security');
const OUT_FILE = path.join(OUT_DIR, 'sbom.json');

const FOCUS_PACKAGES = [
    '@prasetya/qris',
    'qris-mutasi',
    'qrcode',
    'axios',
    'helmet',
    'csrf-csrf',
    'express-rate-limit',
];

function getInstalledVersion(pkgName) {
    const pkgPath = path.join(ROOT, 'node_modules', pkgName, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

function hashFile(filePath) {
    const content = fs.readFileSync(filePath);
    return {
        alg: 'SHA-256',
        content: crypto.createHash('sha256').update(content).digest('hex'),
    };
}

const components = [];
const now = new Date().toISOString();

for (const name of FOCUS_PACKAGES) {
    const pkg = getInstalledVersion(name);
    if (!pkg) continue;
    const tarball = path.join(ROOT, 'node_modules', name);
    const hasIntegrity = fs.existsSync(path.join(tarball, 'package.json'));
    components.push({
        type: 'library',
        name,
        version: pkg.version,
        description: pkg.description || '',
        licenses: pkg.license ? [pkg.license] : [],
        hashes: hasIntegrity ? [hashFile(path.join(tarball, 'package.json'))] : [],
        externalReferences: [
            pkg.homepage ? { type: 'website', url: pkg.homepage } : null,
            pkg.repository?.url ? { type: 'source', url: pkg.repository.url } : null,
        ].filter(Boolean),
        properties: {
            declared: PACKAGE_JSON.dependencies[name] || 'unlisted',
            transitiveDeps: Object.keys(pkg.dependencies || {}).length,
        },
    });
}

const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
        timestamp: now,
        tools: [{ vendor: 'new_mafiking', name: 'build-sbom.js', version: '1.0.0' }],
        component: {
            type: 'application',
            name: 'new_mafiking',
            version: PACKAGE_JSON.version || '0.0.0',
        },
        authors: [{ name: PACKAGE_JSON.author || 'MAFIKING' }],
    },
    components,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(sbom, null, 2));

console.log(`SBOM written to ${path.relative(ROOT, OUT_FILE)}`);
console.log(`Components: ${components.length}`);
for (const c of components) {
    console.log(`  - ${c.name}@${c.version} (declared: ${c.properties.declared})`);
}
process.exit(0);
