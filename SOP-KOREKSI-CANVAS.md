# SOP Koreksi Jawaban Mode Canvas

Dokumen ini menjelaskan arsitektur lengkap alur pengecekan jawaban mode canvas dari sisi frontend, backend, sampai respons AI.

---

## 1. Gambaran Umum

Siswa menulis langkah penyelesaian di papan gambar digital (canvas). Setelah submit, gambar dikirim ke backend, lalu diteruskan ke model vision AI bersama konteks soal. AI membaca tulisan tangan, mengevaluasi setiap langkah, dan mengembalikan hasil berstruktur JSON yang ditampilkan sebagai laporan koreksi.

```
Siswa nulis di canvas
        ↓
exportImage() → base64 PNG
        ↓
POST /api/correction/evaluate
        ↓
Backend validasi & susun prompt
        ↓
Gemini API (vision + JSON mode)
        ↓
Normalisasi & simpan ke DB
        ↓
Frontend tampilkan modal hasil
```

---

## 2. Capture Gambar (Frontend)

**File:** `src/drawing-canvas.jsx`, `src/answer-board.jsx`, `src/practice.jsx`

Saat user klik tombol "Kirim Jawaban", fungsi `submitCanvas()` di `practice.jsx:125` dipanggil:

```js
const imageBase64 = boardRef.current.exportImage();
// → mainCanvasRef.current.toDataURL('image/png')
// → menghasilkan string: "data:image/png;base64,iVBORw0KGgo..."
```

Canvas terdiri dari dua layer:
- **mainCanvas**: tempat user menggambar (strokes, teks)
- **overlayCanvas**: layer transparan untuk highlight hasil (z-index lebih tinggi)

Hanya `mainCanvas` yang di-export. Format: **PNG, base64, data URL**. Gambar tidak dikompres sebelum dikirim.

Validasi awal di frontend:
- Cek `boardDirty` (canvas harus sudah digambar, tidak boleh kosong)
- Jika kosong → error lokal, tidak dikirim ke server

---

## 3. Request ke Backend

**Endpoint:** `POST /api/correction/evaluate`

**Payload:**

```json
{
  "imageBase64": "data:image/png;base64,...",
  "mimeType": "image/png",
  "problemId": 42,
  "questionId": 42,
  "questionText": "Tentukan ∫ 2x(x²+1)³ dx",
  "expectedAnswer": "(x²+1)⁴/4 + C",
  "topicTags": ["Integral Substitusi"]
}
```

`questionText` diambil dari `problem.question_display` (versi format UI) atau fallback ke `question_text`. `expectedAnswer` diambil dari `problem.answer_display` di database.

---

## 4. Validasi Server

**File:** `routes/correction.js` → `validateImagePayload()`

Pemeriksaan yang dilakukan:
1. Strip prefix `data:image/png;base64,` → ambil konten base64 murni
2. Deteksi MIME dari prefix data URL atau field `mimeType`
3. Allowed: `image/png`, `image/jpeg`, `image/webp` — selain ini → HTTP 400
4. Panjang string base64 maksimal 10.000.000 karakter (~7.5 MB decoded) — lebih → HTTP 413

---

## 5. Penyusunan Prompt ke AI

Backend menyusun array `parts` yang dikirim ke Gemini:

**Part 1 — teks konteks:**

```
Evaluasi jawaban siswa dan kembalikan JSON sesuai schema.
ID soal: 42
Soal: Tentukan ∫ 2x(x²+1)³ dx
Jawaban acuan: (x²+1)⁴/4 + C
Topik soal: Integral Substitusi
Jawaban siswa ada pada gambar canvas.
```

Jika siswa juga mengirim teks (bukan canvas), bagian terakhir diganti dengan teks jawaban langsung.

**Part 2 — gambar inline:**

```json
{
  "inlineData": {
    "data": "<base64 murni tanpa prefix>",
    "mimeType": "image/png"
  }
}
```

**System instruction:**

> "Kamu adalah asisten guru matematika yang teliti. Evaluasi langkah penyelesaian siswa dari gambar canvas atau teks. Soal dan jawaban acuan diberikan oleh aplikasi. Baca tulisan tangan, hitung ulang setiap baris, lalu jelaskan letak salahnya jika ada. Gunakan bahasa Indonesia yang mudah dipahami siswa. Jika ada koordinat kesalahan, semua box memakai persen 0-100 relatif ke gambar canvas. Jika posisi tidak yakin, isi null. Jangan mengarang koordinat besar. fullFeedback harus berisi penyelesaian lengkap dari awal sampai akhir dengan langkah bernomor. Hindari Markdown tebal, LaTeX mentah, dan blok kode. Gunakan simbol sederhana dan superscript Unicode untuk pangkat."

