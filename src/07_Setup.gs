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