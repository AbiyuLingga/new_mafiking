// User-owned invoice history and printable invoice view.

const INVOICE_STATUS_META = {
  PENDING: {
    label: "Menunggu Pembayaran",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  SUCCESS: {
    label: "Transaksi Selesai",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
  },
  FAILED: {
    label: "Pembayaran Gagal",
    badge: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
  },
  EXPIRED: {
    label: "Invoice Kedaluwarsa",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  },
};

function invoiceStatusMeta(status) {
  return INVOICE_STATUS_META[String(status || "").toUpperCase()] || {
    label: String(status || "Status tidak diketahui"),
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  };
}

function formatInvoiceAmount(value) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function formatInvoiceDate(value, withTime = true) {
  if (!value) return "-";
  const normalized = String(value).includes("T") ? String(value) : `${String(value).replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

const Invoices = ({ setRoute }) => {
  const [invoices, setInvoices] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [printableInvoice, setPrintableInvoice] = React.useState(null);

  const loadInvoices = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const rows = await MafikingAPI.get("/api/payment/invoices");
      setInvoices(Array.isArray(rows) ? rows : []);
    } catch (caught) {
      setError(caught.message || "Gagal mengambil riwayat pembelian.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadInvoices(false);
  }, [loadInvoices]);

  React.useEffect(() => {
    const clearPrintableInvoice = () => setPrintableInvoice(null);
    window.addEventListener("afterprint", clearPrintableInvoice);
    return () => window.removeEventListener("afterprint", clearPrintableInvoice);
  }, []);

  function openPaymentStatus(invoice) {
    setRoute({
      route: "payment",
      merchantOrderId: invoice.merchantOrderId,
    });
  }

  function printInvoice(invoice) {
    setPrintableInvoice(invoice);
    window.setTimeout(() => window.print(), 80);
  }

  return (
    <div className="app-page-bg app-page-bg--profil min-h-[calc(100vh-72px)] px-4 py-8 sm:px-6 md:py-12">
      <div className="invoice-screen-only mx-auto w-full max-w-4xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => setRoute("profile")}
              className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-ink/55 transition hover:text-ink"
              type="button"
            >
              <Icon.ChevL className="h-4 w-4" />
              Kembali ke Profil
            </button>
            <p className="kicker mb-2">Akun & Pembayaran</p>
            <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
              Riwayat Pembelian
            </h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-ink/50">
              Pantau status pembayaran dan cetak invoice transaksi akunmu.
            </p>
          </div>
          <button
            onClick={() => loadInvoices(true)}
            disabled={refreshing}
            className="btn-ghost !h-11 !w-11 !p-0"
            aria-label="Perbarui riwayat pembelian"
            title="Perbarui"
            type="button"
          >
            <Icon.Refresh className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4" aria-label="Memuat invoice" aria-busy="true">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-52 rounded-3xl" />)}
          </div>
        ) : invoices.length ? (
          <div className="grid gap-5">
            {invoices.map((invoice) => {
              const status = invoiceStatusMeta(invoice.status);
              const isPending = String(invoice.status).toUpperCase() === "PENDING";
              return (
                <article key={invoice.merchantOrderId} className="overflow-hidden rounded-3xl border hairline bg-white shadow-sm">
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                    <div className="min-w-0">
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${status.badge}`}>
                        <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      <h2 className="mt-4 break-words font-display text-xl font-bold text-ink">
                        {invoice.productDetails || "Pembelian Mafiking"}
                      </h2>
                      <p className="mt-2 break-all font-mono text-xs font-semibold text-ink/45">
                        {invoice.merchantOrderId}
                      </p>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <p className="text-xs font-bold uppercase tracking-wider text-ink/35">Total Pembelian</p>
                      <p className="mt-1 font-display text-2xl font-bold text-ink">
                        {formatInvoiceAmount(invoice.fullAmount || invoice.amount)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 border-t hairline bg-ink/[0.015] px-5 py-4 text-sm sm:grid-cols-3 sm:px-6">
                    <InvoiceMeta label="Dibuat" value={formatInvoiceDate(invoice.createdAt)} />
                    <InvoiceMeta label="Metode" value={String(invoice.provider || "-").toUpperCase()} />
                    <InvoiceMeta
                      label={invoice.paidAt ? "Dibayar" : "Batas pembayaran"}
                      value={formatInvoiceDate(invoice.paidAt || invoice.expiresAt)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 border-t hairline px-5 py-4 sm:px-6">
                    <button onClick={() => printInvoice(invoice)} className="btn-ghost !py-2.5 !px-4 text-sm" type="button">
                      <Icon.Download className="h-4 w-4" />
                      Cetak Invoice
                    </button>
                    {isPending && (
                      <button onClick={() => openPaymentStatus(invoice)} className="btn-ink !py-2.5 !px-4 text-sm" type="button">
                        Lanjut Bayar
                        <Icon.Arrow className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-ink/15 bg-white/80 px-6 py-16 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yel/60">
              <Icon.Card className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold">Belum ada invoice</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-relaxed text-ink/50">
              Riwayat pembelian akan muncul di sini setelah kamu membuat transaksi.
            </p>
          </div>
        )}
      </div>

      {printableInvoice && <PrintableInvoice invoice={printableInvoice} />}
    </div>
  );
};

const InvoiceMeta = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-ink/35">{label}</p>
    <p className="mt-1 break-words font-semibold text-ink/70">{value || "-"}</p>
  </div>
);

const PrintableInvoice = ({ invoice }) => {
  const status = invoiceStatusMeta(invoice.status);
  return (
    <section className="invoice-print-sheet">
      <div className="invoice-print-brand">
        <Logo size={34} />
        <span>INVOICE</span>
      </div>
      <div className="invoice-print-head">
        <div>
          <p>Nomor invoice</p>
          <h1>{invoice.merchantOrderId}</h1>
        </div>
        <strong>{status.label}</strong>
      </div>
      <div className="invoice-print-product">
        <span>Produk</span>
        <strong>{invoice.productDetails || "Pembelian Mafiking"}</strong>
      </div>
      <dl className="invoice-print-details">
        <div><dt>Tanggal dibuat</dt><dd>{formatInvoiceDate(invoice.createdAt)}</dd></div>
        <div><dt>Metode pembayaran</dt><dd>{String(invoice.provider || "-").toUpperCase()}</dd></div>
        <div><dt>Tanggal dibayar</dt><dd>{formatInvoiceDate(invoice.paidAt)}</dd></div>
        <div><dt>Total</dt><dd>{formatInvoiceAmount(invoice.fullAmount || invoice.amount)}</dd></div>
      </dl>
      <p className="invoice-print-note">Invoice ini dibuat dari riwayat transaksi akun Mafiking.</p>
    </section>
  );
};

