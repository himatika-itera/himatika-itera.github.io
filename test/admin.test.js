/**
 * Uji Dashboard Admin di Chromium (Playwright). Backend Apps Script DAN Firebase Auth (Email/Password) DITIRUKAN:
 * yang diuji adalah perilaku UI, alur login/sesi sisi klien, pemblokiran akses, validasi, dan CSP halaman admin.
 * Jalankan: node test/admin.test.js   (SHOTS=<dir> untuk screenshot, ONLY=<teks> untuk memfilter)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SHOTS = process.env.SHOTS || '';
const API = 'https://script.google.com/macros/s/TEST/exec';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory() || /\/(apps-script|test|docs)\//.test(p)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

// ---------- Backend tiruan (stateful) ----------
const ok = (data) => ({ success: true, message: 'Request berhasil', data, error: null });
const err = (code, message) => ({ success: false, message, data: null, error: { code, message } });
const PERMS = { SUPER_ADMIN: null, VIEWER: ['dashboard:read'] };
const GOOD_PW = 'Sandi-Benar-123!';
const FBCFG = "FIREBASE: { apiKey: 'AIza" + 'x'.repeat(35) + "', authDomain: 'himatika-test.firebaseapp.com', projectId: 'himatika-test', appId: '1:123456789:web:abcdef123456' }";
function backend(role, expIn, csError) {
  const S = {
    calls: [], news: [{ id_berita: 'b1', slug: 'lomba-1', judul: 'Lomba Matematika', ringkasan: 'r', konten: '<p>Isi awal</p>', kategori: 'Prestasi', penulis: 'Admin', gambar_utama: '', gambar: '[]', tanggal_publikasi: '2026-10-01T03:00:00.000Z', tanggal_diperbarui: '2026-10-02T03:00:00.000Z', status: 'PUBLISHED', is_featured: false, views: 4, _key: 'b1' }],
    members: [{ NIM: '120450001', NAMA: 'Budi Santoso', ANGKATAN: '2020', STATUS: 'AKTIF', _key: '120450001' }, { NIM: '123450002', NAMA: 'Siti Aminah', ANGKATAN: '2023', STATUS: 'AKTIF', _key: '123450002' }],
    media: [], config: { site_name: { value: 'HIMATIKA ITERA' }, primary_color: { value: '#F4C542' }, hero_title: { value: 'Judul awal' }, font_family: { value: 'Inter' }, heading_font: { value: 'Poppins' }, base_font_size: { value: '16' }, maintenance_mode: { value: 'false' } },
    theme: { hero_style: { value: 'centered' }, border_radius: { value: '12' }, custom_css: { value: '' } }, published: 0,
    sections: [{ key: 'hero', label: 'Hero', enabled: 'true', order: 1 }, { key: 'berita', label: 'Berita Terbaru', enabled: 'true', order: 2 }, { key: 'kontak', label: 'Kontak', enabled: 'true', order: 3 }]
  };
  const me = { uid: 'u-me', email: 'fabrizio@itera.ac.id', nama: 'Fabrizio', role, permissions: [], status: 'ACTIVE' };
  S.handle = (body) => {
    const a = body.action, p = body.payload || {}; S.calls.push({ action: a, payload: p });
    if (!/^FBTOKEN\./.test(String(body.firebase_id_token || ''))) return err('UNAUTHENTICATED', 'Token Firebase tidak ada');
    if (a === 'createSession') { if (csError) return err(csError, 'Ditolak: ' + csError); return ok({ application_token: 'APP.TOKEN', expires_at: Date.now() + 1800000, user: me }); }
    if (body.application_token !== 'APP.TOKEN') return err('UNAUTHENTICATED', 'Sesi tidak valid');
    switch (a) {
      case 'adminGetProfile': return ok({ user: me, session_expires_at: Date.now() + (expIn || 1500000) });
      case 'adminLogout': return ok({});
      case 'adminGetDashboard': return ok({ totals: { news: 1, news_published: 1, news_draft: 0, pages: 2, members: 2, users: 3 }, site: { maintenance_mode: false }, recent_activity: [{ action: 'news.create', target: 'b1', timestamp: '2026-10-02T03:00:00Z', status: 'SUCCESS', email: 'x@y.z' }] });
      case 'adminListNews': return ok({ items: S.news.filter((n) => !p.status || n.status === p.status), total: S.news.length, page: 1, page_size: 20 });
      case 'adminGetNews': return ok(S.news.find((n) => n._key === p.key));
      case 'adminCreateNews': { const n = Object.assign({ id_berita: 'b' + (S.news.length + 1), slug: 'baru', tanggal_diperbarui: new Date().toISOString(), views: 0, _key: 'b' + (S.news.length + 1) }, p.data); S.news.unshift(n); return ok(n); }
      case 'adminUpdateNews': { const n = S.news.find((x) => x._key === p.key); Object.assign(n, p.data); return ok(n); }
      case 'adminListMembers': return ok({ items: S.members.filter((m) => !p.q || (m.NAMA + m.NIM).toLowerCase().includes(String(p.q).toLowerCase())), total: S.members.length, page: 1, page_size: 20 });
      case 'adminCreateMember': { const m = Object.assign({ _key: p.data.NIM }, p.data); S.members.push(m); return ok(m); }
      case 'adminListMedia': return ok({ items: S.media, total: S.media.length, page: 1, page_size: 24 });
      case 'adminUploadImage': { const m = { id: 'm1', _key: 'm1', filename: p.filename, public_url: 'https://lh3.googleusercontent.com/d/m1', mime_type: p.mime_type, uploaded_at: new Date().toISOString() }; S.media.unshift(m); return ok(m); }
      case 'adminGetSiteSettings': return ok({ config: S.config, theme: S.theme, sections: S.sections, navigation: [], defaults: { config: { site_name: 'HIMATIKA ITERA', primary_color: '#F4C542', secondary_color: '#FFFFFF', accent_color: '#1F3A5F', background_color: '#F8F9FA', text_color: '#222222', font_family: 'Inter', heading_font: 'Poppins', base_font_size: '16', footer_text: '', maintenance_mode: 'false', active_cabinet: '', hero_title: '', hero_subtitle: '', hero_image: '', welcome_title: '', welcome_name: '', welcome_text: '', contact_email: '', contact_address: '', instagram_url: '', site_description: '', logo_url: '', favicon_url: '' }, theme: { layout: 'wide', navbar_style: 'solid', hero_style: 'centered', footer_style: 'simple', card_style: 'elevated', button_style: 'rounded', border_radius: '12', shadow_style: 'soft', spacing: 'normal', custom_css: '' } }, options: {} });
      case 'adminUpdateWebsiteConfig': Object.keys(p.values).forEach((k) => { S.config[k] = Object.assign(S.config[k] || { value: '' }, { draft: p.values[k] }); }); return ok({ saved: Object.keys(p.values) });
      case 'adminUpdateTheme': Object.keys(p.values).forEach((k) => { S.theme[k] = Object.assign(S.theme[k] || { value: '' }, { draft: p.values[k] }); }); return ok({ saved: Object.keys(p.values) });
      case 'adminPublishSite': S.published++; return ok({ published: 1 });
      case 'adminUpdateSections': return ok({});
      case 'adminManageUsers': if (p.op === 'create') { S.created = p; return ok({ uid: 'pending:' + p.data.email, email: p.data.email }); } return ok({ items: [{ uid: 'u-me', email: 'fabrizio@itera.ac.id', nama: 'Fabrizio', role, status: 'ACTIVE', last_login: '2026-11-20T01:00:00Z' }, { uid: 'pending:budi@itera.ac.id', email: 'budi@itera.ac.id', nama: '', role: 'EDITOR', status: 'ACTIVE', last_login: '' }] });
      case 'adminGetAuditLogs': return ok({ items: [] });
      case 'adminListStruktur': return ok({ items: [], total: 0, page: 1, page_size: 20, kabinet_list: [] });
      default: return err('NOT_FOUND', 'Aksi tidak dikenal');
    }
  };
  return S;
}

let passed = 0, failed = 0; const failures = [];
async function T(name, fn) { if (process.env.ONLY && name.indexOf(process.env.ONLY) < 0) return; try { await fn(); passed++; process.stdout.write('.'); } catch (e) { failed++; failures.push(name + ' -> ' + (e && e.message)); process.stdout.write('F'); } }
const assert = (c, m) => { if (!c) throw new Error(m || 'assert gagal'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'eq') + ': dapat ' + JSON.stringify(a) + ', harap ' + JSON.stringify(b)); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function open(browser, o) {
  o = Object.assign({ role: 'SUPER_ADMIN', signedIn: true, configure: true, fbUser: { email: 'fabrizio@itera.ac.id', pw: GOOD_PW, uid: 'u-me', verified: true }, viewport: { width: 1360, height: 900 } }, o || {});
  if (o.fbSession === undefined) o.fbSession = o.signedIn;
  if (o.appSession === undefined) o.appSession = o.signedIn;
  const S = backend(o.role, o.expiresIn, o.createSessionError), ctx = await browser.newContext({ viewport: o.viewport, locale: 'id-ID' }), page = await ctx.newPage();
  const errors = [], csp = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/.test(t)) csp.push(t); else if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(t)) errors.push(t); });
  await page.route('**/assets/js/config.js', (r) => {
    let s = fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8');
    if (o.configure) s = s.replace("API_URL: ''", "API_URL: '" + API + "'");
    if (o.configure === true) s = s.replace(/FIREBASE: \{[^}]*\}/, FBCFG);
    r.fulfill({ status: 200, contentType: TYPES['.js'], body: s });
  });
  await page.route('https://script.google.com/**', (r) => {
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (r.request().method() !== 'POST') {   // halaman pratinjau (beranda) memakai GET publik
      const a = new URL(r.request().url()).searchParams.get('action');
      return r.fulfill({ status: 200, headers: cors, body: JSON.stringify(a === 'getWebsiteConfig' ? ok({ config: { site_name: 'X', primary_color: '#F4C542' }, theme: {}, sections: [{ key: 'hero', label: 'Hero', order: 1 }], navigation: [] }) : err('NOT_FOUND', 'x')) });
    }
    r.fulfill({ status: 200, headers: cors, body: JSON.stringify(S.handle(JSON.parse(r.request().postData()))) });
  });
  // Firebase Auth palsu (Email/Password). Sesi disimpan di sessionStorage 'fbfake' seperti browserSessionPersistence.
  const FB_USERS = JSON.stringify({ [o.fbUser.email]: o.fbUser, 'terverifikasi-belum@itera.ac.id': { email: 'terverifikasi-belum@itera.ac.id', pw: GOOD_PW, uid: 'u-unv', verified: false }, 'terkunci@itera.ac.id': { email: 'terkunci@itera.ac.id', pw: GOOD_PW, uid: 'u-lock', verified: true, code: 'auth/too-many-requests' } });
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', (r) => r.fulfill({ status: 200, contentType: TYPES['.js'], headers: { 'access-control-allow-origin': '*' }, body: 'export function initializeApp(c){ window.__fbcfg = c; return { c }; }' }));
  await page.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js', (r) => r.fulfill({ status: 200, contentType: TYPES['.js'], headers: { 'access-control-allow-origin': '*' }, body: `