---

## 6. Model & Key Management

**File:** `routes/correction.js` → `getGeminiModels()`, `getGeminiKeys()`

### Model

Urutan prioritas model (diambil dari env, lalu fallback):

```
GEMINI_MODELS (env, comma-separated)
  → fallback: gemini-2.5-flash
  → fallback: gemini-2.5-flash-lite
```

Env `GEMINI_MODELS` bisa berisi model lain di depan, misalnya `gemini-2.5-pro,gemini-2.5-flash`. Model dicoba dari kiri ke kanan.

### API Keys

Hingga 20 key bisa didaftarkan:

```
GEMINI_KEY_1=...
GEMINI_KEY_2=...
...
GEMINI_KEY_20=...
```

### Retry Logic (callGeminiWithFallback)

Urutan percobaan: **model luar → key dalam**

```
untuk setiap model:
  untuk setiap key:
    coba request
    jika berhasil → return
    jika error retryable (429 / 503 / rate_limit / overloaded) → coba key berikutnya
    jika error non-retryable → lempar error langsung (tidak coba key/model lain)
jika semua habis → HTTP 503
```

Error retryable: HTTP 429, 503, `resource_exhausted`, `rate limit`, `overloaded`, `unavailable`.

---

## 7. Konfigurasi AI Call

**Library:** `@google/genai` (GoogleGenAI)

```js
ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{ role: "user", parts }],
  config: {
    responseJsonSchema: EVALUATION_SCHEMA,  // paksa output JSON sesuai schema
    responseMimeType: "application/json",
    systemInstruction: EVALUATE_SYSTEM_PROMPT
  }
})
```

`responseJsonSchema` menjamin output selalu JSON valid sesuai schema — tidak ada prolog/epilog teks biasa.

---

## 8. Schema Output AI (EVALUATION_SCHEMA)

```json
{
  "isCorrect": true,
  "score": 75,
  "detectedAnswerText": "u = x²+1, du = 2x dx, ∫u³du = u⁴/4 + C = (x²+1)⁴/4",
  "wrongSteps": [
    {
      "stepNumber": "3",
      "previousStep": "∫u³ du",
      "studentStep": "u³/3 + C",
      "issue": "Rumus integral pangkat salah: ∫uⁿ du = uⁿ⁺¹/(n+1), bukan uⁿ/n",
      "hint": "Tambahkan 1 ke eksponen lalu bagi dengan eksponen baru",
      "wrongPartBoxPercent": { "x": 10, "y": 62, "width": 35, "height": 8 },
      "wrongBoxPercent": { "x": 5, "y": 60, "width": 80, "height": 12 },
      "combinedBoxPercent": { "x": 5, "y": 58, "width": 80, "height": 16 }
    }
  ],
  "fullFeedback": "1. Substitusi u = x²+1 → du = 2x dx ✓\n2. Integral menjadi ∫u³ du ✓\n3. ∫u³ du = u⁴/4 + C (bukan u³/3) — eksponen harus naik 1\n4. Substitusi balik: (x²+1)⁴/4 + C",
  "strengthTags": ["substitusi variabel", "setup integral"],
  "weaknessTags": ["rumus integral pangkat"]
}
```

### Penjelasan Field

| Field | Tipe | Keterangan |
|---|---|---|
| `isCorrect` | boolean | Apakah keseluruhan jawaban benar |
| `score` | 0–100 | Skor numerik dari AI |
| `detectedAnswerText` | string | Transkripsi tulisan tangan yang AI baca |
| `wrongSteps` | array | Daftar langkah yang salah |
| `wrongSteps[].stepNumber` | string | Nomor langkah (bisa "2", "3a", dll) |
| `wrongSteps[].previousStep` | string | Langkah sebelumnya sebagai konteks |
| `wrongSteps[].studentStep` | string | Apa yang ditulis siswa di langkah ini |
| `wrongSteps[].issue` | string | Penjelasan kesalahan |
| `wrongSteps[].hint` | string | Petunjuk cara memperbaiki |
| `wrongSteps[].wrongPartBoxPercent` | object/null | Koordinat bagian kecil yang spesifik salah |
| `wrongSteps[].wrongBoxPercent` | object/null | Koordinat satu baris/langkah yang salah |
| `wrongSteps[].combinedBoxPercent` | object/null | Gabungan area untuk highlight |
| `fullFeedback` | string | Pembahasan lengkap langkah demi langkah |
| `strengthTags` | string[] | Topik yang sudah dikuasai siswa |
| `weaknessTags` | string[] | Topik yang perlu diperkuat |

