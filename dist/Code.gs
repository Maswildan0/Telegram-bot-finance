/**
 * ============================================================================
 * PERSONAL FINANCE TRACKER — TELEGRAM + GOOGLE APPS SCRIPT + GOOGLE SHEETS
 * FILE GABUNGAN (hasil build.js) — tempel seluruh isi file ini ke editor
 * Apps Script sebagai satu file "Code.gs".
 *
 * Isi dipisah menjadi bagian-bagian berikut (urut):
 *   - 00_Config.gs
 *   - 01_Sheets.gs
 *   - 02_Format.gs
 *   - 03_Parser.gs
 *   - 04_Transactions.gs
 *   - 05_Handlers.gs
 *   - 06_Bot.gs
 *   - 07_Setup.gs
 *   - 08_Webhook.gs
 *
 * JANGAN isi credential di file ini. Semua token/ID disimpan lewat
 * Script Properties (lihat STEP 6 di PANDUAN.md).
 * ============================================================================
 */

/* ===== 00_Config.gs ===== */

/**
 * ============================================================================
 * PERSONAL FINANCE TRACKER — TELEGRAM + GOOGLE APPS SCRIPT + GOOGLE SHEETS
 * ----------------------------------------------------------------------------
 * FILE 00 — Konfigurasi, Konstanta, dan Data Awal
 *
 * File ini TIDAK menyimpan credential apa pun.
 * Token/secret disimpan di Script Properties (lihat FILE 10 dan STEP 6).
 * ============================================================================
 */

/** Konfigurasi umum (non-sensitif, aman dibaca siapa pun). */
const CONFIG = {
  TIMEZONE_DEFAULT: 'Asia/Jakarta',
  ACCOUNT_DEFAULT: 'Cash',
  CATEGORY_FALLBACK: 'Lain-lain',
  WARNING_1_DEFAULT: 70,
  WARNING_2_DEFAULT: 85,
  WARNING_CRITICAL: 100,
  LOCK_TIMEOUT_MS: 20000,
  LAST_TRANSACTIONS_LIMIT: 5,
  MAX_AMOUNT: 1000000000000,
  ID_PREFIX: 'TRX-',
  ID_PAD: 6,
  TELEGRAM_MAX_LENGTH: 4000
};

/** Nama-nama sheet. Jangan diubah setelah data mulai terisi. */
const SHEET = {
  TRANSACTIONS: 'Transactions',
  CATEGORIES: 'Categories',
  ACCOUNTS: 'Accounts',
  BUDGETS: 'Budgets',
  SETTINGS: 'Settings',
  DASHBOARD: 'Dashboard'
};

/** Header kolom tiap sheet — urutan kolom = urutan penulisan data. */
const HEADERS = {
  Transactions: [
    'Transaction_ID', 'Date', 'Time', 'Year', 'Month', 'Type', 'Category',
    'Description', 'Amount', 'Account', 'Telegram_User_ID', 'Telegram_Message_ID',
    'Source', 'Created_At', 'Status'
  ],
  Categories: [
    'Category', 'Type', 'Monthly_Budget', 'Warning_Level_1', 'Warning_Level_2',
    'Active', 'Keywords'
  ],
  Accounts: ['Account', 'Type', 'Initial_Balance', 'Active'],
  Budgets: ['Year', 'Month', 'Category', 'Budget', 'Warning_1', 'Warning_2', 'Active'],
  Settings: ['Key', 'Value'],
  Dashboard: ['Item', 'Nilai']
};

/** Jenis transaksi yang dipakai di kolom Type. */
const TX_TYPE = {
  EXPENSE: 'Pengeluaran',
  INCOME: 'Pemasukan',
  ALLOCATION: 'Alokasi'
};

/** Status transaksi (soft delete memakai Deleted). */
const TX_STATUS = {
  ACTIVE: 'Active',
  DELETED: 'Deleted'
};

/** Sumber transaksi — Telegram OCR disiapkan untuk V2 (scan struk). */
const TX_SOURCE = {
  TEXT: 'Telegram Text',
  OCR: 'Telegram OCR'
};

/** Nama bulan Bahasa Indonesia, index 0 = Januari. */
const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/** Emoji kategori untuk tampilan Telegram. */
const CATEGORY_EMOJI = {
  'Kos': '🏠',
  'Pulsa & Internet': '📱',
  'Makan & Minum': '🍚',
  'Transportasi': '🛵',
  'Belanja Pribadi': '🛍',
  'Nongkrong & Hiburan': '☕',
  'Tak Terduga': '🚨',
  'Tabungan': '🏦',
  'Gaji': '💼',
  'Bonus': '🎁',
  'Freelance': '🧑💻',
  'Transfer Masuk': '📥',
  'Lain-lain': '💸'
};

/** Kata kunci jenis transaksi pada pesan Telegram. */
const TYPE_KEYWORDS = {
  Pengeluaran: ['keluar', 'pengeluaran', 'bayar', 'belanja', 'spend'],
  Pemasukan: ['masuk', 'pemasukan', 'terima', 'dapat', 'income']
};

/** Alias input akun → nama akun resmi di sheet Accounts. */
const ACCOUNT_ALIASES = {
  cash: 'Cash',
  tunai: 'Cash',
  bca: 'BCA',
  bni: 'BNI',
  mandiri: 'Mandiri',
  gopay: 'GoPay',
  gojek: 'GoPay',
  dana: 'DANA',
  shopeepay: 'ShopeePay'
};

/** Kode emoji level budget. */
const LEVEL_EMOJI = {
  AMAN: '🟢',
  PERHATIAN: '🟡',
  HAMPIR: '🟠',
  TERLAMPAUI: '🔴'
};

/** Data awal sheet Categories. Monthly_Budget kosong = tanpa budget. */
const SEED_CATEGORIES = [
  // --- Pengeluaran wajib ---
  {
    Category: 'Kos', Type: 'Pengeluaran', Monthly_Budget: 1000000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'kos, kost, indekos, kontrakan, sewa kamar, sewa'
  },
  {
    Category: 'Pulsa & Internet', Type: 'Pengeluaran', Monthly_Budget: 100000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'pulsa, internet, wifi, paket data, kuota, indihome, telkomsel, xl, tri, byu, token listrik'
  },
  // --- Pengeluaran terkendali ---
  {
    Category: 'Makan & Minum', Type: 'Pengeluaran', Monthly_Budget: 750000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'makan, nasi, kopi, bakso, ayam, restoran, resto, cafe, kafe, sarapan, makan siang, makan malam, jajan, mie, indomie, sate, warteg, seblak, gorengan, minum, air mineral, teh, susu, es, snack, cemilan, roti, martabak'
  },
  {
    Category: 'Transportasi', Type: 'Pengeluaran', Monthly_Budget: 200000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'bensin, pertalite, pertamax, solar, parkir, tol, grab, gojek, ojol, ojek, angkot, krl, mrt, transjakarta, tiket, ongkir, kurir, tarif, travel'
  },
  {
    Category: 'Belanja Pribadi', Type: 'Pengeluaran', Monthly_Budget: 100000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'baju, sepatu, sandal, skincare, belanja, pakaian, celana, tas, jaket, kaos, sabun, shampoo, sampo, odol, tissue, masker, vitamin, obat, kado, hadiah'
  },
  {
    Category: 'Nongkrong & Hiburan', Type: 'Pengeluaran', Monthly_Budget: 150000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'nongkrong, nongkrong, ngopi, bioskop, film, netflix, spotify, game, top up game, hiburan, konser, karaoke, wisata, liburan, jalan jalan'
  },
  {
    Category: 'Tak Terduga', Type: 'Pengeluaran', Monthly_Budget: 200000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'tak terduga, darurat, emergency, denda, pajak, servis, service, perbaikan, ban bocor, rumah sakit, klinik, duka, sumbangan, donasi, kehilangan'
  },
  {
    Category: 'Lain-lain', Type: 'Pengeluaran', Monthly_Budget: '',
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: ''
  },
  // --- Alokasi keuangan (tabungan) ---
  {
    Category: 'Tabungan', Type: 'Alokasi', Monthly_Budget: 500000,
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'tabungan, nabung, menabung, saving, investasi, reksadana, reksa dana, saham, deposito, emas, dana darurat'
  },
  // --- Pemasukan ---
  {
    Category: 'Gaji', Type: 'Pemasukan', Monthly_Budget: '',
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'gaji, gajian, payroll, upah, salary, honor bulanan'
  },
  {
    Category: 'Bonus', Type: 'Pemasukan', Monthly_Budget: '',
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'bonus, insentif, thr, komisi, hadiah, cashback besar'
  },
  {
    Category: 'Freelance', Type: 'Pemasukan', Monthly_Budget: '',
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'freelance, proyek, project, jasa, honor, honorarium, klien, desain, coding, lembur'
  },
  {
    Category: 'Transfer Masuk', Type: 'Pemasukan', Monthly_Budget: '',
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: 'transfer masuk, transferan, tf masuk, kiriman, uang masuk, dana masuk, refund, cashback, transfer'
  },
  {
    Category: 'Lain-lain', Type: 'Pemasukan', Monthly_Budget: '',
    Warning_Level_1: 70, Warning_Level_2: 85, Active: true,
    Keywords: ''
  }
];

/** Data awal sheet Accounts. Initial_Balance boleh diubah manual kapan saja. */
const SEED_ACCOUNTS = [
  { Account: 'Cash', Type: 'Cash', Initial_Balance: 0, Active: true },
  { Account: 'BCA', Type: 'Bank', Initial_Balance: 0, Active: true },
  { Account: 'BNI', Type: 'Bank', Initial_Balance: 0, Active: true },
  { Account: 'Mandiri', Type: 'Bank', Initial_Balance: 0, Active: true },
  { Account: 'GoPay', Type: 'E-Wallet', Initial_Balance: 0, Active: true },
  { Account: 'DANA', Type: 'E-Wallet', Initial_Balance: 0, Active: true },
  { Account: 'ShopeePay', Type: 'E-Wallet', Initial_Balance: 0, Active: true }
];

/** Data awal sheet Settings (konfigurasi tidak sensitif). */
const SEED_SETTINGS = [
  ['Timezone', 'Asia/Jakarta'],
  ['Currency', 'IDR'],
  ['Default_Account', 'Cash'],
  ['Warning_Level_1', '70'],
  ['Warning_Level_2', '85'],
  ['Critical_Level', '100']
];

/** Nama property sensitif di Script Properties. */
const PROP = {
  BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  AUTHORIZED_USER_IDS: 'AUTHORIZED_USER_IDS',
  WEBHOOK_SECRET: 'TELEGRAM_WEBHOOK_SECRET',
  WEBAPP_URL: 'WEBAPP_URL'
};

/** Basis URL Telegram Bot API. */
const TELEGRAM_API = 'https://api.telegram.org/bot';

/** Cache konfigurasi per-eksekusi (sheet dibaca sekali saja). */
let __settingsCache = null;

/** Membersihkan cache konfigurasi (dipakai setelah setup / saat test). */
function clearConfigCache() {
  __settingsCache = null;
  if (typeof __tableCache !== 'undefined') __tableCache = {};
}

/** Mengambil satu Script Property, mengembalikan '' bila belum diisi. */
function getProperty(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Menyimpan satu Script Property. */
function setProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/** Membaca sheet Settings sebagai objek key-value (di-cache per eksekusi). */
function getSettingsMap() {
  if (__settingsCache) return __settingsCache;
  const map = {};
  try {
    readTable(SHEET.SETTINGS).forEach(function (row) {
      if (row.Key) map[String(row.Key).trim()] = String(row.Value).trim();
    });
  } catch (err) {
    console.error('Gagal membaca sheet Settings: ' + err);
  }
  __settingsCache = map;
  return map;
}

/** Mengambil nilai Settings dengan default. */
function getSetting(key, fallback) {
  const map = getSettingsMap();
  const value = map[key];
  return value === undefined || value === '' ? fallback : value;
}

/** Timezone aplikasi (default Asia/Jakarta). */
function getTimezone() {
  return getSetting('Timezone', CONFIG.TIMEZONE_DEFAULT);
}

/** Akun default bila user tidak menyebutkan akun. */
function getDefaultAccount() {
  return getSetting('Default_Account', CONFIG.ACCOUNT_DEFAULT);
}

/** Waktu sekarang. Dinding pemisah agar mudah diuji. */
function now() {
  if (typeof TEST_NOW !== 'undefined' && TEST_NOW) return new Date(TEST_NOW);
  return new Date();
}

/** Konversi nilai apa pun menjadi number; '' / teks tak valid menjadi 0. */
function toNumber(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  let text = String(value).trim();
  if (!text) return 0;
  text = text.replace(/[^0-9,.\-]/g, '');
  if (!text || text === '-') return 0;
  // Format Indonesia: titik = ribuan, koma = desimal (contoh 1.500.000,50)
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    text = text.replace(',', '.');
  }
  const num = parseFloat(text);
  return isFinite(num) ? num : 0;
}

