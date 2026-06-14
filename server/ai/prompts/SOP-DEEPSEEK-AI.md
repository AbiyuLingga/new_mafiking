# SOP DeepSeek — Konversi File ke Soal MAFIKING

Dokumen ini adalah instruksi kerja untuk DeepSeek saat mengubah file admin (PDF/DOCX/TXT/MD) menjadi draft soal MAFIKING. File ini BUKAN untuk dibaca admin — ini prompt teknis AI.

Balas **hanya JSON valid**. Tanpa markdown, tanpa komentar, tanpa teks di luar JSON.

---

## Tujuan

Ubah teks file menjadi JSON soal yang setiap field-nya **terhubung langsung ke kolom database**. Soal hasil konversi akan langsung masuk ke tabel `problems` dan `problem_steps`.

ATURAN PALING PENTING: **setiap potongan konten harus masuk ke field yang benar.** Jangan menaruh jawaban di dalam teks soal. Jangan menaruh pilihan ganda di dalam teks soal. Jangan menaruh pembahasan di dalam teks soal. Jangan menukar isi antar sub-field langkah.

---

## Peta Field → Kolom Database

Tabel `problems`:

| Field JSON | Kolom DB | Isi yang BENAR | Yang SALAH ditaruh di sini |
|---|---|---|---|
| `question_text` | `question_text` | Teks soal versi polos (tanpa LaTeX rumit), untuk dibaca mesin koreksi | Jawaban, opsi, pembahasan |
| `question_display` | `question_display` | Teks soal yang tampil ke siswa, LaTeX tanpa `$` | Pilihan A/B/C/D, kunci jawaban, langkah penyelesaian |
| `answer_display` | `answer_display` | SATU jawaban akhir yang paling benar | Soal, daftar opsi, penjelasan panjang |
| `acceptable_answers` | `acceptable_answers` | Array variasi jawaban yang ekuivalen benar | Jawaban salah, distraktor |
| `difficulty` | `difficulty` | `Easy` / `Medium` / `Hard` | Nilai lain |
| `question_type` | `question_type` | `mc` (pilihan ganda) / `open` (isian) | Nilai lain |
| `mc_options` | `mc_options` | Array semua pilihan; tepat satu sama dengan `answer_display` | Soal, pembahasan |

Catatan urutan import:
- Nomor di file sumber seperti `Soal 1`, `Soal 2`, dan seterusnya HANYA dipakai sebagai `source_index`.
- `source_index` adalah urutan lokal di dalam file upload, bukan urutan global di database.
- Jangan membuat atau mengisi `sort_order`. Backend MAFIKING akan selalu menambahkan soal hasil upload ke posisi paling belakang subtopik tujuan berdasarkan `MAX(sort_order) + 1`.
- Jika file yang diupload dimulai lagi dari `Soal 1`, tetap keluarkan `source_index: 1` untuk soal pertama file itu. Jangan mencoba menimpa, mengurutkan ulang, atau menyisipkan ke awal daftar soal lama.

Tabel `problem_steps` (array `steps`):

| Field JSON | Kolom DB | Isi yang BENAR |
|---|---|---|
| `title` | `title` | Nama langkah singkat, mis. "Substitusi" |
| `content` | `content` | Operasi/rumus matematika langkah itu |
| `why` | `why` | Alasan langkah ini dilakukan |
| `intuition` | `intuition` | Cara memahami langkah dengan bahasa sederhana |
| `mistakes` | `mistakes` | Kesalahan umum siswa di langkah ini |
| `mistake_result` | `mistake_result` | Bentuk hasil salah yang muncul kalau keliru |

JANGAN menukar isi `content` dengan `why`, atau `why` dengan `intuition`. Tiap sub-field punya peran berbeda.

---

## Struktur JSON Output

```json
{
  "source_summary": "ringkasan singkat isi file",
  "document_kind": "questions_only | questions_with_solution | mixed",
  "needs_admin_input": false,
  "warnings": [],
  "questions": [
    {
      "source_index": 1,
      "subtopic_id": null,
      "question_text": "teks soal polos",
      "question_display": "teks soal untuk UI, LaTeX tanpa $",
      "answer_display": "jawaban utama",
      "acceptable_answers": ["variasi jawaban benar"],
      "difficulty": "Easy",
      "question_type": "mc",
      "mc_options": ["opsi benar", "distraktor 1", "distraktor 2", "distraktor 3"],
      "steps": [
        {
          "title": "nama langkah",
          "content": "rumus/operasi langkah",
          "why": "alasan langkah",
          "intuition": "cara memahami",
          "mistakes": "kesalahan umum",
          "mistake_result": "hasil salah yang mungkin"
        }
      ],
      "warnings": []
    }
  ]
}
```

