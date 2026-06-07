// MAFIKING Payment - checkout package, redirect to Duitku, show status.

const PAKET_LIST = [
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
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

const Payment = ({ setRoute, currentUser, context }) => {
  const { useState, useEffect, useMemo, useRef } = React;
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const [selected, setSelected] = useState("bulanan");
  const [loading, setLoading] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [errors, setErrors] = useState({});
  const [qrData, setQrData] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null);
  const [countdown, setCountdown] = useState(0);

  const isGuestUser = (user) => {
    const displayName = user?.display_name || "";
    const username = user?.username || "";
    return displayName.startsWith("Tamu_") || username.startsWith("Tamu_");
  };

  const getInitialEmail = () => {
    const username = currentUser?.username || "";
    if (isGuestUser(currentUser)) return "";
    if (username.includes("@")) return username;
    return username ? `${username}@mafiking.com` : "";
  };

  const getInitialName = () => {
    if (isGuestUser(currentUser)) return "";
    return currentUser?.display_name || "";
  };

  const [email, setEmail] = useState(getInitialEmail);
  const [name, setName] = useState(getInitialName);

  useEffect(() => {
    setEmail(getInitialEmail());
    setName(getInitialName());
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    MafikingAPI.get("/api/payment/config")
      .then((config) => { if (!cancelled) setGatewayConfig(config); })
      .catch(() => {
        if (!cancelled) {
          setGatewayConfig({
            active: false,
            message: "Status payment gateway belum bisa dicek. Coba lagi sebentar atau hubungi admin.",
          });
        }
      });
    return () => { cancelled = true; };
  }, []);

  const params = new URLSearchParams(window.location.search);
  const merchantOrderId = params.get("merchantOrderId");

  const isTryoutCheckout = context && context.type === "tryout" && context.package;
  const currentPkg = isTryoutCheckout ? context.package : null;
  const selectedPackage = useMemo(() => {
    if (isTryoutCheckout) {
      return {
        id: currentPkg.id,
        label: currentPkg.title,
        price: parsePrice(currentPkg.price),
        desc: currentPkg.description,
        access: currentPkg.duration,
      };
    }
    return PAKET_LIST.find((paket) => paket.id === selected) || null;
  }, [isTryoutCheckout, currentPkg, selected]);

  const gatewayReady = gatewayConfig ? Boolean(gatewayConfig.active) : false;
  const canPay = Boolean(selectedPackage) && !loading && gatewayReady;

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
    let cancelled = false;
    let timer = null;

    function schedule() {
      timer = window.setTimeout(check, 5000);
    }

    function check() {
      MafikingAPI.get(`/api/payment/status/${qrData.merchantOrderId}`)
        .then((res) => {
          if (cancelled) return;
          setPollingStatus(res);
          if (res.status === "PENDING") schedule();
        })
        .catch((err) => {
          if (cancelled) return;
          setPollingStatus({ status: "ERROR", error: err.message || "Status pembayaran belum terbaca." });
          schedule();
        });
    }

    check();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [qrData?.merchantOrderId]);

  if (qrData) {
    return (
      <PaymentQrisView
        adminWhatsapp={qrData.adminWhatsapp || gatewayConfig?.qrisAdminWhatsapp}
        countdown={countdown}
        onCancel={() => {
          setQrData(null);
          setPollingStatus(null);
          window.history.replaceState(null, "", "/payment");
        }}
        payment={qrData}
        setRoute={setRoute}
        status={pollingStatus}
      />
    );
  }

  if (merchantOrderId) {
    return <PaymentStatus merchantOrderId={merchantOrderId} setRoute={setRoute} />;
  }

  function validateForm() {
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = "Isi nama lengkap pembeli.";
    if (!isValidEmail(email)) nextErrors.email = "Masukkan email aktif untuk invoice dan akses.";
    if (!selectedPackage) nextErrors.form = "Pilih paket sebelum lanjut bayar.";
    setErrors(nextErrors);

    if (nextErrors.name) nameRef.current?.focus();
    else if (nextErrors.email) emailRef.current?.focus();
    return Object.keys(nextErrors).length === 0;
  }

  async function handleBeli() {
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});
    try {
      const payload = isTryoutCheckout
        ? {
            purchaseType: "tryout",
            tryoutPackageId: currentPkg.id,
            email: email.trim(),
            name: name.trim(),
          }
        : {
            purchaseType: "subscription",
            packageId: selectedPackage.id,
            email: email.trim(),
            name: name.trim(),
          };

      const res = await MafikingAPI.post("/api/payment/create", payload);
      if (res.qrImageDataUrl) {
        setQrData(res);
        setPollingStatus({ status: "PENDING", ...res });
        setCountdown(remainingPaymentSeconds(res.expiresAt));
        window.history.replaceState({ route: "payment" }, "", `/payment?merchantOrderId=${encodeURIComponent(res.merchantOrderId)}`);
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

  return (
    <div className="bg-paper min-h-screen pb-28 md:pb-0">
      <section>
        <div className="max-w-2xl mx-auto px-6 md:px-8 pt-12 pb-20">
          <button className="mafiking-back-button mb-8 animate-fade-in" onClick={() => setRoute(isTryoutCheckout ? "tryout" : "lobby")} type="button">
            <Icon.ChevL className="w-4 h-4" />
            Kembali
          </button>

          <div className="animate-fade-in">
            <div className="kicker mb-2">{isTryoutCheckout ? "Checkout Tryout" : "Pilih Paket"}</div>
            <h1 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.03em] leading-[1.05] mb-3">
              {isTryoutCheckout ? "Konfirmasi pembelian." : "Mulai belajar lebih serius."}
            </h1>
            <p className="text-sm md:text-base text-ink/60 leading-relaxed mb-8 max-w-xl">
              Cek paket, isi kontak pembelian, lalu lanjut ke payment gateway untuk QRIS atau transfer bank.
            </p>
            <PaymentGatewayNotice config={gatewayConfig} />

            {isTryoutCheckout ? (
              <div className="card pad-d bg-white border hairline rounded-3xl p-6 mb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-yel/10 rounded-bl-full flex items-center justify-center pointer-events-none">
                  <Icon.Trophy className="w-6 h-6 text-ink/40 translate-x-3 -translate-y-3" />
                </div>
                <div className="relative z-10">
                  <span className="tag-yel tag mb-3">Premium Tryout</span>
                  <h3 className="font-display font-bold text-2xl tracking-[-0.02em] mt-2 text-ink">
                    {currentPkg.title}
                  </h3>
                  <p className="text-ink/65 text-sm mt-2 leading-relaxed">
                    {currentPkg.description}
                  </p>

                  <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t hairline">
                    <div>
                      <div className="text-xs text-ink/50">Durasi</div>
                      <div className="font-display font-bold text-lg">{currentPkg.duration}</div>
                    </div>
                    <div>
                      <div className="text-xs text-ink/50">Jumlah Soal</div>
                      <div className="font-display font-bold text-lg tnum">{currentPkg.questions} Soal</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 mb-6" role="radiogroup" aria-label="Pilih paket langganan">
                {PAKET_LIST.map((paket) => {
                  const active = selected === paket.id;
                  return (
                    <button
                      aria-checked={active}
                      className={`card pad-d text-left transition-all ${active ? "ring-2 ring-ink" : "hover:border-ink/25"}`}
                      key={paket.id}
                      onClick={() => {
                        setSelected(paket.id);
                        if (errors.form) setErrors((prev) => Object.assign({}, prev, { form: "" }));
                      }}
                      role="radio"
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-display font-bold text-lg">{paket.label}</div>
                            {active ? <span className="tag tag-yel !text-[10px] !py-0.5">Dipilih</span> : null}
                          </div>
                          <div className="text-ink/60 text-sm mt-1">{paket.desc}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-display font-bold text-xl tnum">
                            {formatRupiah(paket.price)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="card pad-d bg-white border hairline rounded-3xl p-6 mb-6">
              <h3 className="font-display font-bold text-lg mb-4">Informasi Kontak</h3>
              <div className="space-y-4">
                <div>
                  <label className="admin-field-label block mb-1.5" htmlFor="payment-name">Nama lengkap</label>
                  <input
                    aria-describedby={errors.name ? "payment-name-error" : undefined}
                    aria-invalid={errors.name ? "true" : "false"}
                    autoComplete="name"
                    className={`admin-input ${errors.name ? "is-error" : ""}`}
                    id="payment-name"
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors((prev) => Object.assign({}, prev, { name: "" }));
                    }}
                    placeholder="Nama lengkap pembeli"
                    ref={nameRef}
                    type="text"
                    value={name}
                  />
                  {errors.name ? <p className="admin-field-error" id="payment-name-error">{errors.name}</p> : null}
                </div>
                <div>
                  <label className="admin-field-label block mb-1.5" htmlFor="payment-email">Email pembelian</label>
                  <input
                    aria-describedby={errors.email ? "payment-email-error" : "payment-email-help"}
                    aria-invalid={errors.email ? "true" : "false"}
                    autoComplete="email"
                    className={`admin-input ${errors.email ? "is-error" : ""}`}
                    id="payment-email"
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => Object.assign({}, prev, { email: "" }));
                    }}
                    placeholder="nama@email.com"
                    ref={emailRef}
                    type="email"
                    value={email}
                  />
                  {errors.email ? (
                    <p className="admin-field-error" id="payment-email-error">{errors.email}</p>
                  ) : (
                    <p className="text-[11px] text-ink/45 mt-1.5" id="payment-email-help">Invoice dan instruksi akses dikirim ke email ini.</p>
                  )}
                </div>
              </div>
            </div>

            <OrderSummary selectedPackage={selectedPackage} isTryoutCheckout={isTryoutCheckout} />
          </div>

          {errors.form ? (
            <div className="mafiking-error-box mb-4" role="alert">
              <Icon.Target className="w-4 h-4" />
              {errors.form}
            </div>
          ) : null}

          <button
            className="mafiking-primary-button w-full justify-center group hidden md:inline-flex"
            disabled={!canPay}
            onClick={handleBeli}
            type="button"
          >
            {loading ? "Memproses..." : gatewayReady ? `Bayar ${selectedPackage ? formatRupiah(selectedPackage.price) : "Sekarang"}` : "Payment belum aktif"}
            {!loading && <Icon.Arrow className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
          </button>

          <TrustNote />
        </div>
      </section>

      <div className="payment-mobile-cta md:hidden">
        <div>
          <div className="text-[11px] text-ink/50">Total</div>
          <div className="font-display font-bold text-lg leading-tight tnum">
            {selectedPackage ? formatRupiah(selectedPackage.price) : "Pilih paket"}
          </div>
        </div>
        <button
          className="mafiking-primary-button justify-center group"
          disabled={!canPay}
          onClick={handleBeli}
          type="button"
        >
          {loading ? "Memproses..." : gatewayReady ? "Bayar" : "Belum aktif"}
          {!loading && <Icon.Arrow className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

const PaymentGatewayNotice = ({ config }) => {
  if (!config) {
    return (
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink/60" aria-busy="true">
        Mengecek kesiapan payment gateway...
      </div>
    );
  }
  if (config.active) {
    const readyText = config.provider === "qris" || config.qrisReady
      ? "QRIS lokal siap digunakan."
      : "Payment gateway siap digunakan.";
    return (
      <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
        {config.mockMode ? "Mode sandbox aktif untuk pengujian pembayaran." : readyText}
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900" role="status">
      {config.message || "Payment gateway sedang dalam proses aktivasi. Pembelian akan dibuka setelah provider aktif."}
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
    <span className="inline-flex items-center gap-1.5"><Icon.CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Diproses via QRIS atau gateway aktif</span>
    <span className="inline-flex items-center gap-1.5"><Icon.CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Akses aktif setelah pembayaran terkonfirmasi</span>
  </div>
);

const PaymentQrisView = ({ payment, countdown, status, adminWhatsapp, onCancel, setRoute }) => {
  const { useState } = React;
  const [copied, setCopied] = useState(false);
  const statusValue = status?.status || payment.status || "PENDING";
  const expired = statusValue === "EXPIRED" || (!["SUCCESS", "FAILED"].includes(statusValue) && countdown === 0);
  const productDetails = payment.productDetails || "Pesanan Mafiking";
  const fullAmount = Number(payment.fullAmount || payment.amount || 0);
  const isTryout = !["Trial 7 Hari", "Bulanan", "Semester"].includes(productDetails);
  const whatsappNumber = String(adminWhatsapp || "").replace(/[^0-9]/g, "");
  const waMessage = encodeURIComponent(
    `Halo admin Mafiking, saya ingin konfirmasi pembayaran ${payment.merchantOrderId} sebesar ${formatRupiah(fullAmount)}.`
  );

  async function copyAmount() {
    try {
      await navigator.clipboard.writeText(String(fullAmount));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      setCopied(false);
    }
  }

  return (
    <div className="bg-paper min-h-screen pb-28 md:pb-0">
      <section>
        <div className="max-w-md mx-auto px-6 md:px-8 pt-12 pb-20">
          <button className="mafiking-back-button mb-8" onClick={onCancel} type="button">
            <Icon.ChevL className="w-4 h-4" />
            Kembali
          </button>

          <div className="text-center mb-6">
            <div className="kicker mb-2">Selesaikan Pembayaran</div>
            <h1 className="font-display font-bold text-2xl tracking-[-0.02em] mb-2">Scan QRIS ini</h1>
            <p className="text-sm text-ink/60 leading-relaxed">
              Gunakan e-wallet atau mobile banking. Pastikan nominalnya sama persis.
            </p>
          </div>

          <div className="card pad-d bg-white border hairline rounded-3xl p-6 mb-6">
            <div className="bg-white p-3 rounded-2xl flex items-center justify-center border border-ink/5">
              <img src={payment.qrImageDataUrl} alt="QRIS pembayaran Mafiking" className="w-full max-w-xs" />
            </div>

            <div className="mt-6 text-center">
              <div className="text-xs text-ink/50 mb-1">Total Bayar</div>
              <div className="font-display font-bold text-3xl tnum text-ink">
                {formatRupiah(fullAmount)}
              </div>
              {payment.baseAmount && payment.suffix ? (
                <div className="text-xs text-ink/50 mt-2">
                  {formatRupiah(payment.baseAmount)} + kode unik {payment.suffix}
                </div>
              ) : null}
            </div>

            {statusValue === "SUCCESS" ? (
              <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-center text-sm font-semibold text-emerald-700">
                Pembayaran berhasil. Akses sudah aktif.
              </div>
            ) : expired ? (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700">
                QR sudah kedaluwarsa. Buat pesanan baru jika belum membayar.
              </div>
            ) : statusValue === "FAILED" ? (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-100 px-3 py-3 text-center text-sm font-semibold text-red-700">
                Pembayaran gagal atau dibatalkan.
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <Icon.Clock className="w-4 h-4 text-ink/50" />
                <span className="text-ink/70">
                  Bayar dalam <strong className="tnum">{formatCountdown(countdown)}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="card bg-white border hairline rounded-3xl p-6 mb-6">
            <h3 className="font-display font-bold text-base mb-3">Detail Pesanan</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-ink/55">Paket</span>
                <span className="font-semibold text-right">{productDetails}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-ink/55">Order ID</span>
                <span className="font-mono text-xs text-right break-all">{payment.merchantOrderId}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-ink/55">Status</span>
                <span className="font-semibold">{statusValue}</span>
              </div>
            </div>
          </div>

          {statusValue === "SUCCESS" ? (
            <button className="btn-ink w-full justify-center group" onClick={() => setRoute(isTryout ? "tryout" : "belajar")} type="button">
              {isTryout ? "Ke Halaman Tryout" : "Mulai Belajar"} <Icon.Arrow className="transition-transform group-hover:translate-x-1" />
            </button>
          ) : (
            <div className="grid gap-3">
              <button className="btn-ghost w-full justify-center" onClick={copyAmount} type="button">
                <Icon.Copy className="w-4 h-4" /> {copied ? "Nominal Disalin" : "Salin Nominal"}
              </button>
              {whatsappNumber ? (
                <a
                  className="btn-ghost w-full justify-center"
                  href={`https://wa.me/${whatsappNumber}?text=${waMessage}`}
                  rel="noopener"
                  target="_blank"
                >
                  Konfirmasi via WhatsApp Admin
                </a>
              ) : null}
            </div>
          )}
        </div>
      </section>
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

  function leaveStatus(nextRoute) {
    window.history.replaceState(null, "", window.location.pathname);
    setRoute(nextRoute);
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
            else setStatus("timeout");
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
    if (payment.qrImageDataUrl) {
      return (
        <PaymentQrisView
          adminWhatsapp={payment.adminWhatsapp}
          countdown={countdown}
          onCancel={() => leaveStatus(isTryout ? "tryout" : "belajar")}
          payment={payment}
          setRoute={setRoute}
          status={payment}
        />
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
      <PaymentStatusShell tone="success" icon={<Icon.CheckCircle className="w-6 h-6 text-emerald-600" />}>
        <h2 className="font-display font-bold text-2xl mb-2">Pembayaran Berhasil</h2>
        <p className="text-ink/60 text-sm mb-5">Akses sudah aktif untuk pesanan ini.</p>
        <StatusDetail productDetails={productDetails} amount={amount} merchantOrderId={merchantOrderId} />
        <button className="btn-ink w-full justify-center group mt-6" onClick={() => leaveStatus(isTryout ? "tryout" : "belajar")} type="button">
          {isTryout ? "Ke Halaman Tryout" : "Mulai Belajar"} <Icon.Arrow className="transition-transform group-hover:translate-x-1" />
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
        <button className="btn-ink w-full justify-center" onClick={() => window.location.reload()} type="button">
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
    success: "bg-emerald-100",
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
