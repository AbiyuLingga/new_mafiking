# End-to-End Process Pemesanan dan Pembayaran Customer Mafiking

**Brand:** Mafiking  
**Website:** https://mafiking.com  
**Jenis layanan:** Platform belajar online untuk mahasiswa TPB, berisi Try Out, latihan Matematika/Fisika/Kimia, koreksi jawaban berbasis AI, progres belajar, dan paket akses berbayar.

## Ringkasan Layanan

Mafiking menyediakan layanan pembelajaran online. Customer dapat membuka website, melihat informasi layanan, mencoba paket gratis, atau membeli paket berbayar seperti paket Try Out dan paket akses belajar. Paket berbayar memberi akses ke fitur sesuai deskripsi paket, misalnya simulasi Try Out, koreksi AI, pembahasan soal, progres belajar, dan fitur pendukung lainnya.

Harga, durasi, jumlah soal, dan fitur paket ditampilkan pada halaman paket atau halaman checkout sebelum customer melakukan pembayaran.

## Alur Customer dari Pemesanan sampai Pembayaran

### 1. Customer membuka website Mafiking

Customer mengakses website Mafiking melalui browser di alamat:

```text
https://mafiking.com
```

Di halaman awal, customer dapat melihat penjelasan layanan Mafiking, fitur belajar, Try Out, dan tombol untuk melihat paket.

### 2. Customer melihat dan memilih produk/jasa

Customer dapat memilih layanan yang tersedia, antara lain:

- Try Out gratis untuk mencoba alur latihan.
- Try Out berbayar, misalnya Tryout Bundling atau Tryout Premium.
- Paket akses belajar berbayar, seperti Trial 7 Hari, Bulanan, atau Semester.

Pada halaman paket, customer melihat informasi penting sebelum membeli:

- nama paket;
- deskripsi paket;
- harga;
- durasi akses;
- jumlah soal atau cakupan layanan;
- fitur yang didapatkan.

Jika customer memilih paket gratis, customer dapat masuk ke alur latihan tanpa pembayaran. Jika customer memilih paket berbayar, customer diarahkan ke proses checkout.

### 3. Customer login atau mendaftar akun

Sebelum membeli paket berbayar, customer perlu login atau membuat akun. Akun digunakan untuk:

- mencatat paket yang dibeli;
- mengaktifkan akses setelah pembayaran berhasil;
- menyimpan progres latihan;
- menghubungkan transaksi dengan email customer.

Jika customer belum login saat memilih paket berbayar, sistem menampilkan alur login/daftar terlebih dahulu, lalu mengembalikan customer ke halaman checkout.

### 4. Customer masuk ke halaman checkout

Setelah memilih paket berbayar dan login, customer masuk ke halaman checkout Mafiking. Pada halaman ini customer melihat kembali paket yang akan dibeli dan mengisi data kontak pembelian.

Data yang diminta:

- nama lengkap pembeli;
- email aktif pembeli.

Email digunakan untuk identifikasi pembelian, informasi invoice, dan bantuan jika ada kendala pembayaran.

### 5. Customer memeriksa ringkasan pesanan

Sebelum membayar, customer melihat ringkasan pesanan yang berisi:

- nama paket;
- durasi atau jenis akses;
- total harga dalam Rupiah;
- informasi bahwa pembayaran akan diproses melalui QRIS in-app saat provider QRIS lokal aktif, atau melalui payment gateway jika mode gateway seperti Midtrans sudah dikonfigurasi.

Customer dapat kembali ke halaman paket jika ingin mengganti paket sebelum menekan tombol bayar.

### 6. Customer menekan tombol bayar

Setelah data checkout lengkap, customer menekan tombol bayar. Sistem Mafiking membuat data transaksi dengan informasi:

- akun customer;
- nama dan email pembeli;
- paket yang dibeli;
- total pembayaran;
- order ID transaksi;
- status awal pembayaran.

Order ID digunakan untuk melacak status transaksi.

### 7. Customer melihat halaman pembayaran

Setelah transaksi dibuat, Mafiking menampilkan instruksi pembayaran. Pada provider QRIS lokal yang sedang aktif, customer melihat popup QRIS di website Mafiking dan URL status seperti `/payment?merchantOrderId=...` tetap menyimpan order ID. Pada integrasi produksi Midtrans, customer akan melihat halaman pembayaran Midtrans atau Snap Checkout sesuai konfigurasi merchant.

Di halaman payment gateway, jika mode Midtrans sudah aktif, customer dapat memilih metode pembayaran yang tersedia, misalnya QRIS, virtual account, e-wallet, atau metode lain yang sudah aktif pada akun merchant.

### 8. Customer menyelesaikan pembayaran

Customer mengikuti instruksi pembayaran yang tampil di halaman payment gateway. Contoh proses:

- memilih metode pembayaran;
- mendapatkan QR code, nomor virtual account, atau instruksi pembayaran lain;
- membayar sesuai nominal yang ditampilkan;
- menunggu konfirmasi pembayaran.

