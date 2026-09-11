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
