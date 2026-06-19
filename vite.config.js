const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

const COMPRESSIBLE_ASSET_RE = /\.(?:css|js|json|svg|txt|xml)$/i;
const COMPRESSIBLE_MIN_BYTES = 1024;

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(filePath);
    if (!entry.isFile()) return [];
    return [filePath];
  });
}

function writeCompressedAssetVariants(distAssets) {
  for (const filePath of walkFiles(distAssets)) {
    if (!COMPRESSIBLE_ASSET_RE.test(filePath)) continue;
    if (filePath.endsWith('.br') || filePath.endsWith('.gz')) continue;
    const source = fs.readFileSync(filePath);
    if (source.length < COMPRESSIBLE_MIN_BYTES) continue;
    fs.writeFileSync(`${filePath}.br`, zlib.brotliCompressSync(source, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }));
    fs.writeFileSync(`${filePath}.gz`, zlib.gzipSync(source, { level: 9 }));
  }
}

function restoreStaticVendorPreloads(distDir, distAssets) {
  const distIndex = path.join(distDir, 'index.html');
  if (!fs.existsSync(distIndex)) return;
  const html = fs.readFileSync(distIndex, 'utf8')
    .replace(
      /href="\/assets\/react-18\.3\.1\.production\.min-[A-Za-z0-9_-]+\.js\?v=18\.3\.1"/g,
      'href="/assets/vendor/react-18.3.1.production.min.js?v=18.3.1"'
    )
    .replace(
      /href="\/assets\/react-dom-18\.3\.1\.production\.min-[A-Za-z0-9_-]+\.js\?v=18\.3\.1"/g,
      'href="/assets/vendor/react-dom-18.3.1.production.min.js?v=18.3.1"'
    );
  fs.writeFileSync(distIndex, html);

  for (const fileName of fs.readdirSync(distAssets)) {
    if (/^react(?:-dom)?-18\.3\.1\.production\.min-[A-Za-z0-9_-]+\.js(?:\.(?:br|gz))?$/.test(fileName)) {
      fs.rmSync(path.join(distAssets, fileName), { force: true });
    }
  }
}

// Copy static assets that are referenced by string paths in JSX but never
// imported by the bundler. Without this, `<picture>` srcSet entries, small
// icon variants, and same-origin React UMD files would be served only through
// the source-assets fallback instead of the immutable dist asset path.
function mafikingResponsiveImagesPlugin() {
  const assetsDir = path.resolve(__dirname, 'assets');
  return {
    name: 'mafiking-responsive-images',
    apply: 'build',
    closeBundle() {
      const distAssets = path.resolve(__dirname, 'dist', 'assets');
      if (!fs.existsSync(distAssets)) return;
      const variantRe = /^(.+?)(?:-mobile|-tablet|-desktop)\.(webp|avif)$|^(.+?)-icon\.(webp|png)$/;
      for (const sourcePath of walkFiles(assetsDir)) {
        const fileName = path.basename(sourcePath);
        if (!variantRe.test(fileName)) continue;
        const relativePath = path.relative(assetsDir, sourcePath);
        const destPath = path.join(distAssets, relativePath);
        if (fs.existsSync(destPath)) continue;
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(sourcePath, destPath);
      }
      const vendorDir = path.join(assetsDir, 'vendor');
      if (fs.existsSync(vendorDir)) {
        fs.cpSync(vendorDir, path.join(distAssets, 'vendor'), { recursive: true });
      }
      restoreStaticVendorPreloads(path.resolve(__dirname, 'dist'), distAssets);
      writeCompressedAssetVariants(distAssets);
    },
  };
}

// Route files use `const X = (...)` and `window.X = X;` instead of `export`.
// For Vite to dynamic-import a route as its own chunk, the module needs a
// real ESM `export` statement. This transform appends `export { Y };` for
// every top-level `window.Y = ...;` assignment, so the route can be split
// per Phase 2.1 of the mobile perf plan. The Babel-standalone path is
// unaffected because that runtime reads the unmodified source file.
const ROUTE_FILE_RE = /[\\/]src[\\/](?:pages[\\/](?:lobby|belajar|misi|tryout|leaderboard|payment|profile|invoices)|features[\\/](?:practice[\\/](?:practice|drawing-canvas|answer-board|toolbar)|admin[\\/](?:admin|admin-monitoring)))\.jsx$/;
function mafikingRouteExportPlugin() {
  return {
    name: 'mafiking-route-export',
    apply: 'build',
    transform(code, id) {
      if (!ROUTE_FILE_RE.test(id)) return null;
      if (id.includes('generated-')) return null;
      if (code.includes('export ')) return null;
      const matches = [...code.matchAll(/^\s*window\.(\w+)\s*=\s*(\w+)\s*;?\s*$/gm)];
      if (matches.length === 0) return null;
      const seen = new Set();
      const exports = [];
      for (const [, , varName] of matches) {
        if (seen.has(varName)) continue;
        seen.add(varName);
        exports.push(`export { ${varName} };`);
      }
      return { code: code + '\n' + exports.join('\n') + '\n', map: null };
    },
  };
}

module.exports = defineConfig({
  plugins: [react({ jsxRuntime: 'classic' }), mafikingRouteExportPlugin(), mafikingResponsiveImagesPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react') || id.includes('/react-dom') || id.includes('/scheduler')) return 'vendor-react';
          if (id.includes('/lucide-react')) return 'vendor-icons';
          return 'vendor';
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000'
    }
  }
});
