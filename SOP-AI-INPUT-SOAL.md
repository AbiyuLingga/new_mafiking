# SOP AI — Input Soal & Pembuatan Pembahasan MAFIKING

Panduan baku untuk **AI** yang bertugas mengubah satu **PDF berisi daftar soal** (diunggah admin) menjadi soal + pembahasan bertahap di web MAFIKING.

Tugas AI: (1) ekstrak tiap soal dari PDF, (2) tulis ulang soal agar jelas, (3) hitung jawaban yang benar, (4) susun **pembahasan langkah-demi-langkah** bergaya database lama `king/Mafiking`, (5) masukkan ke database.

Pembaca akhir konten ini adalah **mahasiswa TPB ITB tahun pertama**. Tolok ukur keberhasilan: seorang siswa yang *belum* bisa mengerjakan soal, setelah membaca pembahasan, jadi **paham caranya** — bukan sekadar tahu jawabannya.

---

## 1. Prinsip Pedagogis Utama

Tujuh prinsip ini mengikat seluruh dokumen:

1. **Akurasi mutlak.** Jawaban matematis harus benar. Selalu verifikasi (turunkan kembali / substitusi). Jika ragu pada satu soal → tandai `NEEDS_REVIEW`, **jangan tebak**.
2. **Ajarkan proses, bukan jawaban.** Pembahasan menjelaskan *cara berpikir* sampai ke jawaban, bukan hanya memamerkan hasil akhir.
3. **Anggap siswa pemula.** Jangan asumsikan rumus sudah dihafal. Sebut rumus saat dipakai. Jangan melompati langkah aljabar.
4. **Satu langkah = satu ide.** Jangan menumpuk dua manipulasi besar dalam satu langkah.
5. **Tunjukkan kesalahan umum.** Siswa belajar paling cepat dari "jebakan" yang sering bikin tersandung.
6. **Bahasa Indonesia, nada mentor.** Semua teks yang dilihat siswa berbahasa Indonesia, hangat dan sabar — bukan kaku seperti buku teks.
7. **Jangan mengarang.** Hanya proses soal yang benar-benar ada di PDF. Bagian PDF yang tak terbaca → laporkan, jangan diisi asal.

---

## 2. PENTING — Bagaimana Konten Tampil ke Siswa (baca dulu)

SOP ini menyuruh AI mengisi 6 field per langkah. **Tapi saat ini UI belum menampilkan semuanya.** AI dan admin wajib paham ini supaya ekspektasi benar:

| Field langkah | Tampil ke siswa sekarang? |
|---|---|
| `title` | ✅ Ya — judul langkah. |
| `content` | ⚠️ **Tidak** — ada bug nama field. `src/practice.jsx:534` membaca `step.body`/`step.description`, padahal kolom DB bernama `content`. Akibatnya kotak rumus kosong. |
| `why` | ❌ Belum dirender di mana pun. |
| `intuition` | ❌ Belum dirender di mana pun. |
| `mistakes` | ❌ Belum dirender di mana pun. |
| `mistake_result` | ❌ Belum dirender di mana pun. |

**Konsekuensi:** Walau AI menulis pembahasan sesempurna apa pun, siswa **hanya melihat judul langkah** sampai frontend diperbaiki.

**Prasyarat agar SOP ini benar-benar menghasilkan "input yang mudah dipahami siswa":** perbaiki `src/practice.jsx` agar:
1. Membaca `step.content` (bukan `step.body`/`step.description`).
2. Menampilkan `why`, `intuition`, `mistakes` sebagai blok teks bernama (mis. "Kenapa langkah ini?", "Cara memahaminya", "Hati-hati"), bukan sebagai LaTeX.

AI tetap **mengisi keenam field** sesuai SOP ini — kolom database memang ada, dan import/API memang menulisnya. SOP ditulis untuk kondisi akhir yang benar; perbaikan frontend adalah pekerjaan terpisah.

---

## 3. Hierarki Data

```
chapter (bab)        →  mis. "Integral"
  └─ subtopic (sub)  →  mis. "u-Substitution"
       └─ problem    →  satu soal
            └─ problem_steps  →  langkah-langkah pembahasan
```

