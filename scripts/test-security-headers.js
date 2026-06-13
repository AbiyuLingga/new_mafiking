const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, pathName) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: pathName }, (res) => {
      res.resume();
      res.once('end', () => resolve(res.headers));
    }).once('error', reject);
  });
}

async function waitUntilReady(port, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      await request(port, '/api/health');
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('server readiness timeout');
}

(async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      CSP_ENFORCE: '1',
      SESSION_SECRET: 'test-security-headers-session-secret',
    },
    stdio: 'ignore',
  });

  try {
    await waitUntilReady(port, child);
    const normal = await request(port, '/login');
    assert.ok(normal['content-security-policy'], 'enforced CSP must be emitted when CSP_ENFORCE=1');
    assert.equal(normal['content-security-policy-report-only'], undefined, 'enforced mode must not emit report-only CSP');
    assert.match(normal['permissions-policy'], /camera=\(\)/, 'camera must be disabled');
    assert.match(normal['permissions-policy'], /microphone=\(\)/, 'microphone must be disabled');
    assert.doesNotMatch(normal['permissions-policy'], /clipboard-write/, 'clipboard-write must remain available');
    assert.equal(normal['cross-origin-opener-policy'], 'same-origin');
    assert.equal(normal['cross-origin-resource-policy'], 'same-origin');
    assert.equal(normal['x-content-type-options'], 'nosniff');

    const callback = await request(port, '/sso-callback?popup=1');
    assert.equal(callback['cross-origin-opener-policy'], 'same-origin-allow-popups');
    assert.equal(callback['cross-origin-resource-policy'], 'cross-origin');

    const deploy = fs.readFileSync(path.join(root, 'deploy.sh'), 'utf8');
    const nginx = fs.readFileSync(path.join(root, 'ops', 'nginx-hardened.conf'), 'utf8');
    assert.match(deploy, /PRESERVE_HARDENED_NGINX/, 'deploy must preserve the hardened nginx site');
    assert.match(deploy, /Strict-Transport-Security "max-age=31536000; includeSubDomains"/, 'baseline deploy must emit HSTS');
    assert.doesNotMatch(nginx, /add_header Permissions-Policy/, 'nginx must not duplicate app-owned Permissions-Policy');
    assert.doesNotMatch(nginx, /add_header Content-Security-Policy/, 'nginx must not duplicate app-owned CSP');

    console.log('test-security-headers: ok');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
})().catch((error) => {
  console.error('test-security-headers: FAIL', error.message);
  process.exit(1);
});
