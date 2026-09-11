/**
 * Stub Google Apps Script untuk pengujian lokal (Node.js).
 * Menyediakan SpreadsheetApp, PropertiesService, UrlFetchApp, LockService,
 * ScriptApp, Utilities, ContentService, Logger, console.
 *
 * HANYA dipakai test/ — tidak ikut ke Apps Script.
 */
'use strict';

function makeSheet(name, values) {
  const data = values || [];
  let maxRows = Math.max(data.length, 1000);
  let maxCols = 26;

  const sheet = {
    __name: name,
    __data: data,
    __frozenRows: 0,
    getName: () => name,
    getLastRow: () => {
      let last = 0;
      data.forEach((row, i) => {
        if (row && row.some((c) => c !== '' && c !== null && c !== undefined)) last = i + 1;
      });
      return last;
    },
    getLastColumn: () => {
      let last = 0;
      data.forEach((row) => {
        if (!row) return;
        row.forEach((c, i) => {
          if (c !== '' && c !== null && c !== undefined) last = Math.max(last, i + 1);
        });
      });
      return last;
    },
    getMaxRows: () => maxRows,
    getMaxColumns: () => maxCols,
    setFrozenRows: (n) => { sheet.__frozenRows = n; return sheet; },
    setColumnWidth: () => sheet,
    setColumnWidths: () => sheet,
    insertSheet: () => sheet,
    insertColumnsAfter: () => sheet,
    clear: () => { data.length = 0; return sheet; },
    clearContent: () => { data.length = 0; return sheet; },
    appendRow: (row) => {
      data.push(row.slice());
      maxRows = Math.max(maxRows, data.length);
      return sheet;
    },
    getRange: (row, col, numRows, numCols) => {
      const rows = numRows === undefined ? 1 : numRows;
      const cols = numCols === undefined ? 1 : numCols;
      return makeRange(sheet, row, col, rows, cols);
    },
  };
  return sheet;
}

function makeRange(sheet, row, col, numRows, numCols) {
  const data = sheet.__data;
  const ensure = (r, c) => {
    while (data.length < r) data.push([]);
    while (data[r - 1].length < c) data[r - 1].push('');
  };

  const range = {
    __row: row,
    __col: col,
    __numRows: numRows,
    __numCols: numCols,
    getValues: () => {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        const line = [];
        for (let c = 0; c < numCols; c++) {
          const value = (data[row - 1 + r] || [])[col - 1 + c];
          line.push(value === undefined ? '' : value);
        }
        out.push(line);
      }
      return out;
    },
    getValue: () => range.getValues()[0][0],
    setValues: (values) => {
      values.forEach((line, r) => {
        line.forEach((value, c) => {
          ensure(row + r, col + c);
          data[row - 1 + r][col - 1 + c] = value;
        });
      });
      return range;
    },
    setValue: (value) => range.setValues([[value]]),
    setNumberFormat: () => range,
    setFontWeight: () => range,
    setBackground: () => range,
    merge: () => range,
  };
  return range;
}

function createContext() {
  const properties = {};
  const sheets = {};
  const order = [];

  const spreadsheet = {
    getId: () => 'TEST_SPREADSHEET_ID',
    getName: () => 'Test Spreadsheet',
    getSheetByName: (name) => sheets[name] || null,
    getSheets: () => order.map((n) => sheets[n]),
    insertSheet: (name) => {
      const sheet = makeSheet(name, []);
      sheets[name] = sheet;
      order.push(name);
      return sheet;
    },
  };

  const urlFetchLog = [];

  const context = {
    __sheets: sheets,
    __order: order,
    __properties: properties,
    __urlFetchLog: urlFetchLog,
    __fetchResponder: () => ({ ok: true, result: { message_id: 1 } }),

    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: () => spreadsheet,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (key in properties ? properties[key] : null),
        setProperty: (key, value) => { properties[key] = String(value); },
        deleteProperty: (key) => { delete properties[key]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
        waitLock: () => {},
      }),
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        urlFetchLog.push({ url, options });
        const body = JSON.parse(options.payload || '{}');
        const result = context.__fetchResponder(url, body);
        return { getContentText: () => JSON.stringify(result), getResponseCode: () => 200 };
      },
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getScriptTimeZone: () => 'Asia/Jakarta',
    },
    Utilities: {
      getUuid: () => 'test-uuid-0000-0000-0000-000000000000',
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({
        __text: text,
        setMimeType: () => ({ __text: text, getContent: () => text }),
        getContent: () => text,
      }),
    },
    Logger: { log: (...args) => console.log('[Logger]', ...args) },
  };

  context.console = console;
  return context;
}

/** Menyusun tabel sheet dari array objek (header + baris). */
function buildSheetValues(headers, rows) {
  const out = [headers.slice()];
  rows.forEach((row) => {
    out.push(headers.map((h) => {
      const value = row[h];
      return value === undefined ? '' : value;
    }));
  });
  return out;
}

module.exports = { createContext, makeSheet, buildSheetValues };