Jika pembayaran belum selesai, status transaksi tetap pending. Jika pembayaran gagal atau kedaluwarsa, customer dapat mengulang proses pembelian atau menghubungi Mafiking.

### 9. Customer melihat status di website Mafiking

Untuk QRIS lokal, customer tetap berada di website Mafiking dan dapat mengecek status dari popup pembayaran. Untuk mode gateway seperti Midtrans, setelah customer menyelesaikan atau meninggalkan proses pembayaran, customer diarahkan kembali ke website Mafiking melalui return/finish URL. Halaman Mafiking menampilkan status pembayaran berdasarkan order ID.

Status yang dapat ditampilkan:

- menunggu pembayaran;
- pembayaran berhasil;
- pembayaran gagal;
- status belum terkonfirmasi.

### 10. Sistem menerima notifikasi pembayaran

Payment gateway mengirimkan notifikasi pembayaran ke sistem Mafiking melalui callback/notification URL. Sistem Mafiking kemudian memperbarui status transaksi berdasarkan hasil pembayaran.

Jika pembayaran berhasil, status transaksi berubah menjadi sukses. Jika gagal, status transaksi berubah menjadi gagal. Jika masih menunggu pembayaran, status tetap pending.

### 11. Akses customer diaktifkan setelah pembayaran berhasil

Setelah status pembayaran sukses, sistem mengaktifkan akses customer sesuai paket yang dibeli. Customer dapat kembali ke halaman Try Out atau Belajar untuk menggunakan fitur yang sudah aktif.

Contoh akses yang diberikan:

- akses paket Try Out yang dibeli;
- akses latihan dan fitur premium sesuai paket;
- koreksi AI dan pembahasan sesuai ketentuan paket;
- progres belajar yang tersimpan di akun customer.

### 12. Penanganan kendala pembayaran

Jika pembayaran gagal, pending terlalu lama, atau dana customer sudah terpotong tetapi akses belum aktif, customer dapat menghubungi Mafiking dengan menyertakan:

- nama akun;
- email pembelian;
- order ID;
- waktu pembayaran;
- bukti pembayaran;
- kronologi singkat kendala.

Tim Mafiking akan memeriksa status transaksi dan membantu aktivasi akses atau tindak lanjut sesuai ketentuan layanan.

## Ringkasan Flow Singkat

```text
Customer buka mafiking.com
-> melihat layanan dan paket
-> memilih paket gratis atau berbayar
-> login/daftar jika membeli paket berbayar
-> masuk checkout
-> mengisi nama dan email
-> memeriksa ringkasan pesanan
-> klik bayar
-> sistem membuat order ID dan instruksi pembayaran
-> QRIS lokal tampil sebagai popup in-app, atau customer diarahkan ke payment gateway/Midtrans jika mode Midtrans aktif
-> customer membayar sesuai metode yang aktif
-> customer menyelesaikan pembayaran
-> QRIS reconciliation atau payment gateway mengirim callback/notifikasi
-> Mafiking memperbarui status transaksi
-> jika sukses, akses paket aktif otomatis
-> customer mulai menggunakan Try Out atau fitur belajar
```

## Informasi Produk dan Harga yang Ditampilkan ke Customer

Mafiking menampilkan harga dan detail paket sebelum customer melakukan pembayaran. Contoh paket yang tersedia:

| Paket | Harga | Keterangan |
| --- | ---: | --- |
| Trial 7 Hari | Rp 29.000 | Akses semua modul dan koreksi AI selama masa trial. |
| Bulanan | Rp 99.000 | Akses penuh selama 30 hari. |
| Semester | Rp 249.000 | Akses belajar untuk periode semester. |
| Tryout Bundling | Rp 50.000 | Simulasi Try Out untuk beberapa mata pelajaran. |
| Tryout Premium | Rp 100.000 | Simulasi Try Out premium dengan fitur tambahan. |
| Tryout Gratis | Gratis | Paket percobaan tanpa proses pembayaran. |

Harga dan isi paket dapat berubah sesuai promo atau pembaruan layanan. Customer selalu melihat harga final di halaman paket atau checkout sebelum melakukan pembayaran.

## Kebijakan Akses dan Refund

- Akses paket berbayar diberikan setelah pembayaran terkonfirmasi berhasil.
- Pembayaran yang gagal atau kedaluwarsa tidak mengaktifkan akses.
- Refund tidak otomatis diberikan untuk perubahan pikiran atau kesalahan memilih paket.
- Permintaan bantuan atau refund dapat dipertimbangkan jika terjadi pembayaran ganda, dana terpotong tetapi akses tidak aktif, atau gangguan layanan signifikan dari sisi Mafiking.
- Customer perlu menghubungi Mafiking dengan bukti transaksi dan informasi akun agar pemeriksaan dapat dilakukan.

## Kontak Bantuan

Customer dapat menghubungi tim Mafiking jika mengalami kendala akun, paket, atau pembayaran.

```text
Website: https://mafiking.com
WhatsApp: +62 812-4604-9951
Instagram: @mafiking._
```

Gunakan kontak resmi yang ditampilkan pada website Mafiking saat dokumen ini dikirim.
