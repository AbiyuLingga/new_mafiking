#!/usr/bin/env node
// Supply-chain audit runner
// Phase 3: track and verify QRIS / payment-related dependencies.
//
// Usage:
//   node scripts/security/audit-supply-chain.js
//   npm run audit:supply-chain
//
// Outputs:
//   - Locked dependency versions for QRIS / payment packages
//   - Maintainer, repository, homepage metadata from package.json
//   - Direct and transitive dependency tree (from node_modules)
//   - Risk register (placeholder for OSV / Dependabot integration)
//   - Optional `npm audit --omit=dev` if --npm-audit flag passed
//
// Exit code 0 = clean, 1 = one or more warnings/failures.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

const RISK_REGISTER = [
    {
        name: '@prasetya/qris',
        reason: 'Small zero-dep package for QRIS TLV conversion; can be re-implemented locally if compromised.',
        mitigation: 'Pinned exact version, regression test suite (test:qris-security-regression).',
    },
    {
        name: 'qris-mutasi',
        reason: 'Scrape-based library against merchant dashboard; cookie persistence in cookieDir.',
        mitigation: 'Pinned exact version, isolated collector process with restricted env (see scripts/collector.js).',
    },
    {
        name: 'qrcode',
        reason: 'Pure JS QR code generator; widely audited.',
        mitigation: 'Pinned via caret; low risk.',
    },
    {
        name: 'axios',
        reason: 'HTTP client; surface used for Duitku + Mutasiku network calls.',
        mitigation: 'Pinned exact version; used inside network-restricted collector.',
    },
];

const QRIS_PACKAGES = ['@prasetya/qris', 'qris-mutasi', 'qrcode', 'axios'];

let issues = 0;

function warn(msg) {
    issues++;
    console.warn(`  !  ${msg}`);
}

function info(msg) {
    console.log(`  .  ${msg}`);
}

function ok(msg) {
    console.log(`  ok ${msg}`);
}

console.log('Supply-chain audit for QRIS/payment packages:\n');

for (const pkgName of QRIS_PACKAGES) {
    info(`--- ${pkgName} ---`);
    const declared = PACKAGE_JSON.dependencies[pkgName] || PACKAGE_JSON.devDependencies?.[pkgName];
    if (!declared) {
        warn(`${pkgName}: not declared in package.json`);
        continue;
    }

    info(`declared in package.json: ${declared}`);

    if (declared.startsWith('^') || declared.startsWith('~') || declared.startsWith('>=')) {
        if (pkgName === '@prasetya/qris' || pkgName === 'qris-mutasi') {
            warn(`${pkgName}: pinned to range (${declared}) — should be exact for security-sensitive package`);
        } else {
            info(`  range pin accepted for ${pkgName}`);
        }
    } else {
        ok(`${pkgName}: exact pin (${declared})`);
    }

    const pkgPath = path.join(ROOT, 'node_modules', pkgName);
    if (!fs.existsSync(pkgPath)) {
        warn(`${pkgName}: not installed in node_modules`);
        continue;
    }

    const installedPkg = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf-8'));
    info(`installed: ${installedPkg.version}`);

    if (declared.replace(/^[\^~>=]+/, '') !== installedPkg.version) {
        warn(`${pkgName}: declared ${declared} but installed ${installedPkg.version}`);
    } else {
        ok(`${pkgName}: version matches package.json`);
    }

    if (installedPkg.maintainers) {
        info(`maintainers: ${installedPkg.maintainers.map(m => m.name || m.email || JSON.stringify(m)).join(', ')}`);
    }
    if (installedPkg.repository) {
        const repo = installedPkg.repository.url || installedPkg.repository;
        info(`repository: ${repo}`);
    }
    if (installedPkg.homepage) {
        info(`homepage: ${installedPkg.homepage}`);
    }
    if (installedPkg.dependencies) {
        const depCount = Object.keys(installedPkg.dependencies).length;
        info(`transitive deps: ${depCount}`);
        if (depCount > 0 && installedPkg.dependencies) {
            for (const dep of Object.keys(installedPkg.dependencies)) {
                const versionRange = installedPkg.dependencies[dep];
                info(`  - ${dep}@${versionRange}`);
            }
        }
    }
    console.log();
}

console.log('Risk register:');
for (const entry of RISK_REGISTER) {
    console.log(`  - ${entry.name}:`);
    console.log(`      reason: ${entry.reason}`);
    console.log(`      mitigation: ${entry.mitigation}`);
}
console.log();

if (process.argv.includes('--npm-audit')) {
    console.log('Running `npm audit --omit=dev`...');
    try {
        const stdout = execSync('npm audit --omit=dev --json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        const audit = JSON.parse(stdout.toString());
        const vulnCount = (audit.metadata?.vulnerabilities?.total || 0);
        if (vulnCount > 0) {
            warn(`npm audit found ${vulnCount} vulnerabilities (dev deps excluded)`);
        } else {
            ok('npm audit clean (dev deps excluded)');
        }
    } catch (err) {
        warn(`npm audit exited with error: ${err.message.slice(0, 200)}`);
    }
} else {
    info('(skipping `npm audit`; pass --npm-audit to run)');
}

if (process.argv.includes('--signatures')) {
    console.log('\nRunning `npm audit signatures`...');
    try {
        const stdout = execSync('npm audit signatures', { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        console.log(stdout.toString());
    } catch (err) {
        warn(`npm audit signatures failed: ${err.message.slice(0, 200)}`);
    }
} else {
    info('(skipping `npm audit signatures`; pass --signatures to run)');
}

console.log(`\nAudit complete: ${issues === 0 ? 'clean' : `${issues} issue(s)`}`);
process.exit(issues > 0 ? 1 : 0);