/** Mengubah teks menjadi huruf kecil tanpa tanda baca, spasi tunggal. */
function normalizeText(value) {
  return String(value === null || value === undefined ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Membaca nilai boolean dari sel sheet (TRUE/1/ya/aktif). */
function isTrue(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'ya' || text === 'aktif' || text === 'yes';
}

/** Cek apakah sebuah nilai adalah objek Date (aman antar-realm). */
function isDateValue(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/** Menambah angka nol di depan. */
function padNumber(num, length) {
  return String(num).padStart(length, '0');
}


/* ===== 01_Sheets.gs ===== */

/**
 * ============================================================================
 * FILE 01 — Lapisan Akses Google Sheets & Lock
 *
 * Semua fungsi di file ini adalah satu-satunya tempat yang menyentuh
 * SpreadsheetApp. Logic bisnis tidak boleh memanggil SpreadsheetApp langsung.
 * ============================================================================
 */

/** Mengambil spreadsheet aktif. Prioritas: Script Property SPREADSHEET_ID. */
function getSpreadsheet() {
  const id = getProperty(PROP.SPREADSHEET_ID);
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('SPREADSHEET_ID belum diisi di Script Properties dan tidak ada spreadsheet aktif.');
  }
  return active;
}

/** Mengambil sheet berdasarkan nama, atau null bila belum ada. */
function getSheetOrNull(name) {
  return getSpreadsheet().getSheetByName(name);
}

/** Mengambil sheet, melempar error jelas bila belum ada (setup belum dijalankan). */
function getSheet(name) {
  const sheet = getSheetOrNull(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" belum ada. Jalankan setupPersonalFinanceSystem() lebih dulu.');
  }
  return sheet;
}

/**
 * Peta header → nomor kolom (1-based).
 * Dihitung dari baris pertama sheet sehingga tetap benar walaupun user
 * menambah kolom sendiri di sebelah kanan.
 */
function getHeaderMap(name) {
  const sheet = getSheet(name);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return {};
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || '').trim();
    if (header) map[header] = i + 1;
  }
  return map;
}

/**
 * Membaca seluruh isi sheet sebagai array objek.
 * Baris yang seluruh kolomnya kosong otomatis dilewati.
 * Nilai asli (Date, number, boolean) dipertahankan.
 */
function readTable(name) {
  const sheet = getSheet(name);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (h) { return String(h || '').trim(); });
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  const rows = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    let hasContent = false;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell !== '' && cell !== null && cell !== undefined) { hasContent = true; break; }
    }
    if (!hasContent) continue;

    const obj = { __row: r + 2 };
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c];
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Menulis satu baris berdasarkan header sheet.
 * `data` adalah objek { Header: value } — kolom yang tidak disebut dibiarkan kosong.
 */
function appendRowByHeader(name, data) {
  const map = getHeaderMap(name);
  const headers = Object.keys(map);
  const width = Math.max.apply(null, headers.map(function (h) { return map[h]; }));
  const row = new Array(width).fill('');
  headers.forEach(function (header) {
    if (Object.prototype.hasOwnProperty.call(data, header)) {
      row[map[header] - 1] = data[header];
    }
  });
  getSheet(name).appendRow(row);
}

/** Menulis satu sel berdasarkan nama header. Aman terhadap pergeseran kolom header. */
/** Membaca tabel dengan cache per-eksekusi; TTL 15 detik untuk batch job. */
function setCellByHeader(name, rowNumber, header, value) {
  const map = getHeaderMap(name);
  if (!map[header]) throw new Error('Header "' + header + '" tidak ditemukan di sheet ' + name);
  getSheet(name).getRange(rowNumber, map[header]).setValue(value);
}
/** Cache tabel — dibersihkan tiap eksekusi baru (lihat clearConfigCache). */
let __tableCache = {};

/**
 * Membaca tabel dengan cache per-eksekusi, TTL 15 detik.
 * Dipakai oleh deteksi kategori/akun dan pengecekan budget agar setiap pesan
 * Telegram tidak berulang kali membaca ulang sheet yang sama.
 */
function readTableCached(name) {
  const nowMs = Date.now();
  const entry = __tableCache[name];
  if (entry && nowMs - entry.at < 15000) return entry.rows;
  const rows = readTable(name);
  __tableCache[name] = { at: nowMs, rows: rows };
  return rows;
}

/**
 * Menjalankan `fn` di dalam script lock.
 *
 * Bila lock belum tersedia, fungsi MENUNGGU (waitLock) sampai lock didapat —
 * bukan langsung lanjut — supaya tidak ada dua eksekusi yang menulis
 * bersamaan (sumber utama Transaction ID bentrok). Jika menunggu melebihi
 * timeout, waitLock() melempar error dan pemanggil menanganinya.
 */
function withLock(fn) {
  const lock = LockService.getScriptLock();
  let acquired = lock.tryLock(CONFIG.LOCK_TIMEOUT_MS);
  if (!acquired) {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    acquired = true;
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (err) { console.error('Gagal melepas lock: ' + err); }
    }
  }
}

/** Format kolom tertentu menjadi format Rupiah (tanpa desimal). */
function formatCurrencyColumn(sheet, columnIndex, startRow, numRows) {
  if (numRows < 1) return;
  sheet.getRange(startRow, columnIndex, numRows, 1).setNumberFormat('"Rp"#,##0');
}


/* ===== 02_Format.gs ===== */

/**
 * ============================================================================
 * FILE 02 — Format Angka, Tanggal, dan Bar Visual Telegram
 * ============================================================================
 */

/**
 * Menambahkan pemisah ribuan gaya Indonesia (titik).
 * Sengaja TIDAK memakai toLocaleString('id-ID'): runtime V8 Apps Script tidak
 * menyertakan data locale lengkap sehingga "id-ID" bisa jatuh ke format en-US
 * ("35,000"). Perhitungan manual ini deterministik di semua lingkungan.
 */
function groupThousands(value) {
  const text = String(Math.abs(Math.round(Number(value) || 0)));
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (i > 0 && (text.length - i) % 3 === 0) out += '.';
    out += text.charAt(i);
  }
  return out;
}

/** Format angka menjadi Rupiah gaya Indonesia: 35000 → "Rp35.000". */
function formatRupiah(amount) {
  const value = Math.round(Number(amount) || 0);
  return (value < 0 ? '-' : '') + 'Rp' + groupThousands(value);
}

/** Format persentase gaya Indonesia dengan satu desimal: 70.67 → "70,7%". */
function formatPercent(percent) {
  const value = Number(percent) || 0;
  const sign = value < 0 ? '-' : '';
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  const parts = String(rounded).split('.');
  const integerPart = groupThousands(Number(parts[0]));
  const decimal = parts.length > 1 && parts[1] !== '0' ? ',' + parts[1] : '';
  return sign + integerPart + decimal + '%';
}

/** Nama bulan Indonesia (1-12). */
function getMonthName(monthNumber) {
  return MONTH_NAMES_ID[Number(monthNumber) - 1] || '';
}

/** Format tanggal panjang: "10 September 2026". */
function formatDateIndonesia(date) {
  const d = toDateObject(date);
  if (!d) return '';
  return d.getDate() + ' ' + getMonthName(d.getMonth() + 1) + ' ' + d.getFullYear();
}

/** Format jam: "10:30". */
function formatTimeIndonesia(date) {
  const d = toDateObject(date);
  if (!d) return '';
  return padNumber(d.getHours(), 2) + ':' + padNumber(d.getMinutes(), 2);
}

/** Format lengkap: "10/09/2026 10:30:25". */
function formatDateTimeIndonesia(date) {
  const d = toDateObject(date);
  if (!d) return '';
  return padNumber(d.getDate(), 2) + '/' + padNumber(d.getMonth() + 1, 2) + '/' + d.getFullYear() +
    ' ' + padNumber(d.getHours(), 2) + ':' + padNumber(d.getMinutes(), 2) + ':' + padNumber(d.getSeconds(), 2);
}

/** Parsing sel tanggal sheet yang bisa berupa Date, "10/09/2026", atau "2026-09-10". */
function parseDateCell(value) {
  if (isDateValue(value)) return isValidDate(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;

  const text = String(value).trim();
  let match = text.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/); // dd/MM/yyyy
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // yyyy-MM-dd
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  const fallback = new Date(text);
  return isValidDate(fallback) ? fallback : null;
}

/** Normalisasi nilai apa pun menjadi objek Date, atau null. */
function toDateObject(value) {
  if (isDateValue(value)) return isValidDate(value) ? value : null;
  return parseDateCell(value);
}

/** Cek Date valid (menolak Invalid Date). */
function isValidDate(date) {
  return isDateValue(date) && !isNaN(date.getTime());
}

/** Jumlah hari dalam sebuah bulan (monthNumber 1-12). */
function getDaysInMonth(year, monthNumber) {
  return new Date(Number(year), Number(monthNumber), 0).getDate();
}

/** Bar visual sepanjang `size` karakter, maksimal penuh saat 100%. */
function makeProgressBar(percent, size) {
  const length = size || 10;
  const ratio = Math.max(0, Math.min(1, (Number(percent) || 0) / 100));
  const filled = Math.round(ratio * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

/** Emoji + label level budget. */
function getLevelInfo(percent, warning1, warning2, critical) {
  const w1 = Number(warning1) || CONFIG.WARNING_1_DEFAULT;
  const w2 = Number(warning2) || CONFIG.WARNING_2_DEFAULT;
  const crit = Number(critical) || CONFIG.WARNING_CRITICAL;
  if (percent >= crit) return { level: 'TERLAMPAUI', emoji: LEVEL_EMOJI.TERLAMPAUI, label: 'BUDGET TERLAMPAUI' };
  if (percent >= w2) return { level: 'HAMPIR', emoji: LEVEL_EMOJI.HAMPIR, label: 'BUDGET HAMPIR HABIS' };
  if (percent >= w1) return { level: 'PERHATIAN', emoji: LEVEL_EMOJI.PERHATIAN, label: 'BUDGET PERHATIAN' };
  return { level: 'AMAN', emoji: LEVEL_EMOJI.AMAN, label: 'BUDGET AMAN' };
}

/** Emoji untuk sebuah kategori. */
function getCategoryEmoji(category) {
  return CATEGORY_EMOJI[String(category || '').trim()] || '💸';
}

/**
 * Ikon arah arus kas untuk laporan.
 * @param {number} amount nilai transaksi (selalu positif).
 * @param {string} type   Pengeluaran/Pemasukan/Alokasi.
 */
function signedEmoji(amount, type) {
  if (type === TX_TYPE.INCOME) return '↗️';
  if (type === TX_TYPE.ALLOCATION) return '🏦';
  return '↘️';
}

/** Format nilai bertanda untuk laporan bulanan: "+Rp3.000.000" / "-Rp185.000". */
function formatSignedRupiah(amount, type) {
  const prefix = type === TX_TYPE.INCOME ? '+' : (type === TX_TYPE.ALLOCATION ? '~' : '-');
  return prefix + formatRupiah(Math.abs(Number(amount) || 0));
}

/** Format net cash flow: "Rp1.150.000" atau "-Rp185.000" saat defisit. */
function formatNetCashFlow(amount) {
  const value = Number(amount) || 0;
  return value < 0 ? '-' + formatRupiah(Math.abs(value)) : formatRupiah(value);
}

/** Potong teks agar tidak melebihi batas panjang pesan Telegram. */
function truncateText(text, maxLength) {
  const limit = maxLength || CONFIG.TELEGRAM_MAX_LENGTH;
  const value = text === null || text === undefined ? '' : String(text);
  return value.length <= limit ? value : value.slice(0, limit - 3) + '...';
}


/* ===== 03_Parser.gs ===== */

/**
 * ============================================================================
 * FILE 03 — Parser Transaksi Bahasa Indonesia
 *
 * Alur:  teks Telegram → parseTransaction() → { type, amount, account,
 *        description, category, source, valid, error }
 * ============================================================================
 */

/** Cek apakah token berupa label jenis transaksi (keluar/masuk/...). */
function isTypeToken(token) {
  const t = normalizeText(token);
  if (!t) return null;
  if (TYPE_KEYWORDS.Pengeluaran.indexOf(t) !== -1) return TX_TYPE.EXPENSE;
  if (TYPE_KEYWORDS.Pemasukan.indexOf(t) !== -1) return TX_TYPE.INCOME;
  return null;
}

/** Singkatan satuan → pengali. */
function getUnitMultiplier(unit) {
  const u = normalizeText(unit);
  switch (u) {
    case 'k':
    case 'rb':
    case 'ribu':
    case 'ribuan':
      return 1000;
    case 'jt':
    case 'juta':
    case 'jutaan':
      return 1000000;
    case 'm':
    case 'miliar':
      return 1000000000;
    default:
      return null;
  }
}

/**
 * Mengubah potongan angka gaya Indonesia menjadi number ("" bila tidak valid).
 * Aturan pemisah (mengikuti kebiasaan Indonesia):
 *   "1.500"    → 1500      (titik ribuan)
 *   "1,5"      → 1.5       (koma desimal)
 *   "1.500,50" → 1500.5
 *   "1,500"    → 1500      (koma ribuan gaya Inggris, pola 3 digit)
 */
function toNumericToken(text) {
  const value = String(text === null || text === undefined ? '' : text).trim();
  if (!value || !/\d/.test(value)) return '';

  const hasDot = value.indexOf('.') !== -1;
  const hasComma = value.indexOf(',') !== -1;
  let normalized;

  if (hasDot && hasComma) {
    // Pemisah yang muncul paling akhir dianggap pemisah desimal.
    normalized = value.lastIndexOf(',') > value.lastIndexOf('.')
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '');
  } else if (hasDot) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(value) ? value.replace(/\./g, '') : value;
  } else if (hasComma) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(value) ? value.replace(/,/g, '') : value.replace(',', '.');
  } else {
    normalized = value;
  }

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? '' : parsed;
}

