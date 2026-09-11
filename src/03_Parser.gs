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
