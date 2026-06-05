function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderVerifyEmail({ displayName, verifyUrl, appUrl }) {
  const safeName = escapeHtml(displayName || 'Sobat Mafiking');
  const safeVerifyUrl = escapeHtml(verifyUrl);
  const safeAppUrl = escapeHtml(appUrl || 'https://mafiking.com');
  const year = new Date().getFullYear();
  const subject = 'Konfirmasi email kamu untuk Mafiking';
  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="no-referrer" />
  <title>Konfirmasi email Mafiking</title>
</head>
<body style="margin:0;padding:0;background:#F6F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1326;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7FB;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.08);">
        <tr><td style="padding:32px 32px 16px 32px;text-align:center;">
          <div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:#0B1326;">MAFIKING</div>
        </td></tr>
        <tr><td style="padding:8px 32px 8px 32px;text-align:center;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0B1326;">Konfirmasi email kamu</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;text-align:center;color:#64748B;font-size:15px;line-height:1.6;">
          Hai <strong style="color:#0B1326;">${safeName}</strong>, klik tombol di bawah untuk mengaktifkan akun Mafiking kamu.
        </td></tr>
        <tr><td align="center" style="padding:24px 32px 8px 32px;">
          <a href="${safeVerifyUrl}" style="display:inline-block;background:#FFF44F;color:#0B1326;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:800;font-size:15px;letter-spacing:.02em;border:1px solid #EAB308;">Konfirmasi Email</a>
        </td></tr>
        <tr><td style="padding:8px 32px 16px 32px;text-align:center;color:#64748B;font-size:12px;line-height:1.6;word-break:break-all;">
          Kalau tombol di atas tidak berfungsi, salin dan buka link ini:<br/>
          <a href="${safeVerifyUrl}" style="color:#2563EB;text-decoration:underline;">${safeVerifyUrl}</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #E5E7EB;text-align:center;color:#94A3B8;font-size:11px;line-height:1.6;">
          Link ini berlaku 24 jam. Kalau kamu tidak merasa membuat akun Mafiking, abaikan email ini.<br/>
          &copy; ${year} Mafiking &middot; ${safeAppUrl}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Konfirmasi email Mafiking

Hai ${displayName || 'Sobat Mafiking'},

Klik link berikut untuk mengaktifkan akun kamu:
${verifyUrl}

Link ini berlaku 24 jam. Kalau kamu tidak merasa membuat akun Mafiking, abaikan email ini.

(c) ${year} Mafiking - ${appUrl || 'https://mafiking.com'}
`;
  return { subject, html, text };
}

module.exports = { renderVerifyEmail, escapeHtml };