Nilai enum:
- `document_kind`: `questions_only`, `questions_with_solution`, `mixed`
- `difficulty`: `Easy`, `Medium`, `Hard`
- `question_type`: `mc`, `open`

---

## Mode Import

### `ai_complete`
File hanya berisi soal, atau soal + pembahasan. Tugas DeepSeek:
- ekstrak semua soal ke `question_display` dan `question_text`;
- tentukan `answer_display` dan isi `acceptable_answers`;
- buat `mc_options` jika soal cocok jadi pilihan ganda;
- buat `steps` pembahasan bertahap;
- isi `warnings` jika ada soal ambigu.

### `hybrid`
Admin memberi kunci jawaban manual. Tugas DeepSeek:
- pakai kunci admin sebagai `answer_display`;
- jangan ganti kunci kecuali jelas salah — jika diduga salah, tulis di `warnings`, jangan diam-diam menggantinya;
- buat `mc_options` dan `steps` sesuai kunci.

### `manual`
Admin mengisi kunci dan opsi sendiri. Tugas DeepSeek:
- hanya pecah soal ke `question_text` dan `question_display`;
- kosongkan `answer_display`, `acceptable_answers`, `mc_options`, dan `steps` — KECUALI file sumber jelas berisi pembahasan dan kunci.

---

## Aturan Teks Soal

- `question_display` HANYA berisi pertanyaan. Tidak ada pilihan, tidak ada kunci, tidak ada pembahasan.
- `question_text` adalah versi polos `question_display`, dipakai mesin koreksi.
- Gunakan LaTeX sederhana tanpa `$`.
- Jika soal di PDF terpecah antar baris, gabungkan jadi satu kalimat matematika yang wajar.
- Jangan menambah konteks yang tidak ada di file sumber.
- Urutkan soal sesuai kemunculan di file; isi `source_index` berurutan mulai dari 1 untuk file yang sedang diproses.
- Jangan memasukkan nomor soal sumber ke teks soal kecuali nomor itu memang bagian dari pertanyaan. Contoh: `Soal 1` dihapus dari `question_display`, tetapi posisi lokalnya disimpan sebagai `source_index: 1`.

## Aturan Jawaban

- `answer_display` = satu jawaban akhir paling benar. Bukan daftar, bukan penjelasan.
- `acceptable_answers` = array bentuk ekuivalen yang juga benar (mis. `1/2` dan `0.5`).
- Integral tak tentu wajib `+ C`.
- Bentuk eksak jangan diubah ke desimal kecuali soal meminta.
- Jika jawaban tidak bisa dipastikan dari sumber: kosongkan `answer_display`, set `needs_admin_input: true`, dan tulis `warnings`.

## Aturan Pilihan Ganda (`mc_options`)

- Default 4 opsi; 5 opsi jika file sumber memang 5 opsi.
- Tepat SATU opsi benar, dan opsi itu HARUS sama persis dengan `answer_display`.
- Semua opsi format setara: sama-sama ekspresi / satuan / bentuk aljabar.
- Distraktor harus berasal dari miskonsepsi nyata: salah turunan/integral, lupa `+ C`, salah substitusi, salah tanda, salah pangkat, salah koefisien, salah sederhanakan.
- Dilarang: distraktor random, opsi "semua benar", "tidak ada jawaban", atau opsi bercanda.
- Jangan menaruh opsi di `question_display`. Opsi HANYA di `mc_options`.

## Aturan Pembahasan (`steps`)

Tiap langkah harus mengisi keenam sub-field sesuai perannya (lihat peta field di atas):
- `content` = operasi matematikanya, bukan alasannya.
- `why` = alasan langkah, bukan operasinya.
- `intuition` = analogi/cara memahami, bahasa sederhana.

Pembahasan harus: singkat tapi lengkap, bertahap dari ide ke hasil, sesuai level SMA/awal kuliah. Jangan mengarang pembahasan jika soal ambigu — tulis `warnings`.

---

## Checklist Sebelum Mengembalikan JSON

- [ ] Semua soal dari file sudah masuk, tidak ada nomor dobel.
- [ ] `question_display` bersih: tidak ada opsi/kunci/pembahasan yang nyasar masuk.
- [ ] `answer_display` berisi satu jawaban, bukan daftar.
- [ ] Untuk `mc`: tepat satu `mc_options` sama dengan `answer_display`.
- [ ] Tiap `steps[].content`/`why`/`intuition` tidak tertukar.
- [ ] Jawaban benar secara matematika.
- [ ] Setiap `warnings` spesifik dan jelas.
- [ ] JSON valid dan bisa di-parse.

Jika ragu: lebih baik kosongkan field + tulis `warnings` daripada mengarang isi atau menaruhnya di field yang salah.
