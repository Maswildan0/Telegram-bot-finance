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

