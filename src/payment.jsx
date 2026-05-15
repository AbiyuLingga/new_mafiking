// MAFIKING Payment — pilih paket, redirect ke Duitku, tampilkan status

const PAKET_LIST = [
  { id: "trial", label: "Trial 7 Hari", price: 29000, desc: "Akses semua modul + 7 hari koreksi AI tidak terbatas." },
  { id: "bulanan", label: "Bulanan", price: 99000, desc: "Akses penuh selama 30 hari + leaderboard premium." },
  { id: "semester", label: "Semester", price: 249000, desc: "Hemat 50% — akses 6 bulan + sesi tanya mentor." },
];

// ─── Payment page ─────────────────────────────────────────────────────────
const Payment = ({ setRoute, currentUser }) => {
  const { useState } = React;
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const params = new URLSearchParams(window.location.search);
  const merchantOrderId = params.get("merchantOrderId");

  if (merchantOrderId) {
    return <PaymentStatus merchantOrderId={merchantOrderId} setRoute={setRoute} />;
  }

  async function handleBeli() {
    if (!selected) return;
    const paket = PAKET_LIST.find((p) => p.id === selected);
    if (!paket) return;
    setLoading(true);
    setError("");
    try {
      const res = await MafikingAPI.post("/api/payment/create", {
        amount: paket.price,
        productDetails: paket.label,
        email: currentUser?.username || "mahasiswa@itb.ac.id",
        name: currentUser?.display_name || "Mahasiswa",
      });
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        setError("Tidak mendapatkan URL pembayaran dari server.");
      }
    } catch (err) {
      setError(err.message || "Gagal membuat pembayaran. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-paper min-h-screen">
      <section>
        <div className="max-w-2xl mx-auto px-6 md:px-8 pt-12 pb-20">
          <button className="mafiking-back-button mb-8" onClick={() => setRoute("lobby")} type="button">
            <Icon.ChevL className="w-4 h-4" />
            Kembali
          </button>

          <div className="kicker mb-2">Pilih Paket</div>
          <h1 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.03em] leading-[1.05] mb-8">
            Mulai belajar lebih serius.
          </h1>

          <div className="grid gap-3 mb-8">
            {PAKET_LIST.map((paket) => {
              const active = selected === paket.id;
              return (
                <button
                  aria-pressed={active}
                  className={`card pad-d text-left transition-all ${active ? "ring-2 ring-ink" : ""}`}
                  key={paket.id}
                  onClick={() => setSelected(paket.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-lg">{paket.label}</div>
                      <div className="text-ink/60 text-sm mt-1">{paket.desc}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-display font-bold text-xl tnum">
                        Rp {paket.price.toLocaleString("id-ID")}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="mafiking-error-box mb-4">
              <Icon.Target className="w-4 h-4" />
              {error}
            </div>
          ) : null}

          <button
            className="mafiking-primary-button w-full justify-center"
            disabled={!selected || loading}
            onClick={handleBeli}
            type="button"
          >
            {loading ? "Memproses..." : "Bayar Sekarang"} {!loading && <Icon.Arrow className="w-4 h-4" />}
          </button>

          <p className="text-center text-xs text-ink/55 mt-4">
            Pembayaran aman via Duitku (QRIS, transfer bank). Sandbox mode aktif.
          </p>
        </div>
      </section>
    </div>
  );
};

// ─── Payment status (setelah redirect dari Duitku) ────────────────────────
const PaymentStatus = ({ merchantOrderId, setRoute }) => {
  const { useState, useEffect } = React;
  const [status, setStatus] = useState("pending");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let timer = null;
    function check() {
      MafikingAPI.get(`/api/payment/status/${merchantOrderId}`)
        .then((res) => {
          if (res.statusCode === "00") {
            setStatus("success");
          } else if (res.statusCode === "01") {
            setStatus("pending");
            setAttempts((a) => a + 1);
            if (attempts < 12) timer = setTimeout(check, 5000);
            else setStatus("timeout");
          } else {
            setStatus("failed");
          }
        })
        .catch(() => {
          setStatus("error");
        });
    }
    check();
    return () => clearTimeout(timer);
  }, [merchantOrderId]);

  if (status === "pending") {
    return (
      <div className="bg-paper min-h-screen flex items-center justify-center">
        <div className="card pad-d text-center max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-full bg-yel/40 flex items-center justify-center mx-auto mb-4">
            <Icon.Clock className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-2xl mb-2">Menunggu Pembayaran</h2>
          <p className="text-ink/60 text-sm mb-4">Selesaikan pembayaran di aplikasi atau ATM. Halaman ini akan otomatis diperbarui.</p>
          <div className="flex items-center justify-center gap-2 text-xs text-ink/55">
            <Icon.Sparkles className="w-3 h-3" />
            Memeriksa status...
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="bg-paper min-h-screen flex items-center justify-center">
        <div className="card pad-d text-center max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Icon.CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="font-display font-bold text-2xl mb-2">Pembayaran Berhasil!</h2>
          <p className="text-ink/60 text-sm mb-6">Akses premium kamu sudah aktif. Selamat belajar!</p>
          <button className="btn-ink w-full justify-center" onClick={() => setRoute("belajar")} type="button">
            Mulai Belajar <Icon.Arrow />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-paper min-h-screen flex items-center justify-center">
      <div className="card pad-d text-center max-w-sm mx-auto">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Icon.Target className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="font-display font-bold text-2xl mb-2">
          {status === "timeout" ? "Waktu Habis" : "Pembayaran Gagal"}
        </h2>
        <p className="text-ink/60 text-sm mb-6">
          {status === "timeout"
            ? "Status tidak dapat dikonfirmasi. Hubungi dukungan jika dana sudah terpotong."
            : "Pembayaran tidak berhasil atau kadaluarsa."}
        </p>
        <button className="btn-ink w-full justify-center" onClick={() => setRoute("payment")} type="button">
          Coba Lagi <Icon.Arrow />
        </button>
      </div>
    </div>
  );
};

window.Payment = Payment;
