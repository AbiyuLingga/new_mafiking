# SOP Gemini Canvas Redline

Dokumen ini adalah SOP untuk sistem koreksi jawaban canvas berbasis Gemini di
`new_mafiking`. Tujuannya adalah membuat alur koreksi yang lebih dekat dengan
cara guru memeriksa tulisan tangan: Gemini membaca tulisan siswa, siswa
mengonfirmasi hasil bacaan, Gemini mengoreksi, lalu aplikasi menampilkan ulang
coretan siswa dengan bagian yang salah berubah merah.

Perbedaan utama dengan `koreksi-jawaban`: referensi lama memberi kotak pada
bagian salah, sedangkan sistem ini tidak memakai kotak sebagai tampilan utama.
Bagian coretan yang salah harus dirender ulang sebagai coretan merah.

---

## 1. Prinsip Utama

1. Gemini tidak boleh langsung mengoreksi sebelum tulisan siswa dikonfirmasi.
2. Gemini tidak membuat gambar baru dan tidak mengedit pixel canvas.
3. Gemini hanya mengembalikan data terstruktur: transkripsi, evaluasi,
   koordinat/target kesalahan, dan penjelasan.
4. Frontend bertanggung jawab mengubah warna coretan user menjadi merah.
5. Semua hasil teks yang akan ditampilkan ke user harus berupa LaTeX.
6. Teks biasa di dalam LaTeX wajib memakai `\text{...}`.
7. Redline harus menandai unit visual yang utuh. Jangan menargetkan setengah
   huruf/angka atau potongan kecil dari satu karakter.
8. Jika kesalahan terjadi pada transisi perhitungan, tandai seluruh ekspresi
   transisi yang salah. Contoh: untuk `1+1=3`, target merah adalah `1+1=3`,
   bukan hanya `3`.

Contoh benar:

```latex
\text{Langkah 1: Substitusi } u = x^2 + 1
```

Contoh salah:

```latex
Langkah 1: Substitusi u = x^2 + 1
```

Untuk kalimat panjang, tetap gunakan LaTeX text mode:

```latex
\text{Kesalahan terjadi karena pangkat belum ditambah satu sebelum dibagi.}
```

Untuk campuran teks dan rumus:

```latex
\text{Seharusnya } \int u^3\,du = \frac{u^4}{4} + C
```

---

## 2. Alur Produk

Alur wajib:

```text
User menulis jawaban di canvas
  -> User klik Submit
  -> Frontend export gambar canvas dan snapshot stroke
  -> Backend memanggil Gemini untuk OCR/transkripsi
  -> Frontend menampilkan hasil transkripsi
  -> User klik "Benar, lanjut koreksi"
  -> Backend memanggil Gemini untuk evaluasi
  -> Frontend menampilkan canvas redline
  -> User klik Next
  -> Frontend menampilkan alasan salah dan pembahasan lengkap
```

Jika user tidak setuju dengan hasil transkripsi, user tidak boleh dipaksa
lanjut ke koreksi. UI harus memberi pilihan kembali ke canvas untuk memperbaiki
tulisan atau mengirim ulang.

---

## 3. Data yang Dikirim Frontend

Saat user submit canvas, frontend harus menyiapkan dua bentuk data:

1. `imageBase64`
   - PNG data URL dari canvas.
   - Dipakai Gemini untuk membaca tulisan tangan.

2. `strokeSnapshot`
   - Data vector dari coretan user.
   - Dipakai frontend untuk menggambar ulang jawaban dan mengubah segmen salah
     menjadi merah.

Struktur minimum `strokeSnapshot`:

```json
{
  "canvasSize": {
    "width": 1200,
    "height": 800
  },
  "strokes": [
    {
      "id": 12,
      "color": "#0f172a",
      "width": 18,
      "points": [
        { "x": 120, "y": 220 },
        { "x": 135, "y": 226 }
      ]
    }
  ]
}
```

Catatan implementasi:

- `src/drawing-canvas.jsx` saat ini menyimpan `strokesRef.current`.
- `exportImage()` saat ini hanya mengembalikan PNG.
- Implementasi berikutnya perlu menambah method seperti `exportSnapshot()`.
- Snapshot tidak dikirim ke Gemini sebagai sumber utama evaluasi; snapshot
  dipakai aplikasi untuk redline.

---

## 4. Endpoint 1: Transkripsi Canvas

Endpoint:

```http
POST /api/correction/transcribe
```

Payload:

```json
{
  "imageBase64": "data:image/png;base64,...",
  "mimeType": "image/png",
  "questionText": "\\text{Tentukan hasil dari } \\int 2x(x^2+1)^3\\,dx"
}
```