/**
 * Parser nominal Rupiah fleksibel.
 * Menerima: 25000, 25rb, 25k, 25 ribu, 1jt, 1,5jt, 1.5jt, 2.25 juta, Rp25.000.
 * @param {string} text potongan teks nominal, mis. "25rb makan".
 * @return {{value: (number|null), consumed: number}}
 *   `value` = nominal, `consumed` = jumlah token (kata) yang dipakai.
 */
function parseAmount(text) {
  const raw = String(text === null || text === undefined ? '' : text).trim();
  if (!raw) return { value: null, consumed: 0 };

  const tokens = raw.split(/\s+/).filter(function (t) { return t.length > 0; });

  for (let i = 0; i < tokens.length; i++) {
    if (!/\d/.test(tokens[i])) continue;

    // Satu token: angka + satuan menempel, mis. "25rb", "1,5jt", "Rp25.000"
    const match = tokens[i].match(/^(?:rp\.?)?([0-9][0-9.,]*)([a-z.]*)$/i);
    if (!match) continue;

    const numeric = toNumericToken(match[1]);
    if (numeric === '') continue;

    const suffix = (match[2] || '').replace(/\./g, '');
    let amount = numeric;
    let consumed = i + 1;

    if (suffix) {
      const multiplier = getUnitMultiplier(suffix);
      if (!multiplier) continue; // token berakhiran kata lain, bukan satuan
      amount = numeric * multiplier;
    } else if (i + 1 < tokens.length) {
      // Satuan terpisah spasi, mis. "25 ribu" atau "1 juta"
      const multiplier = getUnitMultiplier(tokens[i + 1]);
      if (multiplier) {
        amount = numeric * multiplier;
        consumed = i + 2;
      }
    }

    return { value: amount, consumed: consumed };
  }

  return { value: null, consumed: 0 };
}

/** Mengambil akun aktif dari sheet Accounts (dengan cache per-eksekusi). */
function getActiveAccounts() {
  try {
    return readTableCached(SHEET.ACCOUNTS).filter(function (row) {
      return row.Account && isTrue(row.Active);
    });
  } catch (err) {
    console.error('Gagal membaca Accounts: ' + err);
    return [];
  }
}

/** Mencari nama akun resmi dari satu token (cocok persis / sebagai kata). */
function findAccountByToken(token) {
  const t = normalizeText(token);
  if (!t) return '';

  const accounts = getActiveAccounts();
  const alias = ACCOUNT_ALIASES[t];
  if (alias && accounts.some(function (row) { return normalizeText(row.Account) === normalizeText(alias); })) {
    return alias;
  }
  for (let i = 0; i < accounts.length; i++) {
    if (normalizeText(accounts[i].Account) === t) return String(accounts[i].Account).trim();
  }
  return '';
}

/** Jenis kategori (Pengeluaran/Pemasukan/Alokasi) menurut sheet Categories. */
function getCategoryType(category) {
  const name = String(category || '').trim();
  if (!name) return '';
  try {
    const rows = readTableCached(SHEET.CATEGORIES);
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].Category || '').trim() === name) {
        return String(rows[i].Type || '').trim();
      }
    }
  } catch (err) {
    console.error('getCategoryType error: ' + err);
  }
  return '';
}

/**
 * Mendeteksi akun dari token terakhir deskripsi.
 * @return {{account: string, remaining: string}} account = '' bila tidak ketemu.
 */
function detectAccount(descriptionTokens) {
  const tokens = (descriptionTokens || []).slice();
  while (tokens.length) {
    const found = findAccountByToken(tokens[tokens.length - 1]);
    if (found) {
      tokens.pop();
      return { account: found, remaining: tokens.join(' ') };
    }
    break; // hanya token terakhir yang diuji
  }
  return { account: '', remaining: tokens.join(' ') };
}

/** Mengambil kategori (dengan keywords) yang cocok dengan teks. */
function detectCategory(text, type) {
  const targetType = type === TX_TYPE.INCOME ? TX_TYPE.INCOME : TX_TYPE.EXPENSE;
  const normalized = ' ' + normalizeText(text) + ' ';
  if (normalized.trim() === '') return CONFIG.CATEGORY_FALLBACK;

  let categories;
  try {
    categories = readTableCached(SHEET.CATEGORIES);
  } catch (err) {
    console.error('Gagal membaca Categories: ' + err);
    return CONFIG.CATEGORY_FALLBACK;
  }

  const candidates = categories.filter(function (row) {
    if (!row.Category || !isTrue(row.Active)) return false;
    const rowType = String(row.Type || '').trim();
    if (targetType === TX_TYPE.INCOME) return rowType === TX_TYPE.INCOME;
    // Pengeluaran mencakup kategori Alokasi (Tabungan) agar "nabung" terdeteksi.
    return rowType === TX_TYPE.EXPENSE || rowType === TX_TYPE.ALLOCATION;
  });

  let bestMatch = '';
  let bestScore = 0;

  candidates.forEach(function (row) {
    const categoryName = String(row.Category).trim();
    const keywords = String(row.Keywords || '')
      .split(',')
      .map(function (k) { return normalizeText(k); })
      .filter(function (k) { return k.length > 0; });

    let score = 0;
    keywords.forEach(function (keyword) {
      if ((' ' + keyword + ' ').indexOf(' ' + normalized.trim() + ' ') !== -1) {
        score += 1000 + keyword.length; // frasa cocok utuh
      } else if (normalized.indexOf(' ' + keyword + ' ') !== -1) {
        score += keyword.length;        // keyword muncul sebagai kata utuh
      }
    });

    // Nama kategori disebut langsung oleh user → prioritas tertinggi.
    const normalizedName = normalizeText(categoryName);
    if (normalizedName && normalized.indexOf(' ' + normalizedName + ' ') !== -1) {
      score += 2000 + normalizedName.length;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = categoryName;
    }
  });

  return bestMatch || CONFIG.CATEGORY_FALLBACK;
}

/** Parser perintah baris tunggal "Tipe Nominal Deskripsi". */
function parseSingleLine(input) {
  const text = String(input === null || input === undefined ? '' : input).trim();
  if (!text) {
    return { valid: false, error: '❌ Format transaksi belum dikenali.\n\nContoh:\nkeluar 35rb makan\nmasuk 3jt gaji bca' };
  }

  const rawTokens = text.split(/\s+/);
  const tokens = rawTokens.slice();
  const type = isTypeToken(tokens[0]);
  if (!type) {
    return { valid: false, error: '❌ Format transaksi belum dikenali.\n\nAwali dengan "keluar" atau "masuk".\n\nContoh:\nkeluar 35rb makan\nmasuk 3jt gaji bca' };
  }
  tokens.shift();

  const amountResult = parseAmount(tokens.join(' '));
  if (amountResult.value === null) {
    return { valid: false, error: '❌ Nominal tidak ditemukan.\n\nContoh yang benar:\nkeluar 35rb makan\nmasuk 3jt gaji bca' };
  }
  const amount = Math.round(amountResult.value);
  tokens.splice(0, amountResult.consumed);

  if (!isFinite(amount) || amount <= 0) {
    return { valid: false, error: '❌ Nominal harus lebih besar dari 0.\n\nContoh yang benar:\nkeluar 35rb makan' };
  }
  if (amount > CONFIG.MAX_AMOUNT) {
    return { valid: false, error: '❌ Nominal terlalu besar. Maksimal ' + formatRupiah(CONFIG.MAX_AMOUNT) + '.' };
  }

  const accountResult = detectAccount(tokens);
  const description = accountResult.remaining.trim();
  const category = detectCategory(description, type);

  // "keluar 500rb nabung" → kategori Tabungan bertipe Alokasi, bukan pengeluaran
  // konsumtif. Jenis transaksi mengikuti jenis kategori agar laporan pengeluaran
  // tidak ikut menghitung uang yang sebenarnya ditabung.
  let finalType = type;
  if (type === TX_TYPE.EXPENSE && getCategoryType(category) === TX_TYPE.ALLOCATION) {
    finalType = TX_TYPE.ALLOCATION;
  }

  return {
    valid: true,
    type: finalType,
    amount: amount,
    account: accountResult.account || getDefaultAccount(),
    accountExplicit: !!accountResult.account,
    description: description || category,
    category: category,
    source: TX_SOURCE.TEXT,
    raw: text
  };
}

/** Parser pesan bebas: tiap baris valid dianggap satu transaksi. */
function parseTransaction(input) {
  const text = String(input === null || input === undefined ? '' : input);
  const lines = text.split(/\r?\n/).map(function (line) { return line.trim(); })
    .filter(function (line) { return line.length > 0; });

  const parsed = [];
  const invalidLines = [];

  lines.forEach(function (line) {
    // Abaikan baris yang jelas bukan transaksi (mis. tempelan chat lain).
    if (/^https?:\/\//i.test(line)) return;
    const result = parseSingleLine(line);
    if (result.valid) parsed.push(result);
    else invalidLines.push({ line: line, error: result.error });
  });

  if (parsed.length === 0) {
    return {
      valid: false,
      transactions: [],
      error: invalidLines.length ? invalidLines[0].error : undefined
    };
  }

  return {
    valid: true,
    transactions: parsed,
    invalidLines: invalidLines,
    error: invalidLines.length ? invalidLines[0].error : undefined
  };
}


/* ===== 04_Transactions.gs ===== */

/**
 * ============================================================================
 * FILE 04 — Transaksi: Simpan, ID Unik, Duplicate Protection, Hapus (Soft Delete)
 *
 * Semua penulisan transaksi melewati withLock() + saveTransactions() agar:
 *  - Transaction ID tidak pernah bentrok (penulisan paralel Telegram).
 *  - Satu update Telegram tidak pernah tersimpan dua kali (duplicate protection).
 * ============================================================================
 */

/**
 * Memuat transaksi aktif (Status = Active). Dipakai saldo, budget, dan laporan.
 * @param {Object} [filter] opsional { type, category, account } — cocok persis.
 */
function getActiveTransactions(filter) {
  const filterType = filter && filter.type;
  const filterCategory = filter && filter.category;
  const filterAccount = filter && filter.account;

  return readTable(SHEET.TRANSACTIONS).filter(function (row) {
    if (String(row.Status || '').trim() !== TX_STATUS.ACTIVE) return false;
    if (filterType && String(row.Type || '').trim() !== filterType) return false;
    if (filterCategory && String(row.Category || '').trim() !== filterCategory) return false;
    if (filterAccount && String(row.Account || '').trim() !== filterAccount) return false;
    return true;
  });
}

/** Menjumlahkan kolom Amount dari daftar baris transaksi apa pun. */
function sumAmounts(rows) {
  let total = 0;
  (rows || []).forEach(function (row) {
    total += toNumber(row.Amount);
  });
  return total;
}

/** Total nominal transaksi aktif dengan filter opsional { type, category, account }. */
function sumTransactions(filter) {
  return sumAmounts(getActiveTransactions(filter));
}

/** Total pemasukan aktif (semua kategori, semua akun). */
function totalIncome() {
  return sumTransactions({ type: TX_TYPE.INCOME });
}

/** Total pengeluaran aktif (semua kategori, semua akun). */
function totalExpense() {
  return sumTransactions({ type: TX_TYPE.EXPENSE });
}

/**
 * Membaca kolom Transaction_ID sheet Transactions menjadi set (objek lookup).
 * Dipakai untuk menjamin ID unik tanpa mengandalkan counter yang bisa hilang.
 */
function readExistingIds(sheet) {
  const ids = {};
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    existing.forEach(function (row) {
      const id = String(row[0] || '').trim();
      if (id) ids[id] = true;
    });
  }
  return ids;
}

