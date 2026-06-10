# Workflow Plan Codex — Static QRIS DANA + Deteksi Mutasi Self-Hosted

> **Status dokumen:** versi aman untuk implementasi internal.
>
> **Tujuan:** membuat payment web self-hosted yang memakai static QRIS DANA sebagai media pembayaran, lalu mendeteksi mutasi masuk secara otomatis melalui adapter terisolasi.
>
> **Batasan penting:** dokumen ini tidak memuat instruksi reverse engineering, bypass OTP/PIN, MITM, pencarian endpoint internal, credential theft, atau modifikasi aplikasi DANA. Modul `UnofficialDanaProvider` hanya berupa adapter untuk sumber data yang sudah sah kamu miliki.

---

## 1. Ringkasan Arsitektur

Karena kamu memakai **static QRIS**, QR yang ditampilkan tidak dibuat per order. Akibatnya, sistem tidak bisa mengandalkan `payment_id` dari QR secara langsung. Solusi paling realistis adalah membuat **payment intent internal** lalu mencocokkan pembayaran masuk berdasarkan:

1. nominal exact,
2. kode unik nominal,
3. waktu pembayaran,
4. status transaksi masuk,
5. deduplikasi mutasi,
6. manual review jika ambigu.

Alur utamanya:

```text
Customer membuat order
  ↓
Backend membuat payment_intent
  ↓
Backend menentukan nominal unik
  ↓
Frontend menampilkan static QRIS DANA + nominal exact + countdown
  ↓
Collector membaca mutasi dari adapter
  ↓
Mutation ingestion menyimpan data mutasi
  ↓
Matcher mencocokkan mutasi dengan payment_intent pending
  ↓
Jika cocok: order PAID
Jika tidak cocok/ambigu: MANUAL_REVIEW
```

---

## 2. Prinsip Desain yang Sudah Dikoreksi Secara Cybersecurity

Bagian ini adalah koreksi utama dari workflow awal.

### 2.1 Jangan membuat core system bergantung langsung pada unofficial API

**Masalah desain awal:**

Jika seluruh payment system langsung memanggil unofficial DANA API, maka saat format response berubah, akun bermasalah, rate limit muncul, atau library unofficial rusak, seluruh sistem payment ikut rusak.

**Koreksi:**

Gunakan adapter interface:

```ts
export interface PaymentMutationProvider {
  fetchLatestMutations(): Promise<NormalizedMutation[]>;
}
```

Core payment hanya menerima `NormalizedMutation`. Adapter unofficial ditempatkan di satu modul atau service terpisah:

```text
Core API
  ↓
PaymentMutationProvider interface
  ↓
UnofficialDanaProvider / MockProvider / ManualUploadProvider
```

Dengan desain ini, core system tetap stabil walaupun adapter diganti.

---

### 2.2 Adapter unofficial harus dianggap sebagai komponen tidak tepercaya

**Masalah desain awal:**

Biasanya orang memasukkan token/session/cookie unofficial langsung ke backend utama. Ini berbahaya karena kalau library unofficial bermasalah atau compromised, database order dan kredensial lain bisa ikut terekspos.

**Koreksi:**

Jalankan adapter unofficial sebagai **isolated worker**:

```text
[Unofficial Collector Container]
  - akses hanya ke endpoint ingestion internal
  - tidak punya akses langsung ke database
  - tidak punya akses ke Redis admin
  - tidak punya akses ke secret backend utama
  - hanya mengirim NormalizedMutation yang sudah ditandatangani HMAC
```

Collector sebaiknya tidak berjalan di container yang sama dengan API utama.

---

### 2.3 Jangan menyimpan PIN, OTP, password, atau full session mentah di source code

**Masalah desain awal:**

`.env` sering dipakai untuk semua hal. Untuk local development masih wajar, tetapi untuk produksi, menyimpan token sensitif di `.env` plaintext di server sangat berisiko.

**Koreksi produksi:**

Gunakan secret manager, minimal salah satu:

- Docker secrets,
- Infisical,
- HashiCorp Vault,
- 1Password Secrets Automation,
- AWS Secrets Manager,
- GCP Secret Manager,
- sealed secret untuk Kubernetes.

Aturan wajib:

```text
- Jangan commit .env.
- Jangan log token/session/cookie.
- Jangan simpan PIN/OTP.
- Jangan hardcode credential di image Docker.
- Gunakan secret scanning di CI.
- Rotasi token jika ada indikasi bocor.
```

