const VITAL_ENDPOINT = "/api/performance/vitals";
const VITAL_FLUSH_DELAY_MS = 2200;

const pendingVitals = new Map();
let flushTimer = null;

function ratingForMetric(name, value) {
  const thresholds = {
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    FID: [100, 300],
    INP: [200, 500],
    LCP: [2500, 4000],
    TTFB: [800, 1800],
  }[name];
  if (!thresholds) return "unknown";
  if (value <= thresholds[0]) return "good";
  if (value <= thresholds[1]) return "needs-improvement";
  return "poor";
}

function routeName() {
  return window.location.pathname || "/";
}

function queueVital(name, value, id) {
  if (!Number.isFinite(value) || value < 0) return;
  pendingVitals.set(name, {
    id: id || `${name}-${Date.now()}`,
    name,
    rating: ratingForMetric(name, value),
    route: routeName(),
    value: Math.round(value * 100) / 100,
  });
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = window.setTimeout(flushVitals, VITAL_FLUSH_DELAY_MS);
}

function flushVitals() {
  if (flushTimer) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pendingVitals.size) return;
  const body = JSON.stringify({
    metrics: Array.from(pendingVitals.values()),
    route: routeName(),
    url: window.location.href,
  });
  pendingVitals.clear();

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(VITAL_ENDPOINT, blob)) return;
  }

  fetch(VITAL_ENDPOINT, {
    body,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => {});
}

function observePerformance() {
  if (typeof window === "undefined" || typeof PerformanceObserver !== "function") return;

  try {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (navigation) {
      queueVital("TTFB", navigation.responseStart);
    }
  } catch (_) {}

  try {
    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          queueVital("FCP", entry.startTime, entry.name);
        }
      }
    });
    paintObserver.observe({ type: "paint", buffered: true });
  } catch (_) {}

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) queueVital("LCP", last.startTime, last.id || last.url || "lcp");
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (_) {}

  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) clsValue += entry.value || 0;
      }
      queueVital("CLS", clsValue, "cls");
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch (_) {}

  try {
    let maxInteraction = 0;
    const eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > maxInteraction) maxInteraction = entry.duration;
      }
      if (maxInteraction) queueVital("INP", maxInteraction, "inp");
    });
    eventObserver.observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch (_) {}

  window.addEventListener("pagehide", flushVitals, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushVitals();
  });
}

observePerformance();