/**
 * Membuat Transaction ID unik berikutnya (TRX-000001, TRX-000002, ...).
 * @param {Object} ids set ID yang sudah terpakai — hasil readExistingIds().
 *                   ID terpilih langsung ditandai di set agar pemanggilan
 *                   berikutnya dalam batch yang sama tidak menghasilkan ID kembar.
 * @return {string} ID baru yang dijamin belum dipakai.
 */
function generateTransactionId(ids) {
  let counter = 1;
  while (true) {
    const candidate = CONFIG.ID_PREFIX + padNumber(counter, CONFIG.ID_PAD);
    if (!ids[candidate]) {
      ids[candidate] = true;
      return candidate;
    }
    counter++;
  }
}

/**
 * Subtotal per kategori untuk bulan berjalan, difilter menurut jenis transaksi.
 * @param {number} year
 * @param {number} month
 * @param {string} type salah satu TX_TYPE.*
 * @return {Object} { "Makan & Minum": 530000, ... }
 */
function getMonthlyCategoryTotals(year, month, type) {
  const totals = {};
  readTable(SHEET.TRANSACTIONS).forEach(function (row) {
    if (String(row.Status || '').trim() !== TX_STATUS.ACTIVE) return;
    if (String(row.Type || '').trim() !== type) return;
    if (toNumber(row.Year) !== Number(year)) return;
    if (toNumber(row.Month) !== Number(month)) return;
    const category = String(row.Category || CONFIG.CATEGORY_FALLBACK).trim();
    totals[category] = (totals[category] || 0) + toNumber(row.Amount);
  });
  return totals;
}

/**
 * Subtotal pengeluaran konsumtif per kategori (tidak termasuk Alokasi/Tabungan).
 * @return {Object} { "Makan & Minum": 530000, ... }
 */
function getMonthlyCategoryExpense(year, month) {
  return getMonthlyCategoryTotals(year, month, TX_TYPE.EXPENSE);
}

/** Subtotal alokasi (Tabungan) per kategori pada bulan berjalan. */
function getMonthlyCategoryAllocation(year, month) {
  return getMonthlyCategoryTotals(year, month, TX_TYPE.ALLOCATION);
}
/**
 * Total transaksi aktif satu kategori untuk bulan tertentu, mengikuti JENIS
 * kategori tersebut:
 *   - Kategori Pengeluaran → menjumlahkan transaksi bertipe Pengeluaran.
 *   - Kategori Alokasi (Tabungan) → menjumlahkan transaksi bertipe Alokasi.
 * Pemisahan ini membuat target Tabungan terpantau tanpa mencemari laporan
 * pengeluaran konsumtif.
 */
function getMonthlyCategorySpend(year, month, category) {
  const expectedType = getCategoryType(category) || TX_TYPE.EXPENSE;
  let total = 0;
  readTable(SHEET.TRANSACTIONS).forEach(function (row) {
    if (String(row.Status || '').trim() !== TX_STATUS.ACTIVE) return;
    if (String(row.Category || '').trim() !== category) return;
    if (toNumber(row.Year) !== Number(year) || toNumber(row.Month) !== Number(month)) return;
    const rowType = String(row.Type || '').trim();
    if (rowType !== expectedType) return;
    total += toNumber(row.Amount);
  });
  return total;
}

/** Membaca baris budget ter-Active untuk bulan tertentu (opsional per kategori). */
function getBudget(year, month, category) {
  const yearNum = Number(year);
  const monthNum = Number(month);
  return readTableCached(SHEET.BUDGETS).filter(function (row) {
    if (!isTrue(row.Active)) return false;
    if (toNumber(row.Year) !== yearNum || toNumber(row.Month) !== monthNum) return false;
    if (category && String(row.Category || '').trim() !== category) return false;
    return true;
  });
}

/**
 * Ringkasan budget satu kategori bulan tertentu.
 * @return {Object|null} null bila kategori tidak punya budget aktif (budget 0 dianggap tidak dipantau).
 */
function calculateCategoryBudget(year, month, category) {
  const budgets = getBudget(year, month, category);
  if (budgets.length === 0) return null;

  const budget = toNumber(budgets[0].Budget);
  if (budget <= 0) return null;

  const spent = getMonthlyCategorySpend(year, month, category);
  const warning1 = toNumber(budgets[0].Warning_1) || CONFIG.WARNING_1_DEFAULT;
  const warning2 = toNumber(budgets[0].Warning_2) || CONFIG.WARNING_2_DEFAULT;
  const percent = spent / budget * 100;

  return {
    category: category,
    spent: spent,
    budget: budget,
    warning1: warning1,
    warning2: warning2,
    percent: percent,
    remaining: budget - spent,
    levelInfo: getLevelInfo(percent, warning1, warning2, CONFIG.WARNING_CRITICAL)
  };
}

/**
 * Ringkasan budget semua kategori yang punya baris budget aktif bulan berjalan,
 * diurutkan dari pemakaian tertinggi.
 */
function checkBudget(year, month) {
  const categories = {};
  getBudget(year, month).forEach(function (row) {
    if (row.Category) categories[String(row.Category).trim()] = true;
  });

  const result = [];
  Object.keys(categories).forEach(function (category) {
    const summary = calculateCategoryBudget(year, month, category);
    if (summary) result.push(summary);
  });

  result.sort(function (a, b) { return b.percent - a.percent; });
  return result;
}

/**
 * Rekomendasi maksimal pengeluaran per hari agar budget tetap terjaga.
 * Sisa hari dihitung dari tanggal hari ini sampai akhir bulan.
 * @return {Object|null} status 'over' bila budget sudah terlampaui.
 */
function getDailyAllowance(year, month, category) {
  const summary = calculateCategoryBudget(year, month, category);
  if (!summary) return null;
  if (summary.remaining < 0) {
    return { status: 'over', remaining: summary.remaining, budget: summary.budget, spent: summary.spent };
  }

  const todayDate = now();
  const daysLeft = getDaysInMonth(Number(year), Number(month)) - todayDate.getDate();
  if (daysLeft <= 0) return null;

  return {
    status: 'ok',
    allowancePerDay: summary.remaining / daysLeft,
    remaining: summary.remaining,
    daysLeft: daysLeft
  };
}

/**
 * Menyimpan satu transaksi. Pembungkus tipis dari saveTransactions().
 * @return {{saved: boolean, reason: string, id: (string|null)}}
 */
function saveTransaction(tx) {
  const results = saveTransactions([tx]);
  return results[0];
}

/**
 * Menyimpan beberapa transaksi dalam SATU lock.
 *
 * Duplicate protection: bila pasangan Telegram_User_ID + Telegram_Message_ID
 * sudah pernah tersimpan, maka seluruh update dianggap duplikat dan diabaikan.
 * Pemeriksaan dilakukan per-pesan (bukan per-baris) sehingga pesan berisi
 * beberapa transaksi tetap tersimpan lengkap, sementara update Telegram yang
 * dikirim ulang tidak menghasilkan transaksi ganda.
 *
 * @param {Array<Object>} list daftar transaksi { type, amount, category, account, description, source, telegramUserId, telegramMessageId }
 * @return {Array<Object>} hasil sejajar dengan input: { saved, reason, id }
 */
function saveTransactions(list) {
  const items = (list || []).filter(function (tx) { return !!tx; });
  if (items.length === 0) return [];

  const results = items.map(function () {
    return { saved: false, reason: 'DATA_TIDAK_VALID', id: null };
  });

  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET.TRANSACTIONS);
  if (!sheet) throw new Error('Sheet Transactions belum ada. Jalankan setupPersonalFinanceSystem().');

  return withLock(function () {
    const existingRows = readTable(SHEET.TRANSACTIONS);

    // --- Duplicate protection per pesan Telegram ---
    const firstItem = items[0];
    const userId = String(firstItem.telegramUserId || '').trim();
    const messageId = String(firstItem.telegramMessageId || '').trim();
    const hasMessageIdentity = userId !== '' && messageId !== '';

    // Status sengaja TIDAK difilter di sini: satu Telegram_Message_ID mewakili
    // satu pesan Telegram yang unik. Bila update yang sama dikirim ulang setelah
    // transaksinya dihapus, transaksi TIDAK boleh dibuat lagi (menghindari
    // duplikasi sekaligus mencegah transaksi terhapus hidup kembali).
    if (hasMessageIdentity) {
      const alreadyStored = existingRows.some(function (row) {
        return String(row.Telegram_User_ID || '').trim() === userId &&
               String(row.Telegram_Message_ID || '').trim() === messageId;
      });
      if (alreadyStored) {
        console.log('Duplikat diabaikan: user=' + userId + ' message=' + messageId);
        return results.map(function () {
          return { saved: false, reason: 'DUPLIKAT', id: null };
        });
      }
    }

    // --- Alokasi ID unik & penulisan baris ---
    const ids = readExistingIds(sheet);
    const timestamp = now();

    for (let i = 0; i < items.length; i++) {
      const tx = items[i];
      if (!tx.type || !(toNumber(tx.amount) > 0)) continue;

      const id = generateTransactionId(ids);
      appendRowByHeader(SHEET.TRANSACTIONS, {
        Transaction_ID: id,
        Date: formatDatePlain(timestamp),
        Time: formatTimeIndonesia(timestamp),
        Year: timestamp.getFullYear(),
        Month: timestamp.getMonth() + 1,
        Type: tx.type,
        Category: tx.category || CONFIG.CATEGORY_FALLBACK,
        Description: tx.description || tx.category || '',
        Amount: toNumber(tx.amount),
        Account: tx.account || getDefaultAccount(),
        Telegram_User_ID: userId,
        Telegram_Message_ID: messageId,
        Source: tx.source || TX_SOURCE.TEXT,
        Created_At: formatDateTimeIndonesia(timestamp) + '.' + padNumber(timestamp.getMilliseconds(), 3),
        Status: TX_STATUS.ACTIVE
      });

      results[i] = { saved: true, reason: 'OK', id: id };
    }

    return results;
  });
}

/** Format tanggal pendek untuk kolom Date: "10/09/2026". */
function formatDatePlain(date) {
  return padNumber(date.getDate(), 2) + '/' + padNumber(date.getMonth() + 1, 2) + '/' + date.getFullYear();
}

/**
 * Mencari transaksi aktif berdasarkan ID.
 * @return {Object|null} baris transaksi (termasuk __row) atau null.
 */
function findTransactionById(id) {
  const target = String(id || '').trim();
  if (!target) return null;
  return readTable(SHEET.TRANSACTIONS).find(function (row) {
    return String(row.Transaction_ID || '').trim() === target &&
           String(row.Status || '').trim() === TX_STATUS.ACTIVE;
  }) || null;
}

/**
 * Hapus (soft delete): Status = Deleted. Baris tetap tersimpan sebagai audit trail.
 * Saldo, budget, dan laporan otomatis tidak lagi menghitung transaksi ini
 * karena semuanya memfilter Status = Active.
 * @return {Object|null} data transaksi yang dihapus, atau null bila tidak ditemukan.
 */
