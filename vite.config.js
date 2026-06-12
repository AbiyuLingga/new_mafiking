const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

// Copy responsive image variants that are referenced by string paths in JSX
// but never imported by the bundler. Without this, `<picture>` srcSet entries
// for `-mobile.webp` / `-tablet.webp` / `-desktop.webp` / `.avif` would 404
// in production because Vite only copies assets it sees in the import graph.
function mafikingResponsiveImagesPlugin() {
  const assetsDir = path.resolve(__dirname, 'assets');
  return {
    name: 'mafiking-responsive-images',
    apply: 'build',
    closeBundle() {
      const distAssets = path.resolve(__dirname, 'dist', 'assets');
      if (!fs.existsSync(distAssets)) return;
      const sourceFiles = fs.readdirSync(assetsDir);
      const variantRe = /^(.+?)(?:-mobile|-tablet|-desktop)\.(webp|avif)$/;
      for (const fileName of sourceFiles) {
        if (!variantRe.test(fileName)) continue;
        const sourcePath = path.join(assetsDir, fileName);
        const destPath = path.join(distAssets, fileName);
        if (fs.existsSync(destPath)) continue;
        fs.copyFileSync(sourcePath, destPath);
      }
    },
  };
}

// Route files use `const X = (...)` and `window.X = X;` instead of `export`.
// For Vite to dynamic-import a route as its own chunk, the module needs a
// real ESM `export` statement. This transform appends `export { Y };` for
// every top-level `window.Y = ...;` assignment, so the route can be split
// per Phase 2.1 of the mobile perf plan. The Babel-standalone path is
// unaffected because that runtime reads the unmodified source file.
const ROUTE_FILE_RE = /[\\/](src|lobby\.jsx|src\/(lobby|belajar|practice|misi|tryout|leaderboard|payment|profile|invoices|drawing-canvas|answer-board|toolbar))\.jsx$/;
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
