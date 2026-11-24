/**
 * Database.gs — helper reusable untuk Google Sheets.
 * - Kolom dipetakan berdasarkan NAMA header (urutan kolom bebas; kolom ekstra dipertahankan).
 * - Update hanya menulis SATU baris, tidak menulis ulang sheet.
 * - Nilai teks yang diawali = + - @ dinetralkan (anti formula injection).
 * - Semua operasi tulis harus dipanggil di dalam withLock_ oleh pemanggil.
 */

const DB_MEM_ = { ss: null, cols: {} };

function dbReset_() { DB_MEM_.ss = null; DB_MEM_.cols = {}; }

function ss_() {
  if (!DB_MEM_.ss) DB_MEM_.ss = SpreadsheetApp.openById(prop_('SPREADSHEET_ID', true));
  return DB_MEM_.ss;
}

function sheet_(name) {
  if (!Object.prototype.hasOwnProperty.call(SHEETS, name)) throw new Error('Sheet tidak dikenal: ' + name);
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet tidak ditemukan: ' + name + ' (jalankan setupSheets)');
  return sh;
}

function cols_(name) {
  if (DB_MEM_.cols[name]) return DB_MEM_.cols[name];
  const sh = sheet_(name);
  const raw = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const headers = raw.map(function (h) { return String(h).trim(); });
  const idx = {};
  headers.forEach(function (h, i) { if (h && idx[h] === undefined) idx[h] = i; });
  const missing = SHEETS[name].headers.filter(function (h) { return idx[h] === undefined; });
  if (missing.length) throw new Error('Sheet ' + name + ' kehilangan kolom: ' + missing.join(', '));
  DB_MEM_.cols[name] = { headers: headers, idx: idx, n: headers.length };
  return DB_MEM_.cols[name];
}

function sheetSafe_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}
function normCell_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  if (typeof v === 'string') return v.replace(/^'([=+\-@\t\r])/, '$1');
  return (v === null || v === undefined) ? '' : v;
}
function rowToObj_(c, r) {
  const o = {};
  c.headers.forEach(function (h, j) { if (h) o[h] = normCell_(r[j]); });
  return o;
}
function keyOf_(name, o) {
  const k = SHEETS[name].key;
  return Array.isArray(k) ? k.map(function (f) { return String(o[f]); }).join('|') : String(o[k]);
}
/** Salinan objek untuk output: tanpa __row, dengan _key. */
function outRow_(name, r) {
  const o = Object.assign({}, r);
  delete o.__row;
  o._key = keyOf_(name, r);
  return o;
}

/** Semua baris tidak kosong sebagai objek (+ __row). */
function dbAll_(name) {
  const sh = sheet_(name), c = cols_(name), last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, c.n).getValues();
  const out = [];
  vals.forEach(function (r, i) {
    const o = rowToObj_(c, r);
    const empty = c.headers.every(function (h) { return !h || o[h] === ''; });
    if (!empty) { o.__row = i + 2; out.push(o); }
  });
  return out;
}

/** Nilai satu kolom saja (murah; tidak memuat kolom konten besar). */
function dbColumn_(name, header) {
  const sh = sheet_(name), c = cols_(name), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, c.idx[header] + 1, last - 1, 1).getValues()
    .map(function (r) { return normCell_(r[0]); })
    .filter(function (v) { return v !== ''; });
}

function dbCount_(name) {
  const k = SHEETS[name].key;
  return Array.isArray(k) ? dbAll_(name).length : dbColumn_(name, k).length;
}

/** n baris terakhir (urut sheet), setelah melewati `skip` baris dari bawah. */
function dbTail_(name, n, skip) {
  const sh = sheet_(name), c = cols_(name);
  const end = sh.getLastRow() - (skip || 0);
  if (end < 2) return [];
  const start = Math.max(2, end - n + 1);
  return sh.getRange(start, 1, end - start + 1, c.n).getValues().map(function (r) { return rowToObj_(c, r); });
}

/** Nomor baris untuk sebuah kunci; 0 bila tidak ada. */
function dbRowOfKey_(name, keyValue) {
  const def = SHEETS[name], keyStr = String(keyValue);
  if (Array.isArray(def.key)) {
    const hit = dbAll_(name).filter(function (o) { return keyOf_(name, o) === keyStr; })[0];
    return hit ? hit.__row : 0;
  }
  const sh = sheet_(name), c = cols_(name), last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2, c.idx[def.key] + 1, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (String(normCell_(vals[i][0])) === keyStr) return i + 2;
  return 0;
}

function dbFind_(name, keyValue) {
  const row = dbRowOfKey_(name, keyValue);
  if (!row) return null;
  const c = cols_(name);
  const o = rowToObj_(c, sheet_(name).getRange(row, 1, 1, c.n).getValues()[0]);
  o.__row = row;
  return o;
}

function dbInsert_(name, obj) {
  const sh = sheet_(name), c = cols_(name);
  if (dbRowOfKey_(name, keyOf_(name, obj))) throw new ApiError('CONFLICT', 'Data dengan kunci yang sama sudah ada');
  const row = new Array(c.n).fill('');
  Object.keys(obj).forEach(function (h) { if (c.idx[h] !== undefined) row[c.idx[h]] = sheetSafe_(obj[h]); });
  sh.getRange(sh.getLastRow() + 1, 1, 1, c.n).setValues([row]);
  return obj;
}

function dbUpdate_(name, keyValue, patch) {
  const sh = sheet_(name), c = cols_(name);
  const row = dbRowOfKey_(name, keyValue);
  if (!row) throw new ApiError('NOT_FOUND', 'Data tidak ditemukan');
  const cur = sh.getRange(row, 1, 1, c.n).getValues()[0];
  Object.keys(patch).forEach(function (h) { if (c.idx[h] !== undefined) cur[c.idx[h]] = sheetSafe_(patch[h]); });
  const after = rowToObj_(c, cur);
  const newKey = keyOf_(name, after);
  if (newKey !== String(keyValue) && dbRowOfKey_(name, newKey)) throw new ApiError('CONFLICT', 'Data dengan kunci yang sama sudah ada');
  sh.getRange(row, 1, 1, c.n).setValues([cur]);
  after.__row = row;
  return after;
}

function dbDelete_(name, keyValue) {
  const row = dbRowOfKey_(name, keyValue);
  if (!row) throw new ApiError('NOT_FOUND', 'Data tidak ditemukan');
  sheet_(name).deleteRow(row);
}
