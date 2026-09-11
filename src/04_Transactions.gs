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