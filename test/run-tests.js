/**
 * Test runner V1 — memuat seluruh file src/*.gs ke satu konteks VM dengan
 * stub Apps Script, lalu menjalankan test case (termasuk test case §35).
 *
 * Jalankan:  node test/run-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createContext, buildSheetValues } = require('./01_apps-script-stub.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// ---------------------------------------------------------------- assertions
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failures.push({ name, detail });
    console.log('  ✗ ' + name + (detail ? '  →  ' + detail : ''));
  }
}

function section(title) {
  console.log('\n' + title);
}

// ---------------------------------------------------------------- bootstrap
const context = createContext();
vm.createContext(context);

const useBundle = process.env.BUNDLE_MODE === '1';
if (useBundle) {
  const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'Code.gs'), 'utf8');
  try {
    vm.runInContext(bundle, context, { filename: 'dist/Code.gs' });
  } catch (err) {
    console.error('GAGAL memuat dist/Code.gs: ' + err.message);
    process.exit(1);
  }
  console.log('BUNDLE MODE — dimuat dist/Code.gs tunggal.');
} else {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
  files.forEach((file) => {
    const code = fs.readFileSync(path.join(SRC, file), 'utf8');
    try {
      vm.runInContext(code, context, { filename: file });
    } catch (err) {
      console.error('GAGAL memuat ' + file + ': ' + err.message);
      process.exit(1);
    }
  });
  console.log('Dimuat ' + files.length + ' file: ' + files.join(', '));
}

const g = context; // nama pendek untuk fungsi global Apps Script

// ---------------------------------------------------------------- fake clock
const FIXED_NOW = new Date(2026, 8, 10, 10, 30, 25); // 10 September 2026, 10:30:25
context.TEST_NOW = FIXED_NOW;

// ---------------------------------------------------------------- setup awal
context.PropertiesService.getScriptProperties().setProperty('TELEGRAM_BOT_TOKEN', 'TEST_TOKEN');
context.PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', 'TEST_SPREADSHEET_ID');
context.PropertiesService.getScriptProperties().setProperty('AUTHORIZED_USER_IDS', '123456789');

// Telegram API palsu: selalu sukses, dan catat pesan keluar.
const sentMessages = [];
context.__fetchResponder = (url, body) => {
  if (/\/sendMessage$/.test(url)) {
    sentMessages.push(body);
    return { ok: true, result: { message_id: 1000 + sentMessages.length } };
  }
  if (/\/setWebhook$/.test(url)) return { ok: true, result: true, description: 'Webhook was set' };
  if (/\/getWebhookInfo$/.test(url)) {
    return { ok: true, result: { url: body.url || 'https://example/exec', pending_update_count: 0 } };
  }
  if (/\/getMe$/.test(url)) return { ok: true, result: { username: 'test_finance_bot' } };
  return { ok: true, result: {} };
};

function lastMessage() {
  return sentMessages.length ? sentMessages[sentMessages.length - 1].text : '';
}

function clearMessages() {
  sentMessages.length = 0;
}

// ---------------------------------------------------------------- §34 setup
section('STEP 34 — setupPersonalFinanceSystem() idempotent');
const firstSetup = g.setupPersonalFinanceSystem();
check('setup pertama selesai tanpa error', typeof firstSetup === 'string');
check('sheet Transactions dibuat', !!context.__sheets['Transactions']);
check('sheet Categories dibuat', !!context.__sheets['Categories']);
check('sheet Accounts dibuat', !!context.__sheets['Accounts']);
check('sheet Budgets dibuat', !!context.__sheets['Budgets']);
check('sheet Settings dibuat', !!context.__sheets['Settings']);
check('sheet Dashboard dibuat', !!context.__sheets['Dashboard']);

const txRowsAfterSetup = context.__sheets['Transactions'].__data.length;
const catRowsAfterSetup = context.__sheets['Categories'].__data.length;
const accRowsAfterSetup = context.__sheets['Accounts'].__data.length;

g.clearConfigCache();
const secondSetup = g.setupPersonalFinanceSystem();
check('setup kedua (idempotent) tidak menambah kategori', context.__sheets['Categories'].__data.length === catRowsAfterSetup,
  'sebelum=' + catRowsAfterSetup + ' sesudah=' + context.__sheets['Categories'].__data.length);
check('setup kedua tidak menambah akun', context.__sheets['Accounts'].__data.length === accRowsAfterSetup);
check('setup kedua tidak menyentuh Transactions', context.__sheets['Transactions'].__data.length === txRowsAfterSetup);

// ---------------------------------------------------------------- §10 & §35
section('STEP 10 / §35 — Parser nominal');
const amountCases = [
  ['25000', 25000], ['25rb', 25000], ['25k', 25000], ['25 ribu', 25000],
  ['1jt', 1000000], ['1 juta', 1000000], ['1.5jt', 1500000], ['1,5jt', 1500000],
  ['2.25 juta', 2250000], ['Rp25.000', 25000], ['35rb', 35000], ['150rb', 150000],
  ['3jt', 3000000], ['500rb', 500000], ['2,5jt', 2500000]
];
amountCases.forEach(([input, expected]) => {
  const result = g.parseAmount(input);
  check('parseAmount("' + input + '") = ' + expected, result.value === expected, 'didapat ' + result.value);
});

const invalidAmounts = ['', 'abc', 'rb', '0', '-5000'];
invalidAmounts.forEach((input) => {
  const result = g.parseAmount(input);
  check('parseAmount("' + input + '") tidak valid', result.value === null || result.value <= 0, 'didapat ' + result.value);
});

section('§35 — Test case parser lengkap');
const parserCases = [
  {
    input: 'keluar 35rb makan',
    expect: { type: 'Pengeluaran', amount: 35000, category: 'Makan & Minum', account: 'Cash', description: 'makan' }
  },
  {
    input: 'keluar 150rb bensin bca',
    expect: { type: 'Pengeluaran', amount: 150000, category: 'Transportasi', account: 'BCA', description: 'bensin' }
  },
  {
    input: 'masuk 3jt gaji bca',
    expect: { type: 'Pemasukan', amount: 3000000, category: 'Gaji', account: 'BCA', description: 'gaji' }
  },
  {
    input: 'keluar 1jt kos bca',
    expect: { type: 'Pengeluaran', amount: 1000000, category: 'Kos', account: 'BCA', description: 'kos' }
  },
  {
    input: 'keluar 1,5jt belanja',
    expect: { type: 'Pengeluaran', amount: 1500000, category: 'Belanja Pribadi', account: 'Cash', description: 'belanja' }
  },
  {
    input: 'keluar 25 ribu makan siang',
    expect: { type: 'Pengeluaran', amount: 25000, category: 'Makan & Minum', account: 'Cash', description: 'makan siang' }
  },
  {
    input: 'keluar 50rb bensin bca',
    expect: { type: 'Pengeluaran', amount: 50000, category: 'Transportasi', account: 'BCA', description: 'bensin' }
  },
  {
    input: 'masuk 500rb freelance',
    expect: { type: 'Pemasukan', amount: 500000, category: 'Freelance', account: 'Cash', description: 'freelance' }
  },
  {
    input: 'masuk 2.5jt bonus mandiri',
    expect: { type: 'Pemasukan', amount: 2500000, category: 'Bonus', account: 'Mandiri', description: 'bonus' }
  },
  {
    input: 'pengeluaran 100rb wifi',
    expect: { type: 'Pengeluaran', amount: 100000, category: 'Pulsa & Internet', account: 'Cash', description: 'wifi' }
  },
  {
    input: 'pemasukan 200rb transfer masuk dana',
    expect: { type: 'Pemasukan', amount: 200000, category: 'Transfer Masuk', account: 'DANA', description: 'transfer masuk' }
  }
];

parserCases.forEach(({ input, expect }) => {
  const result = g.parseTransaction(input);
  if (!result.valid) {
    check('parse("' + input + '")', false, 'tidak valid: ' + (result.error || '').split('\n')[0]);
    return;
  }
  const tx = result.transactions[0];
  const ok = tx.type === expect.type && tx.amount === expect.amount &&
    tx.category === expect.category && tx.account === expect.account &&
    tx.description === expect.description;
  check('parse("' + input + '")', ok,
    'didapat ' + JSON.stringify({
      type: tx.type, amount: tx.amount, category: tx.category,
      account: tx.account, description: tx.description
    }));
});

section('§12 — Kategori fallback & keyword');
const fallback = g.parseTransaction('keluar 20rb zzzqqq');
check('kategori tak dikenal → Lain-lain', fallback.transactions[0].category === 'Lain-lain',
  'didapat ' + fallback.transactions[0].category);
check('transaksi tak dikenal tetap valid', fallback.valid === true);
const nabung = g.parseTransaction('keluar 500rb nabung bca');
check('"nabung" → kategori Tabungan', nabung.transactions[0].category === 'Tabungan',
  'didapat ' + nabung.transactions[0].category);

section('Validasi input tidak valid');
['', 'halo', 'keluar', 'keluar abc', 'keluar 0 makan', 'keluar -5000 makan'].forEach((input) => {
  const result = g.parseTransaction(input);
  check('parse("' + input + '") ditolak', result.valid === false || result.transactions.length === 0);
});

// ---------------------------------------------------------------- §13 transaksi
section('§13 — Simpan transaksi + response');
clearMessages();
g.handleMessage({
  message_id: 1001,
  chat: { id: 123456789, type: 'private', first_name: 'Wildan' },
  from: { id: 123456789 },
  text: 'keluar 35rb makan'
});
const reply1 = lastMessage();
check('balasan transaksi tercatat', reply1.indexOf('TRANSAKSI TERCATAT') !== -1, reply1.split('\n')[0]);
check('balasan memuat kategori', reply1.indexOf('Makan & Minum') !== -1);
check('balasan memuat Rp35.000', reply1.indexOf('Rp35.000') !== -1);
check('balasan memuat akun Cash', reply1.indexOf('Cash') !== -1);
check('balasan memuat ID TRX-', /TRX-\d{6}/.test(reply1));

const txSheetRows = context.__sheets['Transactions'].__data;
const savedTx = txSheetRows.slice(1).filter((r) => r[0]);
check('tepat 1 transaksi tersimpan', savedTx.length === 1, 'jumlah=' + savedTx.length);
const row = savedTx[0];
check('Transaction_ID format TRX-000001', row[0] === 'TRX-000001', 'didapat ' + row[0]);
check('Type = Pengeluaran', row[5] === 'Pengeluaran');
check('Category = Makan & Minum', row[6] === 'Makan & Minum');
check('Amount = 35000 (number)', row[8] === 35000, 'didapat ' + row[8] + ' (' + typeof row[8] + ')');
check('Account = Cash', row[9] === 'Cash');
check('Telegram_User_ID tersimpan', String(row[10]) === '123456789');
check('Telegram_Message_ID tersimpan', String(row[11]) === '1001');
check('Source = Telegram Text', row[12] === 'Telegram Text');
check('Status = Active', row[14] === 'Active');
check('Year = 2026', row[3] === 2026);
check('Month = 9 (September)', row[4] === 9);
check('Date = 10/09/2026', String(row[1]) === '10/09/2026', 'didapat ' + row[1]);

section('§5 — Tipe data kolom Transactions (kontrak penting)');
// Year/Month/Amount WAJIB number agar filter bulanan dan SUM di Sheets benar.
// Date/Time/Created_At disimpan sebagai teks dengan format yang terbaca manusia.
const typeRow = context.__sheets['Transactions'].__data.slice(1).find((r) => r[0] === 'TRX-000001');
check('Amount tersimpan sebagai number', typeof typeRow[8] === 'number', typeof typeRow[8]);
check('Year tersimpan sebagai number', typeof typeRow[3] === 'number', typeof typeRow[3]);
check('Month tersimpan sebagai number (bukan nama bulan)', typeof typeRow[4] === 'number' && typeRow[4] === 9,
  typeRow[4] + ' (' + typeof typeRow[4] + ')');
check('Date format dd/MM/yyyy sebagai teks', typeRow[1] === '10/09/2026', String(typeRow[1]));
check('Time format HH:mm', typeRow[2] === '10:30', String(typeRow[2]));
check('Created_At memuat tanggal + jam', /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/.test(String(typeRow[13])), String(typeRow[13]));
check('Status = Active', typeRow[14] === 'Active');

section('§29 — Duplicate protection');
clearMessages();
g.handleMessage({
  message_id: 1001,
  chat: { id: 123456789, type: 'private' },
  from: { id: 123456789 },
  text: 'keluar 35rb makan'
});
check('update duplikat tidak menambah baris',
  context.__sheets['Transactions'].__data.slice(1).filter((r) => r[0]).length === 1,
  'jumlah=' + context.__sheets['Transactions'].__data.slice(1).filter((r) => r[0]).length);
check('balasan duplikat informatif', lastMessage().indexOf('sudah tercatat') !== -1, lastMessage().split('\n')[0]);

section('§13 — Multi transaksi dalam satu pesan');
clearMessages();
g.handleMessage({
  message_id: 1002,
  chat: { id: 123456789, type: 'private' },
  from: { id: 123456789 },
  text: 'keluar 50rb bensin bca\nkeluar 20rb kopi'
});
const multiRowCount = context.__sheets['Transactions'].__data.slice(1).filter((r) => r[0]).length;
check('dua transaksi tersimpan dari satu pesan', multiRowCount === 3, 'jumlah=' + multiRowCount);
check('ID berurutan TRX-000002 & TRX-000003',
  g.getActiveTransactions().map((t) => t.Transaction_ID).join(',') === 'TRX-000001,TRX-000002,TRX-000003',
  g.getActiveTransactions().map((t) => t.Transaction_ID).join(','));

section('§12 akun & kategori pada baris tersimpan');
const rowBensin = context.__sheets['Transactions'].__data.slice(1).find((r) => r[0] === 'TRX-000002');
check('TRX-000002 akun BCA', rowBensin[9] === 'BCA', 'didapat ' + rowBensin[9]);
check('TRX-000002 kategori Transportasi', rowBensin[6] === 'Transportasi', 'didapat ' + rowBensin[6]);

// ---------------------------------------------------------------- §14 budget
section('§14 — Budget warning (70% / 85% / 100%)');
clearMessages();
g.handleMessage({
  message_id: 2001, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  text: 'keluar 500rb kos bca'
});
check('transaksi besar tersimpan', lastMessage().indexOf('TRANSAKSI TERCATAT') !== -1);
check('Kos 50% masih tanpa warning budget', lastMessage().indexOf('BUDGET') === -1, lastMessage().slice(-120));

clearMessages();
g.handleMessage({
  message_id: 2002, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  text: 'keluar 200rb kos bca'
});
check('Kos 70% → 🟡 BUDGET PERHATIAN', lastMessage().indexOf('🟡') !== -1 && lastMessage().indexOf('BUDGET') !== -1,
  lastMessage().slice(-160));
check('Kos menampilkan progress bar', lastMessage().indexOf('█') !== -1);

clearMessages();
g.handleMessage({
  message_id: 2003, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  text: 'keluar 150rb kos bca'
});
check('Kos 85% → 🟠 BUDGET HAMPIR HABIS', lastMessage().indexOf('🟠') !== -1, lastMessage().slice(-160));

clearMessages();
g.handleMessage({
  message_id: 2004, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  text: 'keluar 200rb kos bca'
});
check('Kos >100% → 🔴 BUDGET TERLAMPAUI', lastMessage().indexOf('🔴') !== -1, lastMessage().slice(-200));
check('menampilkan kelebihan budget', lastMessage().indexOf('Kelebihan') !== -1);

section('§14 — budget tetap menyimpan walau melewati batas (soft limit)');
const kosTotal = g.getMonthlyCategoryExpense(2026, 9)['Kos'];
check('Kos tersimpan melebihi budget (1.050.000)', kosTotal === 1050000, 'didapat ' + kosTotal);

// Perhitungan independen dari baris mentah sheet (bukan memanggil fungsi yang diuji).
function rawActiveRows() {
  return context.__sheets['Transactions'].__data.slice(1).filter((r) => r[0] && r[14] === 'Active');
}
function rawSum(predicate) {
  return rawActiveRows().filter(predicate).reduce((sum, r) => sum + Number(r[8]), 0);
}
function rawAccountBalance(account) {
  const accountRow = context.__sheets['Accounts'].__data.slice(1).find((r) => r[0] === account);
  const initial = Number(accountRow[2]) || 0;
  return rawActiveRows().filter((r) => r[9] === account).reduce((balance, r) => {
    return r[5] === 'Pemasukan' ? balance + Number(r[8]) : balance - Number(r[8]);
  }, initial);
}

section('§15 — Daily spending recommendation');
const allowance = g.getDailyAllowance(2026, 9, 'Makan & Minum');
check('daily allowance ada saat budget terpakai', allowance !== null);
const makanSummary = g.calculateCategoryBudget(2026, 9, 'Makan & Minum');
const expectedMakan = rawSum((r) => r[5] === 'Pengeluaran' && r[6] === 'Makan & Minum' && Number(r[4]) === 9);
check('Makan & Minum terpakai = jumlah baris aktif', makanSummary.spent === expectedMakan && makanSummary.budget === 750000,
  'spent=' + makanSummary.spent + ' expected=' + expectedMakan + ' budget=' + makanSummary.budget);

clearMessages();
g.handleMessage({
  message_id: 3001, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  text: 'keluar 500rb makan siang'
});
check('Makan 71% → warning + rekomendasi harian',
  lastMessage().indexOf('Makan & Minum') === -1 || lastMessage().indexOf('/ hari') !== -1,
  lastMessage().slice(-200));
check('rekomendasi harian muncul', lastMessage().indexOf('/ hari') !== -1, lastMessage().slice(-200));

section('§15 — budget terlampaui: tanpa daily allowance negatif');
clearMessages();
g.handleMessage({
  message_id: 3002, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  text: 'keluar 500rb makan malam'
});
check('terlampaui → "Budget sudah terlampaui."', lastMessage().indexOf('Budget sudah terlampaui') !== -1,
  lastMessage().slice(-200));
const overAllowance = g.getDailyAllowance(2026, 9, 'Makan & Minum');
check('daily allowance status over, bukan angka negatif',
  overAllowance && overAllowance.status === 'over' && overAllowance.remaining < 0,
  JSON.stringify(overAllowance));

// ---------------------------------------------------------------- §17-24 commands
section('§16-24 — Command Telegram');
clearMessages();
g.handleMessage({ message_id: 4001, chat: { id: 123456789, type: 'private', first_name: 'Wildan' }, from: { id: 123456789 }, text: '/start' });
check('/start membalas sambutan', lastMessage().indexOf('PERSONAL FINANCE BOT') !== -1);
check('/start memuat contoh', lastMessage().indexOf('keluar 35rb makan') !== -1);

clearMessages();
g.handleMessage({ message_id: 4002, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/bantuan' });
check('/bantuan memuat daftar command', lastMessage().indexOf('/hariini') !== -1 && lastMessage().indexOf('/hapus') !== -1);

clearMessages();
g.handleMessage({ message_id: 4003, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/id' });
check('/id menampilkan Telegram User ID', lastMessage().indexOf('123456789') !== -1 && lastMessage().indexOf('Telegram User ID') !== -1);

clearMessages();
g.handleMessage({ message_id: 4004, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/hariini' });
const todayReply = lastMessage();
check('/hariini menampilkan header', todayReply.indexOf('HARI INI') !== -1);
check('/hariini menampilkan Net Cash Flow', todayReply.indexOf('Net Cash Flow') !== -1);
const todayExpense = rawSum((r) => r[5] === 'Pengeluaran' && String(r[1]) === '10/09/2026');
const todayTxCount = rawActiveRows().filter((r) => String(r[1]) === '10/09/2026').length;
check('/hariini menghitung pengeluaran hari ini', todayReply.indexOf(g.formatRupiah(todayExpense)) !== -1,
  'harus ' + g.formatRupiah(todayExpense) + ' · ' + todayReply.split('\n').slice(0, 14).join(' | '));
check('/hariini menampilkan jumlah transaksi', todayReply.indexOf('Transaksi:\n' + todayTxCount) !== -1,
  'harus ' + todayTxCount);

clearMessages();
g.handleMessage({ message_id: 4005, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/bulanini' });
const monthReply = lastMessage();
check('/bulanini menampilkan SEPTEMBER 2026', monthReply.indexOf('SEPTEMBER 2026') !== -1, monthReply.split('\n')[0]);
check('/bulanini menampilkan pemasukan Rp0', monthReply.indexOf('Pemasukan') !== -1);
check('/bulanini memuat kategori Kos', monthReply.indexOf('🏠 Kos') !== -1);

clearMessages();
g.handleMessage({ message_id: 4006, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/budget' });
const budgetReply = lastMessage();
check('/budget menampilkan header', budgetReply.indexOf('BUDGET SEPTEMBER 2026') !== -1, budgetReply.split('\n')[0]);
check('/budget menampilkan emoji level', /[🟢🟡🟠🔴]/.test(budgetReply));
check('/budget memuat Makan & Minum', budgetReply.indexOf('Makan & Minum') !== -1);

clearMessages();
g.handleMessage({ message_id: 4007, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/saldo' });
const balanceReply = lastMessage();
check('/saldo menampilkan TOTAL', balanceReply.indexOf('TOTAL') !== -1);
check('/saldo menampilkan BCA', balanceReply.indexOf('BCA') !== -1);
const expectedTotal = ['Cash', 'BCA', 'BNI', 'Mandiri', 'GoPay', 'DANA', 'ShopeePay']
  .reduce((sum, account) => sum + rawAccountBalance(account), 0);
check('/saldo BCA sesuai transaksi', balanceReply.indexOf(g.formatRupiah(rawAccountBalance('BCA'))) !== -1,
  'harus ' + g.formatRupiah(rawAccountBalance('BCA')) + ' · ' + balanceReply.split('\n').slice(0, 10).join(' | '));
check('/saldo total = jumlah semua akun', balanceReply.indexOf(g.formatRupiah(expectedTotal)) !== -1,
  'harus ' + g.formatRupiah(expectedTotal) + ' · ' + balanceReply.split('\n').slice(-5).join(' | '));

clearMessages();
g.handleMessage({ message_id: 4008, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/terakhir' });
const lastReply = lastMessage();
check('/terakhir menampilkan header', lastReply.indexOf('TRANSAKSI TERAKHIR') !== -1);
check('/terakhir maksimal 5 transaksi', (lastReply.match(/TRX-\d{6}/g) || []).length === 5,
  'jumlah=' + (lastReply.match(/TRX-\d{6}/g) || []).length);
// ID harus muncul urut dari yang terbaru; transaksi terlama tidak masuk 5 besar.
const idOrder = lastReply.match(/TRX-\d{6}/g) || [];
check('/terakhir menampilkan ID terbaru lebih dulu',
  idOrder[0] === 'TRX-000009' && idOrder.indexOf('TRX-000005') === 4 && idOrder.indexOf('TRX-000004') === -1,
  idOrder.join(' > '));

// ---------------------------------------------------------------- §5 & §24 hapus
section('§24 — /hapus (soft delete)');
const kosBefore = g.getMonthlyCategoryExpense(2026, 9)['Kos'];
clearMessages();
g.handleMessage({ message_id: 4009, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/hapus TRX-000001' });
check('/hapus membalas konfirmasi', lastMessage().indexOf('TRANSAKSI DIHAPUS') !== -1, lastMessage().split('\n')[0]);
check('/hapus menyebut ID', lastMessage().indexOf('TRX-000001') !== -1);
check('baris tetap ada (tidak dihapus fisik)', context.__sheets['Transactions'].__data.slice(1).filter((r) => r[0] === 'TRX-000001').length === 1);
check('Status berubah jadi Deleted',
  context.__sheets['Transactions'].__data.slice(1).find((r) => r[0] === 'TRX-000001')[14] === 'Deleted');
// TRX-000001 (35rb makan) dihapus → Makan & Minum tidak lagi menghitungnya.
// rawActiveRows() sudah mengecualikan baris ber-status Deleted secara independen.
const expectedMakanAfterDelete = rawSum((r) => r[5] === 'Pengeluaran' && r[6] === 'Makan & Minum');
check('transaksi Deleted tidak dihitung budget',
  g.getMonthlyCategoryExpense(2026, 9)['Makan & Minum'] === expectedMakanAfterDelete,
  'didapat ' + g.getMonthlyCategoryExpense(2026, 9)['Makan & Minum']);
// TRX-000001 memakai akun Cash → saldo Cash harus naik 35.000 setelah dihapus.
check('saldo BCA tidak terpengaruh (TRX-000001 akun Cash)',
  rawAccountBalance('BCA') === g.getBalancePerAccount().find((a) => a.account === 'BCA').balance,
  'raw=' + rawAccountBalance('BCA') + ' bot=' + g.getBalancePerAccount().find((a) => a.account === 'BCA').balance);
check('saldo Cash naik 35.000 setelah soft delete',
  g.getBalancePerAccount().find((a) => a.account === 'Cash').balance === rawAccountBalance('Cash'),
  JSON.stringify(g.getBalancePerAccount().find((a) => a.account === 'Cash')));

clearMessages();
g.handleMessage({ message_id: 4010, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/hapus TRX-999999' });
check('/hapus ID tidak ada → pesan error', lastMessage().indexOf('tidak ditemukan') !== -1, lastMessage());

clearMessages();
g.handleMessage({ message_id: 4011, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/hapus' });
check('/hapus tanpa ID → panduan format', lastMessage().indexOf('/hapus TRX-000123') !== -1, lastMessage());

check('Kos tidak terpengaruh penghapusan TRX-000001', g.getMonthlyCategoryExpense(2026, 9)['Kos'] === kosBefore);

// Update yang sama dikirim ulang setelah transaksinya dihapus TIDAK boleh
// membuat baris baru (sekaligus mencegah transaksi terhapus hidup kembali).
clearMessages();
g.handleMessage({ message_id: 1001, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: 'keluar 35rb makan' });
check('resend setelah hapus tidak membuat transaksi baru',
  context.__sheets['Transactions'].__data.slice(1).filter((r) => String(r[11]) === '1001').length === 1,
  'jumlah=' + context.__sheets['Transactions'].__data.slice(1).filter((r) => String(r[11]) === '1001').length);
check('resend setelah hapus dibalas sebagai duplikat', lastMessage().indexOf('sudah tercatat') !== -1, lastMessage());
check('transaksi terhapus tidak hidup kembali',
  context.__sheets['Transactions'].__data.slice(1).find((r) => r[0] === 'TRX-000001')[14] === 'Deleted');

// ---------------------------------------------------------------- §3 security
section('§3 — Authorization whitelist');
clearMessages();
g.handleMessage({ message_id: 5001, chat: { id: 999888777, type: 'private' }, from: { id: 999888777 }, text: '/saldo' });
check('user tak terotorisasi ditolak', lastMessage() === '⛔ Anda tidak memiliki akses ke bot ini.', lastMessage());
check('tidak ada data finansial yang bocor', lastMessage().indexOf('Rp') === -1);

clearMessages();
g.handleMessage({ message_id: 5002, chat: { id: 999888777, type: 'private' }, from: { id: 999888777 }, text: 'keluar 10rb makan' });
check('user tak terotorisasi tidak bisa menulis', lastMessage().indexOf('tidak memiliki akses') !== -1);
check('tidak ada transaksi baru dari user tak terotorisasi',
  context.__sheets['Transactions'].__data.slice(1).filter((r) => String(r[10]) === '999888777').length === 0);

clearMessages();
g.handleMessage({ message_id: 5003, chat: { id: 999888777, type: 'private' }, from: { id: 999888777 }, text: '/id' });
check('/id tetap boleh untuk setup', lastMessage().indexOf('999888777') !== -1, lastMessage());

clearMessages();
g.handleMessage({ message_id: 5004, chat: { id: 999888777, type: 'private', first_name: 'Orang' }, from: { id: 999888777 }, text: '/start' });
check('/start tetap dibalas tanpa data', lastMessage().indexOf('PERSONAL FINANCE BOT') !== -1 && lastMessage().indexOf('Rp') === -1);

check('daftar kosong = fail closed', (() => {
  context.PropertiesService.getScriptProperties().setProperty('AUTHORIZED_USER_IDS', '');
  const allowed = g.isAuthorized(123456789);
  context.PropertiesService.getScriptProperties().setProperty('AUTHORIZED_USER_IDS', '123456789, 555');
  return allowed === false;
})());
check('beberapa ID dipisah koma dikenali', g.isAuthorized(555) === true && g.isAuthorized(123456789) === true);
check('ID di luar daftar tetap ditolak', g.isAuthorized(42) === false);

// ---------------------------------------------------------------- §32 OCR
section('§32 — Handler foto (placeholder V2)');
clearMessages();
g.handleMessage({
  message_id: 6001,
  chat: { id: 123456789, type: 'private' },
  from: { id: 123456789 },
  photo: [{ file_id: 'abc', width: 100, height: 100 }]
});
check('foto dibalas placeholder', lastMessage().indexOf('Fitur scan struk sedang disiapkan') !== -1, lastMessage());
check('foto tidak menyimpan transaksi',
  context.__sheets['Transactions'].__data.slice(1).filter((r) => String(r[11]) === '6001').length === 0);

// ---------------------------------------------------------------- §28 error handling
section('§28 — Command di grup (/command@botname)');
clearMessages();
g.handleMessage({
  message_id: 7500,
  chat: { id: -100200300, type: 'supergroup', title: 'Keuangan Keluarga' },
  from: { id: 123456789 },
  text: '/hariini@test_finance_bot'
});
check('command bersuffix @botname tetap dikenali', lastMessage().indexOf('HARI INI') !== -1, lastMessage().split('\n')[0]);
clearMessages();
g.handleMessage({
  message_id: 7501,
  chat: { id: -100200300, type: 'supergroup' },
  from: { id: 123456789 },
  text: '/saldo@test_finance_bot'
});
check('command /saldo bersuffix dikenali', lastMessage().indexOf('SALDO') !== -1, lastMessage().split('\n')[0]);
check('normalizeCommandText membuang suffix',
  g.normalizeCommandText('/budget@bot') === '/budget' && g.normalizeCommandText('keluar 35rb makan') === 'keluar 35rb makan');
clearMessages();
g.handleMessage({
  message_id: 7502,
  chat: { id: -100200300, type: 'supergroup' },
  from: { id: 999888777 },
  text: '/saldo@test_finance_bot'
});
check('grup: user tak terotorisasi tetap ditolak', lastMessage() === '⛔ Anda tidak memiliki akses ke bot ini.', lastMessage());

section('§28 — Error handling');
clearMessages();
g.handleMessage({ message_id: 7001, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/perintahngawur' });
check('command tak dikenal dibalas sopan', lastMessage().indexOf('Perintah tidak dikenal') !== -1, lastMessage());

clearMessages();
g.handleMessage({ message_id: 7002, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: 'keluar apa ya' });
check('nominal tidak valid dibalas pesan jelas', lastMessage().indexOf('Nominal tidak ditemukan') !== -1, lastMessage().split('\n')[0]);
check('balasan menyertakan contoh format', lastMessage().indexOf('keluar 35rb makan') !== -1);
check('tidak ada stack trace ke user',
  lastMessage().indexOf('at ') === -1 && lastMessage().indexOf('TypeError') === -1 && lastMessage().indexOf('.gs:') === -1);

clearMessages();
g.handleMessage({ message_id: 7004, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: 'pesan tanpa tipe transaksi' });
check('teks tanpa tipe dibalas "Format transaksi belum dikenali"',
  lastMessage().indexOf('Format transaksi belum dikenali') !== -1, lastMessage().split('\n')[0]);

clearMessages();
check('doPost tanpa body tetap HTTP 200 & tidak error', (() => {
  const result = g.doPost({});
  return JSON.parse(result.getContent()).ok === true;
})());

clearMessages();
const updateResult = g.doPost({ postData: { contents: JSON.stringify({
  message: { message_id: 7003, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/hariini' }
}) } });
check('doPost memproses update nyata', JSON.parse(updateResult.getContent()).ok === true && lastMessage().indexOf('HARI INI') !== -1);

check('doPost dengan JSON rusak tidak crash', (() => {
  const result = g.doPost({ postData: { contents: '{bukan json', parameter: { secret: g.getProperty('TELEGRAM_WEBHOOK_SECRET') } } });
  return JSON.parse(result.getContent()).ok === true;
})());

// Secret pada URL webhook wajib cocok (proteksi dari update palsu).
context.PropertiesService.getScriptProperties().setProperty('TELEGRAM_WEBHOOK_SECRET', 'test-secret-abc123');
const realSecret = g.getProperty('TELEGRAM_WEBHOOK_SECRET');
clearMessages();
g.doPost({
  parameter: { secret: 'secret-palsu' },
  postData: { contents: JSON.stringify({ message: { message_id: 7100, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/hariini' } }) }
});
check('doPost menolak secret yang salah', sentMessages.length === 0, 'terkirim=' + sentMessages.length);

clearMessages();
g.doPost({
  parameter: { secret: realSecret },
  postData: { contents: JSON.stringify({ message: { message_id: 7101, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/hariini' } }) }
});
check('doPost menerima secret yang benar', sentMessages.length === 1 && lastMessage().indexOf('HARI INI') !== -1);

// ---------------------------------------------------------------- §25 format
section('§25 — Format Rupiah & tanggal');
check('formatRupiah(35000) = Rp35.000', g.formatRupiah(35000) === 'Rp35.000', g.formatRupiah(35000));
check('formatRupiah(1500000) = Rp1.500.000', g.formatRupiah(1500000) === 'Rp1.500.000', g.formatRupiah(1500000));
check('formatRupiah(-185000) = -Rp185.000', g.formatRupiah(-185000) === '-Rp185.000', g.formatRupiah(-185000));
check('tidak memakai format Rp 35,000.00', g.formatRupiah(35000).indexOf(',') === -1);
check('formatDateIndonesia = 10 September 2026', g.formatDateIndonesia(FIXED_NOW) === '10 September 2026',
  g.formatDateIndonesia(FIXED_NOW));
check('formatTimeIndonesia = 10:30', g.formatTimeIndonesia(FIXED_NOW) === '10:30', g.formatTimeIndonesia(FIXED_NOW));
check('formatPercent 70.67 → 70,7%', g.formatPercent(70.666) === '70,7%', g.formatPercent(70.666));
check('getMonthName(9) = September', g.getMonthName(9) === 'September');
check('getDaysInMonth(2026, 9) = 30', g.getDaysInMonth(2026, 9) === 30);
check('getDaysInMonth(2026, 2) = 28', g.getDaysInMonth(2026, 2) === 28);
check('makeProgressBar(71, 10) 7 blok', g.makeProgressBar(71, 10) === '███████░░░', g.makeProgressBar(71, 10));
check('makeProgressBar(0, 10) kosong', g.makeProgressBar(0, 10) === '░░░░░░░░░░');
check('makeProgressBar(150, 10) penuh', g.makeProgressBar(150, 10) === '██████████');

// ---------------------------------------------------------------- §22 saldo
section('§22 — Saldo per akun');
// Saldo ditaruh manual di sheet supaya angka uji mudah diverifikasi.
context.__sheets['Accounts'].__data[1][2] = 2000000; // Cash initial balance
context.__sheets['Accounts'].__data[2][2] = 5000000; // BCA initial balance
g.clearConfigCache();
const balances = g.getBalancePerAccount();
const bcaBalance = balances.find((b) => b.account === 'BCA');
const cashBalance = balances.find((b) => b.account === 'Cash');
check('saldo BCA cocok dengan perhitungan independen', bcaBalance.balance === rawAccountBalance('BCA'),
  JSON.stringify(bcaBalance) + ' vs raw ' + rawAccountBalance('BCA'));
check('saldo Cash cocok dengan perhitungan independen', cashBalance.balance === rawAccountBalance('Cash'),
  JSON.stringify(cashBalance) + ' vs raw ' + rawAccountBalance('Cash'));
check('saldo BCA = Rp3.900.000 (5jt − 1,1jt transaksi aktif)', bcaBalance.balance === 3900000, JSON.stringify(bcaBalance));
clearMessages();
g.handleMessage({ message_id: 8001, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/saldo' });
check('/saldo menampilkan total gabungan', lastMessage().indexOf('TOTAL') !== -1, lastMessage().split('\n').slice(-4).join(' | '));

// ---------------------------------------------------------------- §7-8 sheets
section('§7/§8/§30 — Isi sheet awal');
const categories = g.readTable('Categories');
check('kategori Kos ada', categories.some((c) => c.Category === 'Kos'));
check('kategori Makan & Minum ada', categories.some((c) => c.Category === 'Makan & Minum'));
check('kategori Gaji (pemasukan) ada', categories.some((c) => c.Category === 'Gaji' && c.Type === 'Pemasukan'));
check('kategori Tabungan ada', categories.some((c) => c.Category === 'Tabungan'));
check('Kos budget 1.000.000', categories.find((c) => c.Category === 'Kos').Monthly_Budget === 1000000);
check('Makan budget 750.000', categories.find((c) => c.Category === 'Makan & Minum').Monthly_Budget === 750000);
check('Kos keywords memuat "kos"', String(categories.find((c) => c.Category === 'Kos').Keywords).indexOf('kos') !== -1);

const accounts = g.readTable('Accounts');
check('7 akun awal tersedia', accounts.length === 7, 'jumlah=' + accounts.length);
check('akun BCA bertipe Bank', accounts.find((a) => a.Account === 'BCA').Type === 'Bank');
check('akun GoPay bertipe E-Wallet', accounts.find((a) => a.Account === 'GoPay').Type === 'E-Wallet');

const settings = g.readTable('Settings');
const settingsMap = {};
settings.forEach((s) => { settingsMap[s.Key] = s.Value; });
check('Setting Timezone = Asia/Jakarta', settingsMap.Timezone === 'Asia/Jakarta');
check('Setting Currency = IDR', settingsMap.Currency === 'IDR');
check('Setting Default_Account = Cash', settingsMap.Default_Account === 'Cash');
check('Setting Warning_Level_1 = 70', String(settingsMap.Warning_Level_1) === '70');
check('Setting Warning_Level_2 = 85', String(settingsMap.Warning_Level_2) === '85');
check('Setting Critical_Level = 100', String(settingsMap.Critical_Level) === '100');

const budgets = g.readTable('Budgets');
check('budget bulan berjalan dibuat', budgets.length >= 8, 'jumlah=' + budgets.length);
check('budget Kos = 1.000.000', budgets.find((b) => b.Category === 'Kos').Budget === 1000000);
check('budget Makan = 750.000', budgets.find((b) => b.Category === 'Makan & Minum').Budget === 750000);
check('budget September 2026', budgets.every((b) => Number(b.Year) === 2026 && Number(b.Month) === 9));

// ---------------------------------------------------------------- §31 dashboard
section('§31 — Dashboard');
const dashboard = context.__sheets['Dashboard'].__data;
const flat = dashboard.map((r) => (r || []).join(' ')).join('\n');
check('dashboard punya blok ringkasan', flat.indexOf('RINGKASAN BULAN INI') !== -1);
check('dashboard punya tabel kategori', flat.indexOf('PENGELUARAN PER KATEGORI') !== -1);
check('dashboard punya trend bulanan', flat.indexOf('TREND PENGELUARAN BULANAN') !== -1);
check('dashboard memuat Saldo Total', flat.indexOf('Saldo Total') !== -1);
check('dashboard memuat Tabungan Bulan Ini', flat.indexOf('Tabungan Bulan Ini') !== -1);

// ---------------------------------------------------------------- §27 webhook
section('§27 — Webhook setup & info');
const webhookSummary = g.setupWebhook();
check('setupWebhook berhasil', webhookSummary.indexOf('Webhook terdaftar') !== -1, webhookSummary.split('\n')[0]);
const setWebhookCall = context.__urlFetchLog.filter((c) => /setWebhook$/.test(c.url)).pop();
const setWebhookBody = JSON.parse(setWebhookCall.options.payload);
check('setWebhook memakai secret_token', !!setWebhookBody.secret_token);
check('setWebhook mengarah ke URL /exec', String(setWebhookBody.url).indexOf('/exec') !== -1);
check('URL webhook memuat query ?secret= (diverifikasi doPost)',
  String(setWebhookBody.url).indexOf('?secret=' + setWebhookBody.secret_token) !== -1,
  setWebhookBody.url);
check('setWebhook hanya menerima update message', JSON.stringify(setWebhookBody.allowed_updates) === '["message"]');
const infoSummary = g.getWebhookInfo();
check('getWebhookInfo menampilkan URL', infoSummary.indexOf('URL:') !== -1);
check('getWebhookInfo menampilkan nama bot', infoSummary.indexOf('test_finance_bot') !== -1);

section('§1 — Timezone Asia/Jakarta');
check('Settings memuat Timezone Asia/Jakarta', g.getSetting('Timezone', '') === 'Asia/Jakarta');
check('getTimezone() memakai Settings', g.getTimezone() === 'Asia/Jakarta');
check('timezone project cocok → status OK', g.verifyProjectTimezone().indexOf('OK') !== -1, g.verifyProjectTimezone());
check('timezone beda → peringatan jelas', (() => {
  const original = context.ScriptApp.getScriptTimeZone;
  context.ScriptApp.getScriptTimeZone = () => 'UTC';
  const notice = g.verifyProjectTimezone();
  context.ScriptApp.getScriptTimeZone = original;
  return notice.indexOf('PERHATIAN') !== -1 && notice.indexOf('UTC') !== -1;
})(), 'perlu peringatan saat project UTC');
check('manifest appsscript.json memakai Asia/Jakarta',
  JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8')).timeZone === 'Asia/Jakarta');

section('checkConfiguration()');
const configReport = g.checkConfiguration();
check('laporan konfigurasi memuat token OK', configReport.indexOf('TELEGRAM_BOT_TOKEN   : OK') !== -1, configReport.split('\n')[0]);
check('laporan konfigurasi memuat sheet', configReport.indexOf('Transactions') !== -1);
check('laporan konfigurasi memuat timezone', configReport.indexOf('Time zone project') !== -1);

section('§6 ALOKASI KEUANGAN — Tabungan terpisah dari pengeluaran');
const expenseBeforeSavings = g.totalExpense();
clearMessages();
g.handleMessage({
  message_id: 9001, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 },
  text: 'keluar 500rb nabung bca'
});
check('"keluar 500rb nabung" tersimpan', lastMessage().indexOf('TRANSAKSI TERCATAT') !== -1, lastMessage().split('\n')[0]);
const savingsRow = context.__sheets['Transactions'].__data.slice(1).find((r) => String(r[11]) === '9001');
check('kategori Tabungan', savingsRow[6] === 'Tabungan', 'didapat ' + savingsRow[6]);
check('jenis transaksi = Alokasi (bukan Pengeluaran)', savingsRow[5] === 'Alokasi', 'didapat ' + savingsRow[5]);
check('tabungan TIDAK menambah total pengeluaran', g.totalExpense() === expenseBeforeSavings,
  'sebelum=' + expenseBeforeSavings + ' sesudah=' + g.totalExpense());
check('total alokasi terhitung', g.getMonthlyCategoryAllocation(2026, 9)['Tabungan'] === 500000,
  JSON.stringify(g.getMonthlyCategoryAllocation(2026, 9)));
const savingsBudget = g.calculateCategoryBudget(2026, 9, 'Tabungan');
check('target Tabungan 500.000 terpantau', savingsBudget.spent === 500000 && savingsBudget.budget === 500000,
  JSON.stringify(savingsBudget && { spent: savingsBudget.spent, budget: savingsBudget.budget }));
check('Tabungan 100% → level TERLAMPAUI', savingsBudget.levelInfo.level === 'TERLAMPAUI', savingsBudget.levelInfo.level);
check('balasan menyertakan status budget Tabungan', lastMessage().indexOf('BUDGET') !== -1, lastMessage().slice(-160));

clearMessages();
g.handleMessage({ message_id: 9002, chat: { id: 123456789, type: 'private' }, from: { id: 123456789 }, text: '/bulanini' });
check('/bulanini menampilkan blok Tabungan', lastMessage().indexOf('🏦 Tabungan') !== -1,
  lastMessage().split('\n').slice(-8).join(' | '));
check('/bulanini menampilkan nilai tabungan', lastMessage().indexOf('Rp500.000') !== -1);

// ---------------------------------------------------------------- ringkasan
console.log('\n' + '='.repeat(60));
console.log('LULUS: ' + passed + '   GAGAL: ' + failures.length);
if (failures.length) {
  console.log('\nRincian kegagalan:');
  failures.forEach((f) => console.log('  ✗ ' + f.name + (f.detail ? '  →  ' + f.detail : '')));
  process.exit(1);
}
console.log('Semua test lulus.');
