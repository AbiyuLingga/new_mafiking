// Generate per-asset responsive variants for landing images and small UI icons.
//
// Why this script: MAFIKING.html historically served a single 6.2MB PNG to every
// device even when CSS hid the image on mobile. The Phase 1 quick win needs
// three size variants per landing asset so the `<picture>` element in
// src/pages/lobby.jsx can serve an appropriately-sized AVIF/WebP and the
// browser can skip the larger variants. It also creates tiny WebP/PNG
// derivatives for logo and mobile-nav icons, which are displayed at small
// sizes but historically transferred full-size PNGs.
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
const DEFAULT_ICON_WEBP_QUALITY = 82;
const DEFAULT_ICON_PNG_COMPRESSION = 9;

const TRACKED_ASSETS = [
    { name: 'landing_mentors_20260607', ext: 'png', kind: 'responsive', baseQuality: { webp: 85, avif: 70 } },
    { name: 'landing_page', ext: 'png', kind: 'responsive', baseQuality: { webp: 80, avif: 65 } },
    { name: 'rekomendasi-latihan', ext: 'jpg', dir: 'landing', kind: 'responsive', baseQuality: { webp: 76, avif: 60 } },
    { name: 'history-kesalahan', ext: 'jpg', dir: 'landing', kind: 'responsive', baseQuality: { webp: 76, avif: 60 } },
    { name: 'simulasi-tryout', ext: 'jpg', dir: 'landing', kind: 'responsive', baseQuality: { webp: 76, avif: 60 } },
    { name: 'logo', ext: 'png', kind: 'icon', width: 160, baseQuality: { webp: 88 } },
    { name: 'favicon', ext: 'png', kind: 'icon', width: 96, baseQuality: { webp: 88 } },
    { name: 'Book', ext: 'png', kind: 'icon', width: 64, baseQuality: { webp: 82 } },
    { name: 'crown', ext: 'png', kind: 'icon', width: 64, baseQuality: { webp: 82 } },
    { name: 'leaderboard', ext: 'png', kind: 'icon', width: 64, baseQuality: { webp: 82 } },
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
  <name>-icon.webp    (small UI icon WebP)
  <name>-icon.png     (small UI icon PNG fallback)

The source PNG/JPG is left untouched so <img> fallbacks continue to work.
`);
}

async function processResponsiveAsset(asset, sourcePath) {
    const results = [];
    const outputDir = asset.dir ? path.join(assetsDir, asset.dir) : assetsDir;
    for (const variant of SIZE_VARIANTS) {
        const webpOut = path.join(outputDir, `${asset.name}-${variant.suffix}.webp`);
        const avifOut = path.join(outputDir, `${asset.name}-${variant.suffix}.avif`);
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
    return { name: asset.name, dir: asset.dir || '', kind: asset.kind, status: 'processed', variants: results };
}

async function processIconAsset(asset, sourcePath) {
    const width = Number(asset.width || 64);
    const outputDir = asset.dir ? path.join(assetsDir, asset.dir) : assetsDir;
    const webpOut = path.join(outputDir, `${asset.name}-icon.webp`);
    const pngOut = path.join(outputDir, `${asset.name}-icon.png`);
    const webpQuality = asset.baseQuality?.webp || DEFAULT_ICON_WEBP_QUALITY;
    const results = [];
    try {
        await sharp(sourcePath)
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: webpQuality, effort: 4 })
            .toFile(webpOut);
        await sharp(sourcePath)
            .resize({ width, withoutEnlargement: true })
            .png({ compressionLevel: DEFAULT_ICON_PNG_COMPRESSION, adaptiveFiltering: true })
            .toFile(pngOut);
        const webpStat = fs.statSync(webpOut);
        const pngStat = fs.statSync(pngOut);
        results.push({
            size: 'icon',
            width,
            webpBytes: webpStat.size,
            pngBytes: pngStat.size,
        });
    } catch (err) {
        console.error(`[optimize-images] failed ${asset.name} icon:`, err.message);
        results.push({ size: 'icon', error: err.message });
    }
    return { name: asset.name, dir: asset.dir || '', kind: asset.kind, status: 'processed', variants: results };
}

async function processAsset(asset) {
    const sourcePath = path.join(assetsDir, asset.dir || '', `${asset.name}.${asset.ext}`);
    if (!fs.existsSync(sourcePath)) {
        console.warn(`[optimize-images] skip: source not found ${sourcePath}`);
        return { name: asset.name, dir: asset.dir || '', kind: asset.kind || 'responsive', status: 'skipped', reason: 'source-missing' };
    }
    return asset.kind === 'icon'
        ? processIconAsset(asset, sourcePath)
        : processResponsiveAsset(asset, sourcePath);
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
                } else if (v.pngBytes) {
                    console.log(`  ${result.name} ${v.size} (${v.width}w): webp ${(v.webpBytes / 1024).toFixed(1)}KB, png ${(v.pngBytes / 1024).toFixed(1)}KB`);
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
