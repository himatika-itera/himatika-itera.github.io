/**
 * Setup.gs — dijalankan MANUAL oleh pemilik dari editor Apps Script (bukan dari web).
 * Urutan: 1) isi Script Properties  2) generateAppTokenSecret()  3) setupSheets()
 *         4) bootstrapSuperAdmin()  5) checkConfiguration()
 * Sheet BERITA, ANGGOTA, STRUKTUR milik Anda hanya DIPERIKSA headernya; isinya tidak diubah.
 */

/** Membuat APP_TOKEN_SECRET bila belum ada. */
function generateAppTokenSecret() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('APP_TOKEN_SECRET')) { console.log('APP_TOKEN_SECRET sudah ada; tidak diubah. Hapus manual bila ingin rotasi (semua sesi akan batal).'); return; }
  let s = '';
  for (let i = 0; i < 3; i++) s += Utilities.getUuid().replace(/-/g, '');
  props.setProperty('APP_TOKEN_SECRET', s);
  console.log('APP_TOKEN_SECRET dibuat (tidak ditampilkan).');
}

function seedKv_(sheetName, defaults) {
  const have = {};
  dbColumn_(sheetName, 'key').forEach(function (k) { have[String(k)] = true; });
  Object.keys(defaults).forEach(function (k) {
    if (!have[k]) dbInsert_(sheetName, { key: k, value: defaults[k], draft_value: '', updated_at: nowIso_(), updated_by: 'setup' });
  });
}

function setupSheets() {
  const ss = ss_(), report = [];
  Object.keys(SHEETS).forEach(function (name) {
    const def = SHEETS[name];
    if (ss.getSheetByName(name)) return;
    if (def.existing) { report.push('PERINGATAN: sheet milik Anda tidak ditemukan: ' + name); return; }
    const sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    report.push('Dibuat: ' + name);
  });
  Object.keys(SHEETS).forEach(function (name) {            // sheet buatan kita dari versi lama: tambahkan kolom baru di ujung kanan
    const def = SHEETS[name], sh = ss.getSheetByName(name);
    if (def.existing || !sh) return;
    const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (h) { return String(h).trim(); });
    const add = def.headers.filter(function (h) { return have.indexOf(h) < 0; });
    if (add.length) { sh.getRange(1, have.length + 1, 1, add.length).setValues([add]).setFontWeight('bold'); report.push('Kolom ditambahkan di ' + name + ': ' + add.join(', ')); }
  });
  dbReset_();
  Object.keys(SHEETS).forEach(function (name) {
    try { if (ss.getSheetByName(name)) cols_(name); } catch (e) { report.push('KOLOM: ' + e.message); }
  });
  withLock_(function () {
    seedKv_('WEBSITE_CONFIG', DEFAULT_CONFIG);
    seedKv_('THEME', DEFAULT_THEME);
    const have = dbColumn_('SECTIONS', 'key').map(String);
    DEFAULT_SECTIONS.forEach(function (s) { if (have.indexOf(s.key) < 0) dbInsert_('SECTIONS', { key: s.key, label: s.label, enabled: true, order: s.order, settings_json: '' }); });
    if (dbCount_('NAVIGATION') === 0) DEFAULT_NAVIGATION.forEach(function (n) { dbInsert_('NAVIGATION', { id: Utilities.getUuid(), label: n.label, url: n.url, parent_id: '', order: n.order, visibility: 'VISIBLE', target: '_self' }); });
  });
  console.log(report.length ? report.join('\n') : 'Semua sheet siap.');
  return report;
}

/** Buat Super Admin pertama dari Script Property BOOTSTRAP_ADMIN_EMAIL (di-bind ke UID saat login pertama). */
function bootstrapSuperAdmin() {
  const email = String(prop_('BOOTSTRAP_ADMIN_EMAIL', true)).trim().toLowerCase();
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL tidak valid');
  withLock_(function () {
    if (dbAll_('USERS').some(function (r) { return String(r.role).toUpperCase() === 'SUPER_ADMIN'; })) { console.log('Super Admin sudah ada; tidak ada perubahan.'); return; }
    dbInsert_('USERS', { uid: 'pending:' + email, email: email, nama: '', role: 'SUPER_ADMIN', permissions: '', status: 'ACTIVE', created_at: nowIso_(), updated_at: nowIso_(), last_login: '' });
    console.log('Super Admin dibuat untuk ' + email + '. Hapus BOOTSTRAP_ADMIN_EMAIL dari Script Properties.');
  });
}

