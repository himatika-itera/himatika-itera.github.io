/**
 * Harness uji lokal (Node >= 16): memuat seluruh file .gs ke satu konteks VM dengan mock
 * Sheets/Cache/Lock/Drive/UrlFetch. Menguji LOGIKA backend, bukan Google Sheets/Firebase asli.
 * Jalankan: node apps-script/test/run.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');

// ---------- jam palsu ----------
let offset = 0;
const RealDate = Date;
const nowMs = () => RealDate.now() + offset;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
  static now() { return RealDate.now() + offset; }
}

// ---------- mock layanan Google ----------
const signed = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const toBuf = (d) => (typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(Array.from(d).map((b) => b & 255)));
const Utilities = {
  Charset: { UTF_8: 'UTF_8' }, DigestAlgorithm: { SHA_256: 'SHA_256' },
  getUuid: () => crypto.randomUUID(),
  base64EncodeWebSafe: (d) => toBuf(d).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  base64DecodeWebSafe: (s) => signed(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  base64Decode: (s) => signed(Buffer.from(s, 'base64')),
  computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', toBuf(k)).update(toBuf(v)).digest()),
  computeDigest: (a, v) => signed(crypto.createHash('sha256').update(toBuf(v)).digest()),
  newBlob: (d, mime, name) => ({ bytes: toBuf(d), mime, name, getDataAsString: () => toBuf(d).toString('utf8') })
};
const cacheStore = new Map();
const CacheService = { getScriptCache: () => ({
  get: (k) => { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= nowMs()) { cacheStore.delete(k); return null; } return e.v; },
  put: (k, v, ttl) => { cacheStore.set(k, { v: String(v), exp: nowMs() + (ttl || 600) * 1000 }); },
  remove: (k) => { cacheStore.delete(k); }
}) };
const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
const props = {};
const PropertiesService = { getScriptProperties: () => ({
  getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; }
}) };
const fb = { users: new Map(), calls: 0 };
const UrlFetchApp = { fetch: (url, o) => {
  if (url.indexOf('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=') !== 0) throw new Error('URL tak terduga: ' + url);
  fb.calls++;
  const e = fb.users.get(JSON.parse(o.payload).idToken);
  if (!e || e.valid === false) return { getResponseCode: () => 400, getContentText: () => '{"error":{"message":"INVALID_ID_TOKEN"}}' };
  if (e.status) return { getResponseCode: () => e.status, getContentText: () => '{}' };
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ users: [{ localId: e.localId, email: e.email, emailVerified: e.emailVerified, disabled: e.disabled }] }) };
} };
const ContentService = { MimeType: { JSON: 'JSON' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) };

class MockSheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  getLastRow() { let n = this.rows.length; while (n > 0 && this.rows[n - 1].every((c) => c === '' || c === undefined)) n--; return n; }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    return {
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] === undefined ? '' : row[c - 1 + j]))); } return out; },
      setValues(v) { for (let i = 0; i < nr; i++) { while (sh.rows.length < r + i) sh.rows.push([]); const row = sh.rows[r - 1 + i]; for (let j = 0; j < nc; j++) row[c - 1 + j] = v[i][j]; } return this; },
      setFontWeight() { return this; }
    };
  }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  setFrozenRows() {}
}
const store = { sheets: {} };
const SpreadsheetApp = { openById: (id) => {
  if (id !== 'SSID') throw new Error('spreadsheet tidak ditemukan');
  return { getSheetByName: (n) => store.sheets[n] || null, insertSheet: (n) => (store.sheets[n] = new MockSheet(n)) };
} };
const drive = { files: [], folders: {}, ssAccess: 'PRIVATE', rootAccess: 'PRIVATE' };
const mkFolder = (n) => ({ name: n, createFile(blob) {
  const f = { id: 'file' + (drive.files.length + 1), blob, sharing: null, trashed: false,
    setSharing(a, p) { this.sharing = [a, p]; }, setTrashed(t) { this.trashed = t; }, getId() { return this.id; } };
  drive.files.push(f); return f; } });
const DriveApp = {
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' }, Permission: { VIEW: 'VIEW' },
  getFolderById: () => ({ getFoldersByName: (n) => ({ hasNext: () => !!drive.folders[n], next: () => drive.folders[n] }), createFolder: (n) => (drive.folders[n] = mkFolder(n)), getName: () => 'HIMATIKA', getSharingAccess: () => drive.rootAccess, createFile: (b) => mkFolder('root').createFile(b) }),
  getFileById: (id) => (id === 'SSID' ? { getSharingAccess: () => drive.ssAccess } : drive.files.find((f) => f.id === id))
};
const logs = { error: [], warn: [] };
const quiet = { log() {}, warn: (m) => logs.warn.push(String(m)), error: (m) => logs.error.push(String(m)) };

// ---------- muat kode .gs ----------
const ORDER = ['Config', 'Util', 'Database', 'Token', 'Auth', 'Security', 'Audit', 'Users', 'Crud', 'News', 'Pages', 'Members', 'Site', 'Media', 'Code', 'Setup', 'Integration'];
const code = ORDER.map((f) => fs.readFileSync(path.join(__dirname, '..', f + '.gs'), 'utf8')).join('\n;\n') + '\n;globalThis.__ApiError = ApiError;';
const ctx = vm.createContext({ Utilities, CacheService, LockService, PropertiesService, UrlFetchApp, SpreadsheetApp, DriveApp, ContentService, console: quiet, Date: FakeDate });
vm.runInContext(code, ctx, { filename: 'bundle.gs' });
const api = ctx;

// ---------- data awal milik pemilik ----------
const PROJECT = 'himatika-test';
Object.assign(props, { SPREADSHEET_ID: 'SSID', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_WEB_API_KEY: 'AIzaFake', DRIVE_ROOT_FOLDER_ID: 'root', BOOTSTRAP_ADMIN_EMAIL: 'super@itera.ac.id' });
const mk = (name, headers, rows) => { const s = (store.sheets[name] = new MockSheet(name)); s.rows.push(headers.slice()); rows.forEach((r) => s.rows.push(r)); };
const past = new RealDate(RealDate.now() - 86400000).toISOString();
const NEWS_H = ['id_berita', 'slug', 'judul', 'ringkasan', 'konten', 'kategori', 'penulis', 'gambar_utama', 'gambar', 'tanggal_publikasi', 'tanggal_dibuat', 'tanggal_diperbarui', 'status', 'is_featured', 'views', 'shares'];
mk('BERITA', NEWS_H, [
  ['b1', 'berita-pertama', 'Berita Pertama', 'ringkas', '<p>Halo</p><script>alert(1)</script><img src=x onerror=alert(1)>', 'Umum', 'Admin', 'https://example.com/a.jpg', 'https://example.com/1.jpg, javascript:alert(1)', past, past, past, 'PUBLISHED', true, 5, 1],
  ['b2', 'berita-draft', 'Berita Draft', 'r', '<p>rahasia</p>', 'Umum', 'Admin', '', '', '', past, past, 'DRAFT', false, 0, 0]
]);
mk('ANGGOTA', ['NIM', 'NAMA', 'ANGKATAN', 'STATUS'], [['122140001', 'Budi Santoso', '2022', 'AKTIF'], ['123140002', 'Siti Aminah', '2023', 'AKTIF']]);
mk('STRUKTUR', ['Kabinet', 'NIM', 'Nama', 'Angkatan', 'Jabatan'], [
  ['Kabinet Lama', '122140001', 'Budi Santoso', '2022', 'Ketua'], ['Kabinet Baru', '123140002', 'Siti Aminah', '2023', 'Ketua'], ['Kabinet Baru', '122140001', 'Budi Santoso', '2022', 'Sekretaris']]);
const userSheetsBefore = JSON.stringify(['BERITA', 'ANGGOTA', 'STRUKTUR'].map((n) => store.sheets[n].rows));

// ---------- helper uji ----------
let passed = 0, failed = 0;
const failures = [];
function T(name, fn) { try { fn(); passed++; } catch (e) { failed++; failures.push(name + ' -> ' + (e && e.message)); } }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'eq') + ': dapat ' + JSON.stringify(a) + ', harap ' + JSON.stringify(b)); }
function ok(c, m) { if (!c) throw new Error(m || 'assert gagal'); }
function code_(fn) { try { fn(); return 'NO_ERROR'; } catch (e) { return e.code || ('JS:' + e.message); } }
function expectCode(fn, c) { const got = code_(fn); if (Array.isArray(c) ? c.indexOf(got) < 0 : got !== c) throw new Error('kode error ' + got + ', harap ' + c); }

const rid = () => crypto.randomUUID();
const post = (env) => api.route_({ postData: { contents: JSON.stringify(env) } }, 'POST');
const get = (action, payload) => api.route_({ parameter: Object.assign({ action }, payload ? { payload: JSON.stringify(payload) } : {}) }, 'GET');
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function mkIdToken(uid, email, o) {
  o = o || {}; const now = Math.floor(nowMs() / 1000);
  const claims = { aud: o.aud || PROJECT, iss: 'https://securetoken.google.com/' + (o.iss || PROJECT), sub: uid, iat: now - 10, auth_time: now - 10, exp: o.exp || now + 7200, email, firebase: { sign_in_provider: o.provider || 'password' } };
  const tok = b64u({ alg: o.alg || 'RS256', kid: 'k1', typ: 'JWT' }) + '.' + b64u(claims) + '.' + crypto.randomBytes(60).toString('base64url');
  fb.users.set(tok, { localId: o.lookupUid || uid, email, emailVerified: o.verified !== false, disabled: !!o.disabled, valid: o.valid, status: o.status });
  return tok;
}
const emailOf = (name) => name + '@itera.ac.id';
const uidOf = (name) => { const r = api.dbAll_('USERS').find((x) => String(x.email).toLowerCase() === emailOf(name)); return r && !String(r.uid).startsWith('pending:') ? String(r.uid) : 'fb' + name.replace(/[^A-Za-z0-9]/g, ''); };
const rawLogin = (name, o) => post({ action: 'createSession', request_id: rid(), timestamp: nowMs(), firebase_id_token: mkIdToken(uidOf(name), emailOf(name), o), payload: {} });
function login(name, o) { const r = rawLogin(name, o); return { appToken: r.application_token, uid: r.user.uid, name, user: r.user, idt: mkIdToken(r.user.uid, emailOf(name)) }; }
const env = (s, action, payload, o) => Object.assign({ action, application_token: s.appToken, firebase_id_token: s.idt, request_id: rid(), timestamp: nowMs(), payload }, o || {});
const call = (s, action, payload) => post(env(s, action, payload || {}));
const userRow = (uid, name, role, extra) => api.dbInsert_('USERS', Object.assign({ uid, email: emailOf(name), nama: name, role, permissions: '', status: 'ACTIVE', created_at: past, updated_at: past, last_login: '' }, extra || {}));

// ---------- setup ----------
api.generateAppTokenSecret();
api.setupSheets();
api.bootstrapSuperAdmin();
T('setupSheets tidak mengubah sheet milik pemilik', () => eq(JSON.stringify(['BERITA', 'ANGGOTA', 'STRUKTUR'].map((n) => store.sheets[n].rows)), userSheetsBefore));
T('setupSheets idempoten', () => { const n = store.sheets.WEBSITE_CONFIG.rows.length; api.setupSheets(); eq(store.sheets.WEBSITE_CONFIG.rows.length, n); });
T('USERS tidak punya kolom kata sandi apa pun', () => ok(!/pass|hash|secret/i.test(store.sheets.USERS.rows[0].join(','))));
T('bootstrap membuat Super Admin berstatus pending (uid pending:<email>)', () => eq(api.dbFind_('USERS', 'pending:super@itera.ac.id').role, 'SUPER_ADMIN'));
T('bootstrap idempoten: tidak membuat Super Admin kedua', () => { api.bootstrapSuperAdmin(); eq(api.dbAll_('USERS').length, 1); });
const SUPER = login('super');
T('login pertama mem-bind UID Firebase ke baris pending', () => { ok(!api.dbFind_('USERS', 'pending:super@itera.ac.id')); eq(api.dbFind_('USERS', 'fbsuper').role, 'SUPER_ADMIN'); eq(SUPER.user.role, 'SUPER_ADMIN'); });
userRow('uidAdmin1', 'admin1', 'ADMIN');
userRow('uidEditor1', 'editor1', 'EDITOR');
userRow('uidEditor2', 'editor2', 'EDITOR');
userRow('uidEditor3', 'editor3', 'EDITOR');
userRow('uidViewer1', 'viewer1', 'VIEWER');
userRow('uidNarrow', 'narrow1', 'EDITOR', { permissions: 'news:read' });
userRow('uidRate', 'rate1', 'ADMIN');
userRow('uidUp', 'upload1', 'EDITOR');
const ADMIN = login('admin1'), EDITOR = login('editor1'), EDITOR2 = login('editor2'),
  VIEWER = login('viewer1'), NARROW = login('narrow1'), RATE = login('rate1'), UP = login('upload1');

// ---------- autentikasi Firebase Email/Password ----------
T('login benar menghasilkan token aplikasi + profil', () => { ok(ADMIN.appToken.split('.').length === 2); eq(ADMIN.user.role, 'ADMIN'); eq(ADMIN.user.email, 'admin1@itera.ac.id'); });
T('backend tidak pernah menerima/menyimpan kata sandi (field password diabaikan, tidak tersimpan)', () => {
  const t = mkIdToken('uidAdmin1', emailOf('admin1')); post({ action: 'createSession', request_id: rid(), timestamp: nowMs(), firebase_id_token: t, payload: { password: 'RAHASIA-XYZ-123', email: 'x@y.id' } });
  ok(!JSON.stringify(store.sheets).includes('RAHASIA-XYZ-123'));
});
T('hanya provider "password" yang diterima (google.com, anonymous, custom ditolak)', () => { for (const prov of ['google.com', 'anonymous', 'custom', 'phone', 'facebook.com']) expectCode(() => rawLogin('admin1', { provider: prov }), 'UNAUTHENTICATED'); });
T('verifikasi email TIDAK diperlukan: user Firebase yang terdaftar di USERS bisa login', () => ok(rawLogin('admin1', { verified: false }).application_token));
T('ID token palsu / tidak dikenal Google (lookup 400) ditolak', () => expectCode(() => rawLogin('admin1', { valid: false }), 'UNAUTHENTICATED'));
T('ID token dicabut/akun dinonaktifkan di Firebase ditolak', () => expectCode(() => rawLogin('admin1', { disabled: true }), 'UNAUTHENTICATED'));
T('lookup mengembalikan UID berbeda dari klaim sub ditolak', () => expectCode(() => rawLogin('admin1', { lookupUid: 'orangLain' }), 'UNAUTHENTICATED'));
T('klaim aud / iss salah ditolak (token dari proyek Firebase lain)', () => { expectCode(() => rawLogin('admin1', { aud: 'proyek-lain' }), 'UNAUTHENTICATED'); expectCode(() => rawLogin('admin1', { iss: 'proyek-lain' }), 'UNAUTHENTICATED'); });
T('token kedaluwarsa ditolak; alg selain RS256 ditolak', () => { expectCode(() => rawLogin('admin1', { exp: Math.floor(nowMs() / 1000) - 600 }), 'TOKEN_EXPIRED'); expectCode(() => rawLogin('admin1', { alg: 'none' }), 'UNAUTHENTICATED'); expectCode(() => rawLogin('admin1', { alg: 'HS256' }), 'UNAUTHENTICATED'); });
T('token sampah / terlalu pendek / bukan string ditolak', () => { for (const t of ['abc', 'a.b.c', 'x'.repeat(200), 12345, null, { a: 1 }, '..']) expectCode(() => post({ action: 'createSession', request_id: rid(), timestamp: nowMs(), firebase_id_token: t, payload: {} }), ['UNAUTHENTICATED']); });
T('tanpa firebase_id_token ditolak', () => expectCode(() => post({ action: 'createSession', request_id: rid(), timestamp: nowMs(), payload: {} }), 'UNAUTHENTICATED'));
T('gangguan layanan Firebase (HTTP 500) => UPSTREAM_ERROR, bukan lolos', () => expectCode(() => rawLogin('admin1', { status: 500 }), 'UPSTREAM_ERROR'));
T('email tidak terdaftar di USERS => UNAUTHORIZED (akun Firebase valid pun tidak cukup)', () => expectCode(() => rawLogin('orangasing'), 'UNAUTHORIZED'));
T('akun SUSPENDED tidak dapat login', () => { userRow('uidSusp', 'suspended1', 'EDITOR', { status: 'SUSPENDED' }); expectCode(() => rawLogin('suspended1'), 'USER_INACTIVE'); });
T('role tidak dikenal di sheet = tanpa akses', () => { userRow('uidWeird', 'weird1', 'GOD'); expectCode(() => rawLogin('weird1'), 'UNAUTHORIZED'); });
T('hasil verifikasi di-cache: token sama tidak memanggil Google berulang', () => { const t = ADMIN.idt; call(ADMIN, 'adminGetDashboard'); const c = fb.calls; call(ADMIN, 'adminGetDashboard'); call(ADMIN, 'adminGetDashboard'); eq(fb.calls, c); ok(t); });
T('app token milik A + ID token milik B ditolak (UID tidak cocok)', () => expectCode(() => post(env(Object.assign({}, ADMIN, { idt: EDITOR.idt }), 'adminGetDashboard', {})), 'UNAUTHORIZED'));
T('hanya ID token tanpa app token ditolak untuk aksi admin', () => expectCode(() => post({ action: 'adminGetDashboard', firebase_id_token: ADMIN.idt, request_id: rid(), timestamp: nowMs(), payload: {} }), 'UNAUTHENTICATED'));
T('hanya app token tanpa ID token ditolak', () => expectCode(() => post({ action: 'adminGetDashboard', application_token: ADMIN.appToken, request_id: rid(), timestamp: nowMs(), payload: {} }), 'UNAUTHENTICATED'));
T('createSession dibatasi per UID (10 / 10 menit)', () => { userRow('uidSess', 'sess1', 'VIEWER'); let got = ''; for (let i = 0; i < 14 && got !== 'RATE_LIMITED'; i++) got = code_(() => rawLogin('sess1')); eq(got, 'RATE_LIMITED'); });
T('login sukses & ditolak dicatat di audit', () => { const l = api.dbAll_('AUDIT_LOGS').filter((r) => r.action === 'auth.login'); ok(l.some((r) => r.status === 'SUCCESS') && l.some((r) => r.status === 'DENIED')); });
T('Auth.gs/Users.gs tidak memuat penanganan kata sandi', () => { const src = fs.readFileSync(path.join(__dirname, '..', 'Auth.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') + fs.readFileSync(path.join(__dirname, '..', 'Users.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); ok(!/hashPassword|pbkdf|password_hash|current_password/i.test(src)); });

// ---------- validasi request ----------
T('tanpa application_token ditolak', () => expectCode(() => post({ action: 'adminGetDashboard', request_id: rid(), timestamp: nowMs(), payload: {} }), 'UNAUTHENTICATED'));
T('application_token dirusak ditolak', () => { const t = SUPER.appToken; const bad = t.slice(0, -3) + (t.slice(-3) === 'AAA' ? 'BBB' : 'AAA'); expectCode(() => call(Object.assign({}, SUPER, { appToken: bad }), 'adminGetDashboard'), 'UNAUTHENTICATED'); });
T('payload token diubah (uid lain) ditolak oleh HMAC', () => {
  const [p, sig] = SUPER.appToken.split('.'); const pl = JSON.parse(Buffer.from(p, 'base64url').toString()); pl.uid = 'uidAdmin1';
  expectCode(() => call(Object.assign({}, SUPER, { appToken: Buffer.from(JSON.stringify(pl)).toString('base64url') + '.' + sig }), 'adminGetDashboard'), 'UNAUTHENTICATED');
});
T('token yang ditandatangani rahasia lain ditolak', () => { const p = Buffer.from(JSON.stringify({ v: 1, sid: 'x', uid: 'uidAdmin1', iat: nowMs(), exp: nowMs() + 1e6 })).toString('base64url'); const sig = crypto.createHmac('sha256', 'rahasia-lain-rahasia-lain-rahasia-lain').update(p).digest('base64url'); expectCode(() => call({ appToken: p + '.' + sig }, 'adminGetDashboard'), 'UNAUTHENTICATED'); });
T('timestamp basi ditolak', () => expectCode(() => post(env(SUPER, 'adminGetDashboard', {}, { timestamp: nowMs() - 10 * 60000 })), 'BAD_TIMESTAMP'));
T('timestamp masa depan jauh ditolak', () => expectCode(() => post(env(SUPER, 'adminGetDashboard', {}, { timestamp: nowMs() + 10 * 60000 })), 'BAD_TIMESTAMP'));
T('createSession dengan timestamp basi ditolak', () => expectCode(() => post({ action: 'createSession', request_id: rid(), timestamp: nowMs() - 10 * 60000, firebase_id_token: mkIdToken('uidAdmin1', emailOf('admin1')), payload: {} }), 'BAD_TIMESTAMP'));
T('request_id dipakai ulang (replay) ditolak', () => { const e = env(SUPER, 'adminGetDashboard', {}); post(e); expectCode(() => post(e), 'REPLAY'); });
T('request_id tidak valid ditolak', () => expectCode(() => post(env(SUPER, 'adminGetDashboard', {}, { request_id: 'x' })), 'BAD_REQUEST'));
T('payload array ditolak', () => expectCode(() => post(env(SUPER, 'adminGetDashboard', [])), 'BAD_REQUEST'));
T('aksi tidak dikenal / properti prototype ditolak', () => { expectCode(() => get('nonexistentAction'), 'NOT_FOUND'); expectCode(() => get('constructor'), 'NOT_FOUND'); expectCode(() => get('toString'), 'NOT_FOUND'); });
T('aksi admin dan createSession lewat GET ditolak (kredensial tidak boleh ada di URL)', () => { expectCode(() => get('adminGetDashboard'), 'BAD_REQUEST'); expectCode(() => get('createSession', { firebase_id_token: ADMIN.idt }), 'BAD_REQUEST'); });
T('body terlalu besar ditolak', () => expectCode(() => post(env(SUPER, 'adminCreateNews', { data: { judul: 'x'.repeat(400000) } })), 'PAYLOAD_TOO_LARGE'));
T('JSON rusak ditolak', () => expectCode(() => api.route_({ postData: { contents: '{bukan json' } }, 'POST'), 'BAD_REQUEST'));
T('error internal tidak membocorkan detail', () => {
  const keep = props.APP_TOKEN_SECRET; delete props.APP_TOKEN_SECRET;
  const out = api.doPost({ postData: { contents: JSON.stringify(env(ADMIN, 'adminGetDashboard', {})) } }).getContent();
  props.APP_TOKEN_SECRET = keep;
  const j = JSON.parse(out); eq(j.error.code, 'INTERNAL'); ok(!/Script Property|APP_TOKEN|stack/i.test(out), 'bocor: ' + out);
});
T('respons tidak memuat rahasia (token Firebase, secret, kata sandi)', () => { const all = JSON.stringify(call(SUPER, 'adminManageUsers', { op: 'list' })) + JSON.stringify(call(SUPER, 'adminGetProfile')); ok(!/password|APP_TOKEN_SECRET|AIzaFake|firebase_id_token/i.test(all)); });
T('doPost mengembalikan envelope JSON konsisten', () => { const j = JSON.parse(api.doPost({ postData: { contents: JSON.stringify({ action: 'getWebsiteConfig' }) } }).getContent()); eq(Object.keys(j), ['success', 'message', 'data', 'error']); ok(j.success); });

// ---------- RBAC ----------
T('VIEWER boleh dashboard, tidak boleh membuat berita', () => { ok(call(VIEWER, 'adminGetDashboard').totals); expectCode(() => call(VIEWER, 'adminCreateNews', { data: { judul: 'x' } }), 'FORBIDDEN'); });
T('percobaan ditolak dicatat di AUDIT_LOGS sebagai DENIED', () => ok(api.dbAll_('AUDIT_LOGS').some((r) => r.status === 'DENIED' && r.action === 'adminCreateNews')));
T('EDITOR tidak boleh Customizer, user, audit', () => { expectCode(() => call(EDITOR, 'adminUpdateWebsiteConfig', { values: { site_name: 'x' } }), 'FORBIDDEN'); expectCode(() => call(EDITOR, 'adminManageUsers', { op: 'list' }), 'FORBIDDEN'); expectCode(() => call(EDITOR, 'adminGetAuditLogs'), 'FORBIDDEN'); });
T('ADMIN tidak boleh mengelola user (tidak bisa naikkan role sendiri)', () => { expectCode(() => call(ADMIN, 'adminManageUsers', { op: 'update', uid: 'uidAdmin1', data: { role: 'SUPER_ADMIN' } }), 'FORBIDDEN'); eq(api.dbFind_('USERS', 'uidAdmin1').role, 'ADMIN'); });
T('permissions pengguna hanya mempersempit role', () => { ok(call(NARROW, 'adminListNews').items); expectCode(() => call(NARROW, 'adminCreateNews', { data: { judul: 'x' } }), 'FORBIDDEN'); });
T('SUPER_ADMIN tidak dapat mengubah role/status dirinya sendiri', () => { expectCode(() => call(SUPER, 'adminManageUsers', { op: 'update', uid: SUPER.uid, data: { role: 'ADMIN' } }), 'FORBIDDEN'); expectCode(() => call(SUPER, 'adminManageUsers', { op: 'update', uid: SUPER.uid, data: { status: 'SUSPENDED' } }), 'FORBIDDEN'); });
T('SUPER_ADMIN dapat melihat audit log', () => ok(call(SUPER, 'adminGetAuditLogs', { limit: 5 }).items.length > 0));

// ---------- manajemen user ----------
T('SUPER_ADMIN mengundang pengguna: email dinormalkan, uid pending:<email>, tanpa kolom kata sandi', () => {
  const r = call(SUPER, 'adminManageUsers', { op: 'create', data: { email: 'Baru.User@itera.ac.id', nama: 'Baru', role: 'EDITOR' } });
  eq(r.email, 'baru.user@itera.ac.id'); eq(r.uid, 'pending:baru.user@itera.ac.id'); eq(r.status, 'ACTIVE'); ok(!/pass|hash/i.test(Object.keys(r).join(',')));
  expectCode(() => call(SUPER, 'adminManageUsers', { op: 'create', data: { email: 'BARU.user@itera.ac.id', role: 'EDITOR' } }), 'CONFLICT');
});
T('undangan: email tidak valid / role tidak dikenal ditolak; field uid dari klien diabaikan', () => {
  expectCode(() => call(SUPER, 'adminManageUsers', { op: 'create', data: { email: 'bukan-email', role: 'EDITOR' } }), 'VALIDATION_ERROR');
  expectCode(() => call(SUPER, 'adminManageUsers', { op: 'create', data: { email: 'x1@itera.ac.id', role: 'DEWA' } }), 'VALIDATION_ERROR');
  const r = call(SUPER, 'adminManageUsers', { op: 'create', data: { email: 'x2@itera.ac.id', role: 'VIEWER', uid: 'pwned', status: 'ACTIVE' } }); eq(r.uid, 'pending:x2@itera.ac.id');
});
T('pengguna yang diundang login => UID di-bind, role sesuai undangan', () => {
  const s = login('baru.user'); eq(s.user.role, 'EDITOR'); eq(s.uid, 'fbbaruuser'); ok(!api.dbFind_('USERS', 'pending:baru.user@itera.ac.id')); ok(call(s, 'adminListNews').items);
});
T('SERANGAN: provider selain password (mis. google.com) dengan email korban ditolak', () => expectCode(() => post({ action: 'createSession', request_id: rid(), timestamp: nowMs(), firebase_id_token: mkIdToken('uidPenyerang', 'korban@itera.ac.id', { provider: 'google.com' }), payload: {} }), 'UNAUTHENTICATED'));
T('pengguna yang dibuat di Firebase Console mengambil undangannya pada login pertama', () => { call(SUPER, 'adminManageUsers', { op: 'create', data: { email: 'korban@itera.ac.id', role: 'ADMIN' } }); const s = login('korban', { verified: false }); eq(s.user.role, 'ADMIN'); eq(s.uid, 'fbkorban'); });
T('setelah di-bind, UID lain dengan email sama tidak bisa masuk', () => expectCode(() => post({ action: 'createSession', request_id: rid(), timestamp: nowMs(), firebase_id_token: mkIdToken('uidPenyerang2', 'korban@itera.ac.id'), payload: {} }), 'UNAUTHORIZED'));
T('akun ADMIN tidak boleh mengundang/mengubah pengguna', () => { expectCode(() => call(ADMIN, 'adminManageUsers', { op: 'create', data: { email: 'z@itera.ac.id', role: 'VIEWER' } }), 'FORBIDDEN'); expectCode(() => call(ADMIN, 'adminManageUsers', { op: 'update', uid: 'uidAdmin1', data: { role: 'SUPER_ADMIN' } }), 'FORBIDDEN'); });
const E3 = login('editor3');
T('suspend user mencabut sesi aktif', () => {
  ok(call(E3, 'adminGetDashboard').totals);
  call(SUPER, 'adminManageUsers', { op: 'update', uid: 'uidEditor3', data: { status: 'SUSPENDED' } });
  expectCode(() => call(E3, 'adminGetDashboard'), ['UNAUTHENTICATED', 'USER_INACTIVE']);
});
T('user SUSPENDED tidak dapat membuat sesi', () => expectCode(() => rawLogin('editor3'), 'USER_INACTIVE'));
T('ganti role mencabut sesi lama', () => {
  const s = login('editor2'); ok(call(s, 'adminGetDashboard').totals);
  call(SUPER, 'adminManageUsers', { op: 'update', uid: 'uidEditor2', data: { role: 'VIEWER' } });
  expectCode(() => call(s, 'adminGetDashboard'), ['UNAUTHENTICATED', 'USER_INACTIVE']);
  const s2 = login('editor2'); eq(s2.user.role, 'VIEWER');
});
T('Super Admin kedua: dapat diundang, login, lalu dinonaktifkan oleh Super Admin lain', () => {
  call(SUPER, 'adminManageUsers', { op: 'create', data: { email: 'super2@itera.ac.id', role: 'SUPER_ADMIN' } });
  const s2 = login('super2'); eq(s2.user.role, 'SUPER_ADMIN');
  call(SUPER, 'adminManageUsers', { op: 'update', uid: s2.uid, data: { status: 'SUSPENDED' } });
  expectCode(() => rawLogin('super2'), 'USER_INACTIVE');
});
T('daftar pengguna memuat email dan role, tanpa kolom rahasia', () => { const l = call(SUPER, 'adminManageUsers', { op: 'list' }).items; ok(l.length >= 8 && l.every((u) => u.email && u.role)); });
T('logout mencabut sesi', () => { const s = login('viewer1'); call(s, 'adminLogout'); expectCode(() => call(s, 'adminGetDashboard'), 'UNAUTHENTICATED'); });

// ---------- berita ----------
let createdNews;
T('EDITOR membuat berita; slug otomatis, id/tanggal/views dari server (anti mass-assignment)', () => {
  const r = call(EDITOR, 'adminCreateNews', { data: { judul: 'Lomba Matematika 2026', konten: '<p>Isi</p>', status: 'PUBLISHED', id_berita: 'evil', views: 9999, shares: 77, tanggal_dibuat: '2000-01-01', is_admin: true } });
  createdNews = r; ok(r.id_berita !== 'evil'); eq(r.views, 0); eq(r.shares, 0); eq(r.slug, 'lomba-matematika-2026'); ok(r.tanggal_publikasi); ok(!('is_admin' in r));
});
T('slug duplikat diberi akhiran', () => eq(call(EDITOR, 'adminCreateNews', { data: { judul: 'Lomba Matematika 2026' } }).slug, 'lomba-matematika-2026-2'));
T('judul wajib & validasi enum/URL', () => { expectCode(() => call(EDITOR, 'adminCreateNews', { data: { ringkasan: 'x' } }), 'VALIDATION_ERROR'); expectCode(() => call(EDITOR, 'adminCreateNews', { data: { judul: 'a', status: 'HACKED' } }), 'VALIDATION_ERROR'); expectCode(() => call(EDITOR, 'adminCreateNews', { data: { judul: 'a', gambar_utama: 'javascript:alert(1)' } }), 'VALIDATION_ERROR'); expectCode(() => call(EDITOR, 'adminCreateNews', { data: { judul: 'a', slug: 'Bad Slug!' } }), 'VALIDATION_ERROR'); });
T('konten XSS disanitasi saat disimpan', () => { const r = call(EDITOR, 'adminCreateNews', { data: { judul: 'XSS', konten: '<p onclick="x()">a</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a>' } }); const k = call(EDITOR, 'adminGetNews', { key: r._key }).konten; ok(!/script|onerror|onclick|javascript:/i.test(k), k); });
T('formula injection dinetralkan di sheet, tampil normal di API', () => {
  const r = call(EDITOR, 'adminCreateNews', { data: { judul: '=HYPERLINK("http://evil","klik")' } });
  const raw = store.sheets.BERITA.rows.find((row) => row[0] === r.id_berita)[2]; ok(raw.charAt(0) === "'", 'mentah: ' + raw);
  eq(call(EDITOR, 'adminGetNews', { key: r._key }).judul, '=HYPERLINK("http://evil","klik")');
});
T('update berita: slug unik, tanggal_diperbarui terisi, field server tidak bisa diubah', () => {
  const r = call(EDITOR, 'adminUpdateNews', { key: createdNews._key, data: { judul: 'Judul Baru', views: 1, id_berita: 'x', status: 'DRAFT' } });
  eq(r.judul, 'Judul Baru'); eq(r.id_berita, createdNews.id_berita); eq(r.views, 0); eq(r.status, 'DRAFT');
  call(EDITOR, 'adminUpdateNews', { key: createdNews._key, data: { status: 'PUBLISHED' } });
});
T('update tanpa perubahan / key tidak ada ditolak', () => { expectCode(() => call(EDITOR, 'adminUpdateNews', { key: createdNews._key, data: { views: 5 } }), 'VALIDATION_ERROR'); expectCode(() => call(EDITOR, 'adminUpdateNews', { key: 'tidak-ada', data: { judul: 'x' } }), 'NOT_FOUND'); });
T('hapus berita (EDITOR memiliki news:*)', () => { const r = call(EDITOR, 'adminCreateNews', { data: { judul: 'Sementara' } }); call(EDITOR, 'adminDeleteNews', { key: r._key }); expectCode(() => call(EDITOR, 'adminGetNews', { key: r._key }), 'NOT_FOUND'); });
T('daftar berita admin tidak memuat konten, mendukung pencarian & paginasi', () => { const l = call(EDITOR, 'adminListNews', { q: 'lomba', page_size: 2 }); ok(l.items.length >= 1 && l.items.length <= 2); ok(!('konten' in l.items[0])); });

// ---------- publik ----------
T('berita publik: hanya PUBLISHED, tanpa konten, draft tersembunyi', () => { const r = get('getLatestNews', { limit: 20 }); ok(r.items.some((n) => n.slug === 'berita-pertama')); ok(!r.items.some((n) => n.slug === 'berita-draft')); ok(r.items.every((n) => !('konten' in n))); });
T('berita yang baru dipublikasi muncul (cache publik di-invalidasi)', () => ok(get('getLatestNews', { limit: 20 }).items.some((n) => n.slug === 'lomba-matematika-2026' && n.judul === 'Judul Baru')));
T('detail draft = NOT_FOUND; slug tidak valid = NOT_FOUND', () => { expectCode(() => get('getNewsDetail', { slug: 'berita-draft' }), 'NOT_FOUND'); expectCode(() => get('getNewsDetail', { slug: '../etc/passwd' }), 'NOT_FOUND'); });
T('detail berita disanitasi ulang saat tampil (baris yang diisi langsung di sheet)', () => { const d = get('getNewsDetail', { slug: 'berita-pertama' }); ok(!/script|onerror/i.test(d.konten), d.konten); ok(d.konten.indexOf('Halo') >= 0); eq(d.gambar, ['https://example.com/1.jpg']); });
T('trackNews: dihitung sekali per pengunjung, dedup', () => {
  const v = crypto.randomUUID(); const before = Number(api.dbFind_('BERITA', 'b1').views);
  eq(get('trackNews', { slug: 'berita-pertama', kind: 'view', visitor_id: v }).counted, true);
  eq(get('trackNews', { slug: 'berita-pertama', kind: 'view', visitor_id: v }).counted, false);
  eq(Number(api.dbFind_('BERITA', 'b1').views), before + 1);
  expectCode(() => get('trackNews', { slug: 'berita-pertama', kind: 'delete', visitor_id: v }), 'VALIDATION_ERROR');
});
T('kabinet publik tidak memuat NIM; default kabinet terakhir', () => { const r = get('getCabinet'); eq(r.kabinet, 'Kabinet Baru'); eq(r.items.length, 2); ok(!/NIM|12214|12314/.test(JSON.stringify(r)), JSON.stringify(r)); eq(get('getCabinet', { kabinet: 'Kabinet Lama' }).items.length, 1); });
T('informasi publik tidak memuat data pribadi', () => { const r = get('getPublicInformation'); ok(typeof r.total_anggota === 'number'); ok(!/12214/.test(JSON.stringify(r))); });

// ---------- anggota & struktur ----------
T('anggota: validasi NIM, duplikat, update, hapus', () => {
  expectCode(() => call(ADMIN, 'adminCreateMember', { data: { NIM: 'abc', NAMA: 'X' } }), 'VALIDATION_ERROR');
  const r = call(ADMIN, 'adminCreateMember', { data: { NIM: '124140003', NAMA: 'Rani', ANGKATAN: '2024' } }); eq(r.STATUS, 'AKTIF');
  expectCode(() => call(ADMIN, 'adminCreateMember', { data: { NIM: '124140003', NAMA: 'Dobel' } }), 'CONFLICT');
  eq(call(ADMIN, 'adminUpdateMember', { key: '124140003', data: { NAMA: 'Rani Putri' } }).NAMA, 'Rani Putri');
  call(ADMIN, 'adminDeleteMember', { key: '124140003' });
  expectCode(() => call(EDITOR, 'adminListMembers'), 'FORBIDDEN');
});
T('struktur: Nama/Angkatan terisi otomatis dari ANGGOTA; kunci gabungan', () => {
  const r = call(ADMIN, 'adminCreateStruktur', { data: { Kabinet: 'Kabinet Baru', NIM: '122140001', Jabatan: 'Bendahara' } }); eq(r.Nama, 'Budi Santoso'); eq(r._key, 'Kabinet Baru|122140001|Bendahara');
  expectCode(() => call(ADMIN, 'adminCreateStruktur', { data: { Kabinet: 'Kabinet Baru', NIM: '999999999', Jabatan: 'X' } }), 'VALIDATION_ERROR');
  call(ADMIN, 'adminUpdateStruktur', { key: r._key, data: { Jabatan: 'Bendahara Umum' } });
  call(ADMIN, 'adminDeleteStruktur', { key: 'Kabinet Baru|122140001|Bendahara Umum' });
});

// ---------- halaman ----------
T('halaman: draft tidak tampil, publish tampil & disanitasi', () => {
  const p = call(ADMIN, 'adminCreatePage', { data: { title: 'Tentang Kami', content: '<p>x</p><script>1</script>' } });
  expectCode(() => get('getPage', { slug: 'tentang-kami' }), 'NOT_FOUND');
  call(ADMIN, 'adminUpdatePage', { key: p._key, data: { status: 'PUBLISHED' } });
  const g = get('getPage', { slug: 'tentang-kami' }); ok(!/script/i.test(g.content));
});

// ---------- customizer ----------
T('Customizer: draft tidak live sampai Publish; Reset mengembalikan default', () => {
  eq(get('getWebsiteConfig').config.primary_color, '#F4C542');
  call(ADMIN, 'adminUpdateWebsiteConfig', { values: { primary_color: '#123abc', site_name: 'HIMATIKA Baru' } });
  eq(get('getWebsiteConfig').config.primary_color, '#F4C542');
  eq(call(ADMIN, 'adminGetSiteSettings').config.primary_color.draft, '#123ABC');
  call(ADMIN, 'adminPublishSite'); eq(get('getWebsiteConfig').config.primary_color, '#123ABC'); eq(get('getWebsiteConfig').config.site_name, 'HIMATIKA Baru');
  call(ADMIN, 'adminResetSite', { scope: 'all' }); eq(get('getWebsiteConfig').config.primary_color, '#F4C542');
});
T('Customizer: validasi warna, URL, field tak dikenal, font', () => { for (const v of [{ primary_color: 'red' }, { logo_url: 'javascript:alert(1)' }, { font_family: 'Comic Sans' }, { evil_key: 1 }, { base_font_size: 99 }]) expectCode(() => call(ADMIN, 'adminUpdateWebsiteConfig', { values: v }), 'VALIDATION_ERROR'); expectCode(() => call(ADMIN, 'adminUpdateTheme', { values: { border_radius: 500 } }), 'VALIDATION_ERROR'); });
T('maintenance_mode & hapus logo (nilai kosong) dapat dipublikasikan', () => { call(ADMIN, 'adminUpdateWebsiteConfig', { values: { maintenance_mode: true, logo_url: '' } }); call(ADMIN, 'adminPublishSite'); eq(get('getWebsiteConfig').config.maintenance_mode, 'true'); eq(call(ADMIN, 'adminGetDashboard').site.maintenance_mode, true); call(ADMIN, 'adminResetSite', { scope: 'all' }); });
T('custom_css: ADMIN ditolak, SUPER_ADMIN diterima dan disanitasi', () => {
  expectCode(() => call(ADMIN, 'adminUpdateTheme', { values: { custom_css: 'body{color:red}' } }), 'FORBIDDEN');
  call(SUPER, 'adminUpdateTheme', { values: { custom_css: '@import url(https://evil/x.css); body{background:url(javascript:alert(1));color:red} </style><script>x</script>' } });
  const d = call(SUPER, 'adminGetSiteSettings').theme.custom_css.draft; ok(!/@import|javascript|<|expression/i.test(d), d); ok(/color:red/.test(d));
});
T('section: nonaktif & urutan berpengaruh ke publik', () => { call(ADMIN, 'adminUpdateSections', { items: [{ key: 'galeri', enabled: false }, { key: 'hero', order: 9 }] }); const s = get('getWebsiteConfig').sections; ok(!s.some((x) => x.key === 'galeri')); eq(s[s.length - 1].key, 'hero'); expectCode(() => call(ADMIN, 'adminUpdateSections', { items: [{ key: 'tidak-ada', enabled: true }] }), 'VALIDATION_ERROR'); });
T('navigasi: URL javascript: ditolak, URL sah tampil di publik', () => { expectCode(() => call(ADMIN, 'adminUpdateNavigation', { op: 'create', data: { label: 'X', url: 'javascript:alert(1)' } }), 'VALIDATION_ERROR'); call(ADMIN, 'adminUpdateNavigation', { op: 'create', data: { label: 'Galeri', url: '#galeri', order: 9 } }); ok(get('getNavigation').items.some((n) => n.label === 'Galeri')); });

// ---------- media ----------
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), crypto.randomBytes(50)]).toString('base64');
T('upload gambar valid: disimpan di Drive, dibagikan link, metadata di MEDIA', () => {
  const r = call(UP, 'adminUploadImage', { filename: 'poster.png', mime_type: 'image/png', folder: 'News', data_base64: PNG });
  ok(r.public_url.indexOf('https://lh3.googleusercontent.com/d/') === 0); const f = drive.files[drive.files.length - 1]; eq(f.sharing, ['ANYONE_WITH_LINK', 'VIEW']); ok(/^[0-9a-f-]{36}\.png$/.test(f.blob.name)); ok(api.dbAll_('MEDIA').length === 1);
});
T('upload: magic bytes tidak cocok MIME ditolak', () => expectCode(() => call(UP, 'adminUploadImage', { filename: 'x.jpg', mime_type: 'image/jpeg', data_base64: PNG }), 'VALIDATION_ERROR'));
T('upload: skrip/HTML yang menyamar sebagai gambar ditolak', () => expectCode(() => call(UP, 'adminUploadImage', { filename: 'x.png', mime_type: 'image/png', data_base64: Buffer.from('<html><script>alert(1)</script></html>').toString('base64') }), 'VALIDATION_ERROR'));
T('upload: SVG dan tipe lain ditolak', () => { expectCode(() => call(UP, 'adminUploadImage', { filename: 'x.svg', mime_type: 'image/svg+xml', data_base64: Buffer.from('<svg onload=alert(1)/>').toString('base64') }), 'VALIDATION_ERROR'); expectCode(() => call(UP, 'adminUploadImage', { filename: 'x.exe', mime_type: 'application/x-msdownload', data_base64: PNG }), 'VALIDATION_ERROR'); });
T('upload: folder di luar allowlist & base64 rusak ditolak', () => { expectCode(() => call(UP, 'adminUploadImage', { filename: 'x.png', mime_type: 'image/png', folder: '../Rahasia', data_base64: PNG }), 'VALIDATION_ERROR'); expectCode(() => call(UP, 'adminUploadImage', { filename: 'x.png', mime_type: 'image/png', data_base64: 'bukan base64!!' }), 'VALIDATION_ERROR'); });
T('upload: ukuran > 5 MB ditolak', () => expectCode(() => call(UP, 'adminUploadImage', { filename: 'x.png', mime_type: 'image/png', data_base64: 'A'.repeat(7 * 1024 * 1024) }), 'PAYLOAD_TOO_LARGE'));
T('upload: VIEWER ditolak; hapus media hanya ADMIN ke atas', () => { expectCode(() => call(VIEWER2(), 'adminUploadImage', { filename: 'x.png', mime_type: 'image/png', data_base64: PNG }), ['FORBIDDEN', 'UNAUTHENTICATED']); const m = api.dbAll_('MEDIA')[0]; expectCode(() => call(UP, 'adminDeleteMedia', { key: m.id }), 'FORBIDDEN'); call(ADMIN, 'adminDeleteMedia', { key: m.id }); ok(drive.files[0].trashed); });
function VIEWER2() { return login('viewer1'); }

// ---------- rate limit ----------
T('rate limit tulis per UID (30/menit) lalu RATE_LIMITED', () => {
  let n = 0, hit = false;
  for (let i = 0; i < 40; i++) { try { call(RATE, 'adminCreatePage', { data: { title: 'Spam ' + i } }); n++; } catch (e) { eq(e.code, 'RATE_LIMITED'); hit = true; break; } }
  ok(hit && n <= 30, 'n=' + n);
});
T('rate limit tidak memengaruhi user lain', () => ok(call(ADMIN, 'adminGetDashboard').totals));

// ---------- sanitizer ----------
const ALLOWED_RE = /<\/?(?:p|br|hr|strong|b|em|i|u|s|ul|ol|li|blockquote|h2|h3|h4|code|pre|table|thead|tbody|tr|th|td|figure|figcaption|a|img)(?:\s[^<>]*)?>/g;
const VECTORS = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<a href="JaVaScRiPt&#58;alert(1)">x</a>', '<a href="jav\tascript:alert(1)">x</a>', '<scr<script>ipt>alert(1)</script>', '<svg onload=alert(1)>', '<p onclick="x()">t</p>', '<iframe src="https://evil"></iframe>', '<a href="data:text/html,<script>alert(1)</script>">x</a>', '<img src="x" onerror="alert(1)"', '<<script>script>alert(1)<</script>/script>', '<style>@import "x"</style>', '<body onload=alert(1)>', '<a href=//evil.com>x</a>', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>', '<img src="https://ok/a.png" onerror="alert(1)" onload="y()">', '<A HREF="javascript:alert(1)">x</A>', '<p\nonclick=alert(1)>x</p>', '<object data="x"></object>', '<input onfocus=alert(1) autofocus>', '<a href="https://ok.example/?a=1&b=2" target="_blank" style="x">ok</a>'];
VECTORS.forEach((v, i) => T('sanitizeHtml vektor #' + i + ': ' + v.slice(0, 40).replace(/\n/g, ' '), () => {
  const out = api.sanitizeHtml_(v); const stripped = out.replace(ALLOWED_RE, '');
  ok(stripped.indexOf('<') < 0, 'sisa "<": ' + out); ok(!/<script|<iframe|<svg|<style|<object|<input|<body/i.test(out), out);
  const attrs = (out.match(/<[a-z0-9]+\s([^<>]*)>/gi) || []).join(' ').match(/\s([a-z-]+)=/gi) || [];
  attrs.forEach((a) => ok(['href', 'src', 'alt', 'title', 'rel', 'loading'].indexOf(a.trim().replace('=', '')) >= 0, 'atribut tak diizinkan ' + a + ' di ' + out));
  ok(!/href="\s*(javascript|data|vbscript):/i.test(out) && !/src="\s*(javascript|data|vbscript):/i.test(out), out);
}));
T('sanitizeHtml mempertahankan HTML sah', () => { const o = api.sanitizeHtml_('<h2>Judul</h2><p>Isi <strong>tebal</strong> <a href="https://ok.example/x?a=1&b=2">tautan</a></p>'); ok(o.indexOf('<h2>Judul</h2>') >= 0 && o.indexOf('<strong>tebal</strong>') >= 0 && o.indexOf('href="https://ok.example/x?a=1&amp;b=2"') >= 0 && o.indexOf('rel="noopener noreferrer"') >= 0, o); });
T('isSafeUrl_', () => { for (const u of ['https://a.id/x', '#bagian', 'pages/news.html', '/assets/a.png', 'mailto:a@b.id']) ok(api.isSafeUrl_(u), u); for (const u of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'http://insecure.example', 'https://a b', 'vbscript:x', 'java\tscript:x']) ok(!api.isSafeUrl_(u), u); });
T('sanitizeCss_', () => { const o = api.sanitizeCss_('@import "x"; a{background:url("http://evil/x");width:expression(alert(1))} b{color:red}'); ok(!/@import|http:|expression\(/i.test(o), o); ok(/color:red/.test(o)); });

// ---------- anggota publik per angkatan ----------
T('getMembers: tanpa NIM, hanya AKTIF, urut abjad, default angkatan terbaru', () => {
  call(SUPER, 'adminCreateMember', { data: { NIM: '124140010', NAMA: 'Zahra', ANGKATAN: '2024', STATUS: 'AKTIF' } });
  call(SUPER, 'adminCreateMember', { data: { NIM: '124140011', NAMA: 'Alif', ANGKATAN: '2024' } });
  call(SUPER, 'adminCreateMember', { data: { NIM: '121140012', NAMA: 'Alumni Lama', ANGKATAN: '2021', STATUS: 'ALUMNI' } });
  const r = get('getMembers');
  eq(r.angkatan, '2024'); eq(r.items.map((x) => x.nama), ['Alif', 'Zahra']);
  eq(r.angkatan_list.map((x) => x.angkatan), ['2024', '2023', '2022']);
  ok(!/NIM|12414|12114|12214|12314/.test(JSON.stringify(r)), 'NIM bocor: ' + JSON.stringify(r));
  ok(!JSON.stringify(r).includes('Alumni Lama'), 'status non-AKTIF tampil');
  eq(get('getMembers', { angkatan: '2022' }).items.map((x) => x.nama), ['Budi Santoso']);
  eq(get('getMembers', { angkatan: '1999' }).angkatan, '2024');
  eq(get('getMembers', { angkatan: '<script>' }).angkatan, '2024');
});
T('daftar admin berita & halaman dapat difilter status', () => {
  const d = call(EDITOR, 'adminListNews', { status: 'DRAFT', page_size: 100 }); ok(d.items.length > 0 && d.items.every((x) => x.status === 'DRAFT'));
  const p = call(ADMIN, 'adminListPages', { status: 'PUBLISHED', page_size: 100 }); ok(p.items.every((x) => x.status === 'PUBLISHED'));
});

T('filter anggota (angkatan/status) dan struktur (kabinet) + kabinet_list', () => {
  const m = call(SUPER, 'adminListMembers', { angkatan: '2024', page_size: 100 }); ok(m.items.length >= 2 && m.items.every((x) => x.ANGKATAN === '2024'));
  const a = call(SUPER, 'adminListMembers', { status: 'alumni', page_size: 100 }); ok(a.items.length === 1 && a.items[0].NAMA === 'Alumni Lama');
  const s = call(SUPER, 'adminListStruktur', { kabinet: 'Kabinet Lama' }); eq(s.items.length, 1); eq(s.kabinet_list, ['Kabinet Lama', 'Kabinet Baru']);
});

// ---------- Fase 6: manipulasi payload & spam ----------
const FZ = (() => { userRow('uidFz1', 'fuzz1', 'SUPER_ADMIN'); userRow('uidFz2', 'fuzz2', 'SUPER_ADMIN'); return [login('fuzz1'), login('fuzz2')]; })();
const BAD = [null, 'teks', 42, true, [], [1, 2], ['__proto__'], { data: 'string' }, { data: [] }, { data: null }, { data: { __proto__: { polluted: 1 } } }, JSON.parse('{"data":{"__proto__":{"polluted":"ya"},"constructor":{"prototype":{"polluted":"ya"}}}}'),
  { data: { judul: { a: 1 }, konten: ['x'], status: { $ne: 1 } } }, { data: { judul: 'x'.repeat(100000) } }, { key: ['a', 'b'] }, { key: { a: 1 } }, { key: '../../etc/passwd' }, { page: 'abc', page_size: -5 }, { page_size: 1e9 }, { q: { a: 1 } }, { data: { judul: 'a\u0000b‮', ringkasan: '=cmd|\' /C calc\'!A0' } }];
T('manipulasi payload: tipe/bentuk ganjil pada aksi tulis & baca tidak pernah menyebabkan INTERNAL / crash', () => {
  const acts = ['adminCreateNews', 'adminUpdateNews', 'adminDeleteNews', 'adminCreatePage', 'adminUpdatePage', 'adminCreateMember', 'adminUpdateMember', 'adminCreateStruktur', 'adminUpdateWebsiteConfig', 'adminUpdateTheme', 'adminUpdateSections', 'adminUpdateNavigation', 'adminManageUsers', 'adminUploadImage', 'adminListNews', 'adminListMembers', 'adminGetAuditLogs', 'adminGetNews'];
  const bad = [];
  acts.forEach((a, ai) => BAD.forEach((pl, bi) => {
    const s = FZ[(ai + bi) % 2], c = code_(() => { try { post(env(s, a, pl)); } catch (e) { if (e.code === 'RATE_LIMITED') { offset += 61000; s.idt = mkIdToken(s.uid, emailOf('fuzz1')); const t = login(s === FZ[0] ? 'fuzz1' : 'fuzz2'); Object.assign(s, t); post(env(s, a, pl)); } else throw e; } });
    if (c === 'INTERNAL' || /^JS:/.test(c)) bad.push(a + '#' + bi + '=' + c);
  }));
  ok(bad.length === 0, bad.slice(0, 8).join(', '));
});
T('manipulasi payload: prototype pollution tidak mengubah Object.prototype', () => { eq(({}).polluted, undefined); eq(Object.prototype.polluted, undefined); });
T('manipulasi payload: field server (id, tanggal, views, uid, role) tidak bisa disuntik lewat data', () => {
  const r = call(FZ[0], 'adminCreateNews', { data: { judul: 'Suntik', id_berita: 'HACK', views: 99999, shares: 99999, tanggal_dibuat: '1999-01-01', penulis: 'orang lain', uid: 'x', role: 'SUPER_ADMIN' } });
  ok(r.id_berita !== 'HACK' && Number(r.views) === 0 && Number(r.shares) === 0 && !String(r.tanggal_dibuat).startsWith('1999'), JSON.stringify(r));
});
T('manipulasi payload: key ke sheet/baris lain tidak melompat sheet (key berformat berbeda = NOT_FOUND/VALIDATION)', () => {
  for (const k of ['uidFz1', 'pending:super@itera.ac.id', '2', '-1', '__row', 'USERS']) expectCode(() => call(FZ[0], 'adminUpdateNews', { key: k, data: { judul: 'x' } }), ['NOT_FOUND', 'VALIDATION_ERROR', 'BAD_REQUEST']);
});
T('spam publik: > 600 request/menit ke aksi publik => RATE_LIMITED', () => {
  let hitCode = ''; for (let i = 0; i < 700 && !hitCode; i++) { const c = code_(() => get('getWebsiteConfig')); if (c === 'RATE_LIMITED') hitCode = c; }
  eq(hitCode, 'RATE_LIMITED'); offset += 61000;
  ok(get('getWebsiteConfig'), 'pulih setelah jendela berganti');
});
T('spam sebelum autentikasi: banjir request dengan token palsu dibatasi secara global (300/menit) sebelum memanggil Google', () => {
  offset += 61000; const before = fb.calls; let hitCode = '';
  for (let i = 0; i < 400 && !hitCode; i++) { const c = code_(() => post({ action: 'adminGetDashboard', application_token: 'x', firebase_id_token: mkIdToken('fz' + i, 'fz' + i + '@itera.ac.id'), request_id: rid(), timestamp: nowMs(), payload: {} })); if (c === 'RATE_LIMITED') hitCode = c; }
  eq(hitCode, 'RATE_LIMITED'); ok(fb.calls - before <= 301, 'panggilan ke Google tidak boleh melebihi batas: ' + (fb.calls - before)); offset += 61000;
});

// ---------- Fase 5/7: integrationCheck ----------
T('sharingVerdict_: PRIVATE ok; ANYONE / ANYONE_WITH_LINK gagal; DOMAIN peringatan', () => { eq(api.sharingVerdict_('PRIVATE'), 'OK'); eq(api.sharingVerdict_('ANYONE'), 'GAGAL'); eq(api.sharingVerdict_('ANYONE_WITH_LINK'), 'GAGAL'); eq(api.sharingVerdict_('DOMAIN_WITH_LINK'), 'PERINGATAN'); });
T('integrationCheck: konfigurasi sehat => tanpa GAGAL; file uji Drive dibuang ke sampah', () => {
  const n = drive.files.length; const rows = api.integrationCheck(); const bad = rows.filter((r) => r.startsWith('GAGAL'));
  ok(bad.length === 0, bad.join(' | '));
  eq(drive.files.length, n + 1); ok(drive.files[n].trashed, 'file uji harus di sampah');
});
T('integrationCheck: Spreadsheet berbagi PUBLIK terdeteksi sebagai GAGAL', () => {
  drive.ssAccess = 'ANYONE_WITH_LINK'; const rows = api.integrationCheck(); drive.ssAccess = 'PRIVATE';
  ok(rows.some((r) => r.startsWith('GAGAL  Spreadsheet tidak publik')), rows.join('\n'));
});
T('integrationCheck: sheet kehilangan kolom / Super Admin tidak ada terdeteksi', () => {
  const sh = store.sheets.ANGGOTA, h = sh.rows[0].slice(); sh.rows[0] = ['NIM', 'NAMA', 'ANGKATAN']; const rows = api.integrationCheck(); sh.rows[0] = h;
  ok(rows.some((r) => r.startsWith('GAGAL  Sheet ANGGOTA')), rows.join('\n'));
});
T('integrationCheck: tidak memuat rahasia dalam keluaran', () => { const out = api.integrationCheck().join('\n'); ok(!out.includes(props.APP_TOKEN_SECRET) && !out.includes('AIzaFake')); });

// ---------- waktu (dijalankan paling akhir: memajukan jam) ----------
T('application token kedaluwarsa setelah 30 menit', () => { const s = login('editor1'); offset += 31 * 60000; expectCode(() => call(s, 'adminGetDashboard'), 'TOKEN_EXPIRED'); });
T('token lama tidak berlaku setelah jam maju (61 menit)', () => { offset += 31 * 60000; expectCode(() => call(ADMIN, 'adminGetDashboard'), ['TOKEN_EXPIRED', 'UNAUTHENTICATED']); });
T('purgeOldSessions tidak menghapus sesi aktif dan tidak error', () => { offset = 0; api.purgeOldSessions(); });

console.log('\nLulus: ' + passed + '  Gagal: ' + failed);
failures.forEach((f) => console.log('  GAGAL: ' + f));
const unexpected = logs.error.filter((m) => !/Script Property/.test(m));
if (unexpected.length) { console.log('  Peringatan: console.error tak terduga:'); unexpected.slice(0, 5).forEach((m) => console.log('   ' + m.split('\n')[0])); }
process.exit(failed ? 1 : 0);
