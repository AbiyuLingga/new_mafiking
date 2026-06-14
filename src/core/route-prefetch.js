// Adaptive route loading for the Vite and Babel-standalone runtimes.
//
// Vite needs explicit import expressions so it can keep each page in a
// separate chunk. The legacy runtime has already loaded every route as a
// classic script, so loadRoute resolves from window.* without importing JSX.
const ROUTE_LOADERS = {
  lobby: { globalName: "Lobby", load: () => import("../pages/lobby.jsx") },
  landing: { globalName: "Lobby", load: () => import("../pages/lobby.jsx") },
  belajar: { globalName: "Belajar", load: () => import("../pages/belajar.jsx") },
  misi: { globalName: "Misi", load: () => import("../pages/misi.jsx") },
  tryout: { globalName: "Tryout", load: () => import("../pages/tryout.jsx") },
  practice: { globalName: "Practice", load: () => import("../features/practice/practice.jsx") },
  payment: { globalName: "Payment", load: () => import("../pages/payment.jsx") },
  profile: { globalName: "Profile", load: () => import("../pages/profile.jsx") },
  invoices: { globalName: "Invoices", load: () => import("../pages/invoices.jsx") },
  leaderboard: { globalName: "Leaderboard", load: () => import("../pages/leaderboard.jsx") },
};

const ROUTE_PREFETCHES = {
  lobby: ["belajar", "misi", "leaderboard"],
  landing: ["belajar", "misi", "leaderboard"],
  belajar: ["misi", "tryout", "leaderboard"],
  misi: ["belajar", "tryout", "leaderboard"],
  tryout: ["belajar", "misi", "leaderboard"],
  leaderboard: ["belajar", "misi", "tryout"],
  practice: ["belajar"],
  payment: ["profile"],
  profile: ["invoices", "belajar"],
  invoices: ["profile", "belajar"],
  admin: ["belajar"],
};

const MAX_ADJACENT_PREFETCHES = 3;
const routePromises = new Map();
const scheduledRoutes = new Set();
const pendingRouteMarks = new Map();

function existingRouteModule(routeName) {
  const entry = ROUTE_LOADERS[routeName];
  if (!entry || typeof window === "undefined") return null;
  const component = window[entry.globalName];
  return component ? { [entry.globalName]: component } : null;
}

function shouldSpeculativelyPrefetch() {
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

function loadRoute(routeName) {
  const entry = ROUTE_LOADERS[routeName];
  if (!entry) return Promise.reject(new Error(`Route tidak dikenal: ${routeName}`));

  const existing = existingRouteModule(routeName);
  if (existing) return Promise.resolve(existing);
  if (routePromises.has(routeName)) return routePromises.get(routeName);

  let promise;
  try {
    promise = Promise.resolve(entry.load());
  } catch (error) {
    promise = Promise.reject(error);
  }

  const cachedPromise = promise
    .then((module) => module || existingRouteModule(routeName) || {})
    .catch((error) => {
      routePromises.delete(routeName);
      const fallback = existingRouteModule(routeName);
      if (fallback) return fallback;
      throw error;
    });
  routePromises.set(routeName, cachedPromise);
  return cachedPromise;
}

function prefetchRoute(routeName, { intent = false } = {}) {
  if (!intent && !shouldSpeculativelyPrefetch()) return Promise.resolve(null);
  return loadRoute(routeName).catch(() => null);
}

function prefetchSequence(routeNames, index = 0) {
  if (index >= routeNames.length || !shouldSpeculativelyPrefetch()) return;
  const routeName = routeNames[index];
  if (scheduledRoutes.has(routeName) || existingRouteModule(routeName) || routePromises.has(routeName)) {
    prefetchSequence(routeNames, index + 1);
    return;
  }
  scheduledRoutes.add(routeName);
  scheduleIdle(() => {
    if (!shouldSpeculativelyPrefetch()) return;
    prefetchRoute(routeName).finally(() => prefetchSequence(routeNames, index + 1));
  });
}

function prefetchAdjacentRoutes(currentRoute) {
  if (!shouldSpeculativelyPrefetch()) return;
  const routes = (ROUTE_PREFETCHES[currentRoute] || [])
    .filter((routeName) => routeName !== currentRoute)
    .slice(0, MAX_ADJACENT_PREFETCHES);
  prefetchSequence(routes);
}

function prefetchOnUserIntent(routeName) {
  return prefetchRoute(routeName, { intent: true });
}

function markRouteIntent(routeName) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  if (!routeName) return;
  const now = typeof performance.now === "function" ? performance.now() : Date.now();
  const pending = pendingRouteMarks.get(routeName);
  if (pending && now - pending.startedAt < 1000) return;
  if (pending) performance.clearMarks(pending.markName);
  const markName = `mafiking-route-intent:${routeName}:${Date.now()}`;
  performance.mark(markName);
  pendingRouteMarks.set(routeName, { markName, startedAt: now });
}

function markRouteRendered(routeName) {
  if (typeof window === "undefined" || typeof performance === "undefined") return;
  const pending = pendingRouteMarks.get(routeName);
  if (!pending || typeof performance.mark !== "function" || typeof performance.measure !== "function") return;
  pendingRouteMarks.delete(routeName);
  window.requestAnimationFrame(() => {
    const startMark = pending.markName;
    const endMark = `mafiking-route-rendered:${routeName}:${Date.now()}`;
    const measureName = `mafiking-route-transition:${routeName}`;
    performance.mark(endMark);
    performance.measure(measureName, startMark, endMark);
    const entries = performance.getEntriesByName(measureName);
    const duration = entries.length ? entries[entries.length - 1].duration : null;
    window.dispatchEvent(new CustomEvent("mafiking:route-timing", {
      detail: { route: routeName, duration },
    }));
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
  });
}

let intentListenerAttached = false;
function attachIntentPrefetch() {
  if (typeof document === "undefined" || intentListenerAttached) return;
  intentListenerAttached = true;

  const routeNodeFromEvent = (event) => {
    return event.target instanceof Element ? event.target.closest("[data-route]") : null;
  };

  document.addEventListener("pointerdown", (event) => {
    const node = routeNodeFromEvent(event);
    if (!node || node.getAttribute("aria-current") === "page") return;
    const routeName = node.getAttribute("data-route");
    markRouteIntent(routeName);
    prefetchRoute(routeName, { intent: true });
  }, { passive: true });

  const speculativeIntent = (event) => {
    const node = routeNodeFromEvent(event);
    if (!node || node.getAttribute("aria-current") === "page") return;
    const routeName = node.getAttribute("data-route");
    if (routeName) prefetchRoute(routeName);
  };
  document.addEventListener("pointerover", speculativeIntent, { passive: true });
  document.addEventListener("focusin", speculativeIntent, { passive: true });
}

// Kept as an alias for older app bundles that still call this name.
const attachHoverPrefetch = attachIntentPrefetch;

if (typeof window !== "undefined") {
  window.MafikingRoutePrefetch = {
    loadRoute,
    prefetchRoute,
    prefetchAdjacentRoutes,
    prefetchOnUserIntent,
    markRouteIntent,
    markRouteRendered,
    attachIntentPrefetch,
    attachHoverPrefetch,
  };
}
