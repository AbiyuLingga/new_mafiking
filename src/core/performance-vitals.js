// Browser-side Core Web Vitals telemetry.
// Replaces the earlier custom observer with attribution data, navigation-type
// tagging, and a device-class hint so field p75 can be sliced by hardware tier.
// Mirrors the public web-vitals v4 attribution surface without forcing an
// ESM-only dependency on the Babel-standalone runtime path.
const VITAL_ENDPOINT = "/api/performance/vitals";
const CLIENT_ERROR_ENDPOINT = "/api/performance/client-error";
const VITAL_FLUSH_DELAY_MS = 2200;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIELD_RETENTION_DAYS = 30;
const FIELD_RETENTION_MS = FIELD_RETENTION_DAYS * DAY_MS;

const pendingVitals = new Map();
let flushTimer = null;
let sessionStart = Date.now();

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

const RATING_THRESHOLDS = {
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  FID: [100, 300],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800],
};

function ratingForMetric(name, value) {
  const thresholds = RATING_THRESHOLDS[name];
  if (!thresholds) return "unknown";
  if (value <= thresholds[0]) return "good";
  if (value <= thresholds[1]) return "needs-improvement";
  return "poor";
}

function routeName() {
  if (window.MafikingAppState && typeof window.MafikingAppState.route === "string") {
    return window.MafikingAppState.route;
  }
  return window.location.pathname || "/";
}

function navigationType() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav || !nav.type) return "unknown";
    if (nav.type === "navigate") return "navigate";
    if (nav.type === "reload") return "reload";
    if (nav.type === "back_forward") return "back-forward";
    if (nav.type === "prerender") return "prerender";
    return String(nav.type).slice(0, 24);
  } catch (_) {
    return "unknown";
  }
}

function deviceClass() {
  try {
    const mem = Number(navigator.deviceMemory);
    const cores = Number(navigator.hardwareConcurrency) || 0;
    if ((mem > 0 && mem < 2) || (cores > 0 && cores < 2)) return "low";
    if ((mem > 0 && mem < 8) || (cores > 0 && cores < 4)) return "mid";
    return "high";
  } catch (_) {
    return "unknown";
  }
}

function compactAttribution(value, max = 1000) {
  try {
    const str = JSON.stringify(value);
    if (str.length <= max) return str;
    return JSON.stringify({ truncated: true, preview: str.slice(0, max - 32) });
  } catch (_) {
    return null;
  }
}

function buildAttribution(metric, entry) {
  if (!entry) return null;
  if (metric === "LCP") {
    const attributions = {};
    if (entry.element) attributions.elementTag = String(entry.element.tagName || "").toLowerCase().slice(0, 24);
    if (entry.url) attributions.url = String(entry.url).slice(0, 240);
    if (entry.loadTime != null) attributions.loadTime = Math.round(entry.loadTime);
    if (entry.renderTime != null) attributions.renderTime = Math.round(entry.renderTime);
    if (entry.size != null) attributions.size = Math.round(entry.size);
    return Object.keys(attributions).length ? attributions : null;
  }
  if (metric === "INP" || metric === "FID") {
    if (!entry.name) return null;
    return {
      eventName: String(entry.name).slice(0, 40),
      target: entry.target && entry.target.tagName ? String(entry.target.tagName).toLowerCase().slice(0, 24) : null,
    };
  }
  if (metric === "CLS") {
    return entry.sources && entry.sources.length
      ? { sources: entry.sources.slice(0, 3).map((s) => ({
          node: s && s.node && s.node.tagName ? String(s.node.tagName).toLowerCase() : null,
          previousRect: s && s.previousRect,
          currentRect: s && s.currentRect,
        })) }
      : null;
  }
  return null;
}

function queueVital(name, value, id, attribution) {
  if (!Number.isFinite(value) || value < 0) return;
  pendingVitals.set(name, {
    id: id || `${name}-${Date.now()}`,
    name,
    rating: ratingForMetric(name, value),
    route: routeName(),
    value: Math.round(value * 100) / 100,
    navigationType: navigationType(),
    deviceClass: deviceClass(),
    attribution: compactAttribution(attribution),
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
    navigationType: navigationType(),
    deviceClass: deviceClass(),
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

function safeObserve(type, handler, options) {
  if (typeof window === "undefined" || typeof PerformanceObserver !== "function") return null;
  try {
    const observer = new PerformanceObserver(handler);
    observer.observe(options);
    return observer;
  } catch (_) {
    return null;
  }
}

function observePerformance() {
  if (typeof window === "undefined" || typeof PerformanceObserver !== "function") return;

  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) queueVital("TTFB", nav.responseStart, "ttfb");
  } catch (_) {}

  safeObserve("paint", (list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        queueVital("FCP", entry.startTime, entry.name, {
          url: window.location.pathname,
        });
      }
    }
  }, { type: "paint", buffered: true });

  safeObserve("largest-contentful-paint", (list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    if (!last) return;
    const attribution = buildAttribution("LCP", last);
    queueVital("LCP", last.startTime, last.id || last.url || "lcp", attribution);
  }, { type: "largest-contentful-paint", buffered: true });

  safeObserve("layout-shift", (list) => {
    let clsValue = 0;
    const sources = [];
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      clsValue += entry.value || 0;
      if (sources.length < 3) sources.push(entry);
    }
    queueVital("CLS", clsValue, "cls", buildAttribution("CLS", { sources }));
  }, { type: "layout-shift", buffered: true });

  // INP per web-vitals v4 attribution build: pick the worst interaction up to
  // the present, measured against processingEnd - processingStart when
  // available, with duration as fallback.
  safeObserve("event", (list) => {
    let worst = 0;
    let worstEntry = null;
    for (const entry of list.getEntries()) {
      const processing = (entry.processingEnd || 0) - (entry.processingStart || 0);
      const candidate = processing > 0 ? processing : (entry.duration || 0);
      if (candidate > worst) {
        worst = candidate;
        worstEntry = entry;
      }
    }
    if (worstEntry) {
      const attribution = buildAttribution("INP", worstEntry);
      queueVital("INP", worst, worstEntry.name || "inp", attribution);
    }
  }, { type: "event", buffered: true, durationThreshold: 16 });

  // Backfill: if the tab is still alive long enough, send the worst INP up to
  // this point when visibility goes hidden (matches web-vitals' flush pattern).
  window.addEventListener("pagehide", () => {
    try {
      const events = performance.getEntriesByType("event") || [];
      let worst = 0;
      let worstEntry = null;
      for (const entry of events) {
        const processing = (entry.processingEnd || 0) - (entry.processingStart || 0);
        const candidate = processing > 0 ? processing : (entry.duration || 0);
        if (candidate > worst) {
          worst = candidate;
          worstEntry = entry;
        }
      }
      if (worstEntry) {
        const attribution = buildAttribution("INP", worstEntry);
        queueVital("INP", worst, worstEntry.name || "inp-final", attribution);
      }
    } catch (_) {}
    flushVitals();
  }, { capture: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushVitals();
  });

  // Phase 3.2: detect BFCache restoration. The `persisted` flag is true when
  // the page was restored from back/forward cache instead of a fresh load.
  // We log it as a vitals event so the field-p75 dashboard can confirm the
  // cache header change is actually engaging BFCache in the wild.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      try {
        queueVital("TTFB", performance.now(), "bfcache-restore");
      } catch (_) {}
    }
  });
}

observePerformance();

window.__mafikingVitalsField = {
  retentionDays: FIELD_RETENTION_DAYS,
  navigationType,
  deviceClass,
  sessionStartedAt: sessionStart,
};