function deleteTransaction(id) {
  const target = String(id || '').trim();
  if (!target) return null;

  return withLock(function () {
    const rows = readTable(SHEET.TRANSACTIONS);
    let found = null;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i].Transaction_ID || '').trim() === target &&
          String(rows[i].Status || '').trim() === TX_STATUS.ACTIVE) {
        found = rows[i];
        break;
      }
    }
    if (!found) return null;

    setCellByHeader(SHEET.TRANSACTIONS, found.__row, 'Status', TX_STATUS.DELETED);
    return found;
  });
}


/* ===== 05_Handlers.gs ===== */

/**
 * ============================================================================
 * FILE 05 — Penyusun Pesan (Handler Perintah Telegram)
 * ============================================================================
 */

/**
 * Menghitung saldo per akun: Initial_Balance + Pemasukan − Pengeluaran.
 * Hanya transaksi Status = Active dihitung.
 * @return {Array} [{ account, type, balance }]
 */
function getBalancePerAccount() {
  const accountRows = readTableCached(SHEET.ACCOUNTS).filter(function (row) {
    return row.Account && isTrue(row.Active);
  });

  const balances = accountRows.map(function (row) {
    return {
      account: String(row.Account).trim(),
      type: String(row.Type || '').trim(),
      balance: toNumber(row.Initial_Balance)
    };
  });

  getActiveTransactions().forEach(function (row) {
    const account = String(row.Account || '').trim();
    if (!account) return;
    const entry = balances.find(function (b) { return b.account === account; });
    if (!entry) return;
    if (String(row.Type || '').trim() === TX_TYPE.INCOME) entry.balance += toNumber(row.Amount);
    else entry.balance -= toNumber(row.Amount); // Pengeluaran & Alokasi mengurangi saldo
  });

  return balances;
}

/** Menghasilkan pesan /saldo. */
function buildBalanceMessage() {
  const balances = getBalancePerAccount();
  const dateForHeader = now();
  const lines = ['💰 SALDO', ''];
  let total = 0;

  balances.forEach(function (entry) {
    lines.push(entry.account);
    lines.push(formatRupiah(entry.balance));
    lines.push('');
    total += entry.balance;
  });

  lines.push('────────────');
  lines.push('TOTAL');
  lines.push(formatRupiah(total));
  lines.push('');
  lines.push('Per ' + formatDateIndonesia(dateForHeader));
  return lines.join('\n');
}

/** Menghasilkan pesan /hariini. */
function buildTodayMessage() {
  const t = now();
  const todayStr = formatDatePlain(t);
  const dayFilter = function (row) {
    return String(row.Date || '').trim() === todayStr &&
           String(row.Status || '').trim() === TX_STATUS.ACTIVE;
  };

  const rows = readTable(SHEET.TRANSACTIONS).filter(dayFilter);
  const income = sumAmounts(rows.filter(function (r) {
    return String(r.Type || '').trim() === TX_TYPE.INCOME;
  }));
  const expense = sumAmounts(rows.filter(function (r) {
    return String(r.Type || '').trim() === TX_TYPE.EXPENSE;
  }));

  let topCategory = null;
  let topAmount = 0;
  rows.filter(function (r) {
    return String(r.Type || '').trim() === TX_TYPE.EXPENSE;
  }).forEach(function (r) {
    const amount = toNumber(r.Amount);
    if (amount > topAmount) {
      topAmount = amount;
      topCategory = String(r.Category || '').trim();
    }
  });

  const net = income - expense;
  const lines = [
    '📊 HARI INI',
    formatDateIndonesia(t),
    '',
    'Pemasukan',
    formatRupiah(income),
    '',
    'Pengeluaran',
    formatRupiah(expense),
    '',
    'Net Cash Flow',
    formatNetCashFlow(net),
    '',
    'Transaksi:',
    String(rows.length)
  ];
  if (topCategory) {
    lines.push('');
    lines.push('Pengeluaran terbesar:');
    lines.push(getCategoryEmoji(topCategory) + ' ' + topCategory);
    lines.push(formatRupiah(topAmount));
  }
  return lines.join('\n');
}

/** Menghasilkan pesan /bulanini. */
function buildMonthMessage() {
  const t = now();
  const year = t.getFullYear();
  const month = t.getMonth() + 1;
  const monthName = getMonthName(month);

  const income = totalIncome();
  const expense = totalExpense();
  const byCategory = getMonthlyCategoryExpense(year, month);
  const allocationByCategory = getMonthlyCategoryAllocation(year, month);

  const lines = ['📊 ' + monthName.toUpperCase() + ' ' + year, ''];
  lines.push('💰 Pemasukan');
  lines.push(formatRupiah(income));
  lines.push('');
  lines.push('💸 Pengeluaran');
  lines.push(formatRupiah(expense));
  lines.push('');
  lines.push('💵 Net Cash Flow');
  lines.push(formatNetCashFlow(income - expense));
  lines.push('');

  const categories = Object.keys(byCategory).sort(function (a, b) {
    return byCategory[b] - byCategory[a];
  });
  if (categories.length) {
    lines.push('Kategori pengeluaran:');
    lines.push('');
    categories.forEach(function (cat) {
      lines.push(getCategoryEmoji(cat) + ' ' + cat);
      lines.push(formatRupiah(byCategory[cat]));
    });
  }

  const allocationCategories = Object.keys(allocationByCategory).sort(function (a, b) {
    return allocationByCategory[b] - allocationByCategory[a];
  });
  if (allocationCategories.length) {
    lines.push('');
    lines.push('🏦 Tabungan:');
    lines.push('');
    allocationCategories.forEach(function (cat) {
      lines.push(getCategoryEmoji(cat) + ' ' + cat);
      lines.push(formatRupiah(allocationByCategory[cat]));
    });
  }
  if (!categories.length && !allocationCategories.length) {
    lines.push('');
    lines.push('Belum ada transaksi bulan ini.');
  }
  return lines.join('\n');
}

/** Menghasilkan pesan /budget. */
function buildBudgetMessage() {
  const t = now();
  const year = t.getFullYear();
  const month = t.getMonth() + 1;
  const summaries = checkBudget(year, month);

  if (!summaries.length) {
    return '📊 BUDGET ' + getMonthName(month).toUpperCase() + ' ' + year + '\n\n' +
      'Belum ada kategori dengan budget aktif bulan ini.\n' +
      'Isi sheet "Budgets" lalu atur Active = TRUE.';
  }

  const lines = ['📊 BUDGET ' + getMonthName(month).toUpperCase() + ' ' + year, ''];
  summaries.forEach(function (summary) {
    lines.push(getCategoryEmoji(summary.category) + ' ' + summary.category);
    lines.push(formatRupiah(summary.spent) + ' / ' + formatRupiah(summary.budget));
    lines.push(formatPercent(summary.percent) + ' ' + summary.levelInfo.emoji);
    lines.push('');
  });
  return lines.join('\n').trim();
}

/** Menghasilkan pesan /terakhir. */
function buildLastTransactionsMessage() {
  const rows = getActiveTransactions();
  rows.sort(function (a, b) {
    const createdA = String(a.Created_At || '');
    const createdB = String(b.Created_At || '');
    if (createdA !== createdB) return createdA < createdB ? 1 : -1;
    return Number(b.__row) - Number(a.__row);
  });
  const limit = CONFIG.LAST_TRANSACTIONS_LIMIT;
  const latest = rows.slice(0, limit);

  if (!latest.length) {
    return '🧾 TRANSAKSI TERAKHIR\n\nBelum ada transaksi tercatat.';
  }

  const lines = ['🧾 TRANSAKSI TERAKHIR'];
  latest.forEach(function (row, index) {
    lines.push('');
    lines.push(String(index + 1) + '.');
    lines.push(String(row.Transaction_ID || ''));
    lines.push(formatRupiah(row.Amount));
    lines.push(String(row.Category || ''));
    lines.push(String(row.Account || ''));
  });
  return lines.join('\n');
}

/** Menghasilkan pesan /hapus. Transaksi tidak dihapus fisik (Status = Deleted). */
function buildDeleteMessage(id) {
  const trimmedId = String(id || '').trim();
  if (!trimmedId) {
    return '❌ Format salah.\n\nGunakan:\n/hapus TRX-000123';
  }

  const deleted = deleteTransaction(trimmedId);
  if (!deleted) {
    return '❌ Transaksi ' + trimmedId + ' tidak ditemukan atau sudah dihapus.';
  }

  return '🗑 TRANSAKSI DIHAPUS\n\n' +
    String(deleted.Transaction_ID || trimmedId) + '\n' +
    formatRupiah(deleted.Amount) + '\n' +
    String(deleted.Category || '') + '\n\n' +
    'Data tetap disimpan sebagai audit trail.';
}

/** Daftar bantuan. */
function buildHelpMessage() {
  return [
    'ℹ️ BANTUAN',
    '',
    'Cara mencatat:',
    'keluar 35rb makan',
    'keluar 150rb bensin bca',
    'masuk 3jt gaji bca',
    'masuk 500rb freelance',
    '',
    'Tambahkan akun di kata terakhir:',
    'cash, bca, bni, mandiri, gopay, dana, shopeepay',
    '',
    'Command:',
    '/hariini — ringkasan hari ini',
    '/bulanini — ringkasan bulan ini',
    '/saldo — saldo per akun',
    '/budget — status budget bulan ini',
    '/terakhir — 5 transaksi terakhir',
    '/hapus TRX-000123 — hapus transaksi (soft delete)',
    '/id — Telegram User ID Anda',
    '/bantuan — bantuan ini',
    '',
    'Pencatatan otomatis dikategorikan berdasarkan kata kunci.'
  ].join('\n');
}

/** Menghasilkan pesan /start. */
function buildStartMessage(user) {
  const firstName = (user && user.first_name) || '';
  const greeting = firstName ? 'Halo, ' + firstName + '! 👋' : 'Halo! 👋';
  return [
    greeting,
    '',
    '👋 PERSONAL FINANCE BOT',
    '',
    'Bot ini membantu mencatat pemasukan dan pengeluaran harian.',
    '',
    'Contoh:',
    'keluar 35rb makan',
    'keluar 50rb bensin bca',
    'masuk 3jt gaji bca',
    '',
    'Command:',
    '/hariini',
    '/bulanini',
    '/saldo',
    '/budget',
    '/terakhir',
    '/bantuan'
  ].join('\n');
}

/** Menghasilkan pesan ID user. */
function buildIdMessage(userId) {
  return 'Telegram User ID Anda:\n\n' + String(userId);
}

/** Menghasilkan pesan kesalahan internal yang aman (tanpa detail sensitif). */
function buildErrorMessage() {
  return '⚠️ Terjadi kesalahan saat memproses transaksi.\nSilakan coba kembali.';
}


/* ===== 06_Bot.gs ===== */

/**
 * ============================================================================
 * FILE 06 — Bot: Authorization, Dispatch, Telegram API, Warning Budget
 * ============================================================================
 */

/** Pesan balasan saat user tidak terotorisasi (tanpa data finansial apa pun). */
const UNAUTHORIZED_REPLY = '⛔ Anda tidak memiliki akses ke bot ini.';

/**
 * Rute utama update Telegram.
 * V1 hanya memproses update berisi message (pesan teks/foto). Jenis update lain
 * (edited_message, callback_query dari tombol V2, dsb.) diakui dengan HTTP 200
 * agar Telegram tidak mengirim ulang update yang sama.
 * @return {number} HTTP 200 selalu.
 */
function handleUpdate(update) {
  try {
    if (update && update.message) {
      return handleMessage(update.message);
    }
    return 200;
  } catch (err) {
    console.error('handleUpdate error: ' + err);
    if (update && update.message && update.message.chat) {
      try {
        sendTelegramMessage(update.message.chat.id, buildErrorMessage());
      } catch (sendErr) {
        console.error('Gagal mengirim pesan kesalahan: ' + sendErr);
      }
    }
    return 200;
  }
}

/**
 * Menangani satu pesan Telegram.
 * 1. /start    → selalu dibalas (tanpa data finansial).
 * 2. Otorisasi → hanya user di whitelist; /id tetap dilayani untuk setup.
 * 3. Dispatch  → command atau teks transaksi.
 * @return {number} HTTP 200
 */