Untuk development, gunakan `.env.example`, bukan `.env` asli.

---

### 2.4 Admin endpoint tidak cukup dilindungi `ADMIN_API_KEY`

**Masalah desain awal:**

Endpoint seperti ini terlalu lemah jika hanya memakai satu API key:

```text
POST /admin/orders/:id/mark-paid
POST /admin/mutations/:id/match/:orderId
```

Jika key bocor, attacker bisa menandai order sebagai paid.

**Koreksi:**

Untuk produksi, admin route harus memakai:

```text
- login admin,
- 2FA/TOTP,
- RBAC,
- audit log,
- rate limit,
- IP allowlist atau VPN internal,
- CSRF protection jika berbasis cookie,
- approval dua langkah untuk manual mark-paid bernilai besar.
```

`ADMIN_API_KEY` hanya boleh dipakai untuk development atau internal service-to-service, bukan dashboard admin publik.

---

### 2.5 Raw mutation adalah data sensitif

**Masalah desain awal:**

Menyimpan `rawJson` langsung di database tanpa batasan dapat membocorkan nama pembayar, nomor HP tersamarkan, user ID, waktu transaksi, atau metadata device.

**Koreksi:**

Klasifikasikan data:

| Data | Kategori | Perlakuan |
|---|---|---|
| amount | financial data | boleh ditampilkan terbatas |
| payerName | personal data | mask di UI |
| payerId | unique identifier | encrypt/mask |
| rawJson | sensitive transaction data | encrypt, akses terbatas |
| token/session | secret | jangan masuk database utama |
| audit log | security record | append-only |

Aturan raw mutation:

```text
- Encrypt rawJson at rest.
- Jangan tampilkan rawJson ke admin biasa.
- Mask payerName/payerId di list view.
- Beri fitur reveal dengan alasan audit.
- Simpan maksimal sesuai kebutuhan bisnis, misalnya 30–90 hari.
- Setelah masa retensi, hapus atau anonimisasi.
```

---

## 3. Stack yang Direkomendasikan

```text
Backend      : Node.js + TypeScript + Fastify
Database     : PostgreSQL
ORM          : Prisma
Queue        : BullMQ + Redis
Validation   : Zod
Logging      : Pino
Frontend     : Next.js atau HTML sederhana
Deployment   : Docker Compose
Reverse proxy: Caddy / Nginx / Traefik
Monitoring   : Grafana + Prometheus / Uptime Kuma / Sentry
```

---

## 4. Struktur Folder

```text
payment-web/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ config.ts
│  │  │  ├─ routes/
│  │  │  │  ├─ orders.routes.ts
│  │  │  │  ├─ payments.routes.ts
│  │  │  │  ├─ mutations.routes.ts
│  │  │  │  └─ admin.routes.ts
│  │  │  ├─ services/
│  │  │  │  ├─ paymentIntent.service.ts
│  │  │  │  ├─ mutationIngest.service.ts
│  │  │  │  ├─ mutationMatcher.service.ts
│  │  │  │  ├─ reconciliation.service.ts
│  │  │  │  └─ auditLog.service.ts
│  │  │  ├─ providers/
│  │  │  │  ├─ PaymentMutationProvider.ts
│  │  │  │  ├─ MockMutationProvider.ts
│  │  │  │  └─ UnofficialDanaProvider.ts
│  │  │  ├─ jobs/
│  │  │  │  ├─ pollMutations.job.ts
│  │  │  │  ├─ expirePaymentIntents.job.ts
│  │  │  │  └─ reconciliation.job.ts
│  │  │  ├─ security/
│  │  │  │  ├─ auth.ts
│  │  │  │  ├─ rbac.ts
│  │  │  │  ├─ hmac.ts
│  │  │  │  ├─ rateLimit.ts
│  │  │  │  └─ redaction.ts
│  │  │  └─ utils/
│  │  │     ├─ money.ts
│  │  │     ├─ time.ts
│  │  │     └─ hash.ts
│  │  └─ package.json
│  ├─ collector/
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ normalizeDanaMutation.ts
│  │  │  └─ sendSignedMutationBatch.ts
│  │  └─ package.json
│  └─ web/
│     └─ ...
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ docker-compose.yml
├─ .env.example
├─ SECURITY.md
└─ README.md
```

---

## 5. Database Schema

