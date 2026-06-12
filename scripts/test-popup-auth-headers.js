const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function request({ port, pathName }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'GET',
      hostname: '127.0.0.1',
      port,
      path: pathName,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Server test timeout on port ${port}`));
    }, 20000);

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    };

    const onStdout = (chunk) => {
      if (settled) return;
      const text = String(chunk || '');
      if (text.includes(`new_mafiking server running on http://0.0.0.0:${port}`)) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const onStderr = (chunk) => {
      if (settled) return;
      const text = String(chunk || '').trim();
      if (!text) return;
      process.stderr.write(text + '\n');
    };

    const onExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Server exited before ready with code ${code}`));
    };

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
  });
}

(async () => {
  const clerkBridge = fs.readFileSync(path.join(projectRoot, 'src', 'clerk-auth.jsx'), 'utf8');
  assert.match(clerkBridge, /window\.localStorage/, 'popup result fallback must use cross-window localStorage');
  assert.match(clerkBridge, /recoverClosedPopupSession/, 'closed popup must attempt session recovery');
  assert.match(clerkBridge, /readRegisteredServerUser/, 'closed popup recovery must check the shared server session');

  const port = await getFreePort();
  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
    SESSION_SECRET: process.env.SESSION_SECRET || 'test-popup-auth-headers-session-secret',
  };

  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let failed = false;
  try {
    await waitForServer(child, port);

    const login = await request({ port, pathName: '/login' });
    assert.equal(login.status, 200, '/login should load app shell');
    assert.equal(
      login.headers['cross-origin-opener-policy'],
      'same-origin',
      '/login should keep default COOP isolation'
    );

    const callback = await request({ port, pathName: '/sso-callback?popup=1' });
    assert.equal(callback.status, 200, '/sso-callback should load app shell');
    assert.equal(
      callback.headers['cross-origin-opener-policy'],
      'same-origin-allow-popups',
      '/sso-callback popup callback must preserve opener'
    );
    assert.equal(
      callback.headers['cross-origin-resource-policy'],
      'cross-origin',
      '/sso-callback popup callback must allow popup continuity'
    );

    const popup = await request({ port, pathName: '/auth-popup' });
    assert.equal(popup.status, 200, '/auth-popup should load popup helper');
    assert.equal(
      popup.headers['cross-origin-opener-policy'],
      'same-origin-allow-popups',
      '/auth-popup should preserve opener'
    );

    console.log('test-popup-auth-headers: ok');
  } catch (error) {
    failed = true;
    console.error('test-popup-auth-headers: FAIL', error && error.message ? error.message : error);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    process.exit(failed ? 1 : 0);
  }
})();
