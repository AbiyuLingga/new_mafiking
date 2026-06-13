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

// Minimal LaTeX renderer that uses KaTeX (if already loaded) and falls back to
// safe HTML escape. Exposed on `window` so non-route pages (profile, lobby,
// leaderboard) that may render question/correction text don't have to depend
// on the lazy `practice.jsx` chunk for `renderMafikingMathHTML`. The full
// LaTeX-to-Unicode conversion pipeline still lives in practice.jsx — this is
// the minimum needed to keep KaTeX rendering available on every page.
function escapeMathText(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderKatexBody(body, displayMode) {
  return window.katex.renderToString(String(body || ''), { throwOnError: false, displayMode: Boolean(displayMode) });
}

function stripMathDelimiters(token) {
  const text = String(token || '');
  let match;
  if ((match = text.match(/^\$\$([\s\S]+)\$\$$/))) return { body: match[1], displayMode: true };
  if ((match = text.match(/^\$([\s\S]+)\$$/))) return { body: match[1], displayMode: false };
  if ((match = text.match(/^\\\[([\s\S]+)\\\]$/))) return { body: match[1], displayMode: true };
  if ((match = text.match(/^\\\(([\s\S]+)\\\)$/))) return { body: match[1], displayMode: false };
  return null;
}

function hasStandaloneLatexSyntax(value) {
  return /\\[a-zA-Z]+|[\^_{}]|[∫√ΣΠ∞≤≥≠≈]/.test(String(value || ''));
}

function renderMixedMathHTML(raw) {
  const segmentPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
  let lastIndex = 0;
  let rendered = '';
  let found = false;
  String(raw || '').replace(segmentPattern, (token, _full, offset) => {
    found = true;
    rendered += escapeMathText(raw.slice(lastIndex, offset)).replace(/\n/g, '<br>');
    const stripped = stripMathDelimiters(token);
    try {
      rendered += stripped ? renderKatexBody(stripped.body, stripped.displayMode) : escapeMathText(token);
    } catch (_) {
      rendered += escapeMathText(token);
    }
    lastIndex = offset + token.length;
    return token;
  });
  if (!found) return null;
  rendered += escapeMathText(String(raw || '').slice(lastIndex)).replace(/\n/g, '<br>');
  return rendered;
}

function renderMafikingMathHTML(value) {
  const raw = String(value == null ? "" : value);
  if (!raw) return "";
  if (typeof window !== "undefined" && window.katex && typeof window.katex.renderToString === "function") {
    try {
      const mixed = renderMixedMathHTML(raw);
      if (mixed != null) return mixed;
      // Strip common math delimiters so KaTeX receives raw LaTeX, not the
      // surrounding `$...$` / `$$...$$` / `\(...\)` / `\[...\]` markers.
      const trimmed = raw.trim();
      const stripped = stripMathDelimiters(trimmed);
      if (!stripped && /[A-Za-z]{2,}/.test(trimmed) && /\s/.test(trimmed) && !hasStandaloneLatexSyntax(trimmed)) {
        return escapeMathText(raw).replace(/\n/g, '<br>');
      }
      return renderKatexBody(stripped ? stripped.body : trimmed, stripped?.displayMode);
    } catch (_) {
      // Fall through to escape.
    }
  }
  return escapeMathText(raw);
}

if (typeof window !== "undefined") {
  window.MafikingMathLoader = MafikingMathLoader;
  window.renderMafikingMathHTML = renderMafikingMathHTML;
}
