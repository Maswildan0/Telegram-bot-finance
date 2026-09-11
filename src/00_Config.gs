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