```prisma
model Order {
  id              String      @id @default(uuid())
  invoiceNo       String      @unique
  baseAmount      Int
  uniqueCode      Int
  payableAmount   Int
  status          OrderStatus @default(PENDING)
  customerName    String?
  customerEmail   String?
  createdAt       DateTime    @default(now())
  expiresAt       DateTime
  paidAt          DateTime?

  paymentIntent   PaymentIntent?

  @@index([status, createdAt])
  @@index([payableAmount])
}

model PaymentIntent {
  id                String        @id @default(uuid())
  orderId            String        @unique
  order              Order         @relation(fields: [orderId], references: [id])

  provider           String
  qrisImageUrl       String?
  qrisPayload        String?
  baseAmount         Int
  uniqueCode         Int
  payableAmount      Int

  status             PaymentStatus @default(PENDING)
  matchedMutationId  String?
  createdAt          DateTime      @default(now())
  expiresAt          DateTime
  paidAt             DateTime?

  @@index([status, payableAmount])
  @@index([createdAt, expiresAt])
}

model IncomingMutation {
  id                  String            @id @default(uuid())
  provider             String
  providerMutationId   String?
  contentHash          String            @unique

  direction            MutationDirection
  amount               Int
  status               MutationStatus
  transactedAt         DateTime
  receivedAt           DateTime          @default(now())

  payerNameMasked      String?
  payerNameEncrypted   String?
  payerIdHash          String?
  payerIdEncrypted     String?
  noteMasked           String?
  rawJsonEncrypted     String?

  matchedOrderId       String?
  matchedAt            DateTime?

  @@index([amount, status, transactedAt])
  @@index([providerMutationId])
  @@index([matchedOrderId])
}

model AuditLog {
  id          String   @id @default(uuid())
  actorId     String?
  actorType   String
  action      String
  entityType  String
  entityId    String
  ipAddress   String?
  userAgent   String?
  reason      String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([entityType, entityId])
  @@index([actorId, createdAt])
}

model SecurityEvent {
  id          String   @id @default(uuid())
  severity    String
  eventType   String
  message     String
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([severity, createdAt])
}

model UniqueAmountReservation {
  id            String   @id @default(uuid())
  baseAmount    Int
  uniqueCode    Int
  payableAmount Int
  orderId       String?
  expiresAt     DateTime
  createdAt     DateTime @default(now())

  @@unique([payableAmount, expiresAt])
  @@index([expiresAt])
}

enum OrderStatus {
  PENDING
  PAID
  EXPIRED
  CANCELLED
  MANUAL_REVIEW
}

enum PaymentStatus {
  PENDING
  PAID
  EXPIRED
  FAILED
  MANUAL_REVIEW
}

enum MutationDirection {
  IN
  OUT
}

enum MutationStatus {
  SUCCESS
  PENDING
  FAILED
  UNKNOWN
}
```

---

## 6. Interface Adapter Mutasi

```ts
export type NormalizedMutation = {
  provider: "dana_unofficial" | "mock" | "manual_upload";
  providerMutationId?: string;
  direction: "IN" | "OUT";
  amount: number;
  status: "SUCCESS" | "PENDING" | "FAILED" | "UNKNOWN";
  transactedAt: Date;
  payerName?: string;
  payerId?: string;
  note?: string;
  rawJson?: unknown;
};

export interface PaymentMutationProvider {
  fetchLatestMutations(): Promise<NormalizedMutation[]>;
}
```

Aturan adapter:

```text
- Tidak boleh mengambil keputusan PAID.
- Tidak boleh menulis langsung ke tabel Order.
- Tidak boleh punya akses database utama.
- Hanya normalisasi mutasi.
- Semua response harus divalidasi dengan Zod.
- Semua error harus fail-closed, bukan fail-open.
```

---

## 7. Collector-to-API Security

Jika collector dipisah dari API utama, jangan biarkan collector mengirim data tanpa autentikasi.

Gunakan HMAC signature:

```text
X-Collector-Id: dana-collector-01
X-Timestamp: 2026-06-10T14:00:00+07:00
X-Signature: hmac_sha256(secret, timestamp + "." + rawBody)
```

API harus memvalidasi:

```text
- timestamp tidak lebih tua dari 5 menit,
- collector id dikenal,
- signature valid,
- body belum pernah diproses,
- schema valid,
- jumlah batch masuk akal,
- IP berasal dari network internal/VPN.
```

Endpoint internal:

