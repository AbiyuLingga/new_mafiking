// Vite entry. Exposes the React globals expected by the legacy static JSX files,
// then loads the shell in the same dependency order as the Babel-standalone path.
// app.jsx still dynamic-imports each route on demand; route files are not pulled
// into this main chunk.
import './main.css';

const REACT_RUNTIME_SCRIPTS = [
  {
    globalName: 'React',
    src: '/assets/vendor/react-18.3.1.production.min.js?v=18.3.1',
  },
  {
    globalName: 'ReactDOM',
    src: '/assets/vendor/react-dom-18.3.1.production.min.js?v=18.3.1',
  },
];

function loadRuntimeScript({ globalName, src }) {
  if (window[globalName]) return Promise.resolve();

  const existing = document.querySelector(`script[data-mafiking-runtime="${globalName}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.crossOrigin = 'anonymous';
    script.dataset.mafikingRuntime = globalName;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Gagal memuat runtime ${globalName}`));
    document.head.appendChild(script);
  });
}

async function ensureReactRuntime() {
  for (const runtimeScript of REACT_RUNTIME_SCRIPTS) {
    await loadRuntimeScript(runtimeScript);
  }

  if (!window.React || !window.ReactDOM || typeof window.ReactDOM.createRoot !== 'function') {
    throw new Error('React runtime tidak tersedia.');
  }

  Object.assign(window, {
    forwardRef: window.React.forwardRef,
    useCallback: window.React.useCallback,
    useEffect: window.React.useEffect,
    useImperativeHandle: window.React.useImperativeHandle,
    useLayoutEffect: window.React.useLayoutEffect,
    useMemo: window.React.useMemo,
    useRef: window.React.useRef,
    useState: window.React.useState,
  });
}

function normalizeBootstrapPath() {
  return String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
}

function shouldWarmAuthRoute(path = normalizeBootstrapPath()) {
  return path === '/login' || path === '/signup';
}

function defineDeferredLoaders() {
  window.__mafikingLoadClerkBridge = () => import('./core/clerk-auth.jsx');
  window.__mafikingLoadOnboarding = () => import('./core/onboarding.jsx');
  window.__mafikingLoadTweaksPanel = () => import('./core/tweaks-panel.jsx');
}

function warmAuthRouteEarly(path = normalizeBootstrapPath()) {
  if (!shouldWarmAuthRoute(path)) return;

  window.__mafikingLoadClerkBridge()
    .then((bridge) => {
      if (bridge && typeof bridge.warmup === 'function') return bridge.warmup();
      return null;
    })
    .catch((error) => {
      console.warn('[mafiking-bootstrap] auth warmup failed:', error && error.message ? error.message : error);
    });
}

async function bootstrap() {
  await ensureReactRuntime();
  defineDeferredLoaders();
  const bootstrapPath = normalizeBootstrapPath();
  warmAuthRouteEarly(bootstrapPath);

  const vitalsReady = import('./core/performance-vitals.js').catch((error) => {
    console.warn('[mafiking-bootstrap] performance vitals failed:', error);
  });

  await Promise.all([
    import('./core/tweaks-core.jsx'),
    import('./core/math-loader.js'),
    import('./core/backend-api.jsx'),
  ]);

  if (bootstrapPath === '/sso-callback') {
    await window.__mafikingLoadClerkBridge();
  }

  await import('./core/shared.jsx');
  await import('./core/route-prefetch.js');
  await import('./core/app.jsx');
  await vitalsReady;
}

function renderBootstrapError(error) {
  console.error('[mafiking-bootstrap] failed:', error);
  document.documentElement.classList.add('mafiking-react-ready');
  const staticShell = document.getElementById('mafiking-static-landing');
  if (staticShell) staticShell.setAttribute('aria-hidden', 'true');
  const root = document.getElementById('root');
  if (!root) return;

  const container = document.createElement('div');
  container.style.cssText = [
    'min-height:100vh',
    'display:grid',
    'place-items:center',
    'padding:24px',
    'font-family:Manrope,system-ui,sans-serif',
    'background:#fbf8f1',
    'color:#0b1326',
    'text-align:center',
  ].join(';');

  const message = document.createElement('p');
  message.style.cssText = 'max-width:520px;font-weight:800;font-size:18px;line-height:1.5';
  message.textContent = 'Mafiking gagal dimuat. Muat ulang halaman, lalu cek console jika masalah masih muncul.';
  container.appendChild(message);
  root.replaceChildren(container);
}

bootstrap().catch(renderBootstrapError);