Aturan pemetaan:

- Cek data yang sudah ada lewat `GET /api/quiz/init` **sebelum** membuat apa pun.
- Jika chapter/subtopic yang dimaksud sudah ada → pakai `id`-nya, **jangan duplikat**.
- Jika belum ada → buat chapter dulu, lalu subtopic yang menunjuk `chapter_id`-nya.
- Satu subtopic = satu kelompok soal dengan teknik penyelesaian sejenis.
- `subtopics.slug` harus **unik**, huruf kecil, kebab-case ASCII (mis. `integral-parsial`).

---

## 4. Membersihkan & Menulis Ulang Soal

Soal di PDF sering tidak siap pakai. Sebelum dimasukkan, AI **menulis ulang** soal agar:

- **Mandiri (self-contained).** Tidak merujuk "soal sebelumnya" atau "tabel di halaman 3".
- **Tidak ambigu.** Notasi jelas; nyatakan apa yang dicari ("Tentukan...", "Hitung...").
- **Bersih dari jawaban/langkah.** Soal tidak boleh membocorkan jawaban atau pembahasan.
- **Tipo & OCR diperbaiki.** Perbaiki hasil baca PDF yang rusak (mis. `1` vs `l`, pangkat hilang).

**Soal yang bergantung gambar/diagram:** web merender LaTeX, bukan gambar PDF. Jika soal butuh diagram (grafik, rangkaian, bangun ruang) yang tak bisa dinyatakan dengan LaTeX/teks → tandai `NEEDS_REVIEW` dan laporkan. Jangan masukkan soal yang tidak utuh tanpa gambarnya.

---

## 5. Tabel `problems` — Field & Aturan

| Field | Wajib | Aturan |
|---|---|---|
| `subtopic_id` | Ya | `id` subtopic tempat soal berada. |
| `question_text` | Disarankan | Soal versi **teks polos** (tanpa LaTeX), mis. "Tentukan integral dari 4x pangkat 3 dikurang 2x". Berguna untuk aksesibilitas (screen reader) dan jadi cadangan saat koreksi AI. |
| `question_display` | **Ya** | Soal dalam **LaTeX** (tanpa `$`). Inilah yang dirender ke siswa. |
| `answer_display` | **Ya** | Jawaban akhir dalam **LaTeX**, bentuk paling sederhana & baku. **Inilah sumber kebenaran penilaian** (lihat bagian 6). |
| `acceptable_answers` | Ya | JSON array string — variasi penulisan jawaban. Lihat bagian 6. |
| `difficulty` | Ya | `"Easy"`, `"Medium"`, atau `"Hard"`. |
| `question_type` | Ya | `"open"` (isian) atau `"mc"` (pilihan ganda). Default `"open"`. |
| `mc_options` | Ya | JSON array string. Soal `open` → `"[]"`. Lihat bagian 7. |
| `sort_order` | Ya | Urutan dalam subtopic (1, 2, 3, ...). **Urutkan dari mudah ke sulit.** |

### Kalibrasi `difficulty`

Audiens TPB ITB cukup kuat — "Easy" di sini bukan soal sepele, tapi soal satu langkah konsep.

- `Easy` — satu teknik/rumus langsung, tanpa trik tersembunyi.
- `Medium` — butuh kombinasi teknik, identitas, atau penyesuaian (mis. faktor ½).
- `Hard` — banyak langkah, beberapa teknik bertingkat, atau kasus khusus.

---

## 6. Jawaban: `answer_display` & `acceptable_answers`

**Cara penilaian yang sebenarnya berlaku di aplikasi:**

- **Mode Pilgan:** aplikasi mencocokkan `answer_display` dengan opsi yang dipilih siswa (pencocokan setelah normalisasi teks).
- **Mode Kanvas:** AI koreksi (Gemini 3.1 Flash Lite) membandingkan tulisan siswa dengan `answer_display`.
- `acceptable_answers` **saat ini belum dipakai** untuk penilaian. Tetap diisi demi kelengkapan data & kompatibilitas, tetapi **sumber kebenaran adalah `answer_display`**.

