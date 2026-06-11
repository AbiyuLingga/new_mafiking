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

function renderPaymentSuccess({ user, payment, appUrl }) {
    const year = new Date().getFullYear();
    const displayName = escapeHtml(user.display_name || 'Pembeli');
    const productDetails = escapeHtml(payment.product_details || 'Paket Mafiking');
    const orderId = escapeHtml(payment.merchant_order_id || '');
    const amount = Number(payment.amount || 0).toLocaleString('id-ID');
    const subject = `Pembayaran Mafiking Berhasil - ${productDetails}`;
    const html = `
<p>Halo ${displayName},</p>
<p>Pembayaran untuk <strong>${productDetails}</strong> telah berhasil diverifikasi.</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb">
  <tr><td style="color:#6b7280">Order ID</td><td><code>${orderId}</code></td></tr>
  <tr><td style="color:#6b7280">Nominal</td><td><strong>Rp ${amount}</strong></td></tr>
  <tr><td style="color:#6b7280">Status</td><td><strong style="color:#16a34a">LUNAS</strong></td></tr>
</table>
<p>Akses paket kamu sudah aktif. Mulai sekarang:</p>
<p><a href="${appUrl || 'https://mafiking.com'}/tryout" style="display:inline-block;padding:10px 18px;background:#0b1326;color:#FFF44F;text-decoration:none;border-radius:8px;font-weight:700">Mulai Try Out →</a></p>
<p>Butuh bantuan? Balas email ini atau hubungi admin via WhatsApp.</p>
<p style="color:#9ca3af;font-size:12px">(c) ${year} Mafiking</p>
`;
    const text = `Halo ${displayName}, pembayaran untuk ${productDetails} (Order ID: ${orderId}, Rp ${amount}) telah berhasil diverifikasi. Akses sudah aktif. Mulai: ${appUrl || 'https://mafiking.com'}/tryout`;
    return { subject, html, text };
}

module.exports = { renderVerifyEmail, renderPaymentSuccess, escapeHtml };