Gemini hanya boleh membaca tulisan. Gemini tidak boleh memperbaiki jawaban,
memberi skor, atau menyimpulkan benar/salah.

System instruction:

```text
Kamu adalah sistem OCR matematika untuk tulisan tangan siswa.
Baca isi gambar canvas dari atas ke bawah.
Ubah tulisan siswa menjadi LaTeX yang siap dirender.
Jangan mengoreksi jawaban.
Jangan memperbaiki langkah yang salah.
Jangan menambah langkah baru.
Jangan memberi skor.
Semua teks biasa harus ditulis dalam \text{...}.
Semua rumus harus ditulis sebagai LaTeX.
Balas hanya JSON valid sesuai schema.
```

Schema output:

```json
{
  "detectedAnswerLatex": "\\text{Langkah 1: } u = x^2 + 1",
  "readingConfidence": 0.92,
  "unclearParts": [
    "\\text{Bagian akhir baris 2 kurang jelas.}"
  ],
  "needsUserConfirmation": true
}
```

Aturan field:

| Field | Tipe | Aturan |
|---|---|---|
| `detectedAnswerLatex` | string | Transkripsi lengkap dalam LaTeX. Teks biasa wajib `\text{...}`. |
| `readingConfidence` | number 0-1 | Estimasi keyakinan OCR. |
| `unclearParts` | string[] | Bagian yang tidak jelas, tetap dalam LaTeX text mode. |
| `needsUserConfirmation` | boolean | Selalu `true` untuk flow canvas. |

Frontend harus menampilkan `detectedAnswerLatex` kepada user dan menunggu
konfirmasi.

---

## 5. Konfirmasi User

Setelah transkripsi berhasil, frontend menampilkan panel:

```text
Tulisan yang terbaca:
[render LaTeX dari detectedAnswerLatex]

Button:
- Benar, lanjut koreksi
- Kembali ke canvas
```

Jika user memilih "Benar, lanjut koreksi", frontend mengirim evaluasi dengan:

- `confirmedAnswerLatex`
- `imageBase64`
- `strokeSnapshot`
- `questionText`
- `expectedAnswer`
- `topicTags`

Jika user kembali ke canvas, attempt OCR tidak disimpan sebagai hasil koreksi.

---

## 6. Endpoint 2: Evaluasi Jawaban

Endpoint:

```http
POST /api/correction/evaluate
```

Payload:

```json
{
  "imageBase64": "data:image/png;base64,...",
  "mimeType": "image/png",
  "problemId": 42,
  "questionText": "\\text{Tentukan hasil dari } \\int 2x(x^2+1)^3\\,dx",
  "expectedAnswer": "\\frac{(x^2+1)^4}{4}+C",
  "confirmedAnswerLatex": "\\text{Langkah 1: } u=x^2+1 ...",
  "topicTags": ["Integral Substitusi"]
}
```

Gemini boleh memakai `confirmedAnswerLatex` sebagai teks utama dan gambar
sebagai bukti visual. Jika teks dan gambar berbeda, Gemini harus menjelaskan
bahwa input tidak konsisten dan memberi `needsResubmission: true`.

System instruction:

```text
Kamu adalah guru matematika yang teliti.
Evaluasi jawaban siswa berdasarkan soal, jawaban acuan, transkripsi LaTeX yang
sudah dikonfirmasi user, dan gambar canvas.
Hitung ulang setiap langkah.
Jika ada kesalahan, tentukan bagian coretan yang salah agar frontend dapat
mengubah warnanya menjadi merah.
Jangan mengembalikan Markdown.
Jangan mengembalikan HTML.
Balas hanya JSON valid sesuai schema.
Semua field yang berisi teks untuk user harus berupa LaTeX.
Semua teks biasa di dalam LaTeX wajib memakai \text{...}.
Jika posisi kesalahan tidak yakin, isi boxPercent dengan null.
Jangan membuat koordinat besar hanya untuk terlihat yakin.
```

Schema output:

```json
{
  "isCorrect": false,
  "score": 65,
  "detectedAnswerLatex": "\\text{Langkah 1: } u=x^2+1",
  "needsResubmission": false,
  "wrongSteps": [
    {
      "stepNumber": "3",
      "studentStepLatex": "\\int u^3\\,du = \\frac{u^3}{3}+C",
      "correctStepLatex": "\\int u^3\\,du = \\frac{u^4}{4}+C",
      "issueLatex": "\\text{Eksponen harus ditambah satu, bukan tetap } 3.",
      "hintLatex": "\\text{Gunakan aturan } \\int u^n\\,du=\\frac{u^{n+1}}{n+1}+C.",
      "wrongPartBoxPercent": {
        "x": 42,
        "y": 58,
        "width": 16,
        "height": 8
      },
      "wrongBoxPercent": {
        "x": 30,
        "y": 55,
        "width": 48,
        "height": 12
      }
    }
  ],
  "redlineTargets": [
    {
      "stepNumber": "3",
      "targetTextLatex": "\\frac{u^3}{3}",
      "reasonLatex": "\\text{Bagian ini memakai rumus integral pangkat yang salah.}",
      "boxPercent": {
        "x": 42,
        "y": 58,
        "width": 16,
        "height": 8
      },
      "severity": "error"
    }
  ],
  "fullFeedbackLatex": "\\text{Langkah 1 benar. } u=x^2+1 \\text{ sehingga } du=2x\\,dx. \\text{Langkah 2 benar: } \\int u^3\\,du. \\text{Langkah 3 salah karena } \\int u^3\\,du=\\frac{u^4}{4}+C.",
  "strengthTags": ["substitusi variabel"],
  "weaknessTags": ["rumus integral pangkat"]
}
```

---

## 7. Aturan LaTeX untuk Gemini

Semua field berikut wajib LaTeX:

- `questionText` jika dikirim ke frontend
- `expectedAnswer`
- `detectedAnswerLatex`
- `studentStepLatex`
- `correctStepLatex`
- `issueLatex`
- `hintLatex`
- `targetTextLatex`
- `reasonLatex`
- `fullFeedbackLatex`

Aturan:

1. Teks biasa harus memakai `\text{...}`.
2. Rumus jangan dimasukkan ke dalam `\text{...}`.
3. Jangan memakai Markdown seperti `**tebal**`, bullet Markdown, atau code fence.
4. Jangan memakai HTML.
5. Gunakan `\\` atau pemisah field, bukan paragraf Markdown.
6. Gunakan LaTeX standar untuk pecahan, integral, pangkat, akar, dan indeks.

Contoh feedback benar:

```latex
\text{Kesalahan ada pada langkah 3. Seharusnya } \int u^3\,du=\frac{u^4}{4}+C \text{ karena pangkat naik satu.}
```

Contoh feedback salah:

```text
Kesalahan ada pada langkah 3. Seharusnya integral u^3 adalah u^4/4.
```

---

## 8. Redline Rendering di Frontend

Frontend tidak menampilkan kotak merah sebagai tampilan utama. Frontend harus
membuat preview canvas baru dari `strokeSnapshot`.

Algoritma:

1. Render semua stroke original dengan warna aslinya.
2. Untuk setiap `redlineTargets[].boxPercent`, ubah persen menjadi koordinat
   pixel berdasarkan `strokeSnapshot.canvasSize`.
3. Cari stroke atau segmen stroke yang titik-titiknya masuk area tersebut.
4. Render ulang segmen yang cocok dengan warna merah.
5. Gunakan warna merah standar:

```css
#ef4444
```

6. Jika tidak ada stroke yang cocok tetapi Gemini memberi box valid, gunakan
   fallback red overlay tipis di atas area tersebut.
7. Jangan menampilkan kotak sebagai UI utama kecuali fallback diperlukan.

Data redline tidak boleh menghapus atau mengubah jawaban asli user. Preview
redline adalah render turunan dari snapshot.

---

## 9. Tampilan Hasil

Setelah evaluasi selesai, UI harus memiliki dua tahap.

### Tahap A: Preview Redline

Menampilkan:

- gambar/coretan user yang sama
- bagian salah berubah merah
- skor ringkas
- tombol `Next`

Tidak perlu langsung menampilkan pembahasan panjang agar user fokus melihat
bagian yang salah.

### Tahap B: Penjelasan

Setelah user klik `Next`, tampilkan:

- daftar langkah yang salah
- alasan mengapa salah (`issueLatex`)
- petunjuk (`hintLatex`)
- langkah benar (`correctStepLatex`)
- pembahasan lengkap (`fullFeedbackLatex`)

Semua field dirender sebagai LaTeX, bukan text mentah.

---

## 10. Penyimpanan ke Database

Tabel `correction_attempts` saat ini sudah menyimpan `evaluation_json`.
Untuk versi pertama, data baru bisa disimpan di dalam `evaluation_json` tanpa
migrasi tabel.

Field yang wajib ikut tersimpan:

- `detectedAnswerLatex`
- `confirmedAnswerLatex`
- `wrongSteps`
- `redlineTargets`
- `fullFeedbackLatex`
- `score`
- `isCorrect`
- `strengthTags`
- `weaknessTags`

Jika nanti dibutuhkan query khusus untuk redline, baru pertimbangkan migrasi
kolom tambahan. Untuk tahap SOP ini, migrasi database tidak wajib.

---

## 11. Error Handling

### OCR gagal

Jika Gemini gagal membaca tulisan:

```json
{
  "error": "Tulisan belum terbaca jelas. Coba tulis ulang lebih besar atau lebih rapi."
}
```

Frontend menampilkan pesan dan user tetap berada di canvas.

### User tidak konfirmasi OCR

Evaluasi tidak boleh dipanggil.

### Evaluasi gagal

Jika Gemini gagal saat evaluasi, transkripsi yang sudah dikonfirmasi tetap bisa
dipertahankan di UI supaya user tidak perlu submit ulang dari awal.

### Box tidak valid

Backend harus menormalisasi semua koordinat:

- `x`, `y`, `width`, `height` di-clamp ke 0-100.
- Box dengan `width <= 0` atau `height <= 0` menjadi `null`.
- Redline target tanpa box valid tetap boleh ditampilkan sebagai list
  penjelasan, tetapi tidak diberi redline visual.

---

## 12. Model dan API Key

Gunakan pola existing di `routes/correction.js`:

- `GEMINI_KEY_1` sampai `GEMINI_KEY_20`
- `GEMINI_MODELS` sebagai override urutan model
- fallback model: `gemini-2.5-flash`, lalu `gemini-2.5-flash-lite`
- retry hanya untuk error retryable seperti 429, 503, rate limit, overloaded,
  atau unavailable

Rekomendasi:

- OCR bisa memakai model cepat.
- Evaluasi memakai model terbaik yang tersedia di `GEMINI_MODELS`.
- Jangan menganggap banyak key dalam satu project selalu menambah quota total.

---

## 13. Validasi Implementasi

Checklist backend:

- `POST /api/correction/transcribe` mengembalikan `detectedAnswerLatex`.
- `POST /api/correction/evaluate` menolak request tanpa `confirmedAnswerLatex`
  untuk flow canvas.
- Semua output teks user memakai LaTeX.
- Semua teks biasa dalam LaTeX memakai `\text{...}`.
- `redlineTargets` dinormalisasi sebelum dikirim ke frontend.

Checklist frontend:

- Submit canvas membuka panel konfirmasi OCR.
- Tombol lanjut koreksi tidak aktif sebelum OCR sukses.
- Setelah konfirmasi, evaluasi berjalan.
- Preview redline memakai coretan user yang sama.
- Bagian salah berubah merah, bukan hanya dikotaki.
- Tombol `Next` membuka penjelasan dan pembahasan lengkap.

Checklist manual:

1. Jawaban benar:
   - OCR muncul.
   - Setelah konfirmasi, skor tinggi.
   - Tidak ada coretan merah.
   - Pembahasan tetap tersedia.

2. Jawaban salah satu simbol:
   - OCR muncul.
   - Setelah konfirmasi, hanya simbol/segmen salah berubah merah.
   - Penjelasan menyebut alasan spesifik.

3. Tulisan buram:
   - OCR menandai bagian tidak jelas.
   - User diminta memperbaiki atau submit ulang.

4. Gemini memberi box tidak valid:
   - Backend membuang box.
   - UI tetap menampilkan penjelasan tanpa crash.

---

## 14. Batasan

1. Akurasi redline bergantung pada kualitas koordinat dari Gemini.
2. Karena Gemini memberi area, bukan id stroke, frontend harus melakukan
   pencocokan area ke stroke secara heuristik.
3. Jika tulisan sangat rapat, redline bisa mengenai lebih dari satu simbol.
4. Untuk tahap awal, fallback overlay merah boleh dipakai jika segmen stroke
   tidak bisa dicocokkan dengan aman.

---

## 15. Ringkasan untuk Implementer

Implementasi yang benar harus mengikuti urutan ini:

1. Tambahkan export stroke snapshot dari canvas.
2. Pisahkan OCR dan evaluasi menjadi dua tahap UI.
3. Wajibkan user konfirmasi OCR.
4. Ubah schema evaluasi agar mendukung `redlineTargets` dan field LaTeX.
5. Render preview redline dari stroke asli user.
6. Tampilkan pembahasan lengkap setelah user klik `Next`.
7. Pastikan semua teks hasil Gemini yang tampil ke user berupa LaTeX dengan
   teks biasa dibungkus `\text{...}`.