Maka: `answer_display` wajib bentuk paling baku, benar, dan tersederhanakan.

**`acceptable_answers`** — JSON array berisi variasi penulisan polos (notasi keyboard, bukan render LaTeX). Susun sistematis: dengan/tanpa `+C`, urutan faktor berbeda, `1/2x` vs `x/2`, dengan/tanpa `\` LaTeX. Contoh untuk `\dfrac{\sin(2x)}{2} + C`:

```json
["sin(2x)/2+C","sin(2x)/2","1/2sin(2x)+C","1/2sin(2x)","\\sin(2x)/2+C"]
```

---

## 7. Soal Pilihan Ganda (`question_type: "mc"`)

- `mc_options` = JSON array semua opsi (4–5 opsi) dalam LaTeX.
- Salah satu opsi **harus cocok dengan `answer_display`** setelah normalisasi — itulah cara aplikasi menentukan opsi benar.
- **Pengecoh (distractor) harus masuk akal**, bukan asal salah. Pengecoh terbaik = hasil dari kesalahan umum, yaitu nilai-nilai `mistake_result` dari langkah-langkah pembahasan. Ini membuat soal mendiagnosis miskonsepsi.
- Jika `mc_options` dikosongkan (`"[]"`) pada soal yang ingin tampil Pilgan, aplikasi otomatis membuat pengecoh dari jawaban soal lain — tetap jalan, tapi pengecohnya kurang terarah. Untuk soal yang sengaja pilihan ganda, **isi `mc_options` sendiri**.

---

## 8. Pembahasan Langkah (`problem_steps`) — INTI SOP

Tiap soal punya beberapa langkah (`problem_steps`). Setiap langkah satu objek dengan 7 field:

| Field | Isi |
|---|---|
| `step_order` | Nomor urut (1, 2, 3, ...), tanpa lompat. |
| `title` | Judul langkah singkat, Bahasa Indonesia, **berorientasi aksi** (diawali kata kerja). Contoh: "Pecah integral menjadi suku terpisah", "Substitusi balik ke variabel x". |
| `content` | **LaTeX** — inti matematis langkah ini. Boleh `\text{...}` untuk kalimat dalam math. |
| `why` | **Prosa** — *kenapa* langkah ini dilakukan: alasan strategis/logis dalam alur solusi. |
| `intuition` | **Prosa** — model mental / analogi: cara *merasakan* langkah ini supaya paham, bukan hafal. |
| `mistakes` | **Prosa** — kesalahan umum **spesifik di langkah ini** + cara menghindarinya. |
| `mistake_result` | **LaTeX** — hasil SALAH bila kesalahan di `mistakes` dilakukan. Kosong `""` bila tak relevan. |

### Berapa banyak langkah?

**Sebanyak yang dibutuhkan logika soal — bukan angka tetap.** Umumnya 3–6 langkah. Soal `Easy` bisa cukup 3; `Hard` bisa 6–7. Jangan dipanjang-panjangkan dengan langkah kosong, jangan pula dipadatkan sampai melompati aljabar.

- **Langkah pertama** biasanya: kenali jenis soal & pilih teknik.
- **Langkah terakhir** biasanya: jawaban akhir **+ verifikasi** (turunkan kembali / substitusi). Tunjukkan verifikasi ini ke siswa — itu pelajaran berharga.

### `why` vs `intuition` — beda yang tajam

Keduanya **tidak boleh isinya sama**. Bedakan:

- **`why`** menjawab *"kenapa langkah ini perlu ada dalam solusi?"* — logika strategi. Contoh: *"Kita pisahkan per suku karena rumus pangkat hanya berlaku untuk satu suku tunggal."*
- **`intuition`** menjawab *"bagaimana cara membayangkannya supaya masuk akal?"* — analogi/gambaran. Contoh: *"Integral itu kebalikan turunan — karena turunan x⁴ adalah 4x³, integral 4x³ kembali jadi x⁴."*

### Aturan menulis langkah

1. **Kontinuitas.** Baris awal `content` langkah ke-N harus jelas melanjutkan baris akhir langkah ke-(N−1). Siswa harus bisa mengikuti tanpa "lompatan ajaib".
2. **`why`, `intuition`, `mistakes` tidak boleh kosong.** Bila langkah terasa "tidak ada yang salah di sini", tetap tulis penegasan/tip.
3. **`mistakes` spesifik per langkah.** Jangan mengisi keluhan generik yang sama ("jangan lupa +C") di setiap langkah — kaitkan dengan operasi di langkah itu.
4. **`mistake_result` berpasangan dengan `mistakes`.** Ia adalah hasil persis dari kesalahan yang baru saja dijelaskan — bukan kesalahan acak lain.
5. Tidak membocorkan jawaban akhir sebelum langkah terakhir.

---

## 9. Gaya Bahasa & Beban Kognitif

Sebagai pengajar, jaga agar teks ringan dibaca:

- **Kalimat pendek.** Satu kalimat = satu gagasan. Hindari anak kalimat bertingkat.
- **Istilah baru dijelaskan saat pertama muncul.** "LIATE", "fungsi komposit", "antiturunan" — beri penjelasan singkat sekali.
- **Konsisten.** Satu notasi untuk hal yang sama di seluruh soal (mis. selalu `\dfrac`, selalu tulis `\,dx`).
- **Hindari tembok teks.** `why`/`intuition`/`mistakes` cukup 1–3 kalimat masing-masing.
- **Nada mentor.** Boleh "Bayangkan...", "Ingat ya:", "Triknya:". Hindari nada menggurui atau terlalu formal.
- **Positif.** Tunjukkan cara benar lebih dulu, baru peringatkan kesalahannya.

---

## 10. Aturan LaTeX

Field `question_display`, `answer_display`, `content`, `mistake_result`, dan isi `mc_options` dirender sebagai LaTeX (tanpa `$`).

- Pecahan `\dfrac{a}{b}` · Integral `\int ... \,dx` (selalu `\,` sebelum `dx`) · Akar `\sqrt{...}` · Pangkat `x^{2}` · Trig `\sin^2(x)`.
- Kalimat dalam math: `\text{...}`. Baris baru: `\\` · jarak tambah: `\\[6pt]`. Panah: `\implies`, `\Rightarrow`.
- **Escaping JSON:** di file `.json` setiap `\` LaTeX ditulis `\\`. Contoh: LaTeX `\int x\,dx` → JSON `"\\int x\\,dx"`. Aturan sama untuk body JSON via API.

---

## 11. Catatan Mata Pelajaran Lain (Fisika & Kimia)

MAFIKING mencakup Matematika, Fisika, Kimia (data terimpor saat ini baru Integral). Model langkah 7-field tetap dipakai, dengan penyesuaian:

- **Fisika:** langkah pertama tuliskan **"Diketahui & Ditanya"** beserta **satuan**. Jaga konsistensi satuan di tiap langkah; langkah akhir cek kewajaran besaran & satuan. Soal yang butuh diagram → `NEEDS_REVIEW` (lihat bagian 4).
- **Kimia:** tampilkan **persamaan reaksi yang sudah setara**; untuk stoikiometri tunjukkan konversi mol secara eksplisit; perhatikan angka penting & satuan.

Prinsip pedagogis (bagian 1) dan format field (bagian 8) berlaku sama untuk semua mapel.

---

## 12. Contoh Lengkap End-to-End

**Soal mentah dari PDF:** "Hitung ∫(4x³ − 2x) dx"

**Menjadi `problem`:**

```json
{
  "subtopic_id": 4,
  "question_text": "Tentukan hasil integral dari 4x pangkat 3 dikurang 2x terhadap x.",
  "question_display": "\\int (4x^3 - 2x)\\,dx",
  "answer_display": "x^4 - x^2 + C",
  "acceptable_answers": "[\"x^4-x^2+C\",\"x^4-x^2\"]",
  "difficulty": "Easy",
  "question_type": "open",
  "mc_options": "[]",
  "sort_order": 1
}
```

**Menjadi `problem_steps` (4 langkah — jumlah mengikuti kebutuhan soal):**

| # | title | content | why | intuition | mistakes | mistake_result |
|---|---|---|---|---|---|---|
| 1 | Pecah integral menjadi suku terpisah | `\int (4x^3 - 2x)\,dx = \int 4x^3\,dx - \int 2x\,dx` | Integral dari pengurangan boleh dikerjakan suku per suku. Memecahnya membuat tiap bagian jadi bentuk yang rumusnya kita kenal. | Bayangkan membongkar paket: lebih mudah membuka satu per satu daripada sekaligus. | Jangan mengintegralkan `4x^3 - 2x` sekaligus seolah satu fungsi — pisahkan dulu agar aturan pangkat bisa dipakai. | `` |
| 2 | Integralkan suku pertama dengan aturan pangkat | `\int 4x^3\,dx = 4 \cdot \dfrac{x^{4}}{4} = x^4` | Aturan pangkat: `\int x^n\,dx = \dfrac{x^{n+1}}{n+1}`. Pangkat naik jadi 4, lalu dibagi 4. | Integral itu kebalikan turunan. Turunan x⁴ adalah 4x³, jadi integral 4x³ kembali ke x⁴ — angka 4-nya saling habis. | Kesalahan umum: lupa menaikkan pangkat, atau membagi dengan pangkat lama (3), bukan pangkat baru (4). | `\dfrac{4x^4}{3}` |
| 3 | Integralkan suku kedua | `\int 2x\,dx = 2 \cdot \dfrac{x^{2}}{2} = x^2` | Sama seperti sebelumnya: x berpangkat 1, naik jadi 2, dibagi 2. Konstanta 2 habis dibagi 2. | x sama dengan x¹. Naikkan satu tingkat jadi x², lalu bagi pangkat barunya. Turunan x² memang 2x — cocok. | Hindari menulis hasilnya sebagai `2x` atau `2x^2`; x harus naik pangkat dulu. | `2x^2` |
| 4 | Gabungkan, tambah konstanta, lalu cek | `\int (4x^3 - 2x)\,dx = x^4 - x^2 + C \\[6pt] \text{Cek: } \dfrac{d}{dx}(x^4 - x^2 + C) = 4x^3 - 2x \;\checkmark` | Tanda minus dari soal dibawa ke suku kedua. `+C` wajib: integral tak tentu punya tak hingga banyak antiturunan. | Verifikasi paling ampuh: turunkan kembali jawabanmu. Kalau hasilnya sama dengan integran awal, jawaban pasti benar. | Kesalahan paling sering: lupa `+C`. Tanpa `+C`, jawaban integral tak tentu dianggap belum lengkap. | `x^4 - x^2` |

Perhatikan: `why` berisi alasan strategis, `intuition` berisi analogi/gambaran, `mistakes` spesifik tiap langkah, `mistake_result` berpasangan dengan `mistakes`, dan langkah terakhir memuat verifikasi.

---

## 13. Alur Kerja AI

1. **Terima & verifikasi PDF.** Pastikan terbaca; hitung perkiraan jumlah soal; catat halaman/soal yang tak terbaca.
2. **Ekstrak tiap soal** beserta bab/subtopik & tipe (jika tertera).
3. **Bersihkan & tulis ulang soal** (bagian 4).
4. **Petakan chapter/subtopic** — cek existing via `GET /api/quiz/init` (bagian 3).
5. **Selesaikan tiap soal sendiri** — hitung jawaban, verifikasi, susun langkah (bagian 8). Ragu → `NEEDS_REVIEW`.
6. **Susun output** — pilih jalur (bagian 14).
7. **QA** (bagian 15).
8. **Laporkan** ke admin: jumlah berhasil, daftar `NEEDS_REVIEW` + alasan, chapter/subtopic baru.

---

## 14. Jalur Output

### Jalur B — Tambah bertahap via API admin (DEFAULT untuk unggah PDF)

**Inilah jalur yang benar untuk admin menambah soal baru ke bank yang sudah dipakai siswa** — bersifat menambah, tidak menghapus apa pun. Butuh sesi login admin. Urutan:

1. `POST /api/admin/chapters` — `{ title, icon, sort_order }` (jika bab baru)
2. `POST /api/admin/subtopics` — `{ chapter_id, slug, title, icon, description, sort_order }` (jika subtopik baru)
3. `POST /api/admin/problems` — semua field di bagian 5
4. `POST /api/admin/problems/:id/steps` — `{ step_order, title, content, why, intuition, mistakes, mistake_result }`, dipanggil sekali per langkah.

### Jalur A — Bulk `db/question-bank.json` (HANYA untuk seeding awal / rebuild penuh)

`npm run import:questions` **menghapus seluruh tabel soal lalu mengisi ulang dari JSON**. Maka file JSON harus memuat **seluruh bank** (lama + baru), bukan soal baru saja.

- Sebelum apa pun: `npm run export:questions` untuk membackup bank lama, lalu **merge** soal baru ke dalamnya.
- `id` harus unik & konsisten antar tabel (`problem_steps.problem_id` → `problems.id`); soal baru pakai `id` di atas `id` maksimum yang ada.
- `acceptable_answers` & `mc_options` di JSON adalah **string berisi JSON** (escaping ganda).
- Jika DB sudah punya progress/koreksi siswa, import biasa **ditolak**; `npm run import:questions -- --force` hanya bila admin sadar mereset referensi soal.

Struktur file: `{ exportedAt, source, chapters[], subtopics[], problems[], problem_steps[] }` — lihat `db/question-bank.json` yang ada sebagai acuan.

> Untuk kasus "admin mengunggah PDF berisi soal tambahan", **gunakan Jalur B**. Jalur A hanya untuk membangun ulang bank dari nol.

---

## 15. Verifikasi & QA

- [ ] Tiap `problem` punya `question_display` & `answer_display` terisi.
- [ ] Setiap jawaban sudah diverifikasi benar (turunkan kembali / substitusi).
- [ ] Tiap `problem` punya langkah secukupnya; `step_order` runut tanpa lompat.
- [ ] `content`, `why`, `intuition`, `mistakes` tiap langkah tidak kosong.
- [ ] `why` ≠ `intuition` (tidak redundan); `mistakes` spesifik per langkah; `mistake_result` berpasangan dengan `mistakes`.
- [ ] Soal `mc` punya `mc_options` berisi opsi & satu opsi cocok `answer_display`; soal `open` → `mc_options` = `"[]"`.
- [ ] LaTeX ter-escape benar; tidak ada chapter/subtopic duplikat; `slug` unik.
- [ ] Soal bergantung gambar sudah ditandai `NEEDS_REVIEW`, bukan dimasukkan setengah jadi.

Smoke check teknis:

```bash
npm run check
curl -s http://127.0.0.1:3000/api/quiz/init
```

Cek visual: buka subtopic terkait di web → masuk practice → pastikan soal & langkah dirender rapi. **Ingat keterbatasan render di bagian 2** — sampai frontend diperbaiki, hanya `title` yang tampil.

---

## 16. Checklist Ringkas (per soal)

```
[ ] Soal diekstrak utuh & ditulis ulang agar jelas dan mandiri
[ ] Dipetakan ke subtopic yang benar (tanpa duplikat)
[ ] question_display + answer_display (LaTeX) terisi & sederhana
[ ] question_text (teks polos) diisi untuk aksesibilitas
[ ] acceptable_answers + difficulty + question_type + mc_options sesuai
[ ] Langkah pembahasan: tiap langkah satu ide, kontinu, 7 field terisi
[ ] why = strategi, intuition = analogi, mistakes spesifik, mistake_result berpasangan
[ ] Langkah terakhir memuat verifikasi jawaban
[ ] Jawaban diverifikasi ulang — BENAR
[ ] Ragu / butuh gambar → NEEDS_REVIEW, tidak dimasukkan
```

---

## Lampiran — Acuan Gaya

Acuan gaya penulisan `content`/`why`/`intuition`/`mistakes`/`mistake_result`: `king/Mafiking/db/seed-integral-id.js` (5 soal integral Bahasa Indonesia, masing-masing 5 langkah). Gunakan sebagai contoh nada dan kedalaman penjelasan.