function handleMessage(message) {
  if (!message || !message.chat) return 200;

  const chatId = message.chat.id;
  // Di grup, Telegram mengirim command sebagai "/hariini@nama_bot".
  // Suffix @nama_bot dibuang agar command tetap dikenali.
  const text = normalizeCommandText(message.text);
  const firstName = message.chat.first_name || '';
  const userId = message.from && message.from.id !== undefined ? message.from.id : '';

  // /start tidak memerlukan otorisasi dan tidak menampilkan data apa pun.
  if (text === '/start') {
    sendTelegramMessage(chatId, buildStartMessage({ first_name: firstName }));
    return 200;
  }

  if (!isAuthorized(userId)) {
    // /id hanya menampilkan ID user sendiri — aman untuk proses setup whitelist.
    sendTelegramMessage(chatId, text === '/id' ? buildIdMessage(userId) : UNAUTHORIZED_REPLY);
    return 200;
  }

  // ---------- Mulai dari sini user sudah terotorisasi ----------

  if (text === '/id') {
    sendTelegramMessage(chatId, buildIdMessage(userId));
    return 200;
  }
  if (text === '/bantuan') return handleHelp(chatId);
  if (text === '/hariini') return handleToday(chatId);
  if (text === '/bulanini') return handleMonth(chatId);
  if (text === '/saldo') return handleBalance(chatId);
  if (text === '/budget') return handleBudget(chatId);
  if (text === '/terakhir') return handleLastTransactions(chatId);
  if (text === '/hapus' || text.indexOf('/hapus ') === 0) {
    return handleDelete(chatId, parseDeleteCommand(text));
  }

  // Foto struk → placeholder V2 (OCR belum aktif di V1).
  if (isPhotoMessage(message)) {
    handlePhoto(chatId);
    return 200;
  }

  if (isTelegramCommandLike(text)) {
    sendTelegramMessage(chatId, '❌ Perintah tidak dikenal. Ketik /bantuan untuk melihat daftar perintah.');
    return 200;
  }

  if (text) {
    handleTransactionText(chatId, userId, message, text);
  }
  return 200;
}

/** Parse teks transaksi, simpan, lalu balas hasilnya. */
function handleTransactionText(chatId, userId, message, text) {
  let parsed;
  try {
    parsed = parseTransaction(text);
  } catch (parseErr) {
    console.error('parseTransaction error: ' + parseErr);
    sendTelegramMessage(chatId, buildErrorMessage());
    return;
  }

  if (!parsed.valid) {
    sendTelegramMessage(chatId, parsed.error || buildErrorMessage());
    return;
  }

  const enriched = parsed.transactions.map(function (tx) {
    return {
      type: tx.type,
      amount: tx.amount,
      category: tx.category,
      account: tx.account,
      description: tx.description,
      source: tx.source,
      telegramUserId: String(userId || ''),
      telegramMessageId: String(message.message_id || '')
    };
  });

  let results;
  try {
    results = saveTransactions(enriched);
  } catch (saveErr) {
    console.error('saveTransactions error: ' + saveErr);
    sendTelegramMessage(chatId, buildErrorMessage());
    return;
  }

  const savedItems = [];
  let duplicateCount = 0;
  results.forEach(function (result, index) {
    if (result.saved) savedItems.push({ result: result, tx: enriched[index] });
    else if (result.reason === 'DUPLIKAT') duplicateCount++;
  });

  if (savedItems.length === 0) {
    sendTelegramMessage(chatId, duplicateCount > 0
      ? '⚠️ Transaksi ini sudah tercatat sebelumnya.'
      : buildErrorMessage());
    return;
  }

  if (savedItems.length === 1) {
    sendTelegramMessage(chatId, buildSavedReply(savedItems[0].tx, savedItems[0].result.id));
    return;
  }

  // Satu pesan berisi beberapa transaksi → balas ringkasan berurutan.
  const lines = ['✅ ' + savedItems.length + ' TRANSAKSI TERCATAT'];
  savedItems.forEach(function (item) {
    lines.push('');
    lines.push(item.result.id + ' — ' + formatRupiah(item.tx.amount) + ' — ' + item.tx.category);
  });
  sendTelegramMessage(chatId, lines.join('\n'));
}

/**
 * Menormalkan teks pesan Telegram.
 * Di grup/supergroup Telegram mengirim command dengan suffix bot, misalnya
 * "/hariini@keuangan_bot", sehingga suffix itu dibuang lebih dulu.
 */
function normalizeCommandText(rawText) {
  const text = String(rawText === null || rawText === undefined ? '' : rawText).trim();
  return text.replace(/^(\/[a-z0-9_]+)@[a-z0-9_]+/i, '$1');
}

/** Membaca ID dari perintah "/hapus TRX-000123". */
function parseDeleteCommand(text) {
  const parts = String(text || '').trim().split(/\s+/);
  return parts.length > 1 ? parts[1].trim() : '';
}

/** Deteksi pesan berisi foto (struk — untuk V2). */
function isPhotoMessage(message) {
  return !!(message && message.photo && message.photo.length);
}

/** Apakah teks terlihat seperti command Telegram (/sesuatu)? */
function isTelegramCommandLike(text) {
  return /^\/[a-z0-9_]+/i.test(String(text || '').trim());
}

/** Placeholder OCR — aman, tidak memanggil layanan berbayar (V2). */
function handlePhoto(chatId) {
  sendTelegramMessage(chatId, '📷 Fitur scan struk sedang disiapkan.');
}

/**
 * Balasan setelah transaksi tersimpan.
 * Untuk Pengeluaran, langsung menyertakan status budget kategori tersebut.
 */
function buildSavedReply(tx, id) {
  const t = now();
  const isExpense = tx.type === TX_TYPE.EXPENSE;

  const lines = ['✅ TRANSAKSI TERCATAT', ''];
  lines.push(getCategoryEmoji(tx.category) + ' ' + tx.category);
  lines.push(formatRupiah(tx.amount));
  lines.push('');
  lines.push('Keterangan:');
  lines.push(tx.description || '-');
  lines.push('');
  lines.push('Akun:');
  lines.push(tx.account);
  lines.push('');
  lines.push(formatDateIndonesia(t) + ' • ' + formatTimeIndonesia(t));
  lines.push('');
  lines.push('ID:');
  lines.push(id);

  // Status budget ditampilkan untuk Pengeluaran dan Alokasi (Tabungan punya target).
  if (isExpense || tx.type === TX_TYPE.ALLOCATION) {
    const budgetNote = buildBudgetWarning(t.getFullYear(), t.getMonth() + 1, tx.category);
    if (budgetNote) {
      lines.push('');
      lines.push(budgetNote);
    }
  }

  return lines.join('\n');
}

/**
 * Status budget + rekomendasi harian untuk satu kategori.
 * @return {string} '' bila kategori tidak punya budget aktif atau masih aman.
 */
function buildBudgetWarning(year, month, category) {
  try {
    const summary = calculateCategoryBudget(year, month, category);
    if (!summary || summary.levelInfo.level === 'AMAN') return '';

    const lines = [];
    const spent = summary.spent;
    const budget = summary.budget;
    const percent = summary.percent;
    const remaining = summary.remaining;
    const info = summary.levelInfo;

    if (info.level === 'TERLAMPAUI') {
      lines.push('🔴 BUDGET TERLAMPAUI');
      lines.push('');
      lines.push('Budget:');
      lines.push(formatRupiah(budget));
      lines.push('');
      lines.push('Realisasi:');
      lines.push(formatRupiah(spent));
      lines.push('');
      lines.push('Kelebihan:');
      lines.push(formatRupiah(Math.abs(remaining)));
      lines.push('');
      lines.push('Penggunaan:');
      lines.push(formatPercent(percent));
    } else {
      lines.push(info.level === 'HAMPIR' ? '🟠 BUDGET HAMPIR HABIS' : '🟡 ' + info.label);
      lines.push('');
      lines.push('Terpakai:');
      lines.push(formatRupiah(spent) + ' / ' + formatRupiah(budget));
      lines.push('');
      lines.push(makeProgressBar(percent, 10) + ' ' + formatPercent(percent));
      lines.push('');
      lines.push('Sisa:');
      lines.push(formatRupiah(remaining));
    }

    // Rekomendasi harian: hanya kategori pengeluaran fleksibel (Kos = biaya tetap,
    // sehingga daily allowance tidak relevan).
    if (category !== 'Kos') {
      const allowance = getDailyAllowance(year, month, category);
      if (allowance) {
        if (allowance.status === 'over') {
          lines.push('');
          lines.push('Budget sudah terlampaui.');
        } else if (allowance.allowancePerDay >= 0) {
          lines.push('');
          lines.push('💡 Agar tetap sesuai budget:');
          lines.push('Maksimal sekitar');
          lines.push(formatRupiah(Math.round(allowance.allowancePerDay)) + ' / hari');
          lines.push('hingga akhir bulan.');
        }
      }
    }

    return lines.join('\n');
  } catch (err) {
    console.error('buildBudgetWarning error: ' + err);
    return '';
  }
}

/**
 * Handler command bergaya §26: menerima chatId, menyusun laporan, lalu mengirim.
 * Handler di bawah ini adalah pintu masuk resmi tiap command; dispatch di
 * handleMessage() memanggil fungsi-fungsi ini agar satu command punya satu
 * jalur eksekusi (mudah diuji dan dikembangkan).
 */

/** Kirim ringkasan hari ini. */
function handleToday(chatId) {
  sendTelegramMessage(chatId, buildTodayMessage());
  return 200;
}

/** Kirim ringkasan bulan berjalan. */
function handleMonth(chatId) {
  sendTelegramMessage(chatId, buildMonthMessage());
  return 200;
}

/** Kirim saldo per akun. */
function handleBalance(chatId) {
  sendTelegramMessage(chatId, buildBalanceMessage());
  return 200;
}

/** Kirim status budget bulan berjalan. */
function handleBudget(chatId) {
  sendTelegramMessage(chatId, buildBudgetMessage());
  return 200;
}

/** Kirim 5 transaksi terakhir. */
function handleLastTransactions(chatId) {
  sendTelegramMessage(chatId, buildLastTransactionsMessage());
  return 200;
}

/** Soft delete transaksi, lalu kirim konfirmasinya. */
function handleDelete(chatId, id) {
  sendTelegramMessage(chatId, buildDeleteMessage(id));
  return 200;
}

/** Kirim daftar bantuan. */
function handleHelp(chatId) {
  sendTelegramMessage(chatId, buildHelpMessage());
  return 200;
}

/** ------------- Telegram Bot API (token dari Script Properties) ------------- */

/**
 * Kirim pesan teks.
 * Sengaja TANPA parse_mode: deskripsi transaksi berasal dari input user dan
 * karakter seperti < & bisa membuat Telegram menolak pesan (parse error).
 */
function sendTelegramMessage(chatId, text) {
  const data = sendTelegramRequest('sendMessage', {
    chat_id: String(chatId),
    text: truncateText(text),
    disable_web_page_preview: true
  });
  return data.result;
}

/**
 * Kirim permintaan ke Telegram Bot API.
 * @return {Object} isi respons JSON Telegram ({ok: true, result: ...}).
 */
