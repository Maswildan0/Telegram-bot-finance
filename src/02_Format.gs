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
