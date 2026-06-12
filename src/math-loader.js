// Lazy KaTeX loader.
//
// KaTeX CSS (~280KB) + JS (~280KB) used to be loaded eagerly in MAFIKING.html
// and index.html even for routes that never render math. Phase 1.3 of the
// mobile perf plan removes the eager <link>/<script> tags and defers the
// load to the first call site that actually needs math rendering.
//
// Callers:
//   const katex = await window.MafikingMathLoader.loadKatex();
//   if (katex) { katex.renderToString(latex, { throwOnError: false }); }
//
// The loader is safe to call multiple times — it returns the same Promise
// across calls so the network is hit at most once.

const KATEX_VERSION = "0.16.11";
const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_JS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;

let loadPromise = null;

function ensureStyleLink(href) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }
    const existing = document.querySelector(`link[data-mafiking-katex="1"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.crossOrigin = "anonymous";
    link.dataset.mafikingKatex = "1";
    link.dataset.loaded = "0";
    link.addEventListener("load", () => {
      link.dataset.loaded = "1";
      resolve();
    });
    link.addEventListener("error", () => resolve());
    document.head.appendChild(link);
  });
}

function ensureScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }
    if (window.katex && typeof window.katex.renderToString === "function") {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[data-mafiking-katex="1"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("katex-load-failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.defer = false;
    script.async = false;
    script.crossOrigin = "anonymous";
    script.dataset.mafikingKatex = "1";
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("katex-load-failed")));
    document.head.appendChild(script);
  });
}

async function loadKatex() {
  if (typeof window === "undefined") return null;
  if (window.katex && typeof window.katex.renderToString === "function") {
    window.__mafikingKatexReady = true;
    return window.katex;
  }
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      await ensureScript(KATEX_JS_URL);
      ensureStyleLink(KATEX_CSS_URL);
      const katexInstance = window.katex || null;
      window.__mafikingKatexReady = Boolean(katexInstance);
      try {
        window.dispatchEvent(new CustomEvent("mafiking:katex-ready", { detail: { ok: Boolean(katexInstance) } }));
      } catch (_) {}
      return katexInstance;
    } catch (err) {
      loadPromise = null;
      if (typeof window !== "undefined" && window.reportMafikingClientError) {
        window.reportMafikingClientError("math-loader.loadKatex", err);
      }
      return null;
    }
  })();
  return loadPromise;
}

function useKatexReady() {
  const [ready, setReady] = (typeof React !== "undefined" && React.useState)
    ? React.useState(Boolean(typeof window !== "undefined" && window.__mafikingKatexReady))
    : [Boolean(typeof window !== "undefined" && window.__mafikingKatexReady), () => {}];
  if (typeof React !== "undefined" && React.useEffect) {
    React.useEffect(() => {
      const onReady = () => setReady(true);
      window.addEventListener("mafiking:katex-ready", onReady);
      if (window.__mafikingKatexReady) setReady(true);
      return () => window.removeEventListener("mafiking:katex-ready", onReady);
    }, []);
  }
  return ready;
}

const MafikingMathLoader = { loadKatex, useKatexReady, KATEX_CSS_URL, KATEX_JS_URL };

if (typeof window !== "undefined") {
  window.MafikingMathLoader = MafikingMathLoader;
}
