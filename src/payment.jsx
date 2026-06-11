// MAFIKING Payment - checkout package, create manual order, show status.

const QRIS_LOGO_SRC = "/assets/qris-logo.svg?v=20260612";

const PAKET_LIST = [
  { id: "cek-payment", label: "Cek Payment", price: 500, desc: "Paket khusus untuk mengetes alur pembayaran web.", access: "Test" },
  { id: "trial", label: "Trial 7 Hari", price: 29000, desc: "Akses semua modul + 7 hari koreksi AI tidak terbatas.", access: "7 hari" },
  { id: "bulanan", label: "Bulanan", price: 99000, desc: "Akses penuh selama 30 hari + leaderboard premium.", access: "30 hari" },
  { id: "semester", label: "Semester", price: 249000, desc: "Akses 6 bulan + sesi tanya mentor.", access: "6 bulan" },
];

function parsePrice(priceStr) {
  if (typeof priceStr === "number") return Math.round(priceStr);
  if (!priceStr || priceStr === "Gratis") return 0;
  const clean = String(priceStr).replace(/[^0-9]/g, "");
  return parseInt(clean, 10) || 0;
}

function formatRupiah(amount) {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`;
}

function remainingPaymentSeconds(expiresAt) {
  if (!expiresAt) return 0;
  const raw = String(expiresAt).trim();
  let normalized = raw.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isPaymentExpiredStatus(statusValue) {
  return String(statusValue || "").toUpperCase() === "EXPIRED";
}

function isGuestPaymentUser(user) {
  const displayName = user?.display_name || "";
  const username = user?.username || "";
  return displayName.startsWith("Tamu_") || username.startsWith("Tamu_");
}

function initialPaymentEmail(user) {
  const username = user?.username || "";
  if (isGuestPaymentUser(user)) return "";
  if (username.includes("@")) return username;
  return username ? `${username}@mafiking.com` : "";
}

function initialPaymentName(user) {
  if (isGuestPaymentUser(user)) return "";
  return user?.display_name || "";
}

function paymentProductFromContext(context, selectedId = "cek-payment") {
  if (context && context.type === "tryout" && context.package) {
    const pkg = context.package;
    return {
      id: pkg.id,
      name: pkg.title,
      label: pkg.title,
      type: "Tryout",
      price: parsePrice(pkg.price),
      desc: pkg.description,
      access: pkg.duration,
      purchaseType: "tryout",
      tryoutPackageId: pkg.id,
    };
  }
  const pkg = PAKET_LIST.find((paket) => paket.id === selectedId) || PAKET_LIST[0];
  return {
    id: pkg.id,
    name: pkg.label,
    label: pkg.label,
    type: "Langganan",
    price: pkg.price,
    desc: pkg.desc,
    access: pkg.access,
    purchaseType: "subscription",
    packageId: pkg.id,
  };
}

function renderPaymentOverlay(children) {
  if (typeof ReactDOM !== "undefined" && ReactDOM.createPortal && document?.body) {
    return ReactDOM.createPortal(children, document.body);
  }
  return children;
}

const Payment = ({ setRoute, currentUser, context }) => {
  const { useEffect } = React;
  const params = new URLSearchParams(window.location.search);
  const merchantOrderId = params.get("merchantOrderId");
  
  useEffect(() => {
    if (!merchantOrderId) setRoute("tryout");
  }, [merchantOrderId, setRoute]);

  if (merchantOrderId) {
    return <PaymentStatus merchantOrderId={merchantOrderId} setRoute={setRoute} />;
  }

  return null;
};

const PaymentCheckoutModal = ({ context, currentUser, onClose, setRoute }) => {
  const { useEffect, useMemo, useState } = React;
  const [loading, setLoading] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [errors, setErrors] = useState({});
  const [promoCode, setPromoCode] = useState("");
  const [qrData, setQrData] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [checkingPending, setCheckingPending] = useState(true);
  const [name] = useState(() => initialPaymentName(currentUser));
  const [email] = useState(() => initialPaymentEmail(currentUser));
  const product = useMemo(() => paymentProductFromContext(context), [context]);
  const gatewayReady = gatewayConfig ? Boolean(gatewayConfig.active) : false;

  useEffect(() => {
    let cancelled = false;
    MafikingAPI.get("/api/payment/config")
      .then((config) => { if (!cancelled) setGatewayConfig(config); })
      .catch(() => {
        if (!cancelled) {
          setGatewayConfig({
            active: false,
            message: "Status pembayaran belum bisa dicek. Coba lagi sebentar atau hubungi admin.",
          });
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCheckingPending(true);
    const selectorPayload = product.purchaseType === "tryout"
      ? { purchaseType: "tryout", tryoutPackageId: product.tryoutPackageId }
      : { purchaseType: "subscription", packageId: product.packageId };

    MafikingAPI.post("/api/payment/pending", selectorPayload)
      .then((pending) => {
        if (cancelled) return;
        if (pending?.payment) showPaymentOrder(pending.payment);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckingPending(false);
      });

    return () => { cancelled = true; };
  }, [product.purchaseType, product.tryoutPackageId, product.packageId]);

  useEffect(() => {
    if (!qrData?.expiresAt) return undefined;
    setCountdown(remainingPaymentSeconds(qrData.expiresAt));
    const timer = window.setInterval(() => {
      setCountdown(remainingPaymentSeconds(qrData.expiresAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [qrData?.expiresAt]);

  useEffect(() => {
    if (!qrData?.merchantOrderId) return undefined;
    const merchantOrderId = qrData.merchantOrderId;

    // P3-1: gunakan AbortController untuk race-free cleanup
    const abort = new AbortController();
    let pollTimer = null;
    let eventSource = null;

    function setStatusSafe(updater) {
      if (abort.signal.aborted) return;
      setPollingStatus((prev) => {
        const base = prev || { status: "PENDING" };
        return typeof updater === "function" ? updater(base) : { ...base, ...updater };
      });
    }

    // P3-1: jitter 3-7 detik, bukan fixed 5s — hindari thundering herd
    function jitteredDelay() {
      return 3000 + Math.floor(Math.random() * 4000);
    }

    function startPollingFallback() {
      if (pollTimer) return;
      const tick = () => {
        if (abort.signal.aborted) return;
        MafikingAPI.get(`/api/payment/status/${merchantOrderId}`)
          .then((res) => {
            if (abort.signal.aborted) return;
            setStatusSafe(res);
            if (res.status === "PENDING" || res.status === "ERROR") {
              pollTimer = window.setTimeout(tick, jitteredDelay());
            } else {
              pollTimer = null;
            }
          })
          .catch(() => {
            if (abort.signal.aborted) return;
            setStatusSafe({ status: "ERROR", error: "Status pembayaran belum terbaca." });
            pollTimer = window.setTimeout(tick, jitteredDelay());
          });
      };
      // P3-1: offset initial poll dengan jitter juga
      pollTimer = window.setTimeout(tick, 300 + Math.floor(Math.random() * 300));
    }

    function startSSE() {
      try {
        eventSource = new EventSource(`/api/payment/stream/${merchantOrderId}`);
      } catch (e) {
        startPollingFallback();
        return;
      }
      eventSource.addEventListener("status", (e) => {
        if (abort.signal.aborted) return;
        try { setStatusSafe(JSON.parse(e.data)); } catch (_) {}
      });
      eventSource.addEventListener("paid", (e) => {
        if (abort.signal.aborted) return;
        try { setStatusSafe(JSON.parse(e.data)); } catch (_) {}
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      });
      // P3-1: sisa retry count yang terbatas (max 3), lalu fallback ke polling
      let sseRetries = 0;
      const MAX_SSE_RETRIES = 3;
      eventSource.onerror = () => {
        if (abort.signal.aborted) return;
        sseRetries += 1;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (sseRetries >= MAX_SSE_RETRIES) {
          startPollingFallback();
        }
        // < MAX_SSE_RETRIES: browser akan reconnect otomatis via EventSource spec
      };
    }

    startSSE();
    // P3-1: jangan start fallback jika SSE sukses — tunggu onerror dulu.
    // Tapi untuk safety tetap ada single-shot initial poll dengan delay pendek
    // yang akan skip jika status sudah != PENDING.
    const safetyTimer = window.setTimeout(() => {
      if (abort.signal.aborted) return;
      // Hanya poll sekali sebagai safety net — jangan masuk loop
      MafikingAPI.get(`/api/payment/status/${merchantOrderId}`)
        .then((res) => {
          if (abort.signal.aborted || !res) return;
          if (res.status !== "PENDING") {
            setStatusSafe(res);
            if (eventSource) {
              eventSource.close();
              eventSource = null;
            }
          }
        })
        .catch(() => {});
    }, 2000);

    return () => {
      abort.abort();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (pollTimer) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
      window.clearTimeout(safetyTimer);
    };
  }, [qrData?.merchantOrderId]);

  function closePaymentStatus() {
    setQrData(null);
    setPollingStatus(null);
    window.history.replaceState({ route: "tryout" }, "", "/tryout");
    if (typeof onClose === "function") onClose();
  }

  function buildPaymentPayload() {
    const cleanName = String(name || "").trim() || "Pembeli Mafiking";
    const cleanEmail = String(email || "").trim();
    if (!isValidEmail(cleanEmail)) {
      throw new Error("Email akun belum valid. Login ulang atau lengkapi profil sebelum membeli.");
    }
    return product.purchaseType === "tryout"
      ? {
          purchaseType: "tryout",
          tryoutPackageId: product.tryoutPackageId,
          email: cleanEmail,
          name: cleanName,
        }
      : {
          purchaseType: "subscription",
          packageId: product.packageId,
          email: cleanEmail,
          name: cleanName,
        };
  }

  function showPaymentOrder(payment) {
    setQrData(payment);
    setPollingStatus({ status: "PENDING", ...payment });
    setCountdown(remainingPaymentSeconds(payment.expiresAt));
    window.history.replaceState(
      { route: "payment", merchantOrderId: payment.merchantOrderId },
      "",
      `/payment?merchantOrderId=${encodeURIComponent(payment.merchantOrderId)}`
    );
  }

  async function refreshPaymentStatus() {
    if (!qrData?.merchantOrderId || checkingStatus) return;
    setCheckingStatus(true);
    try {
      const res = await MafikingAPI.get(`/api/payment/status/${qrData.merchantOrderId}`);
      setPollingStatus(res);
      setQrData((current) => ({ ...(current || {}), ...res }));
      if (res.expiresAt) setCountdown(remainingPaymentSeconds(res.expiresAt));
    } catch (err) {
      setPollingStatus((current) => ({
        ...(current || {}),
        status: current?.status || qrData.status || "PENDING",
        error: err.message || "Status pembayaran belum terbaca.",
      }));
    } finally {
      setCheckingStatus(false);
    }
  }

  if (qrData) {
    return renderPaymentOverlay(
      qrData.provider === "manual" || !qrData.qrImageDataUrl ? (
        <PaymentManualView
          adminWhatsapp={qrData.adminWhatsapp || gatewayConfig?.manualAdminWhatsapp || gatewayConfig?.qrisAdminWhatsapp}
          checkingStatus={checkingStatus}
          countdown={countdown}
          onCancel={closePaymentStatus}
          onCheckStatus={refreshPaymentStatus}
          payment={qrData}
          setRoute={setRoute}
          status={pollingStatus}
        />
      ) : (
        <>
          <PaymentQrisView
            countdown={countdown}
            checkingStatus={checkingStatus}
            onCancel={closePaymentStatus}
            onCheckStatus={refreshPaymentStatus}
            payment={qrData}
            setRoute={setRoute}
            status={pollingStatus}
          />
          <PaymentQrisViewDesktop
            countdown={countdown}
            checkingStatus={checkingStatus}
            onCancel={closePaymentStatus}
            onCheckStatus={refreshPaymentStatus}
            payment={qrData}
            setRoute={setRoute}
            status={pollingStatus}
          />
        </>
      )
    );
  }

  if (checkingPending) {
    return renderPaymentOverlay(
      <div className="checkout-modal-backdrop">
        <div className="checkout-modal" style={{ maxWidth: 420 }} role="dialog" aria-modal="true">
          <div className="checkout-modal-main" style={{ width: "100%" }}>
            <div className="flex items-center gap-3">
              <Icon.Clock className="w-6 h-6 text-ink" />
              <div>
                <h2 className="font-display font-bold text-2xl tracking-[-0.02em]">Mengecek QRIS</h2>
                <p className="text-sm text-ink/50">Sebentar, kami cek apakah pesanan lama masih aktif.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handlePay() {
    if (!gatewayReady || loading) return;

    setLoading(true);
    setErrors({});
    try {
      const payload = buildPaymentPayload();
      const pending = await MafikingAPI.post("/api/payment/pending", payload);
      if (pending?.payment) {
        showPaymentOrder(pending.payment);
        return;
      }

      const res = await MafikingAPI.post("/api/payment/create", payload);
      if (res.provider === "manual" || res.qrImageDataUrl) {
        showPaymentOrder(res);
      } else if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        setErrors({ form: "Server belum mengirim QR atau URL pembayaran. Coba lagi." });
      }
    } catch (err) {
      setErrors({ form: err.message || "Gagal membuat pembayaran. Coba lagi." });
    } finally {
      setLoading(false);
    }
  }

  return renderPaymentOverlay(
    <CheckoutModal
      config={gatewayConfig}
      error={errors.form}
      loading={loading}
      onClose={onClose}
      onPay={handlePay}
      product={product}
      promoCode={promoCode}
      setPromoCode={setPromoCode}
    />
  );
};

const CheckoutModal = ({ config, error, onClose, onPay, product, loading, promoCode, setPromoCode }) => {
  const total = product.price;
  const ready = Boolean(config?.active);
  const providerLabel = config?.provider === "manual" ? "konfirmasi manual" : "QRIS";

  return (
    <div className="checkout-modal-backdrop" onClick={onClose}>
      <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-modal-main">
          <div className="flex items-center gap-3 mb-6">
            <Icon.Wallet className="w-6 h-6 text-ink" />
            <div>
              <h2 className="font-display font-bold text-2xl tracking-[-0.02em]">Checkout</h2>
              <p className="text-sm text-ink/50">Selesaikan pembayaran Anda</p>
            </div>
          </div>

          <div className="checkout-product-card">
            <div className="checkout-product-thumb">
              <Icon.Card className="w-8 h-8 text-ink/30" />
            </div>
            <div className="checkout-product-info">
              <div className="checkout-product-name">{product.name}</div>
              <div className="checkout-product-type">{product.type}</div>
              <div className="checkout-product-price">{formatRupiah(product.price)}</div>
            </div>
          </div>

          <div className="checkout-promo-label">Kode Promo</div>
          <div className="checkout-promo-row">
            <input
              className="checkout-promo-input"
              placeholder="Masukkan kode..."
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
            />
            <button className="checkout-promo-btn" type="button">Gunakan</button>
          </div>
          {error ? (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
          {config && !ready ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
              {config.message || "Pembayaran sedang disiapkan. Coba lagi sebentar."}
            </div>
          ) : null}
        </div>

        <div className="checkout-modal-sidebar">
          <div className="checkout-modal-sidebar-header">
            <h3>Ringkasan Pembayaran</h3>
            <button className="checkout-modal-close" onClick={onClose} type="button">
              <Icon.X className="w-5 h-5" />
            </button>
          </div>

          <div className="checkout-summary-row">
            <span className="label">Harga Item</span>
            <span className="value">{formatRupiah(product.price)}</span>
          </div>
          <hr className="checkout-summary-divider" />
          <div className="checkout-summary-total">
            <span className="label">Total Bayar</span>
            <span className="value">{formatRupiah(total)}</span>
          </div>

          <button
            className="checkout-pay-btn"
            disabled={loading || !ready}
            onClick={onPay}
            type="button"
          >
            <Icon.Card className="w-5 h-5" />
            {loading ? "Memproses..." : ready ? "Bayar Sekarang" : "Mengecek Pembayaran..."}
          </button>
          <div className="checkout-secure-note">Pembayaran aman melalui {providerLabel}</div>
        </div>
      </div>
    </div>
  );
};

const PaymentGatewayNotice = ({ config }) => {
  if (!config) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink/60" aria-busy="true">
        Mengecek kesiapan pembayaran...
      </div>
    );
  }
  if (config.active) {
    if (config.provider === "manual") {
      return (
        <div className="mb-6 rounded-2xl border border-yel/60 bg-yel/20 px-4 py-3 text-sm font-semibold text-ink">
          Pembayaran manual aktif. Setelah order dibuat, chat admin untuk konfirmasi.
        </div>
      );
    }
    const readyText = config.provider === "qris" || config.qrisReady
      ? "QRIS lokal siap digunakan."
      : "Payment gateway siap digunakan.";
    return (
        <div className="mb-6 rounded-2xl border border-yel/60 bg-yel/20 px-4 py-3 text-sm font-semibold text-ink">
        {config.mockMode ? "Mode sandbox aktif untuk pengujian pembayaran." : readyText}
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900" role="status">
      {config.message || "Pembayaran sedang dalam proses aktivasi. Pembelian akan dibuka setelah admin siap."}
    </div>
  );
};

const OrderSummary = ({ selectedPackage, isTryoutCheckout }) => (
  <div className="card bg-white border hairline rounded-3xl p-6 mb-6">
    <div className="flex items-center justify-between gap-4 mb-4">
      <h3 className="font-display font-bold text-lg">Ringkasan Pembayaran</h3>
      <span className="tag">{isTryoutCheckout ? "Tryout" : "Langganan"}</span>
    </div>
    <div className="space-y-3 text-sm">
      <div className="flex justify-between gap-4">
        <span className="text-ink/55">Paket</span>
        <span className="font-semibold text-right">{selectedPackage?.label || "Belum dipilih"}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-ink/55">Masa akses</span>
        <span className="font-semibold text-right">{selectedPackage?.access || "-"}</span>
      </div>
      <div className="pt-3 border-t hairline flex justify-between gap-4 items-end">
        <span className="font-semibold text-ink/65">Total bayar</span>
        <span className="font-display font-bold text-2xl tnum">{selectedPackage ? formatRupiah(selectedPackage.price) : "-"}</span>
      </div>
    </div>
  </div>
);

const TrustNote = () => (
  <div className="text-center text-xs text-ink/55 mt-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
    <span className="inline-flex items-center gap-1.5"><Icon.CheckCircle className="w-3.5 h-3.5 text-ink" /> Nominal memakai kode unik</span>
    <span className="inline-flex items-center gap-1.5"><Icon.CheckCircle className="w-3.5 h-3.5 text-ink" /> Akses aktif setelah admin verifikasi</span>
  </div>
);

const PaymentManualView = ({ payment, countdown, status, adminWhatsapp, onCancel, onCheckStatus, checkingStatus, setRoute }) => {
  const { useState } = React;
  const [copied, setCopied] = useState("");
  const statusValue = status?.status || payment.status || "PENDING";
  const expired = isPaymentExpiredStatus(statusValue);
  const productDetails = payment.productDetails || "Pesanan Mafiking";
  const baseAmount = Number(payment.baseAmount || 0);
  const uniqueCode = Number(payment.suffix || 0);
  const fullAmount = Number(payment.fullAmount || payment.amount || 0);
  const isTryout = !["Trial 7 Hari", "Bulanan", "Semester"].includes(productDetails);
  const whatsappNumber = String(adminWhatsapp || "").replace(/[^0-9]/g, "");
  const buyerEmail = String(payment.email || "-").trim() || "-";
  const waMessage = encodeURIComponent(
    [
      "Halo admin Mafiking, saya ingin konfirmasi pembayaran.",
      "",
      `ID Payment: ${payment.merchantOrderId}`,
      `Nominal: ${formatRupiah(fullAmount)}`,
      `Email Akun: ${buyerEmail}`,
      `Paket: ${productDetails}`,
      "",
      "Saya akan kirim bukti pembayaran setelah pesan ini.",
    ].join("\n")
  );

  async function copyValue(value, key) {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (_) {
      setCopied("");
    }
  }

  return (
    <div className="checkout-modal-backdrop" onClick={onCancel}>
      <div className="checkout-modal manual-desktop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-modal-main">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Icon.Wallet className="w-6 h-6 text-ink" />
              <div>
                <h2 className="font-display font-bold text-2xl tracking-[-0.02em]">Checkout</h2>
                <p className="text-sm text-ink/50">Selesaikan pembayaran Anda</p>
              </div>
            </div>
            <button className="checkout-modal-close" onClick={onCancel} type="button">
              <Icon.X className="w-5 h-5" />
            </button>
          </div>

          <div className="checkout-product-card">
            <div className="checkout-product-thumb">
              <Icon.Card className="w-8 h-8 text-ink/30" />
            </div>
            <div className="checkout-product-info">
              <div className="checkout-product-name">{productDetails}</div>
              <div className="checkout-product-type">Product</div>
              <div className="checkout-product-price">{formatRupiah(fullAmount)}</div>
            </div>
          </div>

          <div className="checkout-promo-label">Kode Promo</div>
          <div className="checkout-promo-row">
            <input className="checkout-promo-input" placeholder="Masukkan kode..." />
            <button className="checkout-promo-btn" type="button">Gunakan</button>
          </div>

          {statusValue === "SUCCESS" ? (
            <div className="mt-4 rounded-xl bg-green-50 border border-green-200 px-3 py-3 text-center text-sm font-semibold text-green-700">
              Pembayaran sudah diverifikasi. Akses sudah aktif.
            </div>
          ) : expired ? (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700">
              Order sudah kedaluwarsa. Buat order baru jika belum membayar.
            </div>
          ) : statusValue === "FAILED" ? (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700">
              Pembayaran ditandai gagal atau dibatalkan.
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              <Icon.Clock className="w-4 h-4 text-ink/50" />
              <span className="text-ink/70">
                Konfirmasi dalam <strong className="tnum">{formatCountdown(countdown)}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="checkout-modal-sidebar">
          <div className="checkout-modal-sidebar-header">
            <h3>Ringkasan Pembayaran</h3>
          </div>

          <div className="checkout-summary-row">
            <span className="label">Harga Item</span>
            <span className="value">{formatRupiah(baseAmount || fullAmount)}</span>
          </div>
          {uniqueCode ? (
            <div className="checkout-summary-row">
              <span className="label">Kode Unik</span>
              <span className="value">{formatRupiah(uniqueCode)}</span>
            </div>
          ) : null}
          <hr className="checkout-summary-divider" />
          <div className="checkout-summary-total">
            <span className="label">Total Bayar</span>
            <span className="value">{formatRupiah(fullAmount)}</span>
          </div>

          {statusValue === "SUCCESS" ? (
            <button className="checkout-pay-btn" onClick={() => setRoute(isTryout ? "tryout" : "belajar")} type="button">
              {isTryout ? "Ke Halaman Tryout" : "Mulai Belajar"} <Icon.Arrow className="w-5 h-5" />
            </button>
          ) : (
            <div className="manual-action-btns">
              <button className="manual-copy-btn" onClick={() => copyValue(fullAmount, "amount")} type="button">
                <Icon.Copy className="w-4 h-4" /> {copied === "amount" ? "Nominal Disalin" : "Salin Nominal"}
              </button>
              <button className="manual-copy-btn" onClick={() => copyValue(payment.merchantOrderId, "order")} type="button">
                <Icon.Copy className="w-4 h-4" /> {copied === "order" ? "Order ID Disalin" : "Salin Order ID"}
              </button>
              {whatsappNumber ? (
                <a
                  className="manual-wa-btn"
                  href={`https://wa.me/${whatsappNumber}?text=${waMessage}`}
                  rel="noopener"
                  target="_blank"
                >
                  Chat Admin untuk Konfirmasi
                </a>
              ) : null}
            </div>
          )}
          <div className="checkout-secure-note">Konfirmasi manual via WhatsApp</div>
        </div>
      </div>
    </div>
  );
};