function sendTelegramRequest(method, payload) {
  const token = getProperty(PROP.BOT_TOKEN);
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum diisi di Script Properties.');

  const response = UrlFetchApp.fetch(TELEGRAM_API + token + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (err) {
    throw new Error('Respons Telegram tidak valid: ' + response.getContentText());
  }

  if (!data.ok) {
    throw new Error('Telegram API ' + method + ' gagal: ' + (data.description || 'unknown error'));
  }
  return data;
}

/** ------------- Otorisasi ------------- */

/** Daftar Telegram User ID yang diizinkan (Script Property AUTHORIZED_USER_IDS, pisah koma). */
function getAuthorizedUserIds() {
  return getProperty(PROP.AUTHORIZED_USER_IDS)
    .split(',')
    .map(function (id) { return String(id).trim(); })
    .filter(function (id) { return id.length > 0; });
}

/**
 * Cek otorisasi berbasis whitelist murni.
 * Daftar kosong berarti TIDAK ADA yang diizinkan (fail closed).
 */
function isAuthorized(userId) {
  const idStr = String(userId === null || userId === undefined ? '' : userId).trim();
  if (!idStr) return false;
  return getAuthorizedUserIds().indexOf(idStr) !== -1;
}


/* ===== 07_Setup.gs ===== */

/**
 * ============================================================================
 * FILE 07 — Setup Sistem (idempotent), Dashboard, Webhook
 *
 * Jalankan setupPersonalFinanceSystem() SATU KALI dari editor Apps Script.
 * Fungsi ini AMAN dijalankan berkali-kali: data yang sudah ada tidak dihapus.
 * ============================================================================
 */

/**
 * Setup lengkap sistem keuangan pribadi.
 * Urutan: sheet → header → data awal → budget → format → dashboard.
 * Idempotent: hanya membuat/menambal yang belum ada.
 */
function setupPersonalFinanceSystem() {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(CONFIG.LOCK_TIMEOUT_MS);
  if (!acquired) lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

  const log = [];
  try {
    const spreadsheet = getSpreadsheet();
    log.push('Spreadsheet: ' + spreadsheet.getName());

    // 1-2. Sheet + header
    setupSheets().forEach(function (name) {
      log.push('Sheet siap: ' + name);
    });

    // 3. Categories awal
    const categoryCount = seedCategories();
    log.push('Kategori baru ditambahkan: ' + categoryCount);

    // 4. Accounts awal
    const accountCount = seedAccounts();
    log.push('Akun baru ditambahkan: ' + accountCount);

    // 5. Settings default
    const settingsCount = seedSettings();
    log.push('Setting baru ditambahkan: ' + settingsCount);

    // 6. Budget bulan berjalan (dari Monthly_Budget kategori)
    const budgetCount = seedBudgetsForCurrentMonth();
    log.push('Baris budget bulan ini dibuat: ' + budgetCount);

    // 7-9. Formatting
    applyBasicFormatting(spreadsheet);
    log.push('Formatting dasar diterapkan.');

    // 10. Dashboard
    refreshDashboard();
    log.push('Dashboard diperbarui.');

    // 11. Verifikasi timezone project.
    const timezoneNotice = verifyProjectTimezone();
    if (timezoneNotice) log.push(timezoneNotice);

    const message = 'Setup selesai.\n' + log.join('\n');
    console.log(message);
    return message;
  } finally {
    try { lock.releaseLock(); } catch (err) { console.error(err); }
  }
}

/**
 * Memastikan timezone project Apps Script sesuai dengan Settings.
 *
 * PENTING: Apps Script mengambil jam dinding (dan format tanggal) dari setting
 * project, BUKAN dari nilai di sheet Settings. Nilai Settings dipakai sebagai
 * sumber kebenaran; fungsi ini membandingkannya dan memberi peringatan bila
 * berbeda, supaya jam transaksi tidak diam-diam memakai UTC.
 *
 * @return {string} pesan status/peringatan, atau '' bila tidak dapat diperiksa.
 */
function verifyProjectTimezone() {
  const expected = getTimezone();
  let actual = '';
  try {
    actual = String(ScriptApp.getScriptTimeZone() || '').trim();
  } catch (err) {
    return '';
  }
  if (!actual) return '';
  if (actual === expected) return 'Timezone project: ' + actual + ' (OK)';

  return 'PERHATIAN: timezone project = "' + actual + '" tetapi Settings = "' + expected +
    '". Samakan lewat Project Settings → Time zone, lalu jalankan ulang setup.';
}

/**
 * Membuat semua sheet + header yang belum ada (§26: setupSheets).
 * Dipanggil oleh setupPersonalFinanceSystem(); aman dijalankan sendiri.
 * @return {Array<string>} nama sheet yang siap dipakai.
 */
function setupSheets() {
  const spreadsheet = getSpreadsheet();
  const names = [
    SHEET.TRANSACTIONS, SHEET.CATEGORIES, SHEET.ACCOUNTS,
    SHEET.BUDGETS, SHEET.SETTINGS, SHEET.DASHBOARD
  ];
  names.forEach(function (name) {
    ensureSheetWithHeaders(spreadsheet, name, HEADERS[name]);
  });
  clearConfigCache();
  return names;
}

/** Membuat sheet + header bila belum ada; tidak menyentuh data yang sudah ada. */
function ensureSheetWithHeaders(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  const existingHeaders = sheet.getLastColumn() >= 1
    ? sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(function (h) { return String(h || '').trim(); })
    : [];

  const headersMissing = headers.some(function (header, index) {
    return existingHeaders[index] !== header;
  });
  if (headersMissing) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#efefef');
  }
  return sheet;
}

/** Menambahkan kategori awal yang belum ada. @return {number} jumlah baris baru. */
function seedCategories() {
  const sheet = getSheet(SHEET.CATEGORIES);
  const existing = {};
  readTable(SHEET.CATEGORIES).forEach(function (row) {
    const key = String(row.Category || '').trim() + '|' + String(row.Type || '').trim();
    existing[key] = true;
  });

  const toAppend = SEED_CATEGORIES.filter(function (category) {
    return !existing[String(category.Category).trim() + '|' + String(category.Type).trim()];
  });
  if (toAppend.length === 0) return 0;

  const rows = toAppend.map(function (category) {
    return [
      category.Category,
      category.Type,
      category.Monthly_Budget,
      category.Warning_Level_1,
      category.Warning_Level_2,
      category.Active,
      category.Keywords
    ];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.Categories.length).setValues(rows);
  clearConfigCache();
  return rows.length;
}

/** Menambahkan akun awal yang belum ada. @return {number} jumlah baris baru. */
function seedAccounts() {
  const sheet = getSheet(SHEET.ACCOUNTS);
  const existing = {};
  readTable(SHEET.ACCOUNTS).forEach(function (row) {
    existing[String(row.Account || '').trim().toLowerCase()] = true;
  });

  const toAppend = SEED_ACCOUNTS.filter(function (account) {
    return !existing[String(account.Account).trim().toLowerCase()];
  });
  if (toAppend.length === 0) return 0;

  const rows = toAppend.map(function (account) {
    return [account.Account, account.Type, account.Initial_Balance, account.Active];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.Accounts.length).setValues(rows);
  clearConfigCache();
  return rows.length;
}

/** Menambahkan setting default yang belum ada. @return {number} jumlah baris baru. */
function seedSettings() {
  const sheet = getSheet(SHEET.SETTINGS);
  const existing = {};
  readTable(SHEET.SETTINGS).forEach(function (row) {
    if (row.Key) existing[String(row.Key).trim()] = true;
  });

  const toAppend = SEED_SETTINGS.filter(function (pair) { return !existing[pair[0]]; });
  if (toAppend.length === 0) return 0;

  sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, HEADERS.Settings.length).setValues(toAppend);
  clearConfigCache();
  return toAppend.length;
}

/**
 * Membuat baris budget bulan berjalan dari Monthly_Budget di sheet Categories.
 * Kategori yang belum punya baris budget untuk bulan ini akan ditambahkan
 * sehingga user bisa mengubah nilainya manual di sheet Budgets.
 * @return {number} jumlah baris budget baru.
 */
function seedBudgetsForCurrentMonth() {
  const sheet = getSheet(SHEET.BUDGETS);
  const today = now();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const existing = {};
  readTable(SHEET.BUDGETS).forEach(function (row) {
    existing[toNumber(row.Year) + '|' + toNumber(row.Month) + '|' + String(row.Category || '').trim()] = true;
  });

  const toAppend = [];
  readTable(SHEET.CATEGORIES).forEach(function (row) {
    if (!row.Category || !isTrue(row.Active)) return;
    const budget = toNumber(row.Monthly_Budget);
    if (budget <= 0) return;

    const category = String(row.Category).trim();
    const key = year + '|' + month + '|' + category;
    if (existing[key]) return;

    toAppend.push([
      year, month, category, budget,
      toNumber(row.Warning_Level_1) || CONFIG.WARNING_1_DEFAULT,
      toNumber(row.Warning_Level_2) || CONFIG.WARNING_2_DEFAULT,
      true
    ]);
  });

  if (toAppend.length === 0) return 0;
  sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, HEADERS.Budgets.length).setValues(toAppend);
  clearConfigCache();
  return toAppend.length;
}

/** Formatting dasar: freeze header, lebar kolom, format Rupiah & format tanggal. */
function applyBasicFormatting(spreadsheet) {
  const transactionSheet = spreadsheet.getSheetByName(SHEET.TRANSACTIONS);
  transactionSheet.setFrozenRows(1);
  transactionSheet.setColumnWidths(1, HEADERS.Transactions.length, 110);
  transactionSheet.setColumnWidth(8, 220);  // Description lebih lebar
  transactionSheet.setColumnWidth(15, 90);  // Status

  // Amount (kolom I) sebagai angka Rupiah tanpa desimal.
  const transactionRows = Math.max(transactionSheet.getMaxRows() - 1, 0);
  formatCurrencyColumn(transactionSheet, 9, 2, transactionRows);

  const accountsSheet = spreadsheet.getSheetByName(SHEET.ACCOUNTS);
  accountsSheet.setFrozenRows(1);
  formatCurrencyColumn(accountsSheet, 3, 2, Math.max(accountsSheet.getMaxRows() - 1, 0));

  const budgetsSheet = spreadsheet.getSheetByName(SHEET.BUDGETS);
  budgetsSheet.setFrozenRows(1);
  formatCurrencyColumn(budgetsSheet, 4, 2, Math.max(budgetsSheet.getMaxRows() - 1, 0));

  const categoriesSheet = spreadsheet.getSheetByName(SHEET.CATEGORIES);
  categoriesSheet.setFrozenRows(1);
  categoriesSheet.setColumnWidth(7, 400); // Keywords
  formatCurrencyColumn(categoriesSheet, 3, 2, Math.max(categoriesSheet.getMaxRows() - 1, 0));

  const settingsSheet = spreadsheet.getSheetByName(SHEET.SETTINGS);
  settingsSheet.setFrozenRows(1);

  // Kategori menampilkan format Rp pada budget.
  clearConfigCache();
}

/**
 * Mengisi sheet Dashboard dengan ringkasan bulan berjalan.
 * Dashboard ini data-source terbaru: dipanggil ulang setiap transaksi baru.
 */
function refreshDashboard() {
  const sheet = getSheet(SHEET.DASHBOARD);
  // Dashboard adalah sheet turunan: selalu ditulis ulang agar tidak menyisakan
  // baris lama (mis. kategori yang sudah tidak punya transaksi bulan ini).
  // clearContent() (bukan clear()) agar lebar kolom & format tetap terjaga.
  sheet.clearContent();
  clearConfigCache();

  const today = now();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthName = getMonthName(month);

  const income = totalIncome();
  const expense = totalExpense();
  const balances = getBalancePerAccount();
  const totalBalance = balances.reduce(function (sum, entry) { return sum + entry.balance; }, 0);
  const savings = getMonthlyCategorySpend(year, month, 'Tabungan');

  const budgetSummaries = checkBudget(year, month);
  let totalBudget = 0;
  let totalSpent = 0;
  budgetSummaries.forEach(function (summary) {
    totalBudget += summary.budget;
    totalSpent += summary.spent;
  });

  // -------- Ringkasan utama --------
  const summaryRows = [
    ['Item', 'Nilai'],
    ['Periode', monthName + ' ' + year],
    ['Pemasukan Bulan Ini', income],
    ['Pengeluaran Bulan Ini', expense],
    ['Net Cash Flow', income - expense],
    ['Tabungan Bulan Ini', savings],
    ['Total Budget', totalBudget],
    ['Total Terpakai', totalSpent],
    ['Sisa Budget', totalBudget - totalSpent],
    ['Saldo Total', totalBalance]
  ];

  // -------- Pengeluaran per kategori --------
  const byCategory = getMonthlyCategoryExpense(year, month);
  const categoryNames = Object.keys(byCategory).sort(function (a, b) { return byCategory[b] - byCategory[a]; });
  const categoryRows = [['Kategori', 'Pengeluaran']].concat(
    categoryNames.length
      ? categoryNames.map(function (name) { return [name, byCategory[name]]; })
      : [['Belum ada data', 0]]
  );

  // -------- Trend pengeluaran bulanan --------
  const trendRows = [['Bulan', 'Pengeluaran']].concat(getMonthlyExpenseTrend(year, month, 12));

  writeDashboardBlock(sheet, 1, 'RINGKASAN BULAN INI', summaryRows);
  const categoryStart = summaryRows.length + 3;
  writeDashboardBlock(sheet, categoryStart, 'PENGELUARAN PER KATEGORI', categoryRows);
  const trendStart = categoryStart + categoryRows.length + 3;
  writeDashboardBlock(sheet, trendStart, 'TREND PENGELUARAN BULANAN', trendRows);

  // Format kolom Nilai (kolom B) sebagai Rupiah. Baris "Periode" dilewati
  // karena isinya teks (mis. "September 2026").
  const summaryDataRows = summaryRows.length - 2; // buang baris header + Periode
  formatDashboardValues(sheet, 4, summaryDataRows);          // mulai setelah "Periode"
  formatDashboardValues(sheet, categoryStart + 2, categoryRows.length - 1);
  formatDashboardValues(sheet, trendStart + 2, trendRows.length - 1);

  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 160);
}