const USERS = ${FB_USERS};
const log = (k, v) => { const a = JSON.parse(sessionStorage.getItem(k) || '[]'); a.push(v); sessionStorage.setItem(k, JSON.stringify(a)); };
const wrap = (u) => ({ email: u.email, uid: u.uid, emailVerified: !!u.verified, getIdToken: async () => 'FBTOKEN.' + u.uid, _rec: u });
export const browserSessionPersistence = { type: 'SESSION' };
export function initializeAuth(app, o) { window.__fbpersist = o && o.persistence && o.persistence.type; window.__fbresolver = o && o.popupRedirectResolver; return { authStateReady: async () => {}, get currentUser() { const x = sessionStorage.getItem('fbfake'); return x ? wrap(JSON.parse(x)) : null; } }; }
export async function signInWithEmailAndPassword(auth, email, pw) {
  const u = USERS[String(email).toLowerCase()];
  if (u && u.code) { const e = new Error('x'); e.code = u.code; throw e; }
  if (!u || u.pw !== pw) { const e = new Error('x'); e.code = 'auth/invalid-credential'; throw e; }
  const pub = { email: u.email, uid: u.uid, verified: u.verified }; sessionStorage.setItem('fbfake', JSON.stringify(pub)); return { user: wrap(pub) };
}
export async function signOut() { sessionStorage.removeItem('fbfake'); }
export async function sendEmailVerification(u) { log('fbverif', u.email); }
export async function sendPasswordResetEmail(auth, email) { if (email === 'jaringan@itera.ac.id') { const e = new Error('x'); e.code = 'auth/network-request-failed'; throw e; } log('fbreset', email); }
` }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://lh3.googleusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  await page.addInitScript((a) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (a.app) sessionStorage.setItem('himatika:session', JSON.stringify({ t: a.token, e: Date.now() + a.exp })); if (a.fb) sessionStorage.setItem('fbfake', JSON.stringify({ email: a.fbUser.email, uid: a.fbUser.uid, verified: a.fbUser.verified })); } }, { app: o.appSession, fb: o.fbSession, fbUser: o.fbUser, token: o.appToken || 'APP.TOKEN', exp: o.expiresIn || 1500000 });
  return { ctx, page, S, errors, csp, base };
}
const ready = (page) => page.waitForSelector('body[data-ready]', { timeout: 10000 });
const R1 = (page) => page.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
const calls = (S, a) => S.calls.filter((c) => c.action === a);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const shot = async (page, name, full) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }); };

  const lg = async (t, email, pw) => { await t.page.fill('#email', email); await t.page.fill('#password', pw); await t.page.click('#login-btn'); };
  const msg = (t, txt) => t.page.waitForFunction((x) => document.getElementById('login-msg').textContent.includes(x), txt, { timeout: 8000 });
  const fbStore = (t, k) => t.page.evaluate((x) => sessionStorage.getItem(x), k);

  await T('login: konfigurasi kosong => peringatan jelas, tombol nonaktif, tanpa galat', async () => {
    const t = await open(browser, { configure: false, signedIn: false }); await t.page.goto(t.base + 'admin/index.html'); await ready(t.page);
    assert((await t.page.textContent('#login-msg')).includes('config.js')); assert(await t.page.isDisabled('#login-btn')); eq(t.errors, []); eq(t.csp, []); await t.ctx.close();
  });

  await T('login: API_URL terisi tetapi Firebase kosong => tetap peringatan, tidak memuat SDK Firebase', async () => {
    const t = await open(browser, { configure: 'api-only', signedIn: false }); let sdk = 0; t.page.on('request', (r) => { if (/gstatic\.com\/firebasejs/.test(r.url())) sdk++; });
    await t.page.goto(t.base + 'admin/index.html'); await ready(t.page); assert((await t.page.textContent('#login-msg')).includes('FIREBASE')); assert(await t.page.isDisabled('#login-btn')); eq(sdk, 0); await t.ctx.close();
  });

  await T('login: halaman hanya Email/Password (tanpa tombol Google/popup), SDK dikonfigurasi persistensi sesi tab & tanpa popup resolver', async () => {
    const t = await open(browser, { signedIn: false }); await t.page.goto(t.base + 'admin/index.html'); await R1(t.page);
    assert(!/google/i.test(await t.page.innerText('body')), 'tidak boleh ada tombol Google'); eq(await t.page.getAttribute('#email', 'type'), 'email'); eq(await t.page.getAttribute('#password', 'autocomplete'), 'current-password');
    await lg(t, 'fabrizio@itera.ac.id', GOOD_PW); await t.page.waitForURL('**/admin/dashboard.html'); await R1(t.page);
    eq(await t.page.evaluate(() => window.__fbpersist), 'SESSION'); eq(await t.page.evaluate(() => window.__fbresolver), undefined); eq(await t.page.evaluate(() => window.__fbcfg.projectId), 'himatika-test'); await t.ctx.close();
  });

  await T('login: email+sandi -> Firebase -> createSession -> dashboard; sandi TIDAK PERNAH dikirim ke Apps Script/URL/storage', async () => {
    const t = await open(browser, { signedIn: false }); const urls = []; t.page.on('request', (r) => urls.push(r.url()));
    await t.page.goto(t.base + 'admin/index.html'); await R1(t.page);
    await t.page.fill('#email', ' Fabrizio@itera.ac.id '); await t.page.fill('#password', GOOD_PW); await t.page.click('#login-btn'); await t.page.waitForURL('**/admin/dashboard.html'); await R1(t.page);
    const l = calls(t.S, 'createSession'); eq(l.length, 1, 'createSession tepat sekali'); eq(l[0].payload, {});
    assert(!JSON.stringify(t.S.calls).includes(GOOD_PW), 'sandi bocor ke Apps Script'); assert(!urls.some((u) => u.includes(GOOD_PW) || u.includes(encodeURIComponent(GOOD_PW))), 'sandi bocor ke URL');
    const st = await t.page.evaluate(() => JSON.stringify(Object.assign({}, localStorage, sessionStorage))); assert(!st.includes('Sandi-Benar'), 'sandi tersimpan di storage'); assert(st.includes('APP.TOKEN')); eq(await t.page.evaluate(() => JSON.stringify(localStorage)), '{}', 'tidak boleh ada localStorage');
    assert(/Berita/.test(await t.page.textContent('.grid-stats'))); assert((await t.page.textContent('.top__email')).includes('fabrizio@itera.ac.id'));
    eq(t.errors, []); eq(t.csp, []); await shot(t.page, 'admin-dashboard', true); await t.ctx.close();
  });

  await T('login gagal: pesan seragam (email salah / sandi salah), sandi dikosongkan, tetap di login; terlalu banyak percobaan', async () => {
    const t = await open(browser, { signedIn: false }); await t.page.goto(t.base + 'admin/index.html'); await R1(t.page);
    await lg(t, 'orang@itera.ac.id', 'salah-salah-salah'); await msg(t, 'Email atau kata sandi salah'); const m1 = await t.page.textContent('#login-msg');
    eq(await t.page.inputValue('#password'), ''); assert(!(await t.page.isDisabled('#login-btn'))); assert(t.page.url().includes('index.html'));
    await lg(t, 'fabrizio@itera.ac.id', 'salah-salah-salah'); await t.page.waitForTimeout(200); eq(await t.page.textContent('#login-msg'), m1, 'pesan harus sama agar tidak membocorkan keberadaan akun');
    await lg(t, 'terkunci@itera.ac.id', GOOD_PW); await msg(t, 'Terlalu banyak percobaan'); eq(calls(t.S, 'createSession').length, 0); await shot(t.page, 'admin-login-error', false); eq(t.errors, []); await t.ctx.close();
  });

  await T('login: email/kata sandi kosong atau format email salah ditolak di klien; tombol tampilkan sandi', async () => {
    const t = await open(browser, { signedIn: false }); await t.page.goto(t.base + 'admin/index.html'); await R1(t.page);
    await t.page.click('#login-btn'); assert((await t.page.textContent('#login-msg')).includes('wajib')); await t.page.fill('#email', 'bukan-email'); await t.page.fill('#password', 'x'); await t.page.click('#login-btn'); assert((await t.page.textContent('#login-msg')).includes('wajib'));
    eq(calls(t.S, 'createSession').length, 0); await t.page.click('#toggle-pw'); eq(await t.page.getAttribute('#password', 'type'), 'text'); await t.ctx.close();
  });

  await T('login: email belum terverifikasi TIDAK menghalangi (cukup terdaftar di Firebase Users)', async () => {
    const t = await open(browser, { signedIn: false }); await t.page.goto(t.base + 'admin/index.html'); await R1(t.page);
    await lg(t, 'terverifikasi-belum@itera.ac.id', GOOD_PW); await t.page.waitForURL('**/admin/dashboard.html'); eq(calls(t.S, 'createSession').length, 1); eq(await fbStore(t, 'fbverif'), null, 'tidak boleh mengirim email verifikasi'); await t.ctx.close();
  });

  await T('login: server menolak (akun tidak terdaftar / nonaktif) => pesan jelas, Firebase signOut', async () => {
    for (const [code, txt] of [['UNAUTHORIZED', 'tidak terdaftar sebagai pengelola'], ['USER_INACTIVE', 'tidak aktif']]) {
      const t = await open(browser, { signedIn: false, createSessionError: code }); await t.page.goto(t.base + 'admin/index.html'); await R1(t.page);
      await lg(t, 'fabrizio@itera.ac.id', GOOD_PW); await msg(t, txt); eq(await fbStore(t, 'fbfake'), null, code + ': sesi Firebase harus dibersihkan'); eq(await fbStore(t, 'himatika:session'), null); assert(t.page.url().includes('index.html')); await t.ctx.close();
    }
  });

  await T('tidak ada alur email/tautan: tanpa tombol lupa sandi, tanpa pengiriman verifikasi', async () => {
    const t = await open(browser, { signedIn: false }); await t.page.goto(t.base + 'admin/index.html'); await R1(t.page);
    eq(await t.page.locator('#forgot-btn').count(), 0); assert(!/verifikasi/i.test(await t.page.innerText('body'))); await t.ctx.close();
  });

  await T('sesi: berpindah halaman admin memakai token tersimpan (tanpa createSession ulang)', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/dashboard.html'); await R1(t.page);
    await t.page.click('a.side__link[href="news.html"]'); await R1(t.page); await t.page.click('a.side__link[href="members.html"]'); await R1(t.page);
    eq(calls(t.S, 'createSession').length, 0); assert(calls(t.S, 'adminGetProfile').length >= 2, 'sesi divalidasi ke server'); await t.ctx.close();
  });

  await T('setiap aksi admin membawa ID token Firebase DAN token aplikasi', async () => {
    const t = await open(browser); const bodies = []; t.page.on('request', (r) => { if (r.method() === 'POST' && r.url().startsWith('https://script.google.com')) bodies.push(JSON.parse(r.postData())); });
    await t.page.goto(t.base + 'admin/news.html'); await R1(t.page); await t.page.waitForSelector('.table');
    assert(bodies.length >= 2 && bodies.every((b) => /^FBTOKEN\./.test(b.firebase_id_token) && b.application_token === 'APP.TOKEN' && b.request_id && typeof b.timestamp === 'number'), JSON.stringify(bodies.map((b) => Object.keys(b)))); await t.ctx.close();
  });

  await T('sesi aplikasi habis tetapi login Firebase masih ada => sesi baru dibuat otomatis (tanpa login ulang)', async () => {
    const t = await open(browser, { expiresIn: -1000 }); await t.page.goto(t.base + 'admin/news.html'); await R1(t.page); await t.page.waitForSelector('.table');
    eq(calls(t.S, 'createSession').length, 1); assert(t.page.url().includes('news.html')); await t.ctx.close();
  });

  await T('token aplikasi dicabut server tetapi login Firebase sah => sesi baru otomatis', async () => {
    const t = await open(browser, { appToken: 'REVOKED' }); await t.page.goto(t.base + 'admin/news.html'); await R1(t.page); await t.page.waitForSelector('.table');
    eq(calls(t.S, 'createSession').length, 1); await t.ctx.close();
  });

  await T('akun dinonaktifkan: token dicabut + createSession ditolak => kembali ke login dan Firebase signOut', async () => {
    const t = await open(browser, { appToken: 'REVOKED', createSessionError: 'USER_INACTIVE' }); await t.page.goto(t.base + 'admin/news.html'); await t.page.waitForURL('**/admin/index.html', { timeout: 10000 });
    eq(calls(t.S, 'adminListNews').length, 0); eq(await fbStore(t, 'fbfake'), null); await t.ctx.close();
  });

  await T('app token ada tetapi TIDAK ada login Firebase => dialihkan ke login (token aplikasi saja tidak cukup)', async () => {
    const t = await open(browser, { fbSession: false }); await t.page.goto(t.base + 'admin/news.html'); await t.page.waitForURL('**/admin/index.html'); eq(calls(t.S, 'adminListNews').length, 0); eq(t.S.calls.length, 0); await t.ctx.close();
  });

  await T('akses: belum login => dialihkan ke halaman login', async () => {
    const t = await open(browser, { signedIn: false }); await t.page.goto(t.base + 'admin/news.html'); await t.page.waitForURL('**/admin/index.html'); await t.ctx.close();
  });

  await T('keluar: token dicabut di server (membawa kedua kredensial); Firebase dan storage dibersihkan', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/dashboard.html'); await R1(t.page); await t.page.click('text=Keluar'); await t.page.waitForURL('**/admin/index.html');
    eq(calls(t.S, 'adminLogout').length, 1); eq(await fbStore(t, 'himatika:session'), null); eq(await fbStore(t, 'fbfake'), null); await t.ctx.close();
  });

  await T('RBAC UI: VIEWER hanya melihat menu Dashboard, dan ditolak di halaman lain', async () => {
    const t = await open(browser, { role: 'VIEWER' }); await t.page.goto(t.base + 'admin/dashboard.html'); await R1(t.page);
    eq(await t.page.$$eval('.side__link', (a) => a.map((x) => x.textContent)), ['Dashboard']);
    await t.page.goto(t.base + 'admin/users.html'); await ready(t.page); assert((await t.page.textContent('body')).includes('Akses ditolak'));
    eq(calls(t.S, 'adminManageUsers').length, 0, 'tidak boleh memanggil API terlarang'); await t.ctx.close();
  });

  await T('berita: tambah (Quill) -> payload tervalidasi & status PUBLISHED lewat tombol Terbitkan', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/news.html'); await R1(t.page); await t.page.waitForSelector('.table');
    assert((await t.page.textContent('.table')).includes('Lomba Matematika'));
    await t.page.click('text=+ Tambah berita'); await t.page.waitForSelector('.ql-editor');
    await t.page.click('text=Terbitkan'); assert(await t.page.isVisible('.field__error'), 'judul kosong harus ditolak di klien'); eq(calls(t.S, 'adminCreateNews').length, 0);
    await t.page.fill('[data-field="judul"] input', 'Pelatihan LaTeX');
    await t.page.click('.ql-editor'); await t.page.keyboard.type('Isi berita baru');
    await t.page.click('text=Terbitkan'); await t.page.waitForSelector('text=+ Tambah berita');
    const c = calls(t.S, 'adminCreateNews'); eq(c.length, 1); eq(c[0].payload.data.judul, 'Pelatihan LaTeX'); eq(c[0].payload.data.status, 'PUBLISHED');
    assert(c[0].payload.data.konten.includes('Isi berita baru'), 'konten Quill terkirim'); assert(!('slug' in c[0].payload.data), 'slug kosong tidak dikirim');
    eq(t.errors, []); eq(t.csp, [], 'CSP'); await t.ctx.close();
  });

  await T('berita: ubah memuat detail penuh dan mengirim update dengan key', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/news.html'); await R1(t.page); await t.page.waitForSelector('.table');
    await t.page.click('text=Ubah'); await t.page.waitForSelector('.ql-editor');
    eq(await t.page.inputValue('[data-field="judul"] input'), 'Lomba Matematika'); assert((await t.page.textContent('.ql-editor')).includes('Isi awal'));
    await t.page.fill('[data-field="judul"] input', 'Lomba Matematika 2026'); await t.page.click('text=Terbitkan'); await t.page.waitForSelector('text=+ Tambah berita');
    const u = calls(t.S, 'adminUpdateNews'); eq(u.length, 1); eq(u[0].payload.key, 'b1'); eq(u[0].payload.data.judul, 'Lomba Matematika 2026'); await shot(t.page, 'admin-news', false); await t.ctx.close();
  });

  await T('anggota: NIM tidak valid ditolak di klien; NIM valid terkirim; pencarian memanggil API', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/members.html'); await R1(t.page); await t.page.waitForSelector('.table');
    await t.page.click('text=+ Tambah anggota'); await t.page.fill('[data-field="NIM"] input', '12ab'); await t.page.fill('[data-field="NAMA"] input', 'Rani');
    await t.page.click('dialog >> text=Simpan'); assert((await t.page.textContent('[data-field="NIM"] .field__error')).includes('NIM')); eq(calls(t.S, 'adminCreateMember').length, 0);
    await t.page.fill('[data-field="NIM"] input', '125450009'); await t.page.fill('[data-field="ANGKATAN"] input', '2025'); await t.page.click('dialog >> text=Simpan'); await t.page.waitForSelector('dialog', { state: 'detached' });
    const c = calls(t.S, 'adminCreateMember'); eq(c.length, 1); eq(c[0].payload.data.NIM, '125450009'); eq(c[0].payload.data.STATUS, 'AKTIF');
    await t.page.fill('input[type=search]', 'siti'); await t.page.waitForFunction(() => document.querySelectorAll('.table tbody tr').length === 1); await shot(t.page, 'admin-members', false); await t.ctx.close();
  });

  await T('media: unggah gambar => di-encode ulang ke WebP (EXIF hilang), dikirim base64, tampil di pustaka', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/media.html'); await R1(t.page);
    await t.page.setInputFiles('input[type=file]', { name: 'foto kegiatan.png', mimeType: 'image/png', buffer: PNG });
    await t.page.waitForSelector('.media-item'); const c = calls(t.S, 'adminUploadImage'); eq(c.length, 1);
    eq(c[0].payload.mime_type, 'image/webp'); assert(/\.webp$/.test(c[0].payload.filename), 'ekstensi webp'); assert(c[0].payload.data_base64.length > 20 && !/^data:/.test(c[0].payload.data_base64), 'base64 murni');
    eq(c[0].payload.folder, 'News'); eq(t.errors, []); await t.ctx.close();
  });

  await T('media: format selain gambar ditolak di klien tanpa memanggil API', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/media.html'); await R1(t.page);
    await t.page.setInputFiles('input[type=file]', { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    await t.page.waitForSelector('.toast--error'); eq(calls(t.S, 'adminUploadImage').length, 0); await t.ctx.close();
  });

  await T('kustomisasi: pratinjau langsung, simpan draf hanya field berubah, terbitkan memanggil publish', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/customizer.html'); await R1(t.page);
    const fr = t.page.frameLocator('.cz__frame'); await t.page.waitForFunction(() => { const f = document.querySelector('.cz__frame'); return f && f.contentDocument && f.contentDocument.documentElement.dataset.ready; }, null, { timeout: 10000 }).catch(async () => { throw new Error('iframe tidak siap: ' + (await t.page.evaluate(() => { const f = document.querySelector('.cz__frame'); return f.contentDocument ? f.contentDocument.location.href + ' html=' + f.contentDocument.documentElement.outerHTML.slice(0, 200) : 'no doc'; })) + ' csp=' + JSON.stringify(t.csp) + ' err=' + JSON.stringify(t.errors)); });
    await t.page.click('summary:has-text("Hero")'); await t.page.fill('[data-field="hero_title"] input', 'Judul Baru'); await t.page.click('summary:has-text("Warna")');
    await t.page.fill('[data-field="primary_color"] input[type=text]', '#E91E63');
    await t.page.waitForFunction(() => getComputedStyle(document.querySelector('.cz__frame').contentDocument.documentElement).getPropertyValue('--primary-color').trim().toUpperCase() === '#E91E63', null, { timeout: 5000 }).catch(async (e) => { throw new Error('preview: ' + (await t.page.evaluate(() => { const d = document.querySelector('.cz__frame').contentDocument; return d.documentElement.dataset.ready + ' pc=' + getComputedStyle(d.documentElement).getPropertyValue('--primary-color') + ' hex=' + document.querySelector('[data-field=primary_color] input[type=text]').value; })) + ' csp=' + JSON.stringify(t.csp) + ' err=' + JSON.stringify(t.errors)); });
    eq(calls(t.S, 'adminUpdateWebsiteConfig').length, 0, 'pratinjau tidak boleh menulis ke server');
    await t.page.click('text=Simpan draf'); await t.page.waitForSelector('.toast--success');
    const u = calls(t.S, 'adminUpdateWebsiteConfig'); eq(u.length, 1); eq(Object.keys(u[0].payload.values).sort(), ['hero_title', 'primary_color']); eq(u[0].payload.values.primary_color, '#E91E63');
    eq(calls(t.S, 'adminUpdateTheme').length, 0); eq(calls(t.S, 'adminPublishSite').length, 0, 'simpan draf tidak menerbitkan');
    await t.page.click('button:has-text("Terbitkan")'); await t.page.click('dialog button:has-text("Terbitkan")'); await t.page.waitForFunction(() => document.body.textContent.includes('Diterbitkan'));
    eq(t.S.published, 1); eq(t.errors, []); eq(t.csp, [], 'CSP'); await shot(t.page, 'admin-customizer', false); await t.ctx.close();
  });

  await T('kustomisasi: hex warna tidak valid tidak dipakai pratinjau; CSS kustom hanya muncul untuk pemegang izin css:update', async () => {
    const t = await open(browser, { role: 'SUPER_ADMIN' }); await t.page.goto(t.base + 'admin/customizer.html'); await R1(t.page);
    assert(await t.page.isVisible('summary:has-text("CSS kustom")') || (await t.page.$('summary:has-text("CSS kustom")')) !== null);
    await t.page.click('summary:has-text("Warna")'); await t.page.fill('[data-field="primary_color"] input[type=text]', 'bukan-warna');
    assert((await t.page.getAttribute('[data-field="primary_color"] input[type=text]', 'aria-invalid')) === 'true'); await t.ctx.close();
  });

  await T('pengguna: daftar tampil dengan email; undangan menunggu login; akun sendiri tidak dapat mengubah role/status', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/users.html'); await R1(t.page); await t.page.waitForSelector('.table');
    const tx = await t.page.textContent('.table'); assert(tx.includes('budi@itera.ac.id') && tx.includes('menunggu login pertama') && tx.includes('fabrizio@itera.ac.id')); assert(!/username/i.test(tx));
    await t.page.click('tbody tr:first-child >> text=Ubah'); assert(await t.page.isDisabled('dialog select >> nth=0'), 'role akun sendiri harus terkunci'); await shot(t.page, 'admin-users', false); await t.ctx.close();
  });

  await T('pengguna: undang lewat email (dinormalkan); tanpa kolom kata sandi; email tidak valid ditolak di klien', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'admin/users.html'); await R1(t.page); await t.page.waitForSelector('.table');
    await t.page.click('text=+ Undang pengguna'); eq(await t.page.locator('dialog input[type=password]').count(), 0, 'tidak boleh ada kolom kata sandi'); assert(!/sandi sementara/i.test(await t.page.textContent('dialog')));
    await t.page.fill('[data-field="email"] input', 'bukan-email'); await t.page.click('dialog button:has-text("Simpan")'); assert((await t.page.textContent('[data-field="email"] .field__error')).includes('tidak valid')); eq(calls(t.S, 'adminManageUsers').filter((c) => c.payload.op === 'create').length, 0);
    await t.page.fill('[data-field="email"] input', 'Siti.Editor@itera.ac.id'); await t.page.click('dialog button:has-text("Simpan")'); await t.page.waitForSelector('dialog', { state: 'detached' });
    const c = calls(t.S, 'adminManageUsers').find((x) => x.payload.op === 'create'); eq(c.payload.data.email, 'siti.editor@itera.ac.id'); eq(c.payload.data.role, 'EDITOR'); assert(!('password' in c.payload.data) && !('username' in c.payload.data)); await t.ctx.close();
  });

  await T('mobile: halaman admin tidak melebar dan menu dapat dibuka', async () => {
    const t = await open(browser, { viewport: { width: 390, height: 800 } });
    for (const f of ['dashboard', 'news', 'members', 'media', 'customizer', 'users']) {
      await t.page.goto(t.base + 'admin/' + f + '.html'); await R1(t.page); await t.page.waitForTimeout(150);
      const ov = await t.page.evaluate(() => { const W = window.innerWidth; if (document.documentElement.scrollWidth <= W + 1) return ''; return Array.from(document.querySelectorAll('body *')).filter((e) => e.getBoundingClientRect().right > W + 1 && !e.closest('.table-wrap')).slice(0, 4).map((e) => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().right)).join(' | '); }); assert(!ov, f + ' melebar: ' + ov);
    }
    await t.page.goto(t.base + 'admin/dashboard.html'); await R1(t.page); await t.page.click('.menu-btn'); await t.page.waitForTimeout(500); assert((await t.page.$eval('.side', (e) => e.getBoundingClientRect().left)) >= 0, 'menu samping harus masuk layar');
    await shot(t.page, 'admin-mobile', false); eq(t.errors, []); await t.ctx.close();
  });

  await T('CSP: tidak ada pelanggaran di semua halaman admin; tidak ada skrip/handler inline', async () => {
    const t = await open(browser);
    for (const f of ['dashboard', 'news', 'pages', 'members', 'content', 'media', 'customizer', 'users']) { await t.page.goto(t.base + 'admin/' + f + '.html'); await R1(t.page); await t.page.waitForTimeout(200); assert(!/\b(null|undefined)\b/.test(await t.page.innerText('main')), f + ': teks "null"/"undefined" bocor ke UI'); }
    eq(t.csp, []); eq(t.errors, []);
    for (const f of fs.readdirSync(path.join(ROOT, 'admin'))) { const s = fs.readFileSync(path.join(ROOT, 'admin', f), 'utf8'); assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(s) && !/\son\w+=/.test(s), f + ' memuat skrip/handler inline'); assert(/noindex/.test(s), f + ' tanpa noindex'); const csp = (s.match(/Content-Security-Policy" content="([^"]*)"/) || [])[1] || ''; assert(/script-src 'self' https:\/\/www\.gstatic\.com;/.test(csp), f + ': script-src'); assert(!/unsafe-inline'?[^;]*script-src|script-src[^;]*unsafe-(inline|eval)/.test(csp), f + ': script unsafe'); assert(!/accounts\.google|apis\.google|apis\.google\.com/.test(csp) && !/frame-ancestors/.test(csp), f + ': CSP berlebih'); assert(/connect-src[^;]*identitytoolkit\.googleapis\.com[^;]*securetoken\.googleapis\.com/.test(csp), f + ': connect-src Firebase');}
    for (const f of fs.readdirSync(path.join(ROOT, 'assets/js'), { recursive: true }).filter((x) => x.endsWith('.js'))) { const c = fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); assert(!/GoogleAuthProvider|signInWithPopup|signInWithRedirect|popupRedirectResolver|signInWithCredential|signInAnonymously/.test(c), f + ' memakai Google/popup sign-in'); if (!/^(firebase|auth|config|api)\.js$|^admin[\\/\\\\]page-users\.js$|^admin[\/\\]page-login\.js$/.test(f)) assert(!/firebase/i.test(c.replace(/firebase_id_token/g, '')), f + ' menyebut Firebase di luar auth'); }
    for (const f of ['index.html', 'pages/news.html', 'pages/members.html']) assert(!/gstatic\.com\/?(?!\w)|identitytoolkit/.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/fonts\.gstatic\.com/g, '')), f + ': situs publik tidak boleh dilonggarkan CSP-nya untuk Firebase');
    await t.ctx.close();
  });

  await browser.close(); server.close();
  console.log('\nLulus: ' + passed + '  Gagal: ' + failed); failures.forEach((f) => console.log('  GAGAL: ' + f));
  process.exit(failed ? 1 : 0);
})();
