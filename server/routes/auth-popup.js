const express = require('express');
const router = express.Router();

const POPUP_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>Login Mafiking</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #ffffff; color: #0b1326; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
    .card { text-align: center; max-width: 360px; }
    .spinner { width: 36px; height: 36px; border: 3px solid #e5e7eb; border-top-color: #0b1326; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 6px; }
    p { font-size: 14px; color: #4b5563; margin: 0; line-height: 1.5; }
    .err h1 { color: #b91c1c; }
    .err p { color: #b91c1c; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card" id="card">
      <div class="spinner" id="spinner"></div>
      <h1 id="title">Menghubungkan ke Google</h1>
      <p id="msg">Selesaikan login di jendela ini. Jangan tutup sebelum kembali ke Mafiking.</p>
    </div>
  </div>
  <script>
    (async function boot() {
      var STORAGE_KEY = 'mafiking.clerk.pendingOAuth';
      var POPUP_RESULT_KEY = 'mafiking.clerk.popupResult';
      var POPUP_MESSAGE_TYPE = 'mafiking:clerk-popup-result';
      var CLERK_SCRIPT_LOAD_TIMEOUT_MS = 12000;
      var params = new URLSearchParams(window.location.search);
      var mode = params.get('mode') === 'signup' ? 'signup' : 'login';
      var rawRedirect = params.get('redirect');
      var parsedRedirect = null;
      if (rawRedirect) {
        var trimmed = rawRedirect.trim();
        if (trimmed && (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[')) {
          try { parsedRedirect = JSON.parse(trimmed); } catch (_) { parsedRedirect = trimmed; }
        } else {
          parsedRedirect = trimmed;
        }
      }

      function setError(message) {
        var card = document.getElementById('card');
        var sp = document.getElementById('spinner');
        var title = document.getElementById('title');
        var msg = document.getElementById('msg');
        if (card) card.className = 'card err';
        if (sp) sp.style.display = 'none';
        if (title) title.textContent = 'Login Google gagal';
        if (msg) msg.textContent = message || 'Silakan tutup jendela ini dan coba lagi dari Mafiking.';
      }

      function deliverFailure(message) {
        try {
          localStorage.setItem(POPUP_RESULT_KEY, JSON.stringify({
            at: Date.now(),
            payload: { ok: false, error: message || 'Login Google gagal.' }
          }));
        } catch (_) {}
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: POPUP_MESSAGE_TYPE, ok: false, error: message || 'Login Google gagal.' },
              window.location.origin
            );
          }
        } catch (_) {}
      }

      function closeSoon() {
        setTimeout(function () { try { window.close(); } catch (_) {} }, 50);
      }

      function writePendingOAuth() {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            mode: mode,
            redirect: parsedRedirect || null,
            createdAt: Date.now()
          }));
        } catch (_) {}
      }

      function frontendApiFromPublishableKey(publishableKey) {
        try {
          var encoded = String(publishableKey || '').split('_')[2];
          if (!encoded) return '';
          return atob(encoded).replace(/\\$$/, '');
        } catch (_) { return ''; }
      }

      function loadScript(src, attrs) {
        return new Promise(function (resolve, reject) {
          var script = document.createElement('script');
          var timer = 0;
          function cleanup() {
            clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
          }
          script.src = src;
          script.async = true;
          script.defer = true;
          script.crossOrigin = 'anonymous';
          if (attrs) {
            Object.keys(attrs).forEach(function (key) {
              var value = attrs[key];
              if (value !== undefined && value !== null) script.setAttribute(key, value);
            });
          }
          script.onload = function () {
            cleanup();
            resolve();
          };
          script.onerror = function () {
            cleanup();
            reject(new Error('Gagal memuat ' + src));
          };
          timer = setTimeout(function () {
            cleanup();
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error('Memuat Google terlalu lama. Periksa koneksi lalu coba lagi.'));
          }, CLERK_SCRIPT_LOAD_TIMEOUT_MS);
          document.head.appendChild(script);
        });
      }

      try {
        var configRes = await fetch('/api/config/clerk', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' }
        });
        var config = await configRes.json().catch(function () { return {}; });
        if (!config.enabled || !config.publishableKey) {
          setError('Clerk belum dikonfigurasi.');
          deliverFailure('Clerk belum dikonfigurasi.');
          closeSoon();
          return;
        }

        var frontendApi = frontendApiFromPublishableKey(config.publishableKey);
        if (!frontendApi) {
          setError('Publishable key Clerk tidak valid.');
          deliverFailure('Publishable key Clerk tidak valid.');
          closeSoon();
          return;
        }

        writePendingOAuth();

        await loadScript('https://' + frontendApi + '/npm/@clerk/clerk-js@6/dist/clerk.browser.js', {
          'data-clerk-publishable-key': config.publishableKey
        });

        if (!window.Clerk) throw new Error('Clerk gagal dimuat.');

        await window.Clerk.load();

        var target = (window.Clerk.signIn || (window.Clerk.client && window.Clerk.client.signIn))
          || (mode === 'signup' ? (window.Clerk.signUp || (window.Clerk.client && window.Clerk.client.signUp)) : null);
        var callbackUrl = window.location.origin + '/sso-callback?popup=1';

        if (target && typeof target.sso === 'function') {
          await target.sso({
            strategy: 'oauth_google',
            redirectCallbackUrl: callbackUrl,
            redirectUrl: callbackUrl
          });
          return;
        }

        if (target && typeof target.authenticateWithRedirect === 'function') {
          await target.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: callbackUrl,
            redirectUrlComplete: callbackUrl
          });
          return;
        }

        throw new Error('Login Google langsung belum didukung oleh Clerk saat ini.');
      } catch (err) {
        var message = (err && err.message) ? err.message : 'Login Google gagal.';
        setError(message);
        deliverFailure(message);
        closeSoon();
      }
    })();
  </script>
</body>
</html>
`;

router.get(['/auth-popup', '/auth-popup.html'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.status(200).send(POPUP_HTML);
});

module.exports = router;