/** Menulis satu blok judul + tabel (baris pertama tabel = header). */
function writeDashboardBlock(sheet, startRow, title, rows) {
  sheet.getRange(startRow, 1, 1, 2).merge().setValue(title).setFontWeight('bold').setBackground('#d9ead3');
  sheet.getRange(startRow + 1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(startRow + 1, 1, 1, 2).setFontWeight('bold');
}

/**
 * Terapkan format Rupiah pada kolom Nilai (kolom B).
 * @param {number} startRow baris pertama data (BUKAN baris header)
 * @param {number} numRows jumlah baris data
 */
function formatDashboardValues(sheet, startRow, numRows) {
  if (numRows < 1) return;
  sheet.getRange(startRow, 2, numRows, 1).setNumberFormat('"Rp"#,##0');
}

/**
 * Trend pengeluaran bulanan.
 * @param {number} endYear tahun acuan
 * @param {number} endMonth bulan acuan (1-12)
 * @param {number} monthsBack jumlah bulan yang ditampilkan (termasuk bulan acuan)
 * @return {Array} [["September 2026", 1850000], ...] urut lama → baru.
 */
function getMonthlyExpenseTrend(endYear, endMonth, monthsBack) {
  const totals = {};
  readTable(SHEET.TRANSACTIONS).forEach(function (row) {
    if (String(row.Status || '').trim() !== TX_STATUS.ACTIVE) return;
    if (String(row.Type || '').trim() !== TX_TYPE.EXPENSE) return;
    const key = toNumber(row.Year) + '-' + toNumber(row.Month);
    totals[key] = (totals[key] || 0) + toNumber(row.Amount);
  });

  const trend = [];
  for (let offset = monthsBack - 1; offset >= 0; offset--) {
    // new Date() dengan bulan 0-based menangani pergantian tahun secara otomatis.
    const point = new Date(Number(endYear), Number(endMonth) - 1 - offset, 1);
    const year = point.getFullYear();
    const month = point.getMonth() + 1;
    trend.push([getMonthName(month) + ' ' + year, totals[year + '-' + month] || 0]);
  }
  return trend;
}
/** ------------- Webhook ------------- */

/**
 * Mendaftarkan webhook Telegram ke URL Web App.
 * Otomatis memakai WEBAPP_URL dari Script Properties bila belum ada.
 * Set secret token agar hanya Telegram (dan pemilik URL) yang bisa memanggil.
 */
function setupWebhook() {
  const token = getProperty(PROP.BOT_TOKEN);
  if (!token) throw new Error('Isi TELEGRAM_BOT_TOKEN di Script Properties terlebih dahulu.');

  let webAppUrl = getProperty(PROP.WEBAPP_URL);
  if (!webAppUrl) {
    try {
      webAppUrl = ScriptApp.getService().getUrl();
    } catch (err) {
      webAppUrl = '';
    }
  }
  if (!webAppUrl) {
    throw new Error('Web App URL tidak ditemukan. Jalankan setupWebhookFromDeployment() dengan URL deployment Anda.');
  }
  return registerWebhook(webAppUrl);
}

/**
 * Mendaftarkan webhook memakai URL Web App hasil deploy.
 * Pakai fungsi ini jika ScriptApp.getService().getUrl() tidak tersedia.
 * @param {string} webAppUrl URL Web App, mis. "https://script.google.com/macros/s/AKfy.../exec"
 */
function setupWebhookFromDeployment(webAppUrl) {
  const url = String(webAppUrl || '').trim();
  if (!url) throw new Error('Isi WEBAPP_URL di Script Properties, atau kirim URL sebagai argumen.');
  setProperty(PROP.WEBAPP_URL, url);
  return registerWebhook(url);
}

/** Memanggil setWebhook Telegram dan mengembalikan ringkasannya. */
function registerWebhook(webAppUrl) {
  const token = getProperty(PROP.BOT_TOKEN);
  if (!token) throw new Error('Isi TELEGRAM_BOT_TOKEN di Script Properties terlebih dahulu.');

  // Secret token disimpan di properties, bukan di source code.
  let secret = getProperty(PROP.WEBHOOK_SECRET);
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '');
    setProperty(PROP.WEBHOOK_SECRET, secret);
  }

  // Apps Script tidak dapat membaca header HTTP (termasuk secret_token header
  // Telegram). Solusi: secret disisipkan sebagai query string ?secret=… pada
  // URL webhook; doPost() memverifikasinya lewat e.parameter.secret.
  const separator = webAppUrl.indexOf('?') === -1 ? '?' : '&';
  const webhookUrl = webAppUrl + separator + 'secret=' + secret;

  const payload = {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true
  };

  const response = UrlFetchApp.fetch(TELEGRAM_API + token + '/setWebhook', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());
  if (!data.ok) {
    throw new Error('setWebhook gagal: ' + (data.description || 'unknown error'));
  }

  const summary = [
    'Webhook terdaftar.',
    'URL: ' + webhookUrl,
    'Secret: terpasang sebagai query ?secret=... (diverifikasi oleh doPost).',
    'Jalankan getWebhookInfo() untuk memeriksa status.'
  ].join('\n');
  console.log(summary);
  return summary;
}

/** Menghapus webhook (berguna saat debugging). */
function deleteWebhook() {
  const token = getProperty(PROP.BOT_TOKEN);
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum diisi.');
  const response = UrlFetchApp.fetch(TELEGRAM_API + token + '/deleteWebhook', {
    method: 'post',
    muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText());
  console.log('deleteWebhook: ' + JSON.stringify(data));
  return data;
}

/** Info webhook untuk debugging: URL, status, update terakhir yang gagal, dll. */
function getWebhookInfo() {
  const token = getProperty(PROP.BOT_TOKEN);
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum diisi.');

  const response = UrlFetchApp.fetch(TELEGRAM_API + token + '/getWebhookInfo', {
    method: 'post',
    muteHttpExceptions: true
  });
  const data = JSON.parse(response.getContentText());

  // Tampilkan juga info bot agar mudah dipakai saat panduan setup.
  const meResponse = UrlFetchApp.fetch(TELEGRAM_API + token + '/getMe', {
    method: 'post',
    muteHttpExceptions: true
  });
  const me = JSON.parse(meResponse.getContentText());

  const info = data.result || {};
  const summary = [
    '=== WEBHOOK INFO ===',
    'Bot: @' + ((me.result && me.result.username) || '(tidak diketahui)'),
    'URL: ' + (info.url || '(belum di-set)'),
    'Pending updates: ' + (info.pending_update_count === undefined ? '-' : info.pending_update_count),
    'Last error: ' + (info.last_error_message || '(tidak ada)'),
    'Last error date: ' + (info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : '-'),
    'Max connections: ' + (info.max_connections || '-'),
    'IP: ' + (info.ip_address || '-')
  ].join('\n');

  console.log(summary);
  return summary;
}

/** Menyimpan Web App URL hasil deploy ke Script Properties. */
function saveWebAppUrl(webAppUrl) {
  const url = String(webAppUrl || '').trim();
  if (!url) throw new Error('URL kosong.');
  setProperty(PROP.WEBAPP_URL, url);
  console.log('WEBAPP_URL disimpan: ' + url);
  return url;
}


/* ===== 08_Webhook.gs ===== */

/**
 * ============================================================================
 * FILE 08 — Webhook Entry Point (doPost) + Pemeriksaan Konfigurasi
 *
 * Deploy file ini sebagai Web App:
 *   Execute as : Me
 *   Who has access : Anyone
 * ============================================================================
 */

/**
 * Entry point webhook Telegram.
 *
 * Telegram mengirim POST berisi JSON update. Kita selalu membalas HTTP 200
 * supaya Telegram tidak mengulang pengiriman update yang sama (penyebab
 * utama transaksi ganda), kecuali saat konfigurasi belum lengkap.
 *
 * @param {Object} e event Apps Script; e.postData.contents berisi JSON update.
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      console.log('doPost tanpa body — kemungkinan dibuka lewat browser.');
      return jsonResponse({ ok: true, message: 'Webhook aktif.' });
    }

    // Keamanan: secret disisipkan di query string URL webhook (bukan header),
    // karena Apps Script hanya mengekspos e.parameter untuk query string.
    // Ini mencegah orang lain yang menebak URL /exec mengirim update palsu.
    // Otorisasi user tetap dijamin terpisah oleh whitelist Telegram User ID.
    const secret = getProperty(PROP.WEBHOOK_SECRET);
    if (secret) {
      const incoming = (e && e.parameter && e.parameter.secret) || '';
      if (incoming !== secret) {
        console.log('Secret pada URL webhook tidak cocok — permintaan diabaikan.');
        return jsonResponse({ ok: true });
      }
    }

    let update;
    try {
      update = JSON.parse(e.postData.contents);
    } catch (err) {
      console.error('Body bukan JSON valid: ' + err);
      return jsonResponse({ ok: true });
    }

    // Konfigurasi dasar belum lengkap → catat, jangan proses.
    if (!getProperty(PROP.BOT_TOKEN) || !getProperty(PROP.SPREADSHEET_ID)) {
      console.error('Konfigurasi belum lengkap (BOT_TOKEN/SPREADSHEET_ID). Update diabaikan.');
      return jsonResponse({ ok: true });
    }

    handleUpdate(update);
  } catch (err) {
    // Jangan pernah membocorkan detail internal ke Telegram.
    console.error('doPost error: ' + err);
  }
  return jsonResponse({ ok: true });
}

/** Membalas JSON agar Telegram selalu menerima HTTP 200. */
function jsonResponse(payload) {
  return HtmlService.createHtmlOutput(
    JSON.stringify(payload || { ok: true })
  );
}

/**
 * Memeriksa konfigurasi Script Properties.
 * Jalankan dari editor Apps Script; hasilnya tampil di Execution log.
 */
function checkConfiguration() {
  const report = [];
  const botToken = getProperty(PROP.BOT_TOKEN);
  const spreadsheetId = getProperty(PROP.SPREADSHEET_ID);
  const authorizedIds = getAuthorizedUserIds();
  const webAppUrl = getProperty(PROP.WEBAPP_URL);

  report.push('TELEGRAM_BOT_TOKEN   : ' + (botToken ? 'OK (' + botToken.length + ' karakter)' : 'BELUM DIISI'));
  report.push('SPREADSHEET_ID       : ' + (spreadsheetId ? 'OK (' + spreadsheetId + ')' : 'BELUM DIISI'));
  report.push('AUTHORIZED_USER_IDS  : ' + (authorizedIds.length ? 'OK (' + authorizedIds.join(', ') + ')' : 'BELUM DIISI'));
  report.push('WEBAPP_URL           : ' + (webAppUrl ? 'OK (' + webAppUrl + ')' : 'belum disimpan (opsional)'));
  report.push('TELEGRAM_WEBHOOK_SECRET: ' + (getProperty(PROP.WEBHOOK_SECRET) ? 'OK' : 'belum dibuat'));
  const timezoneNotice = verifyProjectTimezone();
  report.push('Time zone project    : ' + (timezoneNotice || 'tidak dapat diperiksa'));

  if (spreadsheetId) {
    try {
      const sheets = getSpreadsheet().getSheets().map(function (s) { return s.getName(); });
      report.push('Sheet tersedia       : ' + sheets.join(', '));
    } catch (err) {
      report.push('Sheet                : GAGAL DIBUKA (' + err + ')');
    }
  }

  const output = report.join('\n');
  console.log(output);
  return output;
}

/**
 * Mengirim pesan uji ke chat tertentu tanpa lewat webhook.
 * Berguna untuk memastikan token & konfigurasi benar.
 * @param {string} chatId ID chat tujuan (biasanya Telegram User ID Anda).
 */
function sendTestMessage(chatId) {
  const id = String(chatId || getAuthorizedUserIds()[0] || '').trim();
  if (!id) throw new Error('Isi AUTHORIZED_USER_IDS atau kirim chatId sebagai argumen.');
  sendTelegramMessage(id, '✅ Bot keuangan aktif. Coba kirim:\nkeluar 35rb makan');
  console.log('Pesan uji terkirim ke ' + id);
  return 'Pesan uji terkirim.';
}
