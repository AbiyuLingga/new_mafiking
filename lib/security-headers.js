const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'bluetooth=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'serial=()',
  'usb=()',
].join(', ');

function securityHeaders(_req, res, next) {
  // Clipboard access is intentionally not disabled because payment flows use it.
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  next();
}

module.exports = {
  PERMISSIONS_POLICY,
  securityHeaders,
};
