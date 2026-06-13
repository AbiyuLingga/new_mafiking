const DEFAULT_PACKAGE_ACCESS_FEATURES = ['tryout-access', 'daily-missions', 'special-practice'];

const PACKAGE_ACCESS_FEATURES = [
  {
    id: 'tryout-access',
    label: 'Try Out paket',
    accessType: 'tryout',
    accessValue: ({ tryoutId, title }) => String(tryoutId || title || '').trim(),
  },
  {
    id: 'daily-missions',
    label: 'Misi Harian',
    accessType: 'mission',
    accessValue: () => 'daily-missions',
  },
  {
    id: 'special-practice',
    label: 'Latihan Soal Khusus',
    accessType: 'practice',
    accessValue: () => 'special-practice',
  },
];

const FEATURE_IDS = new Set(PACKAGE_ACCESS_FEATURES.map((feature) => feature.id));

function normalizePackageAccessFeatures(value, { useDefault = true } = {}) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (_) {
      parsed = value.split(/[\n,]/);
    }
  }

  const selected = Array.isArray(parsed)
    ? parsed.map((item) => String(item || '').trim()).filter((item) => FEATURE_IDS.has(item))
    : [];

  const unique = [...new Set(selected)];
  if (unique.length || !useDefault) return unique;
  if (value == null || String(value).trim() === '') return [...DEFAULT_PACKAGE_ACCESS_FEATURES];
  return [];
}

function packageAccessGrantSpecs(pkg = {}) {
  const features = normalizePackageAccessFeatures(pkg.access_features);
  const tryoutId = String(pkg.tryout_id || pkg.tryoutId || '').trim();
  const title = String(pkg.title || '').trim();

  return features
    .map((featureId) => {
      const feature = PACKAGE_ACCESS_FEATURES.find((item) => item.id === featureId);
      if (!feature) return null;
      const value = feature.accessValue({ tryoutId, title });
      if (!value) return null;
      return {
        featureId,
        accessType: feature.accessType,
        accessValue: value,
      };
    })
    .filter(Boolean);
}

module.exports = {
  DEFAULT_PACKAGE_ACCESS_FEATURES,
  PACKAGE_ACCESS_FEATURES,
  normalizePackageAccessFeatures,
  packageAccessGrantSpecs,
};
