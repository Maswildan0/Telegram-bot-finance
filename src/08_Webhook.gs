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
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
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