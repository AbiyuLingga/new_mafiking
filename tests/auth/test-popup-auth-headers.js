const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');

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
  const clerkBridge = fs.readFileSync(path.join(projectRoot, 'src', 'core', 'clerk-auth.jsx'), 'utf8');
  const lobbySource = fs.readFileSync(path.join(projectRoot, 'src', 'pages', 'lobby.jsx'), 'utf8');
  const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'core', 'app.jsx'), 'utf8');
  const profileSource = fs.readFileSync(path.join(projectRoot, 'src', 'pages', 'profile.jsx'), 'utf8');
  const sharedSource = fs.readFileSync(path.join(projectRoot, 'src', 'core', 'shared.jsx'), 'utf8');
  const authPopupSource = fs.readFileSync(path.join(projectRoot, 'server', 'routes', 'auth-popup.js'), 'utf8');
  assert.match(clerkBridge, /window\.localStorage/, 'popup result fallback must use cross-window localStorage');
  assert.match(clerkBridge, /recoverClosedPopupSession/, 'closed popup must attempt session recovery');
  assert.match(clerkBridge, /POPUP_CLOSED_RECOVERY_MS\s*=\s*30000/, 'closed popup recovery must wait long enough for Clerk session hydration');
  assert.match(clerkBridge, /syncSessionWhenReady/, 'closed popup recovery must wait for Clerk before syncing Mafiking session');
  assert.match(clerkBridge, /readRegisteredServerUser/, 'closed popup recovery must check the shared server session');
  assert.match(clerkBridge, /CLERK_SCRIPT_LOAD_TIMEOUT_MS\s*=\s*30000/, 'Clerk script loading must have a mobile-safe timeout');
  assert.match(clerkBridge, /CLERK_JS_VERSION\s*=\s*"6\.16\.1"/, 'Clerk JS should be pinned to avoid mobile redirect latency');
  assert.match(clerkBridge, /preconnectTo\(`https:\/\/\$\{frontendApi\}`\)/, 'Clerk bridge must preconnect before loading Clerk JS');
  assert.match(clerkBridge, /async function warmupNetwork\(\)[\s\S]*?readConfig\(\)[\s\S]*?preconnectTo\(`https:\/\/\$\{frontendApi\}`\)/, 'Clerk bridge must expose a lightweight network warmup before full Clerk load');
  assert.match(clerkBridge, /clerk-js@\$\{CLERK_JS_VERSION\}/, 'Clerk bridge must load the pinned Clerk JS version');
  assert.match(clerkBridge, /preload:\s*load/, 'Clerk bridge must expose a preload hook for login screen warmup');
  assert.match(clerkBridge, /warmup:\s*warmupNetwork/, 'Clerk bridge must expose warmup separately from full preload');
  assert.doesNotMatch(clerkBridge, /@clerk\/ui/, 'Google auth should not load Clerk UI before OAuth redirect');
  assert.doesNotMatch(clerkBridge, /__internal_ClerkUICtor/, 'Google auth should not require Clerk UI globals');
  assert.doesNotMatch(clerkBridge, /openAccountPortal/, 'Google auth should not send users to the generic Clerk Account Portal');
  assert.ok(
    clerkBridge.indexOf('target.sso') > 0
      && clerkBridge.indexOf('target.sso') < clerkBridge.indexOf('target.authenticateWithRedirect'),
    'Google auth must prefer Clerk sso before the authenticateWithRedirect fallback'
  );
  assert.match(clerkBridge, /function finalizeOAuthCallbackFlow\(clerk\)[\s\S]*?signUp\?\.isTransferable[\s\S]*?signIn\?\.isTransferable/, 'Google callback must finalize Clerk sign-in/sign-up transfer flows');
  assert.match(clerkBridge, /resource\.status === "complete"[\s\S]*?resource\.finalize/, 'Google callback must finalize completed Clerk resources');
  assert.match(clerkBridge, /clerk\.setActive\(\{ session: sessionId, navigate: async \(\) => \{\} \}\)/, 'Google callback must activate created or existing Clerk sessions');
  assert.match(clerkBridge, /const target = mode === "signup"[\s\S]*?\? \(signUp \|\| signIn\)[\s\S]*?: \(signIn \|\| signUp\)/, 'Google signup must start from Clerk signUp while login starts from signIn');
  assert.ok(
    clerkBridge.indexOf('if (clerk.isSignedIn && clerk.session)') > 0
      && clerkBridge.indexOf('if (clerk.isSignedIn && clerk.session)') < clerkBridge.indexOf('target.sso'),
    'Google auth must sync an existing Clerk session before starting a new OAuth redirect'
  );
  assert.doesNotMatch(clerkBridge, /signInForceRedirectUrl\s*:\s*"\/"/, 'Google callback must not force redirect to landing before Mafiking session sync');
  assert.doesNotMatch(clerkBridge, /signUpForceRedirectUrl\s*:\s*"\/"/, 'Google callback must not force redirect to landing before Mafiking session sync');
  assert.match(lobbySource, /ensureLobbyClerkBridge/, 'auth screen must lazy-load the Clerk bridge before Google auth');
  assert.match(lobbySource, /clerkPreloadAttemptedRef/, 'auth screen must remember Clerk preload attempts');
  assert.match(lobbySource, /shouldEagerPreloadGoogleAuth[\s\S]*?saveData[\s\S]*?return false[\s\S]*?2g[\s\S]*?return false/, 'auth screen must avoid full Clerk preload on Save-Data or 2G');
  assert.match(lobbySource, /bridge\.warmup\(\)/, 'auth screen must warm up Clerk network before full preload');
  assert.match(lobbySource, /bridge\.preload\(\)/, 'auth screen must prewarm Clerk before the Google button is clicked');
  assert.match(lobbySource, /markGoogleAuthTiming\('click'\)/, 'Google auth click must mark timing start');
  assert.match(lobbySource, /markGoogleAuthTiming\('redirect-start'\)/, 'Google auth must mark when Clerk redirect starts');
  assert.match(lobbySource, /withGoogleAuthTimeout/, 'Google auth click must not stay stuck forever on mobile');
  assert.match(lobbySource, /getGoogleAuthTimeoutMs/, 'Google auth click timeout must adapt for mobile and slow networks');
  assert.match(lobbySource, /return\s+30000;/, 'mobile Google auth should wait long enough for slow Clerk script startup');
  assert.match(lobbySource, /return\s+45000;/, 'slow-network Google auth should wait longer before showing a failure');
  assert.doesNotMatch(lobbySource, /buildGoogleAuthHandoffUrl/, 'mobile Google auth should not move users to a confusing handoff page');
  assert.doesNotMatch(lobbySource, /window\.location\.assign\(buildGoogleAuthHandoffUrl\(\)\)/, 'mobile Google auth should stay on the login page until Clerk redirects to Google');
  assert.doesNotMatch(lobbySource, /clerkBridge\.openAccountPortal/, 'mobile Google auth must not open the generic Clerk Account Portal page');
  assert.match(lobbySource, /clerkBridge\.openAuth\([\s\S]*provider:\s*'google'/, 'Google auth must use full-page redirect instead of a nested popup');
  assert.match(lobbySource, /if \(result && result\.user\)[\s\S]*onSuccess\(result\.user/, 'Google auth screen must accept already-signed-in Clerk session sync results');
  assert.match(lobbySource, /const \[error, setError\] = useState\(authState\?\.error \|\| ''\)/, 'auth screen must show Google sync errors passed from callback fallback');
  assert.doesNotMatch(lobbySource, /const result = await clerkBridge\.openGooglePopup/, 'Google auth screen should not open OAuth in a popup');
  assert.match(authPopupSource, /CLERK_SCRIPT_LOAD_TIMEOUT_MS\s*=\s*12000/, 'auth handoff page must time out Clerk script loading');
  assert.doesNotMatch(authPopupSource, /params\.get\('handoff'\)/, 'auth popup route should not double as a mobile handoff page');
  assert.doesNotMatch(authPopupSource, /@clerk\/ui/, 'auth popup route should not load Clerk UI before OAuth redirect');
  assert.ok(
    authPopupSource.indexOf('target.sso') > 0
      && authPopupSource.indexOf('target.sso') < authPopupSource.indexOf('target.authenticateWithRedirect'),
    'auth popup route must prefer Clerk sso before authenticateWithRedirect fallback'
  );
  assert.match(authPopupSource, /var target = \(window\.Clerk\.signIn/, 'auth popup Google OAuth must prefer the fast sign-in object');
  assert.doesNotMatch(authPopupSource, /var target = mode === 'signup'/, 'auth popup Google signup must not prefer the slower signUp OAuth path');
  assert.match(clerkBridge, /function normalizeCallbackPath\(pathname\)[\s\S]*?function isRedirectCallback\(\)[\s\S]*?normalizeCallbackPath\(window\.location\.pathname\) === OAUTH_CALLBACK_PATH/, 'Clerk callback detection must tolerate a trailing slash');
  assert.match(appSource, /const switchAccount = React\.useCallback/, 'switch account must use its own auth flow');
  assert.match(appSource, /onRequestSwitchAccount:\s*switchAccount/, 'profile must receive the dedicated switch-account handler');
  assert.match(appSource, /const handleAuthSuccess[\s\S]*?navigate\(\{ route: "belajar", section: "Try Out" \}\);/, 'successful login must navigate to Beranda');
  assert.match(appSource, /const routeAuthSyncFailure[\s\S]*?authMode: "login"[\s\S]*?authState: \{ error: message \}/, 'failed Google callback sync must return to login with a visible error');
  assert.match(appSource, /if \(isRegisteredAppUser\(user\)\) \{\s*handleAuthSuccess\(user, null\);[\s\S]*?routeAuthSyncFailure\(\);/, 'Google callback fallback must not treat a guest session as a successful login');
  assert.match(appSource, /completeRedirectAuth\(\)[\s\S]*?if \(!result \|\| !result\.user\) \{\s*leaveCallback\(\);[\s\S]*?return;[\s\S]*?\}/, 'Google callback must not silently render the landing page when Clerk returns no result');
  assert.ok(
    appSource.indexOf('const LoginRedirect = React.useCallback') < appSource.indexOf('if (authCallbackLoading) {\n    return ('),
    'all App hooks must run before the Google callback loading early return'
  );
  assert.match(profileSource, /onClick=\{onRequestSwitchAccount\}[\s\S]{0,800}Switch account/, 'switch account button must use the dedicated handler');
  assert.match(sharedSource, /gamified && !isLoggedIn[\s\S]*?md:hidden[\s\S]*?authMode: "login"[\s\S]*?Masuk[\s\S]*?authMode: "signup"[\s\S]*?Daftar/, 'mobile guest header must offer login and signup actions');

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
