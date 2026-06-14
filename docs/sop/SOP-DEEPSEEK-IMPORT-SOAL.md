# Panduan Import Soal MAFIKING

Dokumen ini menjelaskan cara membuat file soal yang siap diupload ke sistem MAFIKING. Ikuti format di bawah agar soal, pilihan jawaban, dan pembahasan bisa diproses otomatis.

---

## Format File yang Diterima

- **PDF** — hasil scan atau cetak dari buku/lembar soal
- **DOCX** — dokumen Word
- **TXT / MD** — teks biasa atau markdown

---

## Isi yang Perlu Ada di File

Untuk setiap soal, sertakan:

1. **Teks soal** — kalimat pertanyaannya
2. **Pilihan jawaban** (opsional, untuk soal pilihan ganda) — minimal 4 pilihan, tandai yang benar
3. **Pembahasan** (opsional) — langkah penyelesaian dari awal sampai akhir

Jika pembahasan tidak disertakan, sistem akan membuatkan otomatis. Jika kunci jawaban tidak disertakan, sistem akan menentukan sendiri — tapi lebih baik Anda sertakan.

---

## Penulisan Notasi Matematika

Gunakan LaTeX sederhana **tanpa tanda `$`**:

| Yang Dimaksud | Tulis Seperti Ini |
|---|---|
| Pecahan ½ | `\frac{1}{2}` |
| x kuadrat | `x^2` atau `x^{2}` |
| Integral | `\int x^2 dx` |
| Akar | `\sqrt{x}` |
| sin, cos, ln | `\sin x`, `\cos x`, `\ln x` |

---

## Contoh Soal 1 — Pilihan Ganda dengan Pembahasan

```
Soal 1
Nilai dari \int 2x(x^2+1)^3 dx adalah ...

Pilihan:
A. \frac{(x^2+1)^4}{4} + C  ← BENAR
B. \frac{(x^2+1)^3}{3} + C
C. 2x \cdot \frac{(x^2+1)^4}{4} + C
D. (x^2+1)^4 + C

Pembahasan:
Langkah 1 — Substitusi
Misalkan u = x^2+1, maka du = 2x dx.
Integral menjadi \int u^3 du.

Langkah 2 — Integralkan
\int u^3 du = \frac{u^4}{4} + C

Langkah 3 — Substitusi Balik
= \frac{(x^2+1)^4}{4} + C
```

---

## Contoh Soal 2 — Isian (Open) dengan Pembahasan

```
Soal 2
Tentukan turunan pertama dari f(x) = x^3 - 3x^2 + 5x - 2.

Jawaban: 3x^2 - 6x + 5

Pembahasan:
Langkah 1 — Aturan Pangkat
Turunkan suku per suku menggunakan aturan d/dx[x^n] = nx^{n-1}.

Langkah 2 — Hitung
- Turunan x^3 = 3x^2
- Turunan -3x^2 = -6x
- Turunan 5x = 5
- Turunan konstanta -2 = 0

Langkah 3 — Gabungkan
f'(x) = 3x^2 - 6x + 5
```

---

## Contoh Soal 3 — Pilihan Ganda Tanpa Pembahasan

```
Soal 3
Jika \lim_{x \to 2} \frac{x^2 - 4}{x - 2} = L, maka nilai L adalah ...

Pilihan:
A. 0
B. 2
C. 4  ← BENAR
D. Tidak ada

Kunci: C
```

Jika tidak ada pembahasan, sistem akan membuatkannya otomatis berdasarkan jawaban yang benar.

---

## Template Kosong

Salin template ini dan isi dengan soal Anda:

```
Soal [nomor]
[Tulis teks soal di sini]

Pilihan:
A. [pilihan A]
B. [pilihan B]
C. [pilihan C]
D. [pilihan D]
Kunci: [huruf pilihan yang benar]

Pembahasan:
Langkah 1 — [Nama Langkah]
[Penjelasan langkah]

Langkah 2 — [Nama Langkah]
[Penjelasan langkah]

[dst...]
```

Untuk soal isian (tanpa pilihan ganda), hapus bagian Pilihan dan ganti dengan:

```
Jawaban: [tulis jawaban di sini]
```

---

## Tips

- **Sertakan nomor soal** agar urutan tidak kacau saat diproses.
- **Tandai kunci jawaban** dengan jelas — bisa dengan tanda `← BENAR`, `*`, atau `Kunci: A`.
- **Satu file bisa berisi banyak soal** — tidak perlu upload satu per satu.
- **Pembahasan boleh dilewati** — sistem akan membuatkan, tapi kualitasnya lebih baik jika Anda isi sendiri.
- Setelah upload, Anda tetap bisa **mengedit soal, pilihan, dan pembahasan** sebelum menyimpan ke database.
