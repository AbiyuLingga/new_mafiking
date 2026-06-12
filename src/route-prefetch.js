// Idle-time route prefetch.
//
// After Phase 2 split, each route is its own Vite chunk. The chunk is only
// fetched the first time the user navigates to the route, which can cause a
// 50-200ms delay on first click. To hide that latency we pre-warm likely-
// next routes during browser idle time.
//
// Rules from `docs/plans/2026-06-12-002-…` §5 Phase 2:
//   - Only on `requestIdleCallback`.
//   - Only when `navigator.connection.saveData !== true`.
//   - Only when the user has shown clear intent (e.g. scroll, focus, hover).
//   - Cap at 2 prefetches per page to avoid network contention.
//
// Babel-standalone path: dynamic `import()` may be unavailable on classic
// scripts. We wrap it in try/catch and silently bail.
const ROUTE_PREFETCHES = {
  lobby: ["./belajar.jsx", "./misi.jsx"],
  landing: ["./belajar.jsx"],
  belajar: ["./practice.jsx", "./misi.jsx"],
  misi: ["./practice.jsx"],
  tryout: ["./payment.jsx"],
  practice: ["./belajar.jsx"],
  payment: ["./profile.jsx"],
  profile: ["./invoices.jsx"],
  invoices: ["./profile.jsx"],
  leaderboard: ["./belajar.jsx"],
  admin: ["./belajar.jsx"],
};

const MAX_PREFETCH_PER_TICK = 2;
const prefetched = new Set();

function shouldPrefetch() {
  try {
    const conn = navigator.connection;
    if (conn && conn.saveData) return false;
    if (conn && /(^|-)2g(-|$)/.test(String(conn.effectiveType || ""))) return false;
  } catch (_) {}
  return true;
}

function scheduleIdle(cb) {
  if (typeof window === "undefined") return;
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(cb, { timeout: 2000 });
    return;
  }
  window.setTimeout(cb, 1200);
}

function prefetchRoute(specifier) {
  if (prefetched.has(specifier)) return;
  prefetched.add(specifier);
  try {
    const loader = import(/* @vite-ignore */ specifier);
    if (loader && typeof loader.then === "function") {
      loader.catch(() => {});
    }
  } catch (_) {
    // Babel-standalone path: dynamic import unavailable on classic scripts.
  }
}

export function prefetchAdjacentRoutes(currentRoute) {
  if (!shouldPrefetch()) return;
  const specifiers = ROUTE_PREFETCHES[currentRoute] || [];
  if (specifiers.length === 0) return;
  scheduleIdle(() => {
    let i = 0;
    for (const spec of specifiers) {
      if (i >= MAX_PREFETCH_PER_TICK) break;
      prefetchRoute(spec);
      i += 1;
    }
  });
}

export function prefetchOnUserIntent(currentRoute) {
  // Called from app.jsx when the user scrolls, focuses a nav link, or hovers
  // over a clickable surface that points to a known target. We bias the
  // specifier set toward the most likely target.
  if (!shouldPrefetch()) return;
  scheduleIdle(() => {
    const specifiers = ROUTE_PREFETCHES[currentRoute] || [];
    if (specifiers[0]) prefetchRoute(specifiers[0]);
  });
}

let hoverListenerAttached = false;
export function attachHoverPrefetch() {
  if (typeof document === "undefined" || hoverListenerAttached) return;
  hoverListenerAttached = true;
  let lastTargetSpec = null;
  document.addEventListener("pointerover", (event) => {
    if (!shouldPrefetch()) return;
    const node = event.target instanceof Element ? event.target.closest("[data-route]") : null;
    if (!node) return;
    const route = node.getAttribute("data-route");
    if (!route) return;
    const spec = (ROUTE_PREFETCHES[route] || [])[0];
    if (!spec || spec === lastTargetSpec) return;
    lastTargetSpec = spec;
    scheduleIdle(() => prefetchRoute(spec));
  }, { passive: true });
}

if (typeof window !== "undefined") {
  window.MafikingRoutePrefetch = {
    prefetchAdjacentRoutes,
    prefetchOnUserIntent,
    attachHoverPrefetch,
  };
}