const PaymentQrisView = ({ payment, countdown, status, onCancel, onCheckStatus, checkingStatus, setRoute }) => {
  const statusValue = status?.status || payment.status || "PENDING";
  const expired = isPaymentExpiredStatus(statusValue);
  const productDetails = payment.productDetails || "Pesanan Mafiking";
  const fullAmount = Number(payment.fullAmount || payment.amount || 0);
  const isTryout = !["Trial 7 Hari", "Bulanan", "Semester"].includes(productDetails);
  const { useState } = React;
  const [copied, setCopied] = useState("");

  async function copyAmount() {
    try {
      await navigator.clipboard.writeText(String(fullAmount));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      setCopied(false);
    }
  }

  function downloadQR() {
    if (!payment.qrImageDataUrl) return;
    const link = document.createElement("a");
    link.href = payment.qrImageDataUrl;
    link.download = `qris-mafiking-${payment.merchantOrderId || "payment"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="qris-mobile-page md:hidden">
      <div className="qris-mobile-logo">
        <img src="/assets/logo.png" alt="MAFIKING" />
      </div>
      <div className="qris-mobile-brand">Mafiking</div>

      <div className="qris-order-card">
        <div className="qris-order-header">
          <h4>Order Summary</h4>
          <a href="#" onClick={(e) => { e.preventDefault(); }}>See Details</a>
        </div>
        <div className="qris-order-invoice">Invoice Number: {payment.merchantOrderId || "-"}</div>
        <div className="qris-order-total-label">Total Payment</div>
        <div className="qris-order-total-value">
          IDR {Number(fullAmount).toLocaleString("id-ID")}
          <button onClick={copyAmount} type="button">
            <Icon.Copy className="w-4 h-4" />
          </button>
          {copied && <span className="text-xs text-ink font-semibold">Disalin</span>}
        </div>
      </div>

      <div className="qris-scan-section">
        <div className="qris-scan-title">Scan QR Code to Pay</div>
        <div className="qris-code-wrapper">
          <img className="qris-code-logo" src={QRIS_LOGO_SRC} alt="QRIS" />
          <img src={payment.qrImageDataUrl} alt="QRIS pembayaran Mafiking" />
        </div>
        <div className="qris-nmid">NMID: {payment.qrisNmid || "ID" + Date.now()}</div>
        <button className="qris-download-btn" onClick={downloadQR} type="button">Download QR Code</button>
        <button className="qris-check-btn" disabled={checkingStatus} onClick={onCheckStatus} type="button">
          {checkingStatus ? "Checking..." : "Check Payment Status"}
        </button>
      </div>

      <div className="qris-howto">
        <h4>How to pay</h4>
        <ol>
          <li>Scan QR Code or download it first</li>
          <li>Make sure the amount to pay already correct</li>
          <li>After done payment, click "I Have Paid" button to check the payment status</li>
        </ol>
      </div>

      {statusValue === "SUCCESS" ? (
        <div style={{ margin: "0 16px 16px" }}>
          <button className="checkout-pay-btn" onClick={() => setRoute(isTryout ? "tryout" : "belajar")} type="button">
            {isTryout ? "Ke Halaman Tryout" : "Mulai Belajar"} <Icon.Arrow className="w-5 h-5" />
          </button>
        </div>
      ) : null}

      {expired ? (
        <div style={{ margin: "0 16px 16px" }} className="rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700">
          QR sudah kedaluwarsa. Buat pesanan baru jika belum membayar.
        </div>
      ) : statusValue === "FAILED" ? (
        <div style={{ margin: "0 16px 16px" }} className="rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700">
          Pembayaran gagal atau dibatalkan.
        </div>
      ) : (
        <div style={{ margin: "0 16px 16px" }} className="flex items-center justify-center gap-2 text-sm text-ink/60">
          <Icon.Clock className="w-4 h-4 text-ink/50" />
          <span>Bayar dalam <strong className="tnum">{formatCountdown(countdown)}</strong></span>
        </div>
      )}
    </div>
  );
};

const PaymentQrisViewDesktop = ({ payment, countdown, status, onCancel, onCheckStatus, checkingStatus, setRoute }) => {
  const statusValue = status?.status || payment.status || "PENDING";
  const expired = isPaymentExpiredStatus(statusValue);
  const productDetails = payment.productDetails || "Pesanan Mafiking";
  const fullAmount = Number(payment.fullAmount || payment.amount || 0);
  const baseAmount = Number(payment.baseAmount || 0);
  const uniqueCode = Number(payment.suffix || 0);
  const isTryout = !["Trial 7 Hari", "Bulanan", "Semester"].includes(productDetails);
  const { useState } = React;
  const [copied, setCopied] = useState("");

  async function copyAmount() {
    try {
      await navigator.clipboard.writeText(String(fullAmount));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      setCopied(false);
    }
  }

  function downloadQR() {
    if (!payment.qrImageDataUrl) return;
    const link = document.createElement("a");
    link.href = payment.qrImageDataUrl;
    link.download = `qris-mafiking-${payment.merchantOrderId || "payment"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="hidden md:block">
    <div className="checkout-modal-backdrop" onClick={onCancel}>
      <div className="checkout-modal qris-desktop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-modal-main">
          <div className="qris-desktop-header">
            <div className="flex items-center gap-3">
              <img src={QRIS_LOGO_SRC} alt="QRIS" className="h-8 w-auto shrink-0" />
              <div>
                <h2>Scan QRIS</h2>
                <p>Selesaikan pembayaran dengan nominal yang tertera.</p>
              </div>
            </div>
            <button className="checkout-modal-close" onClick={onCancel} type="button">
              <Icon.X className="w-5 h-5" />
            </button>
          </div>

          <div className="qris-desktop-qr">
            <img className="qris-code-logo" src={QRIS_LOGO_SRC} alt="QRIS" />
            <img className="qris-payment-code" src={payment.qrImageDataUrl} alt="QRIS pembayaran Mafiking" />
          </div>

          {statusValue === "SUCCESS" ? (
            <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-3 text-center text-sm font-semibold text-green-700 w-full">
              Pembayaran berhasil. Akses sudah aktif.
            </div>
          ) : expired ? (
            <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700 w-full">
              QR sudah kedaluwarsa. Buat pesanan baru jika belum membayar.
            </div>
          ) : statusValue === "FAILED" ? (
            <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700 w-full">
              Pembayaran gagal atau dibatalkan.
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-ink/60">
              <Icon.Clock className="w-4 h-4 text-ink/50" />
              <span>Bayar dalam <strong className="tnum">{formatCountdown(countdown)}</strong></span>
            </div>
          )}

          <div className="qris-desktop-detail">
            <h4>Detail Pesanan</h4>
            <div className="qris-desktop-detail-row">
              <span className="label">Paket</span>
              <span className="value">{productDetails}</span>
            </div>
            <div className="qris-desktop-detail-row">
              <span className="label">Order ID</span>
              <span className="value" style={{ fontFamily: "monospace", fontSize: 12 }}>{payment.merchantOrderId}</span>
            </div>
            <div className="qris-desktop-detail-row">
              <span className="label">Status</span>
              <span className="value">{statusValue}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button className="manual-copy-btn" style={{ flex: 1 }} onClick={copyAmount} type="button">
              <Icon.Copy className="w-4 h-4" /> {copied ? "Nominal Disalin" : "Salin Nominal"}
            </button>
            <button className="manual-copy-btn" style={{ flex: 1 }} onClick={downloadQR} type="button">
              <Icon.Download className="w-4 h-4" /> Download QR
            </button>
          </div>
        </div>

        <div className="checkout-modal-sidebar">
          <div className="checkout-modal-sidebar-header">
            <h3>Ringkasan Pembayaran</h3>
          </div>

          <div className="checkout-summary-row">
            <span className="label">Harga Item</span>
            <span className="value">{formatRupiah(baseAmount || fullAmount)}</span>
          </div>
          {uniqueCode ? (
            <div className="checkout-summary-row">
              <span className="label">Kode Unik</span>
              <span className="value">{formatRupiah(uniqueCode)}</span>
            </div>
          ) : null}
          <hr className="checkout-summary-divider" />
          <div className="checkout-summary-total">
            <span className="label">Total Bayar</span>
            <span className="value">{formatRupiah(fullAmount)}</span>
          </div>

          <button
            className="checkout-pay-btn"
            disabled={statusValue !== "SUCCESS" && checkingStatus}
            onClick={statusValue === "SUCCESS" ? () => setRoute(isTryout ? "tryout" : "belajar") : onCheckStatus}
            type="button"
          >
            {statusValue === "SUCCESS" ? (
              <>
                {isTryout ? "Ke Halaman Tryout" : "Mulai Belajar"} <Icon.Arrow className="w-5 h-5" />
              </>
            ) : (
              <>
                <Icon.Refresh className="w-5 h-5" /> {checkingStatus ? "Mengecek..." : "Cek Status Pembayaran"}
              </>
            )}
          </button>
          <div className="checkout-secure-note">Pembayaran aman melalui QRIS</div>
        </div>
      </div>
    </div>
    </div>
  );
};

const PaymentStatus = ({ merchantOrderId, setRoute }) => {
  const { useState, useEffect } = React;
  const [status, setStatus] = useState("pending");
  const [attempts, setAttempts] = useState(0);
  const [payment, setPayment] = useState({ merchantOrderId });
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);

  function leaveStatus(nextRoute) {
    window.history.replaceState(null, "", window.location.pathname);
    setRoute(nextRoute);
  }

  async function refreshVisibleStatus() {
    if (checkingStatus) return;
    setCheckingStatus(true);
    try {
      const res = await MafikingAPI.get(`/api/payment/status/${merchantOrderId}`);
      setPayment(res);
      if (res.expiresAt) setCountdown(remainingPaymentSeconds(res.expiresAt));
      if (res.status === "SUCCESS") setStatus("success");
      else if (res.status === "PENDING") setStatus("pending");
      else setStatus("failed");
    } catch (err) {
      setErrorMessage(err.message || "Status pembayaran belum bisa dicek.");
      setStatus("error");
    } finally {
      setCheckingStatus(false);
    }
  }

  useEffect(() => {
    let timer = null;
    let cancelled = false;
    let nextAttempts = 0;

    function check() {
      MafikingAPI.get(`/api/payment/status/${merchantOrderId}`)
        .then((res) => {
          if (cancelled) return;
          setPayment(res);
          if (res.expiresAt) setCountdown(remainingPaymentSeconds(res.expiresAt));
          if (res.status === "SUCCESS") {
            setStatus("success");
          } else if (res.status === "PENDING") {
            nextAttempts += 1;
            setAttempts(nextAttempts);
            setStatus("pending");
            if (nextAttempts < 12) timer = setTimeout(check, 5000);
          } else {
            setStatus("failed");
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setErrorMessage(err.message || "Status pembayaran belum bisa dicek.");
          setStatus("error");
        });
    }

    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [merchantOrderId]);

  useEffect(() => {
    if (!payment.expiresAt) return undefined;
    setCountdown(remainingPaymentSeconds(payment.expiresAt));
    const timer = window.setInterval(() => {
      setCountdown(remainingPaymentSeconds(payment.expiresAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [payment.expiresAt]);

  const productDetails = payment.productDetails || "Pesanan Mafiking";
  const amount = payment.amount ? formatRupiah(payment.amount) : "";
  const isTryout = !["Trial 7 Hari", "Bulanan", "Semester"].includes(productDetails);

  if (status === "pending") {
    if (payment.provider === "manual") {
      return renderPaymentOverlay(
        <PaymentManualView
          adminWhatsapp={payment.adminWhatsapp}
          checkingStatus={checkingStatus}
          countdown={countdown}
          onCancel={() => leaveStatus(isTryout ? "tryout" : "belajar")}
          onCheckStatus={refreshVisibleStatus}
          payment={payment}
          setRoute={setRoute}
          status={payment}
        />
      );
    }
    if (payment.qrImageDataUrl) {
      return renderPaymentOverlay(
        <>
          <PaymentQrisView
            countdown={countdown}
            checkingStatus={checkingStatus}
            onCancel={() => leaveStatus(isTryout ? "tryout" : "belajar")}
            onCheckStatus={refreshVisibleStatus}
            payment={payment}
            setRoute={setRoute}
            status={payment}
          />
          <PaymentQrisViewDesktop
            countdown={countdown}
            checkingStatus={checkingStatus}
            onCancel={() => leaveStatus(isTryout ? "tryout" : "belajar")}
            onCheckStatus={refreshVisibleStatus}
            payment={payment}
            setRoute={setRoute}
            status={payment}
          />
        </>
      );
    }
    return (
      <PaymentStatusShell tone="pending" icon={<Icon.Clock className="w-6 h-6 text-ink" />}>
        <h2 className="font-display font-bold text-2xl mb-2">Menunggu Pembayaran</h2>
        <p className="text-ink/60 text-sm mb-5">Selesaikan pembayaran. Halaman ini mengecek status otomatis.</p>
        <StatusDetail productDetails={productDetails} amount={amount} merchantOrderId={merchantOrderId} />
        <div className="flex items-center justify-center gap-2 text-xs text-ink/55 mt-5">
          <Icon.Sparkles className="w-3 h-3 animate-spin" />
          Memeriksa status, percobaan {attempts || 1}/12
        </div>
      </PaymentStatusShell>
    );
  }

  if (status === "success") {
    return (
      <PaymentStatusShell tone="success" icon={<Icon.CheckCircle className="w-6 h-6 text-ink" />}>
        <h2 className="font-display font-bold text-2xl mb-2">Pembayaran Berhasil</h2>
        <p className="text-ink/60 text-sm mb-5">Akses sudah aktif untuk pesanan ini.</p>
        <StatusDetail productDetails={productDetails} amount={amount} merchantOrderId={merchantOrderId} />
        <button className="payment-success-button group mt-6" onClick={() => leaveStatus(isTryout ? "tryout" : "belajar")} type="button">
          {isTryout ? "Ke Halaman Tryout" : "Mulai Belajar"} <Icon.Arrow className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </PaymentStatusShell>
    );
  }

  const title = status === "timeout" ? "Status Belum Terkonfirmasi" : status === "error" ? "Status Tidak Terbaca" : "Pembayaran Gagal";
  const message = status === "timeout"
    ? "Kalau dana sudah terpotong, simpan Order ID dan hubungi admin."
    : status === "error"
      ? errorMessage
      : "Pembayaran tidak berhasil atau sudah kedaluwarsa.";

  return (
    <PaymentStatusShell tone="failed" icon={<Icon.Target className="w-6 h-6 text-red-500" />}>
      <h2 className="font-display font-bold text-2xl mb-2">{title}</h2>
      <p className="text-ink/60 text-sm mb-5">{message}</p>
      <StatusDetail productDetails={productDetails} amount={amount} merchantOrderId={merchantOrderId} />
      <div className="grid gap-3 mt-6">
        <button className="btn-ink w-full justify-center" onClick={refreshVisibleStatus} type="button">
          Cek Ulang Status <Icon.Arrow />
        </button>
        <button className="btn-ghost w-full justify-center" onClick={() => leaveStatus("tryout")} type="button">
          Kembali ke Tryout
        </button>
      </div>
    </PaymentStatusShell>
  );
};

const PaymentStatusShell = ({ tone, icon, children }) => {
  const toneClass = {
    pending: "bg-yel/40",
    success: "bg-yel/40",
    failed: "bg-red-50",
  }[tone] || "bg-yel/40";

  return (
    <div className="bg-paper min-h-screen flex items-center justify-center animate-fade-in px-6 py-12">
      <div className="card pad-d text-center max-w-md w-full mx-auto shadow-xl">
        <div className={`w-12 h-12 rounded-full ${toneClass} flex items-center justify-center mx-auto mb-4`}>
          {icon}
        </div>
        {children}
      </div>
    </div>
  );
};

const StatusDetail = ({ productDetails, amount, merchantOrderId }) => (
  <div className="rounded-2xl border hairline bg-ink/[0.025] p-4 text-left text-sm space-y-3">
    <div className="flex justify-between gap-4">
      <span className="text-ink/50">Paket</span>
      <span className="font-semibold text-right">{productDetails}</span>
    </div>
    {amount ? (
      <div className="flex justify-between gap-4">
        <span className="text-ink/50">Total</span>
        <span className="font-semibold tnum">{amount}</span>
      </div>
    ) : null}
    <div className="flex justify-between gap-4">
      <span className="text-ink/50">Order ID</span>
      <span className="font-mono text-xs text-right break-all">{merchantOrderId}</span>
    </div>
  </div>
);

window.Payment = Payment;
window.PaymentCheckoutModal = PaymentCheckoutModal;
