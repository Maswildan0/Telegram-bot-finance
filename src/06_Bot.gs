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