```text
POST /internal/mutations/ingest
```

Endpoint ini tidak boleh dibuka langsung ke publik.

---

## 8. Logic Nominal Unik

Gunakan nominal unik untuk mengurangi ambiguity.

Contoh:

```text
Harga produk : Rp50.000
Kode unik    : Rp137
Total bayar  : Rp50.137
Expired      : 30 menit
```

Rules:

```text
- Kode unik hanya valid selama order aktif.
- Jangan gunakan kode unik yang sama untuk baseAmount sama dalam window aktif.
- Jika semua kode 1–999 habis, tahan order baru atau perlebar range.
- Kode unik tidak boleh dianggap sebagai bukti tunggal jika ada lebih dari satu kandidat.
- Jika user salah nominal, masuk MANUAL_REVIEW.
```

Contoh function:

```ts
async function reserveUniqueAmount(baseAmount: number) {
  const activeReservations = await prisma.uniqueAmountReservation.findMany({
    where: {
      baseAmount,
      expiresAt: { gt: new Date() },
    },
    select: { uniqueCode: true },
  });

  const used = new Set(activeReservations.map((r) => r.uniqueCode));

  for (let code = 1; code <= 999; code++) {
    if (!used.has(code)) {
      return {
        uniqueCode: code,
        payableAmount: baseAmount + code,
      };
    }
  }

  throw new Error("No unique payment code available");
}
```

---

## 9. Mutation Ingestion

Mutation ingestion menerima mutasi yang sudah dinormalisasi.

Tugasnya:

```text
1. Validasi schema.
2. Normalisasi amount ke integer rupiah.
3. Normalisasi waktu ke Asia/Jakarta.
4. Buat contentHash.
5. Mask/encrypt field sensitif.
6. Upsert ke IncomingMutation.
7. Jika mutasi baru dan status SUCCESS, panggil matcher.
8. Tulis audit/security log.
```

Content hash minimal:

```ts
const contentHash = sha256(JSON.stringify({
  provider,
  providerMutationId,
  direction,
  amount,
  status,
  transactedAt: floorToSecond(transactedAt),
  payerIdHash,
  payerNameNormalized,
}));
```

Catatan keamanan:

```text
- Jangan hash rawJson penuh sebagai satu-satunya dedupe key, karena urutan field bisa berubah.
- Jangan simpan payerId plaintext jika tidak dibutuhkan.
- Gunakan keyed hash/HMAC untuk identifier sensitif agar tidak mudah ditebak.
```

---

## 10. Matcher Pembayaran

Matcher harus idempotent dan transactional.

```ts
async function matchMutation(mutationId: string) {
  const mutation = await prisma.incomingMutation.findUnique({
    where: { id: mutationId },
  });

  if (!mutation) return null;
  if (mutation.direction !== "IN") return null;
  if (mutation.status !== "SUCCESS") return null;
  if (mutation.matchedOrderId) return null;

  const candidates = await prisma.paymentIntent.findMany({
    where: {
      status: "PENDING",
      payableAmount: mutation.amount,
      createdAt: { lte: mutation.transactedAt },
      expiresAt: { gte: mutation.transactedAt },
    },
    include: { order: true },
  });

  if (candidates.length === 0) {
    await writeAuditLog({
      actorType: "system",
      action: "MUTATION_UNMATCHED",
      entityType: "IncomingMutation",
      entityId: mutation.id,
    });
    return null;
  }

  if (candidates.length > 1) {
    await markMutationManualReview(mutation.id, candidates.map(c => c.id));
    return null;
  }

  const paymentIntent = candidates[0];

  await prisma.$transaction(async (tx) => {
    const freshIntent = await tx.paymentIntent.findUnique({
      where: { id: paymentIntent.id },
    });

    if (!freshIntent || freshIntent.status !== "PENDING") return;

    const freshMutation = await tx.incomingMutation.findUnique({
      where: { id: mutation.id },
    });

    if (!freshMutation || freshMutation.matchedOrderId) return;

    await tx.paymentIntent.update({
      where: { id: paymentIntent.id },
      data: {
        status: "PAID",
        matchedMutationId: mutation.id,
        paidAt: mutation.transactedAt,
      },
    });

    await tx.order.update({
      where: { id: paymentIntent.orderId },
      data: {
        status: "PAID",
        paidAt: mutation.transactedAt,
      },
    });

    await tx.incomingMutation.update({
      where: { id: mutation.id },
      data: {
        matchedOrderId: paymentIntent.orderId,
        matchedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "system",
        action: "ORDER_MARKED_PAID_BY_MUTATION",
        entityType: "Order",
        entityId: paymentIntent.orderId,
        metadata: {
          paymentIntentId: paymentIntent.id,
          mutationId: mutation.id,
          amount: mutation.amount,
        },
      },
    });
  });

  return paymentIntent;
}
```