### Koordinat Box

Semua koordinat box dalam **persen (0–100) relatif ke dimensi gambar canvas**:

```
x      = jarak dari kiri gambar (%)
y      = jarak dari atas gambar (%)
width  = lebar box (%)
height = tinggi box (%)
```

AI diperintahkan untuk mengisi `null` jika tidak yakin posisinya, agar tidak ada koordinat yang dikarang.

---

## 9. Normalisasi Respons

**Fungsi:** `normalizeEvaluation()`

Backend membersihkan respons AI sebelum disimpan dan dikirim ke frontend:

- `score`: di-clamp ke 0–100, dibulatkan ke integer. Jika `isCorrect=true` dan `score=null` → otomatis 100.
- `wrongSteps[].combinedBoxPercent` dll: tiap box divalidasi → koordinat di-clamp 0–100, width/height tidak boleh keluar batas gambar, jika tidak valid → `null`.
- `strengthTags` / `weaknessTags`: max 12 item, distrip dari whitespace.
- `fullFeedback`: fallback ke raw text dari AI jika field kosong.
- `detectedAnswerText`: fallback ke string kosong.

---

## 10. Penyimpanan ke Database

Setelah normalisasi, hasil disimpan ke tabel `correction_attempts`:

```sql
INSERT INTO correction_attempts (
  user_id, problem_id, mode, question_text, expected_answer,
  detected_answer_text, score, is_correct, feedback,
  strength_tags, weakness_tags, evaluation_json
) VALUES (...)
```

- `mode` = `'canvas'`
- `evaluation_json` = JSON lengkap dari `normalizeEvaluation()`
- `strength_tags` dan `weakness_tags` disimpan sebagai JSON array string

---

## 11. Respons ke Frontend

Backend mengembalikan:

```json
{
  "evaluation": { ... },
  "feedback": "1. Substitusi u = ...",
  "keyIndex": 2,
  "modelUsed": "gemini-2.5-flash"
}
```

`keyIndex` dan `modelUsed` dilog di response untuk debugging (tidak ditampilkan ke siswa).

---

## 12. Tampilan Hasil (Frontend)

**File:** `src/practice.jsx` → komponen `CanvasResultModal`

Modal hasil menampilkan:
1. **Badge skor** — bulat, warna hijau (benar) atau kuning (salah/parsial)
2. **Teks terbaca** — `detectedAnswerText`: tulisan yang berhasil AI baca
3. **Feedback** — `fullFeedback`: pembahasan lengkap langkah bernomor
4. **Langkah yang perlu diperbaiki** — list dari `wrongSteps[]`, tiap item menampilkan `issue` dan `hint`

Koordinat box (`wrongPartBoxPercent`, dll) tersimpan di data tapi **saat ini belum dirender sebagai overlay di atas canvas**. Data tersebut tersedia untuk keperluan pengembangan fitur highlight visual di masa mendatang.

---

## 13. Progress Submission

Setelah evaluasi berhasil, frontend otomatis mengirim progress:

```js
MafikingAPI.post("/api/progress/submit", {
  correct: isCorrect,
  hintsUsed: 0,
  problemId: problem.id,
})
```

Ini berjalan fire-and-forget (`.catch(() => null)`), kegagalannya tidak memengaruhi tampilan hasil koreksi.

---

## 14. Endpoint Tambahan

### POST /api/correction/transcribe

Digunakan untuk membaca tulisan tangan saja tanpa evaluasi. Mengembalikan teks transkripsi. Schema output: `{ text: string }`. Prompt: "Baca tulisan tangan matematika pada gambar. Jangan memperbaiki jawaban, hanya transkripsikan."

### POST /api/correction/profile-summary

Membuat raport belajar dari riwayat koreksi user. Mengambil max 20 attempt terakhir dari DB, meringkasnya, lalu meminta AI membuat ringkasan dalam format:

```json
{
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendedQuestions": ["...", "...", "..."],
  "overallSummary": "..."
}
```

Jika tidak ada API key aktif → fallback ke `fallbackProfileFromAttempts()` yang menghitung tag paling sering muncul dari data lokal tanpa memanggil AI.

### GET /api/correction/attempts

Mengambil 50 attempt terakhir user, diurutkan dari terbaru. Digunakan untuk halaman riwayat koreksi.

---

## 15. Konfigurasi .env yang Diperlukan

```env
# Wajib — minimal 1 key
GEMINI_KEY_1=AIza...
GEMINI_KEY_2=AIza...   # opsional, untuk fallback

# Opsional — override urutan model
GEMINI_MODELS=gemini-2.5-pro,gemini-2.5-flash
```
