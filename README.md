# Personal Finance Tracker Telegram + Google Sheets

Personal Finance Tracker sederhana untuk mencatat pemasukan dan pengeluaran melalui Telegram. Data transaksi disimpan otomatis ke Google Sheets, lengkap dengan kategori, akun, budget bulanan, saldo, dan ringkasan pengeluaran.

Sistem berjalan menggunakan Google Apps Script, jadi tidak perlu VPS dan tidak perlu menyalakan laptop terus-menerus.

## Fitur

- Catat pemasukan dan pengeluaran lewat Telegram
- Nominal fleksibel: `25rb`, `25k`, `1jt`, `1,5jt`, dan sejenisnya
- Kategori otomatis berdasarkan kata kunci
- Dukungan beberapa akun: Cash, BCA, BNI, Mandiri, GoPay, DANA, ShopeePay
- Budget bulanan per kategori
- Warning budget pada level 70%, 85%, dan 100%
- Saldo per akun
- Ringkasan harian dan bulanan
- Soft delete transaksi
- Whitelist Telegram User ID
- Anti-duplikasi transaksi
- Dashboard sederhana di Google Sheets
- Struktur sudah disiapkan untuk OCR struk pada pengembangan berikutnya

## Arsitektur

```text
Telegram
   ↓
Telegram Bot API
   ↓
Webhook
   ↓
Google Apps Script
   ↓
Google Sheets
```

Google Apps Script hanya berjalan saat ada request masuk dari Telegram.

## Contoh Penggunaan

Catat pengeluaran:

```text
keluar 35rb makan
keluar 150rb bensin bca
keluar 50rb kopi gopay
keluar 1jt kos bca
```

Catat pemasukan:

```text
masuk 3jt gaji bca
masuk 500rb freelance
```

Catat tabungan:

```text
keluar 500rb nabung bca
```

Jika akun tidak ditulis, sistem memakai akun default `Cash`.

## Command Telegram

```text
/hariini
/bulanini
/saldo
/budget
/terakhir
/hapus TRX-000123
/id
/bantuan
```

Keterangan:

| Command | Fungsi |
|---|---|
| `/hariini` | Ringkasan transaksi hari ini |
| `/bulanini` | Ringkasan transaksi bulan berjalan |
| `/saldo` | Saldo per akun |
| `/budget` | Status budget per kategori |
| `/terakhir` | Lima transaksi terakhir |
| `/hapus TRX-xxxxxx` | Menandai transaksi sebagai Deleted |
| `/id` | Menampilkan Telegram User ID |
| `/bantuan` | Menampilkan bantuan penggunaan |

## Struktur Google Sheets

Setelah setup, sistem membuat sheet berikut:

| Sheet | Fungsi |
|---|---|
| `Transactions` | Seluruh transaksi |
| `Categories` | Daftar kategori dan kata kunci |
| `Accounts` | Daftar akun dan saldo awal |
| `Budgets` | Budget per kategori per bulan |
| `Settings` | Pengaturan non-sensitif |
| `Dashboard` | Ringkasan keuangan |

### Transactions

Kolom utama:

```text
Transaction_ID
Date
Time
Year
Month
Type
Category
Description
Amount
Account
Telegram_User_ID
Telegram_Message_ID
Source
Created_At
Status
```

Transaksi yang dihapus tidak dihapus secara fisik. Nilai `Status` diubah dari:

```text
Active
```

menjadi:

```text
Deleted
```

Transaksi berstatus `Deleted` tidak dihitung dalam saldo, budget, maupun laporan.

## Budget Awal

Konfigurasi awal dapat disesuaikan langsung dari sheet `Budgets`.

| Kategori | Budget |
|---|---:|
| Kos | Rp1.000.000 |
| Makan & Minum | Rp750.000 |
| Transportasi | Rp200.000 |
| Pulsa & Internet | Rp100.000 |
| Belanja Pribadi | Rp100.000 |
| Nongkrong & Hiburan | Rp150.000 |
| Tak Terduga | Rp200.000 |
| Tabungan | Rp500.000 |

Level warning:

```text
0–69,99%   🟢 Aman
70–84,99%  🟡 Perhatian
85–99,99%  🟠 Hampir habis
≥100%      🔴 Terlampaui
```

Budget menggunakan soft limit. Transaksi tetap disimpan walaupun budget sudah terlampaui.

## Setup

### 1. Buat Google Spreadsheet

Buat spreadsheet baru dan beri nama, misalnya:

```text
Keuangan Pribadi
```

Salin Spreadsheet ID dari URL.

Contoh:

```text
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUv/edit
```

Spreadsheet ID:

```text
1AbCdEfGhIjKlMnOpQrStUv
```

### 2. Buka Apps Script

Dari spreadsheet:

```text
Extensions → Apps Script
```

Tempel seluruh isi `Code.gs`, lalu simpan.

### 3. Buat Telegram Bot

Buka:

```text
@BotFather
```

Kirim:

```text
/newbot
```

Ikuti proses sampai mendapat Bot Token.

Jangan simpan Bot Token langsung di source code.

### 4. Ambil Telegram User ID

Bisa menggunakan `@userinfobot`, atau command `/id` setelah bot aktif.

### 5. Isi Script Properties

Buka:

```text
Apps Script
→ Project Settings
→ Script Properties
```

Tambahkan:

```text
TELEGRAM_BOT_TOKEN
SPREADSHEET_ID
AUTHORIZED_USER_IDS
```

Nilai property ditulis langsung tanpa tanda petik.

### 6. Atur Time Zone

Gunakan:

```text
Asia/Jakarta
```

### 7. Cek Konfigurasi

Jalankan:

```text
checkConfiguration()
```

Pastikan hasil utama:

```text
TELEGRAM_BOT_TOKEN   : OK
SPREADSHEET_ID       : OK
AUTHORIZED_USER_IDS  : OK
```

### 8. Setup Google Sheets

Jalankan:

```text
setupPersonalFinanceSystem()
```

Fungsi ini membuat sheet, header, kategori, akun, budget awal, serta dashboard.

Fungsi aman dijalankan ulang.

### 9. Deploy sebagai Web App

Pilih:

```text
Deploy → New deployment → Web app
```

Gunakan:

```text
Execute as: Me
Who has access: Anyone
```

Salin URL Web App yang berakhiran:

```text
/exec
```

Simpan URL tersebut ke Script Properties:

```text
WEBAPP_URL
```

### 10. Pasang Webhook

Jalankan:

```text
setupWebhook()
```

Lalu periksa dengan:

```text
getWebhookInfo()
```

Kondisi normal:

```text
Pending updates: 0
Last error: (tidak ada)
```

## Pengujian

Tes pertama:

```text
/start
```

Lanjut:

```text
masuk 3jt gaji
```

dan:

```text
keluar 35rb makan
```

Setelah itu periksa sheet `Transactions`.

Tes command:

```text
/bulanini
/budget
/saldo
```

## Mengubah Budget

Budget dapat diubah langsung dari sheet:

```text
Budgets
```

Tidak perlu mengubah kode dan tidak perlu deploy ulang.

## Mengubah Saldo Awal

Buka sheet:

```text
Accounts
```

Ubah nilai:

```text
Initial_Balance
```

Saldo dihitung sebagai:

```text
Initial Balance
+ Pemasukan
- Pengeluaran
- Alokasi
```

## Menambah Kategori

Buka sheet:

```text
Categories
```

Tambahkan kategori dan keyword yang sesuai.

Contoh keyword `Makan & Minum`:

```text
makan, nasi, kopi, bakso, ayam, restoran, cafe
```

Jika transaksi tidak cocok dengan keyword apa pun, kategori `Lain-lain` digunakan.

## Menambah Akun

Tambahkan baris baru di sheet `Accounts`.

Contoh:

```text
BRI | Bank | 0 | TRUE
```

## Setelah Mengubah Code.gs

Perubahan kode belum langsung aktif di Web App.

Lakukan:

```text
Deploy
→ Manage deployments
→ Edit
→ New version
→ Deploy
```

Untuk perubahan yang hanya dilakukan di Google Sheets, deploy ulang tidak diperlukan.

## Troubleshooting

### Bot tidak membalas

Jalankan:

```text
getWebhookInfo()
```

Periksa `Pending updates` dan `Last error`.

### Bot membalas berkali-kali

Biasanya Telegram sedang melakukan retry karena webhook gagal.

Pastikan:

```text
Pending updates: 0
Last error: (tidak ada)
```

Jangan terus mengirim pesan selama webhook masih error.

### Error 302 Found

Jika Telegram menampilkan:

```text
Wrong response from the webhook: 302 Found
```

pastikan respons webhook menggunakan `HtmlService`.

Contoh:

```javascript
function jsonResponse(payload) {
  return HtmlService.createHtmlOutput(
    JSON.stringify(payload || { ok: true })
  );
}
```

Setelah mengubah kode, deploy versi baru lalu jalankan kembali `setupWebhook()`.

### Jam transaksi salah

Pastikan timezone Apps Script:

```text
Asia/Jakarta
```

### Kategori selalu Lain-lain

Tambahkan keyword yang sesuai di sheet `Categories`.

### Dashboard belum berubah

Jalankan:

```text
refreshDashboard()
```

## Keamanan

Credential disimpan di Script Properties, bukan di `Code.gs`.

Jangan membagikan:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
```

Jika Bot Token pernah terlanjur terlihat di chat, screenshot, atau repository publik, segera reset melalui BotFather.

Akses data keuangan dibatasi menggunakan `AUTHORIZED_USER_IDS`.

## OCR Struk

Struktur untuk OCR sudah disiapkan, tetapi implementasi OCR belum menjadi bagian dari versi awal.

Rencana alurnya:

```text
Foto struk
↓
Telegram
↓
OCR
↓
Baca merchant, tanggal, dan total
↓
Konfirmasi di Telegram
↓
Simpan ke Transactions
```

Hasil OCR sebaiknya tidak langsung disimpan tanpa konfirmasi pengguna.

Source transaksi OCR nantinya menggunakan:

```text
Telegram OCR
```

## Roadmap

Beberapa fitur yang bisa ditambahkan:

- OCR struk
- tombol konfirmasi Telegram
- edit transaksi
- recurring expense
- notifikasi tagihan
- budget rollover
- laporan otomatis
- backup ke Excel

## Catatan

Untuk pemakaian sehari-hari, cukup gunakan Telegram. Google Sheets dipakai untuk pengaturan dan melihat data secara lebih lengkap.

Selama webhook aktif, bot tetap dapat digunakan meskipun laptop atau komputer sedang mati.