Aturan matcher:

```text
- Tidak boleh mark paid kalau amount tidak exact.
- Tidak boleh mark paid kalau mutasi OUT.
- Tidak boleh mark paid kalau status bukan SUCCESS.
- Tidak boleh mark paid kalau order expired, kecuali manual review.
- Tidak boleh mark paid jika kandidat lebih dari satu.
- Tidak boleh mengubah PAID kembali ke PENDING/EXPIRED.
```

---

## 11. API Endpoint

### Public endpoint

```text
POST /orders
GET /orders/:id
GET /payments/:paymentIntentId
```

Koreksi keamanan untuk public endpoint:

```text
- Gunakan UUID/ULID yang tidak mudah ditebak.
- Jangan tampilkan raw mutation.
- Jangan tampilkan payer detail ke customer lain.
- Rate limit berdasarkan IP dan fingerprint ringan.
- Validasi semua input dengan Zod.
- Jangan percaya amount dari frontend; hitung ulang di backend.
```

### Internal endpoint

```text
POST /internal/mutations/ingest
```

Koreksi keamanan:

```text
- Tidak publik.
- Hanya bisa diakses dari private network/VPN.
- Wajib HMAC signature.
- Wajib timestamp anti-replay.
- Wajib schema validation.
```

### Admin endpoint

```text
GET  /admin/mutations
POST /admin/mutations/:id/match/:orderId
POST /admin/orders/:id/mark-paid
GET  /admin/reconciliation/daily?date=YYYY-MM-DD
```

Koreksi keamanan:

```text
- Wajib login admin.
- Wajib 2FA untuk action manual mark-paid.
- RBAC: viewer, operator, finance_admin, super_admin.
- Manual mark-paid wajib alasan/reason.
- Semua action ditulis ke audit log.
- Untuk nominal besar, gunakan dual approval.
```

---

## 12. State Machine

```text
Order:
PENDING → PAID
PENDING → EXPIRED
PENDING → CANCELLED
PENDING → MANUAL_REVIEW
MANUAL_REVIEW → PAID
MANUAL_REVIEW → CANCELLED

PaymentIntent:
PENDING → PAID
PENDING → EXPIRED
PENDING → MANUAL_REVIEW
PENDING → FAILED
```

Transisi yang dilarang:

```text
PAID → PENDING
PAID → EXPIRED
PAID → CANCELLED tanpa refund workflow
EXPIRED → PAID otomatis tanpa manual review
```

---

## 13. Worker Polling

```text
pollMutations.job
1. Jalan setiap 10–20 detik.
2. Panggil PaymentMutationProvider.
3. Normalize data.
4. Validasi schema.
5. Kirim batch ke ingestion service.
6. Ingestion dedupe dan simpan mutation.
7. Matcher memproses mutation baru.
8. Log hasil.
```

Koreksi keamanan worker:

```text
- Gunakan backoff jika provider error.
- Gunakan circuit breaker jika gagal berulang.
- Jangan polling terlalu agresif.
- Jangan login dari banyak lokasi/device.
- Jangan expose log worker ke publik.
- Alert jika worker tidak berhasil polling dalam periode tertentu.
- Alert jika jumlah mutation tiba-tiba abnormal.
```

Contoh event log:

```text
mutation_inserted
mutation_duplicate
mutation_unmatched
mutation_matched
order_paid
manual_review_required
provider_error
collector_signature_invalid
```

---

## 14. Docker Compose — Versi Lebih Aman

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
      POSTGRES_DB: payment_web
    volumes:
      - postgres_data:/var/lib/postgresql/data
    secrets:
      - postgres_password
    networks:
      - internal

  redis:
    image: redis:7
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    networks:
      - internal

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    ports:
      - "3000:3000"
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    networks:
      - internal
      - public

  collector:
    build:
      context: .
      dockerfile: apps/collector/Dockerfile
    env_file:
      - .env.collector
    depends_on:
      - api
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    networks:
      - internal

