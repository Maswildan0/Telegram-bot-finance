/**
 * Build: menggabungkan seluruh src/*.gs menjadi SATU file siap tempel
 * (dist/Code.gs) untuk yang ingin copy-paste sekali jalan.
 *
 * Jalankan:  node build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
if (!files.length) {
  console.error('Tidak ada file .gs di src/');
  process.exit(1);
}

const header = [
  '/**',
  ' * ============================================================================',
  ' * PERSONAL FINANCE TRACKER — TELEGRAM + GOOGLE APPS SCRIPT + GOOGLE SHEETS',
  ' * FILE GABUNGAN (hasil build.js) — tempel seluruh isi file ini ke editor',
  ' * Apps Script sebagai satu file "Code.gs".',
  ' *',
  ' * Isi dipisah menjadi bagian-bagian berikut (urut):',
  ...files.map((f) => ' *   - ' + f),
  ' *',
  ' * JANGAN isi credential di file ini. Semua token/ID disimpan lewat',
  ' * Script Properties (lihat STEP 6 di PANDUAN.md).',
  ' * ============================================================================',
  ' */',
  ''
].join('\n');

const bodies = files.map((file) => {
  const content = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\s+$/, '');
  return '/* ===== ' + file + ' ===== */\n\n' + content;
});

const bundle = header + '\n' + bodies.join('\n\n\n') + '\n';

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);
fs.writeFileSync(path.join(DIST, 'Code.gs'), bundle, 'utf8');

console.log('dist/Code.gs dibuat (' + bundle.length + ' karakter, ' + files.length + ' file).');
console.log('Perintah yang tersedia untuk pengguna:');
[
  'setupPersonalFinanceSystem()', 'setupWebhook()', 'setupWebhookFromDeployment(url)',
  'getWebhookInfo()', 'checkConfiguration()', 'sendTestMessage(chatId)',
  'deleteWebhook()', 'refreshDashboard()'
].forEach((name) => console.log('  - ' + name));
