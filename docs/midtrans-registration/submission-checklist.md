# Checklist Submission Ulang Midtrans

Gunakan checklist ini sebelum mengirim ulang dokumen ke Midtrans.

## Dokumen yang Dikirim

- [ ] Upload `end-to-end-process-mafiking.md` atau salin isi `end-to-end-process-copy-paste.txt`.
- [ ] Pastikan informasi yang dikirim menjawab permintaan Midtrans tentang proses end-to-end customer.
- [ ] Pastikan dokumen tidak mengklaim Midtrans sudah live jika production key dan metode pembayaran belum aktif.

## Website dan Informasi Produk

- [ ] Website `https://mafiking.com` dapat diakses publik.
- [ ] Halaman awal menjelaskan Mafiking sebagai platform belajar online.
- [ ] Customer dapat menemukan halaman paket atau tombol "Lihat Paket".
- [ ] Nama paket, harga, durasi, dan fitur terlihat sebelum customer membayar.
- [ ] Paket gratis dan paket berbayar dibedakan dengan jelas.
- [ ] Syarat dan ketentuan tersedia dan dapat diakses publik.

## Alur Checkout

- [ ] Customer dapat memilih paket.
- [ ] Customer diarahkan untuk login/daftar sebelum membeli paket berbayar.
- [ ] Customer mengisi nama lengkap dan email aktif di halaman checkout.
- [ ] Customer melihat ringkasan pesanan dan total harga.
- [ ] Customer menekan tombol bayar untuk membuat transaksi.
- [ ] Untuk QRIS lokal saat ini, QR/status pembayaran tampil langsung sebagai popup in-app.
- [ ] Jika submission memakai Midtrans, customer diarahkan ke payment gateway dan kembali ke Mafiking lewat finish/return URL.
- [ ] Mafiking menampilkan status pembayaran dengan order ID yang sama.
- [ ] Akses paket aktif setelah pembayaran sukses.

## Informasi Bantuan

- [ ] Website menampilkan kontak bantuan yang aktif.
- [ ] Customer diberi instruksi jika pembayaran pending, gagal, atau dana terpotong tetapi akses belum aktif.
- [ ] Customer diminta menyertakan order ID, email pembelian, waktu pembayaran, dan bukti pembayaran saat menghubungi bantuan.

## Catatan Teknis untuk Tim Mafiking

- [ ] Jika sudah pindah ke Midtrans, update kode payment gateway dan callback URL sesuai konfigurasi Midtrans production.
- [ ] Pastikan finish/return URL mengarah ke halaman status pembayaran Mafiking.
- [ ] Pastikan notification/callback URL dapat menerima update status pembayaran dari Midtrans.
- [ ] Pastikan harga di dokumen masih sama dengan harga yang tampil di website saat submission.