volumes:
  postgres_data:
  redis_data:

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt

networks:
  internal:
    internal: true
  public:
```

Catatan:

```text
- Collector tidak expose port publik.
- Postgres dan Redis tidak expose port publik.
- API saja yang berada di network public.
- Container dijalankan non-root di Dockerfile.
- Jangan mount docker.sock.
```

---

## 15. Environment Variables

`.env.example`:

```env
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
APP_TIMEZONE=Asia/Jakarta

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_web
REDIS_URL=redis://localhost:6379

PAYMENT_EXPIRE_MINUTES=30
PAYMENT_POLL_INTERVAL_SECONDS=15
PAYMENT_UNIQUE_CODE_MIN=1
PAYMENT_UNIQUE_CODE_MAX=999

QRIS_STATIC_IMAGE_URL=https://your-domain.com/qris-dana.png
QRIS_STATIC_PAYLOAD=

MUTATION_PROVIDER=mock

COLLECTOR_ID=dana-collector-01
COLLECTOR_HMAC_SECRET=change-me

ENCRYPTION_KEY=change-me-32-bytes-minimum
HASH_PEPPER=change-me

ADMIN_SESSION_SECRET=change-me
ADMIN_2FA_REQUIRED=true
```

Untuk production:

```text
- Jangan gunakan .env plaintext jika server shared.
- Gunakan secret manager.
- Rotasi secret berkala.
- Pisahkan secret API dan collector.
- Jangan gunakan secret yang sama untuk HMAC, encryption, dan session.
```

---

## 16. Logging dan Redaction

Pakai structured logging, tetapi redaksi field sensitif.

Field yang harus di-redact:

```text
password
pin
otp
token
authorization
cookie
session
payerId
payerName
rawJson
phone
email
```

Contoh Pino redaction:

```ts
const logger = pino({
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.token",
      "*.session",
      "*.otp",
      "*.pin",
      "*.payerId",
      "*.payerName",
      "*.rawJson",
    ],
    censor: "[REDACTED]",
  },
});
```

---

## 17. Privacy dan Data Retention

Karena mutasi pembayaran dapat mengandung data pribadi dan data transaksi, gunakan prinsip minimisasi data.

Rules:

```text
- Simpan amount, status, waktu, dan hash identifier sebagai data utama.
- Simpan payer name hanya jika diperlukan untuk rekonsiliasi.
- Jangan tampilkan payer full detail di halaman customer.
- Raw mutation dienkripsi dan dibatasi aksesnya.
- Retention default: 90 hari untuk raw mutation.
- Audit log dapat disimpan lebih lama, tetapi jangan menyimpan rahasia di audit log.
- Buat prosedur penghapusan data jika tidak lagi diperlukan.
```

---

## 18. Supply Chain Security

Karena kamu memakai adapter unofficial, risiko supply chain lebih tinggi.

Wajib:

```text
- Pin dependency version.
- Gunakan lockfile.
- Jalankan npm audit / pnpm audit.
- Gunakan SCA: Dependabot, Renovate, atau osv-scanner.
- Gunakan SAST: Semgrep atau CodeQL.
- Generate SBOM jika production.
- Jangan auto-update library unofficial tanpa review.
- Review source code library unofficial sebelum dipakai.
- Jalankan unofficial adapter di container minim privilege.
```

Tambahan:

```text
- Jangan biarkan unofficial package punya akses ke database utama.
- Jangan biarkan package membaca semua environment variables.
- Pisahkan secret collector dari secret API.
- Gunakan egress allowlist jika memungkinkan.
```

---

## 19. Security Headers dan Web Hardening

Untuk frontend/admin:

```text
- HTTPS wajib.
- HSTS aktif.
- Secure cookie.
- HttpOnly cookie.
- SameSite=Lax atau Strict.
- CSP ketat.
- X-Frame-Options / frame-ancestors.
- Referrer-Policy.
- Permissions-Policy.
- CORS allowlist, jangan pakai wildcard untuk credentialed request.
```

Contoh baseline header:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self'; object-src 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 20. Fraud dan Abuse Scenario

### Scenario 1 — Attacker menebak order ID

Mitigasi:

```text
- Gunakan UUID/ULID random.
- Jangan pakai invoice increment public sebagai satu-satunya ID.
- Batasi data pada GET /orders/:id.
```

### Scenario 2 — Attacker membuat banyak order untuk menghabiskan unique code

Mitigasi:

```text
- Rate limit create order.
- Captcha ringan jika abnormal.
- Reservation expiry singkat.
- Batasi unpaid order per IP/user.
```

### Scenario 3 — Mutasi palsu dikirim ke ingestion endpoint

Mitigasi:

```text
- Endpoint internal-only.
- HMAC signature.
- Anti-replay timestamp.
- Collector ID allowlist.
- mTLS jika memungkinkan.
```

### Scenario 4 — Admin nakal mark order sebagai paid

Mitigasi:

```text
- RBAC.
- 2FA.
- Audit log append-only.
- Dual approval untuk nominal besar.
- Reconciliation harian.
```

### Scenario 5 — Library unofficial compromised

Mitigasi:

```text
- Isolated container.
- No direct DB access.
- No broad env access.
- Egress allowlist.
- Dependency pinning.
- Code review.
```

### Scenario 6 — User salah nominal

Mitigasi:

```text
- Jangan auto-paid.
- Masukkan MANUAL_REVIEW.
- Admin cocokkan manual.
- Buat flow refund/manual adjustment jika diperlukan.
```

### Scenario 7 — Mutasi duplicate

Mitigasi:

```text
- contentHash unique.
- providerMutationId unique jika tersedia.
- Matcher idempotent.
- DB transaction.
```

---

## 21. Test Case Wajib

```text
1. Order Rp50.000 dibuat → payable Rp50.xxx.
2. Mutasi Rp50.xxx masuk → order PAID.
3. Mutasi sama masuk dua kali → tidak double paid.
4. Mutasi Rp50.xxx status FAILED → tidak match.
5. Mutasi amount cocok tapi waktu di luar window → tidak match.
6. Dua order punya amount sama → MANUAL_REVIEW.
7. Order expired → tidak auto-paid.
8. Manual mark-paid wajib audit log.
9. Collector kirim batch tanpa HMAC → ditolak.
10. Collector kirim timestamp lama → ditolak.
11. Raw mutation tidak muncul di response admin list.
12. Admin viewer tidak bisa manual mark-paid.
13. Worker provider error → retry dan circuit breaker aktif.
14. Dependency unofficial error → core API tetap hidup.
15. Redaction log tidak membocorkan token/session/payerId.
```

---

## 22. Prompt Codex Utama

```text
Build a secure self-hosted static QRIS payment detector using TypeScript.

