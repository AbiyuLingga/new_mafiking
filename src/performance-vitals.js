const VITAL_ENDPOINT = "/api/performance/vitals";
const CLIENT_ERROR_ENDPOINT = "/api/performance/client-error";
const VITAL_FLUSH_DELAY_MS = 2200;

const pendingVitals = new Map();
let flushTimer = null;

function serializeError(errorLike) {
  if (!errorLike) return { message: "Unknown client error" };
  if (errorLike instanceof Error) {
    return {
      message: errorLike.message || "Unknown client error",
      name: errorLike.name || "Error",
      stack: errorLike.stack || "",
    };
  }
  if (typeof errorLike === "object") {
    return {
      message: String(errorLike.message || errorLike.reason || JSON.stringify(errorLike).slice(0, 300)),
      name: String(errorLike.name || "Error"),
      stack: String(errorLike.stack || ""),
    };
  }
  return { message: String(errorLike), name: "Error", stack: "" };
}

function postClientError(payload) {
  const body = JSON.stringify({
    ...payload,
    route: routeName(),
    url: window.location.href,
    userAgent: navigator.userAgent || "",
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(CLIENT_ERROR_ENDPOINT, blob)) return;
  }

  fetch(CLIENT_ERROR_ENDPOINT, {
    body,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => {});
}

function reportClientError(source, errorLike, extra = {}) {
  const error = serializeError(errorLike);
  postClientError({
    source: String(source || "unknown"),
    message: error.message,
    name: error.name,
    stack: error.stack,
    extra,
  });
}

window.reportMafikingClientError = reportClientError;

window.addEventListener("error", (event) => {
  reportClientError("window.error", event.error || event.message, {
    filename: event.filename || "",
    lineno: event.lineno || 0,
    colno: event.colno || 0,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportClientError("window.unhandledrejection", event.reason || "Unhandled promise rejection");
});

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
