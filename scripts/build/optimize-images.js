// Generate per-asset responsive variants (WebP + AVIF) for landing images.
//
// Why this script: MAFIKING.html historically served a single 6.2MB PNG to every
// device even when CSS hid the image on mobile. The Phase 1 quick win needs
// three size variants per asset so the `<picture>` element in src/pages/lobby.jsx
// can serve an appropriately-sized AVIF/WebP and the browser can skip the
// larger variants.
//
// Per-asset quality is reviewed in docs/performance/image-quality-review.md (S1) and
// adjusted per asset rather than using a universal q value.
//
// Run:
//   node scripts/build/optimize-images.js                 # process every tracked asset
//   node scripts/build/optimize-images.js --asset=landing_mentors_20260607
//
// This is a dev/CI tool only. The generated variants are committed to the
// repo so the runtime VPS (which intentionally has no Sharp) can serve them as
// static assets. See docs/plans/2026-06-12-002-perf-mobile-perf-incremental-plan.md
// for context.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..', '..');
const assetsDir = path.join(projectRoot, 'assets');

const SIZE_VARIANTS = [
    { suffix: 'mobile', width: 640 },
    { suffix: 'tablet', width: 960 },
    { suffix: 'desktop', width: 1280 },
];

const DEFAULT_WEBP_QUALITY = 80;
const DEFAULT_AVIF_QUALITY = 65;

const TRACKED_ASSETS = [
    { name: 'landing_mentors_20260607', ext: 'png', baseQuality: { webp: 85, avif: 70 } },
    { name: 'landing_page', ext: 'png', baseQuality: { webp: 80, avif: 65 } },
];

function parseArgs(argv) {
    const args = { assets: null };
    for (const arg of argv.slice(2)) {
        if (arg.startsWith('--asset=')) {
            args.assets = [arg.slice('--asset='.length)];
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        }
    }
    return args;
}

function printHelp() {
    console.log(`Usage:
  node scripts/build/optimize-images.js
  node scripts/build/optimize-images.js --asset=landing_mentors_20260607

Outputs (alongside the source):
  <name>-<size>.webp  (responsive WebP variants)
  <name>-<size>.avif  (responsive AVIF variants)

The source PNG/JPG is left untouched so <img> fallbacks continue to work.
`);
}

async function processAsset(asset) {
    const sourcePath = path.join(assetsDir, `${asset.name}.${asset.ext}`);
    if (!fs.existsSync(sourcePath)) {
        console.warn(`[optimize-images] skip: source not found ${sourcePath}`);
        return { name: asset.name, status: 'skipped', reason: 'source-missing' };
    }
    const results = [];
    for (const variant of SIZE_VARIANTS) {
        const webpOut = path.join(assetsDir, `${asset.name}-${variant.suffix}.webp`);
        const avifOut = path.join(assetsDir, `${asset.name}-${variant.suffix}.avif`);
        const webpQuality = asset.baseQuality?.webp || DEFAULT_WEBP_QUALITY;
        const avifQuality = asset.baseQuality?.avif || DEFAULT_AVIF_QUALITY;
        try {
            await sharp(sourcePath)
                .resize({ width: variant.width, withoutEnlargement: true })
                .webp({ quality: webpQuality, effort: 4 })
                .toFile(webpOut);
            const webpStat = fs.statSync(webpOut);
            await sharp(sourcePath)
                .resize({ width: variant.width, withoutEnlargement: true })
                .avif({ quality: avifQuality, effort: 4 })
                .toFile(avifOut);
            const avifStat = fs.statSync(avifOut);
            results.push({
                size: variant.suffix,
                width: variant.width,
                webpBytes: webpStat.size,
                avifBytes: avifStat.size,
            });
        } catch (err) {
            console.error(`[optimize-images] failed ${asset.name} ${variant.suffix}:`, err.message);
            results.push({ size: variant.suffix, error: err.message });
        }
    }
    return { name: asset.name, status: 'processed', variants: results };
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }
    const targets = args.assets
        ? TRACKED_ASSETS.filter((a) => args.assets.includes(a.name))
        : TRACKED_ASSETS;
    if (targets.length === 0) {
        console.error('[optimize-images] no matching assets in --asset filter');
        process.exit(1);
    }
    const summary = [];
    for (const asset of targets) {
        const result = await processAsset(asset);
        summary.push(result);
        if (result.variants) {
            for (const v of result.variants) {
                if (v.error) {
                    console.log(`  ${result.name} ${v.size}: ERROR ${v.error}`);
                } else {
                    console.log(`  ${result.name} ${v.size} (${v.width}w): webp ${(v.webpBytes / 1024).toFixed(1)}KB, avif ${(v.avifBytes / 1024).toFixed(1)}KB`);
                }
            }
        }
    }
    const manifestPath = path.join(assetsDir, 'image-variants-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), assets: summary }, null, 2));
    console.log(`\nWrote manifest: ${path.relative(projectRoot, manifestPath)}`);
}

main().catch((err) => {
    console.error('[optimize-images] fatal:', err);
    process.exit(1);
});