Stack:
- Fastify
- Prisma
- PostgreSQL
- Redis
- BullMQ
- Zod
- Pino
- Docker Compose

Important safety and security boundaries:
- Do not reverse engineer DANA.
- Do not implement OTP/PIN bypass.
- Do not implement MITM or hidden endpoint discovery.
- Do not store PIN, OTP, or passwords.
- Implement UnofficialDanaProvider only as an adapter wrapper around a user-supplied lawful data source.
- Treat the unofficial adapter as untrusted.
- Collector must not access the main database directly.

Implement:
1. Order creation with unique payable amount.
2. Static QRIS payment intent.
3. PaymentMutationProvider interface.
4. MockMutationProvider.
5. UnofficialDanaProvider adapter wrapper only.
6. Separate collector service that sends normalized mutations to API via signed HMAC request.
7. Mutation ingestion with schema validation, deduplication, masking, and encryption.
8. Matching engine using exact amount + time window + success status.
9. Idempotent order paid update inside database transaction.
10. Manual review for ambiguous mutations.
11. Admin endpoints with auth, RBAC, 2FA-ready design, and audit logs.
12. Daily reconciliation report.
13. Security logging and redaction.
14. Unit and integration tests for duplicate mutation, expired order, ambiguous match, successful match, invalid collector signature, and unauthorized admin action.
```

---

## 23. Roadmap Implementasi untuk Codex

### Phase 1 — Core payment tanpa DANA

```text
Implement database schema, order creation API, payment intent creation, unique amount reservation, and mock mutation provider. Do not implement real DANA integration yet.
```

Target:

```text
POST /orders berjalan.
GET /orders/:id berjalan.
Mock mutation bisa dibuat untuk simulasi.
```

### Phase 2 — Mutation ingestion

```text
Implement mutation ingestion service with Zod validation, contentHash deduplication, field masking, optional field encryption, and audit logging.
```

Target:

```text
Mutation dummy bisa masuk database.
Duplicate tidak double insert.
Field sensitif tidak tampil mentah.
```

### Phase 3 — Matching engine

```text
Implement idempotent mutation matcher. Use exact amount, successful incoming mutation, and order time window. Use database transaction. Ambiguous candidates must go to manual review.
```

Target:

```text
Order otomatis PAID hanya jika match tunggal dan valid.
```

### Phase 4 — Worker polling

```text
Implement BullMQ worker that calls PaymentMutationProvider periodically, handles provider errors with backoff and circuit breaker, and never crashes the main API.
```

Target:

```text
Worker stabil walaupun provider error.
```

### Phase 5 — Collector isolation

```text
Create separate collector app. It fetches mutations from the configured provider, normalizes them, and sends signed batches to POST /internal/mutations/ingest using HMAC.
```

Target:

```text
Collector tidak punya akses database.
API menolak batch tanpa signature valid.
```

### Phase 6 — Admin dashboard/API

```text
Implement admin mutation list, manual match, manual mark-paid, reconciliation report, RBAC, and audit logs. Do not expose raw mutation by default.
```

Target:

```text
Manual review bisa diselesaikan dengan aman dan tercatat.
```

### Phase 7 — Security hardening

```text
Add rate limiting, CORS allowlist, security headers, log redaction, secret management docs, container hardening, dependency scanning, and CI checks.
```

Target:

```text
Aplikasi siap diuji staging dengan risiko minimal.
```

---

## 24. Checklist Production Readiness

### App security

```text
[ ] Semua input divalidasi Zod.
[ ] Tidak ada raw SQL tanpa parameter.
[ ] Rate limit endpoint publik.
[ ] Admin memakai auth + RBAC.
[ ] Admin action sensitif memakai 2FA.
[ ] CORS allowlist.
[ ] Security headers aktif.
[ ] CSRF protection untuk admin cookie session.
```

### Payment correctness

```text
[ ] Unique amount reservation aman dari collision.
[ ] Matcher idempotent.
[ ] Duplicate mutation tidak double paid.
[ ] Expired order tidak auto-paid.
[ ] Ambiguous mutation masuk manual review.
[ ] Ada reconciliation report.
```

### Secret management

```text
[ ] Tidak ada secret di git.
[ ] `.env` production tidak plaintext di shared server.
[ ] Secret dipisah antara API dan collector.
[ ] Token/session tidak muncul di log.
[ ] Ada prosedur rotasi secret.
```

### Data protection

```text
[ ] rawJson terenkripsi.
[ ] payerId di-hash/encrypt.
[ ] payerName dimask.
[ ] Retention policy jelas.
[ ] Admin akses raw data diaudit.
```

### Infrastructure

```text
[ ] Postgres tidak expose publik.
[ ] Redis tidak expose publik.
[ ] Collector tidak expose publik.
[ ] Container non-root.
[ ] Container read-only jika memungkinkan.
[ ] Tidak mount docker.sock.
[ ] Backup database terenkripsi.
[ ] Monitoring dan alerting aktif.
```

### Supply chain

```text
[ ] Lockfile dipakai.
[ ] Dependency scanning aktif.
[ ] SAST aktif.
[ ] Container scanning aktif.
[ ] Unofficial package direview manual.
[ ] Adapter unofficial berjalan isolated.
```

---

## 25. Keputusan Final yang Disarankan

Untuk tahap awal, jangan langsung pasang unofficial provider. Bangun dulu sampai sistem berjalan dengan `MockMutationProvider`.

Urutan terbaik:

```text
1. Core order + payment intent.
2. Mock mutation ingestion.
3. Matcher dan idempotency.
4. Admin manual review.
5. Collector HMAC.
6. Security hardening.
7. Baru sambungkan unofficial adapter.
```

Dengan urutan ini, kalau adapter unofficial berubah atau gagal, sistem payment kamu tetap punya fondasi yang benar.

---

## 26. Referensi

- OWASP Application Security Verification Standard: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- OWASP API Security Top 10 2023: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- Bank Indonesia QRIS: https://www.bi.go.id/en/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx
- DANA QRIS Acquirer Overview: https://dashboard.dana.id/api-docs-v2/api/qris-acquirer/overview
- DANA Finish Notify: https://dashboard.dana.id/api-docs-v2/api/payment-gateway/finish-notify
- DANA Query Payment: https://dashboard.dana.id/api-docs-v2/api/payment-gateway/optional-api/query-payment
- DANA Privacy Policy: https://www.dana.id/policy