function checkConfiguration() {
  const names = ['SPREADSHEET_ID', 'FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'APP_TOKEN_SECRET', 'DRIVE_ROOT_FOLDER_ID'];
  const out = names.map(function (n) { return n + ': ' + (prop_(n, false) ? 'OK' : 'KOSONG'); });
  console.log(out.join('\n'));
  return out;
}

/**
 * Diagnosa login: jalankan di editor Apps Script. Memanggil accounts:lookup dengan token palsu dan membaca jawaban Google.
 * Kunci & proyek benar  => HTTP 400 "INVALID_ID_TOKEN" (normal; token memang palsu).
 * HTTP 403 / "API_KEY_HTTP_REFERRER_BLOCKED" => API key dibatasi referrer web; panggilan server tidak membawa referrer.
 *   Perbaiki di Google Cloud Console > APIs & Services > Credentials: pakai restriction "None" untuk key ini, atau
 *   "API restrictions" saja (Identity Toolkit API) tanpa "Website restrictions".
 * "API key not valid" => FIREBASE_WEB_API_KEY salah. "SERVICE_DISABLED" => aktifkan Identity Toolkit API.
 */
function diagnoseAuth() {
  const out = [];
  out.push('FIREBASE_PROJECT_ID: ' + (prop_('FIREBASE_PROJECT_ID', false) || 'KOSONG') + '  (harus Project ID, bukan nama proyek)');
  const key = prop_('FIREBASE_WEB_API_KEY', false);
  out.push('FIREBASE_WEB_API_KEY: ' + (key ? 'terisi, awalan ' + key.slice(0, 4) : 'KOSONG'));
  if (key) {
    const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key),
      { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: 'x' }), muteHttpExceptions: true });
    out.push('accounts:lookup => HTTP ' + res.getResponseCode() + ' ' + String(res.getContentText()).replace(/\s+/g, ' ').slice(0, 400));
    out.push(res.getResponseCode() === 400 ? 'Kunci tampak benar (400 INVALID_ID_TOKEN untuk token palsu itu normal).' : 'Ada masalah pada kunci/pengaturan API, lihat pesan di atas.');
  }
  console.log(out.join('\n'));
  return out;
}

/**
 * Ukur langkah-langkah yang dilakukan saat login (tanpa menulis data). Jalankan di editor Apps Script dan lihat Execution log.
 * Angka normal: tiap langkah < ~1500 ms. Langkah yang jauh lebih lambat menunjukkan sumber keterlambatan.
 */
function benchmarkLogin() {
  const rows = []; let t = Date.now();
  const step = function (name, fn) { t = Date.now(); let note = ''; try { const r = fn(); if (r !== undefined) note = ' ' + r; } catch (e) { note = ' GAGAL: ' + e; } rows.push(name + ': ' + (Date.now() - t) + ' ms' + note); };
  step('buka spreadsheet', function () { dbReset_(); ss_(); });
  step('baca sheet USERS', function () { return dbAll_('USERS').length + ' baris'; });
  step('baca header SESSIONS & AUDIT_LOGS', function () { cols_('SESSIONS'); cols_('AUDIT_LOGS'); });
  step('jumlah baris SESSIONS / AUDIT_LOGS', function () { return sheet_('SESSIONS').getLastRow() + ' / ' + sheet_('AUDIT_LOGS').getLastRow(); });
  step('cache tulis+baca', function () { cachePut_('bench', 'x', 30); return cacheGet_('bench'); });
  step('ambil lock', function () { const l = LockService.getScriptLock(); const ok = l.tryLock(5000); if (ok) l.releaseLock(); return ok ? 'OK' : 'TIDAK DAPAT (ada proses lain menahan lock)'; });
  step('panggil Firebase accounts:lookup', function () { const k = prop_('FIREBASE_WEB_API_KEY', false); if (!k) return 'kunci kosong'; const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(k), { method: 'post', contentType: 'application/json', payload: '{"idToken":"x"}', muteHttpExceptions: true }); return 'HTTP ' + r.getResponseCode(); });
  console.log(rows.join('\n')); return rows;
}

/** Pasang sebagai trigger harian: hapus sesi yang sudah kedaluwarsa lebih dari 1 hari. */
function purgeOldSessions() {
  withLock_(function () {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    dbAll_('SESSIONS').filter(function (s) { return Number(s.expires_at) < cutoff; })
      .sort(function (a, b) { return b.__row - a.__row; })
      .forEach(function (s) { sheet_('SESSIONS').deleteRow(s.__row); });
  });
}
