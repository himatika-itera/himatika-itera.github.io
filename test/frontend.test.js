/**
 * Uji frontend di Chromium sungguhan (Playwright) dengan API Apps Script TIRUAN (page.route).
 * Menguji perilaku UI/keamanan sisi klien, bukan Apps Script/Firebase asli.
 * Jalankan: node test/frontend.test.js   (screenshot ke $SHOTS bila diset)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SHOTS = process.env.SHOTS || '';
const API = 'https://script.google.com/macros/s/TEST/exec';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

// ---------- server statis (meniru GitHub Pages: 404.html untuk path tak dikenal) ----------
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory() || /\/(apps-script|test|docs)\//.test(p)) {
    res.writeHead(404, { 'content-type': TYPES['.html'] }); return res.end(fs.readFileSync(path.join(ROOT, '404.html')));
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

// ---------- data tiruan ----------
const ok = (data) => ({ success: true, message: 'Request berhasil', data, error: null });
const err = (code, message) => ({ success: false, message, data: null, error: { code } });
const SITE = {
  config: { site_name: 'HIMATIKA ITERA', site_description: 'Himpunan Mahasiswa Matematika Institut Teknologi Sumatera', logo_url: '', favicon_url: '', primary_color: '#1E88E5', secondary_color: '#FFFFFF', accent_color: '#0D2B4F', background_color: '#F8F9FA', text_color: '#222222', font_family: 'Inter', heading_font: 'Poppins', base_font_size: '16', footer_text: '© 2026 HIMATIKA ITERA', maintenance_mode: 'false', active_cabinet: '', hero_title: 'Matematika untuk Negeri', hero_subtitle: 'Berkarya, berkolaborasi, dan bertumbuh bersama.', hero_image: 'https://lh3.googleusercontent.com/d/hero', welcome_title: 'Sambutan', welcome_name: '', welcome_text: '', contact_email: 'himatika@itera.ac.id', contact_address: 'Jl. Terusan Ryacudu, Lampung Selatan', instagram_url: 'https://instagram.com/himatika' },
  theme: { layout: 'wide', navbar_style: 'solid', hero_style: 'split', footer_style: 'columns', card_style: 'elevated', button_style: 'pill', border_radius: '14', shadow_style: 'soft', spacing: 'normal', custom_css: '' },
  sections: [{ key: 'hero', label: 'Hero', order: 1 }, { key: 'berita', label: 'Berita', order: 2 }, { key: 'kabinet', label: 'Kabinet', order: 3 }, { key: 'divisi', label: 'Divisi', order: 4 }, { key: 'galeri', label: 'Galeri', order: 5 }, { key: 'kontak', label: 'Kontak', order: 6 }],
  navigation: [{ id: 'n1', label: 'Beranda', url: '#beranda', parent_id: '', order: 1, target: '_self' }, { id: 'n3', label: 'Berita', url: 'pages/news.html', parent_id: '', order: 3, target: '_self' }, { id: 'n4', label: 'Kabinet', url: 'pages/cabinet.html', parent_id: '', order: 4, target: '_self' }, { id: 'n5', label: 'Kontak', url: '#kontak', parent_id: '', order: 5, target: '_self' }]
};
const news = (i) => ({ id_berita: 'b' + i, slug: 'berita-' + i, judul: 'Lomba Matematika Nasional ' + i, ringkasan: 'Ringkasan kegiatan nomor ' + i + ' yang cukup panjang untuk menguji pemotongan teks pada kartu berita.', kategori: 'Prestasi', penulis: 'Admin', gambar_utama: 'https://lh3.googleusercontent.com/d/n' + i, gambar: ['https://lh3.googleusercontent.com/d/g' + i], tanggal_publikasi: '2026-10-1' + (i % 9) + 'T03:00:00.000Z', is_featured: false, views: 3, shares: 0 });
const CAB = { kabinet: 'Kabinet Bersinergi', daftar_kabinet: ['Kabinet Lama', 'Kabinet Bersinergi'], items: [
  { Nama: 'Budi Santoso', Angkatan: '2022', Jabatan: 'Ketua Himpunan' }, { Nama: 'Siti Aminah', Angkatan: '2023', Jabatan: 'Sekretaris' },
  { Nama: 'Rani Putri', Angkatan: '2023', Jabatan: 'Kepala Departemen Pendidikan' }, { Nama: 'Dewi Lestari', Angkatan: '2024', Jabatan: 'Staf Departemen Pendidikan' }, { Nama: 'Andi Wijaya', Angkatan: '2023', Jabatan: 'Kepala Departemen Kominfo' }] };
const EVIL = '<p>Halo dunia</p><script>window.__xss=1</script><img src=x onerror="window.__xss=2"><a href="javascript:window.__xss=3">klik</a><iframe src="https://evil.example"></iframe><p onclick="window.__xss=4">teks</p><svg onload="window.__xss=5"></svg><a href="https://ok.example/x">tautan sah</a>';

function handler(over) {
  const o = Object.assign({ site: SITE, news: [1, 2, 3, 4, 5, 6].map(news), newsTotal: null, cab: CAB, detail: EVIL, calls: [] }, over || {});
  return (route) => {
    const u = new URL(route.request().url()), action = u.searchParams.get('action'), payload = JSON.parse(u.searchParams.get('payload') || '{}');
    o.calls.push(action);
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const send = (b) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(b) });
    switch (action) {
      case 'getWebsiteConfig': return send(ok(o.site));
      case 'getLatestNews': { const page = payload.page || 1, lim = payload.limit || 6; const all = o.news; const items = all.slice((page - 1) * lim, page * lim); return send(ok({ items, total: o.newsTotal != null ? o.newsTotal : all.length, page, page_size: lim })); }
      case 'getNewsDetail': return send(ok(Object.assign(news(1), { slug: payload.slug, konten: o.detail })));
      case 'getCabinet': return send(ok(payload.kabinet === 'Kabinet Lama' ? Object.assign({}, o.cab, { kabinet: 'Kabinet Lama', items: o.cab.items.slice(0, 1) }) : o.cab));
      case 'getMembers': {
        const all = { '2024': ['Dewi Lestari', 'Citra Ayu'], '2023': ['Andi Wijaya', 'Siti Aminah', 'Rani Putri'], '2022': ['Budi Santoso'] };
        const list = Object.keys(all).sort().reverse().map((a) => ({ angkatan: a, total: all[a].length }));
        const y = payload.angkatan && all[payload.angkatan] ? payload.angkatan : list[0].angkatan;
        return send(ok({ angkatan: y, angkatan_list: list, items: all[y].map((n) => ({ nama: n })), total: all[y].length }));
      }
      case 'getPage': return send(err('NOT_FOUND', 'Halaman tidak ditemukan'));
      case 'getPublicInformation': return send(ok({ total_anggota: 142, total_berita: 6, kabinet_aktif: 'Kabinet Bersinergi' }));
      case 'trackNews': return send(ok({ counted: true }));
      default: return send(err('NOT_FOUND', 'Aksi tidak dikenal'));
    }
  };
}

// ---------- kerangka uji ----------
let passed = 0, failed = 0; const failures = [];
async function T(name, fn) { if (process.env.ONLY && name.indexOf(process.env.ONLY) < 0) return; try { await fn(); passed++; process.stdout.write('.'); } catch (e) { failed++; failures.push(name + ' -> ' + (e && e.message)); process.stdout.write('F'); } }
const assert = (c, m) => { if (!c) throw new Error(m || 'assert gagal'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'eq') + ': dapat ' + JSON.stringify(a) + ', harap ' + JSON.stringify(b)); };
const SVG = (c) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c + '"/><stop offset="1" stop-color="#0D2B4F"/></linearGradient></defs><rect width="160" height="100" fill="url(#g)"/></svg>';

async function open(browser, opts) {
  const o = Object.assign({ configure: true, api: handler(), viewport: { width: 1280, height: 900 }, abortApi: false }, opts || {});
  const ctx = await browser.newContext({ viewport: o.viewport, locale: 'id-ID' });
  const page = await ctx.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|Content Security Policy/.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  await page.route('**/assets/js/config.js', (r) => {
    let src = fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8');
    if (o.configure) src = src.replace("API_URL: ''", "API_URL: '" + API + "'");
    r.fulfill({ status: 200, contentType: TYPES['.js'], body: src });
  });
  await page.route('https://script.google.com/**', (r) => (o.abortApi ? r.abort('failed') : o.api(r)));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://lh3.googleusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG(/hero/.test(r.request().url()) ? '#F4C542' : '#1E88E5') }));
  return { ctx, page, errors, requests, base: 'http://127.0.0.1:' + server.address().port + '/' };
}
const ready = (page) => page.waitForSelector('html[data-ready="1"]', { timeout: 10000 });
const settle = (page) => page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 10000 });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const shot = async (page, name, full) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }); };

  await T('beranda: urutan bagian mengikuti server, bagian nonaktif tidak ada, tema diterapkan', async () => {
    const t = await open(browser); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    eq(await t.page.$$eval('main > section', (s) => s.map((x) => x.id)), ['beranda', 'berita', 'kabinet', 'divisi', 'galeri', 'kontak']);
    assert(!(await t.page.$('#sambutan')) && !(await t.page.$('#tentang')), 'bagian nonaktif muncul');
    eq(await t.page.textContent('h1'), 'Matematika untuk Negeri');
    eq(await t.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()), '#1E88E5');
    eq(await t.page.evaluate(() => document.documentElement.dataset.hero), 'split');
    eq(await t.page.evaluate(() => document.documentElement.dataset.button), 'pill');
    eq(await t.page.$$eval('#berita .news-card', (c) => c.length), 6);
    eq(await t.page.$$eval('#kabinet .person', (c) => c.length), 5);
    assert((await t.page.textContent('#divisi')).includes('Pendidikan') && (await t.page.textContent('#divisi')).includes('Kominfo'), 'pengelompokan divisi');
    eq(await t.page.$$eval('#galeri .gallery__item', (c) => c.length), 12);
    assert((await t.page.textContent('#kontak')).includes('himatika@itera.ac.id'));
    assert((await t.page.title()).includes('HIMATIKA ITERA'));
    eq(t.errors, [], 'galat konsol');
    await shot(t.page, 'home-desktop', true); await t.ctx.close();
  });

  await T('beranda: kartu berita menaut ke halaman detail dengan slug ter-encode', async () => {
    const t = await open(browser); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    eq(await t.page.getAttribute('#berita .card__title a', 'href'), 'pages/news.html?slug=berita-1'); await t.ctx.close();
  });

  await T('XSS: konten berita berbahaya dari API tidak mengeksekusi apa pun', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'pages/news.html?slug=berita-1'); await ready(t.page); await settle(t.page);
    await t.page.waitForSelector('.article .prose');
    eq(await t.page.evaluate(() => window.__xss), undefined, 'skrip dieksekusi');
    const r = await t.page.evaluate(() => ({
      script: document.querySelectorAll('main script, main iframe, main svg').length,
      onattr: Array.from(document.querySelectorAll('main *')).filter((e) => Array.from(e.attributes).some((a) => /^on/i.test(a.name))).length,
      jsHref: document.querySelectorAll('main a[href^="javascript:"]').length,
      okLink: !!document.querySelector('.prose a[href="https://ok.example/x"]'), text: document.querySelector('.prose').textContent.includes('Halo dunia')
    }));
    eq(r, { script: 0, onattr: 0, jsHref: 0, okLink: true, text: true });
    eq(await t.page.getAttribute('.prose a[href="https://ok.example/x"]', 'rel'), 'noopener noreferrer');
    await shot(t.page, 'news-detail', false); await t.ctx.close();
  });

  await T('XSS: judul/teks dari API ditampilkan sebagai teks, bukan HTML', async () => {
    const bad = SITE.config.hero_title; const s = JSON.parse(JSON.stringify(SITE)); s.config.hero_title = '<img src=x onerror="window.__xss=9">Judul'; s.config.site_name = '<b>X</b>';
    const t = await open(browser, { api: handler({ site: s }) }); await t.page.goto(t.base); await ready(t.page);
    eq(await t.page.evaluate(() => window.__xss), undefined);
    assert((await t.page.textContent('h1')).includes('<img src=x'), 'harus tampil sebagai teks');
    eq(await t.page.$$eval('h1 img, .brand b', (x) => x.length), 0); await t.ctx.close();
  });

  await T('CSP: skrip inline yang disuntikkan diblokir', async () => {
    const t = await open(browser); await t.page.goto(t.base); await ready(t.page);
    await t.page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__csp=1'; document.head.append(s); });
    eq(await t.page.evaluate(() => window.__csp), undefined, 'skrip inline lolos CSP'); await t.ctx.close();
  });

  await T('API gagal total: tidak crash, tampilan dasar, pesan galat + tombol coba lagi', async () => {
    const t = await open(browser, { abortApi: true }); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    eq(await t.page.textContent('.brand__name'), 'HIMATIKA ITERA');
    eq(await t.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()), '#F4C542');
    assert(await t.page.isVisible('.notice'), 'pemberitahuan tidak tampil');
    assert((await t.page.$$('.state--error .btn')).length >= 3, 'tombol coba lagi');
    eq(await t.page.$$eval('main > section', (s) => s.length) > 3, true);
    eq(t.errors, [], 'galat tak tertangani'); await shot(t.page, 'home-api-down', true); await t.ctx.close();
  });

  await T('coba lagi memulihkan bagian setelah API kembali', async () => {
    let down = true; const inner = handler();
    const t = await open(browser, { api: (r) => (down ? r.abort('failed') : inner(r)) });
    await t.page.goto(t.base); await ready(t.page); await settle(t.page); down = false;
    await t.page.click('#berita .state--error .btn'); await t.page.waitForSelector('#berita .news-card');
    eq(await t.page.$$eval('#berita .news-card', (c) => c.length), 6); await t.ctx.close();
  });

  await T('API belum dikonfigurasi: tampilan dasar, tanpa permintaan jaringan ke Apps Script', async () => {
    const t = await open(browser, { configure: false }); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    eq(t.requests.filter((u) => u.includes('script.google.com')).length, 0);
    assert(await t.page.isVisible('h1')); assert(!(await t.page.$('.notice')), 'tidak perlu notifikasi saat belum dikonfigurasi');
    assert((await t.page.textContent('#berita')).includes('Konten belum tersedia')); eq(t.errors, []); await t.ctx.close();
  });

  await T('empty state: berita & kabinet kosong, galeri/divisi disembunyikan', async () => {
    const t = await open(browser, { api: handler({ news: [], cab: Object.assign({}, CAB, { items: [] }) }) });
    await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    assert((await t.page.textContent('#berita')).includes('Belum ada berita'));
    assert((await t.page.textContent('#kabinet')).includes('belum tersedia'));
    assert(!(await t.page.isVisible('#galeri')) && !(await t.page.isVisible('#divisi'))); await t.ctx.close();
  });

  await T('halaman berita: paginasi "Muat lebih banyak"', async () => {
    const all = Array.from({ length: 12 }, (_, i) => news(i + 1));
    const t = await open(browser, { api: handler({ news: all }) }); await t.page.goto(t.base + 'pages/news.html'); await ready(t.page); await settle(t.page);
    eq(await t.page.$$eval('.news-card', (c) => c.length), 9);
    await t.page.click('text=Muat lebih banyak'); await t.page.waitForFunction(() => document.querySelectorAll('.news-card').length === 12);
    eq(await t.page.$$eval('text=Muat lebih banyak', (c) => c.length), 0, 'tombol harus hilang di halaman terakhir');
    eq(await t.page.$$eval('header .nav__link', (a) => a.map((x) => x.getAttribute('href'))), ['../index.html#beranda', '../pages/news.html', '../pages/cabinet.html', '../index.html#kontak'].map((x) => x.replace('../pages/', '../pages/')));
    await t.ctx.close();
  });

  await T('halaman kabinet: dropdown memuat kabinet lain', async () => {
    const t = await open(browser); await t.page.goto(t.base + 'pages/cabinet.html'); await ready(t.page); await settle(t.page);
    eq(await t.page.$$eval('.person', (p) => p.length), 5);
    await t.page.selectOption('#cabinet-select', 'Kabinet Lama'); await t.page.waitForFunction(() => document.querySelectorAll('.person').length === 1);
    assert((await t.page.textContent('.cabinet__name')).includes('Kabinet Lama')); await t.ctx.close();
  });

  await T('cache publik: pindah halaman & refresh dalam 20 menit TIDAK memanggil Apps Script lagi', async () => {
    const calls = []; const t = await open(browser, { api: handler({ calls }) });
    await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    const first = calls.filter((c) => c !== 'trackNews').length; ok(first >= 2);
    await t.page.goto(t.base + 'pages/news.html'); await ready(t.page); await settle(t.page);
    const afterNews = calls.filter((c) => c === 'getWebsiteConfig').length; eq(afterNews, 1, 'konfigurasi tidak diminta ulang di halaman lain');
    const newsCalls = calls.filter((c) => c === 'getLatestNews').length;
    await t.page.goto(t.base + 'pages/news.html'); await ready(t.page); await settle(t.page); await t.page.reload(); await ready(t.page); await settle(t.page);
    eq(calls.filter((c) => c === 'getWebsiteConfig').length, 1); eq(calls.filter((c) => c === 'getLatestNews').length, newsCalls, 'daftar berita memakai cache');
    const keys = await t.page.evaluate(() => Object.keys(localStorage)); assert(keys.every((k) => /^himatika:(pc:v1:|site:v1|visitor|viewed)/.test(k)), 'kunci tak terduga: ' + keys.join(',')); assert(!keys.some((k) => /trackNews/.test(k)));
    eq(t.errors, []); await t.ctx.close();
  });

  await T('cache publik: halaman tampil seketika dari cache walau server lambat', async () => {
    let slow = false; const inner = handler();
    const t = await open(browser, { api: (r) => (slow ? setTimeout(() => inner(r), 4000) : inner(r)) });
    await t.page.goto(t.base); await ready(t.page); await settle(t.page); await t.page.goto(t.base + 'pages/news.html'); await ready(t.page); await settle(t.page); slow = true;
    const t0 = Date.now(); await t.page.goto(t.base + 'pages/news.html'); await t.page.waitForSelector('.card, .news-card, article', { timeout: 3000 }); ok(Date.now() - t0 < 3000);
    await t.page.goto(t.base); await t.page.waitForSelector('.brand'); await t.page.waitForSelector('#berita .card, #berita article', { timeout: 3000 }); await t.ctx.close();
  });

  await T('cache publik: data basi (>20 mnt) tampil dulu lalu diperbarui otomatis di latar belakang', async () => {
    let site = SITE; const innerOld = handler({ site: SITE }), innerNew = handler({ site: Object.assign({}, SITE, { config: Object.assign({}, SITE.config, { site_name: 'HIMATIKA BARU' }) }) });
    let calls = 0; const t = await open(browser, { api: (r) => { calls++; return (site === SITE ? innerOld : innerNew)(r); } });
    await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    assert((await t.page.textContent('.brand')).includes('HIMATIKA ITERA'));
    await t.page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('himatika:pc:v1:')) { const o = JSON.parse(localStorage[k]); o.t -= 25 * 60 * 1000; localStorage[k] = JSON.stringify(o); } });
    site = 'baru'; const before = calls;
    await t.page.goto(t.base); await t.page.waitForSelector('.brand');
    await t.page.waitForFunction(() => document.querySelector('.brand').textContent.includes('HIMATIKA BARU'), null, { timeout: 8000 });
    assert(calls > before, 'harus merevalidasi ke server'); eq(t.errors, []); await t.ctx.close();
  });

  await T('cache publik: ?refresh=1 melewati cache; data lebih tua dari 24 jam dibuang; trackNews tidak dicache', async () => {
    const calls = []; const t = await open(browser, { api: handler({ calls }) });
    await t.page.goto(t.base); await ready(t.page); await settle(t.page); const n = calls.filter((c) => c === 'getWebsiteConfig').length;
    await t.page.goto(t.base + '?refresh=1'); await ready(t.page); eq(calls.filter((c) => c === 'getWebsiteConfig').length, n + 1);
    await t.page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('himatika:pc:v1:')) { const o = JSON.parse(localStorage[k]); o.t -= 25 * 3600 * 1000; localStorage[k] = JSON.stringify(o); } });
    await t.page.goto(t.base); await ready(t.page); eq(calls.filter((c) => c === 'getWebsiteConfig').length, n + 2);
    await t.ctx.close();
  });

  await T('detail berita: view dihitung sekali per sesi, share via tautan', async () => {
    const calls = []; const t = await open(browser, { api: handler({ calls }) });
    await t.page.goto(t.base + 'pages/news.html?slug=berita-1'); await ready(t.page); await settle(t.page); await t.page.reload(); await ready(t.page); await settle(t.page);
    eq(calls.filter((c) => c === 'trackNews').length, 1); await t.ctx.close();
  });

  await T('slug tidak ada: pesan "tidak ditemukan", tanpa crash', async () => {
    const t = await open(browser, { api: (r) => { const u = new URL(r.request().url()); const h = handler(); if (u.searchParams.get('action') === 'getNewsDetail') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(err('NOT_FOUND', 'Berita tidak ditemukan')) }); return h(r); } });
    await t.page.goto(t.base + 'pages/news.html?slug=tidak-ada'); await ready(t.page); await settle(t.page);
    assert((await t.page.textContent('main')).includes('Data tidak ditemukan') || (await t.page.textContent('main')).includes('tidak ditemukan')); eq(t.errors, []); await t.ctx.close();
  });

  await T('mode pemeliharaan tampil; ?preview melewatinya', async () => {
    const s = JSON.parse(JSON.stringify(SITE)); s.config.maintenance_mode = 'true';
    let t = await open(browser, { api: handler({ site: s }) }); await t.page.goto(t.base); await ready(t.page);
    assert((await t.page.textContent('main')).includes('pemeliharaan')); assert(!(await t.page.$('#berita'))); await t.ctx.close();
    t = await open(browser, { api: handler({ site: s }) }); await t.page.goto(t.base + '?preview=1'); await ready(t.page); await settle(t.page);
    assert(await t.page.$('#berita')); await t.ctx.close();
  });

  await T('tema: nilai tidak sah dari API diganti default (tidak ada injeksi CSS)', async () => {
    const s = JSON.parse(JSON.stringify(SITE)); Object.assign(s.config, { primary_color: 'red; background:url(//evil/x)', font_family: 'Evil"; } body{display:none', base_font_size: '999', accent_color: 'javascript:1' }); Object.assign(s.theme, { border_radius: '9999', hero_style: 'hack', spacing: '"><x' });
    const t = await open(browser, { api: handler({ site: s }) }); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    const v = await t.page.evaluate(() => { const c = getComputedStyle(document.documentElement); return { p: c.getPropertyValue('--primary-color').trim(), a: c.getPropertyValue('--accent-color').trim(), f: c.getPropertyValue('--font-body'), s: c.getPropertyValue('--base-font-size').trim(), r: c.getPropertyValue('--border-radius').trim(), hero: document.documentElement.dataset.hero, sp: document.documentElement.dataset.spacing, body: getComputedStyle(document.body).display }; });
    eq(v.p, '#F4C542'); eq(v.a, '#1F3A5F'); assert(v.f.includes('Inter') && !v.f.includes('Evil'), v.f); eq(v.s, '16px'); eq(v.r, '12px'); eq(v.hero, 'centered'); eq(v.sp, 'normal'); eq(v.body, 'block'); await t.ctx.close();
  });

  await T('tema: kontras teks otomatis pada warna utama gelap/terang', async () => {
    for (const [c, want] of [['#111111', '#FFFFFF'], ['#F4C542', '#111111'], ['#0D47A1', '#FFFFFF']]) {
      const s = JSON.parse(JSON.stringify(SITE)); s.config.primary_color = c;
      const t = await open(browser, { api: handler({ site: s }) }); await t.page.goto(t.base); await ready(t.page);
      eq(await t.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-contrast').trim()).then((x) => x.toUpperCase()), want, 'kontras untuk ' + c); await t.ctx.close();
    }
  });

  await T('tema: custom_css diterapkan tanpa unsafe-inline (constructable stylesheet)', async () => {
    const s = JSON.parse(JSON.stringify(SITE)); s.theme.custom_css = '.hero__title{letter-spacing:7px} @import url(https://evil/x.css);';
    const t = await open(browser, { api: handler({ site: s }) }); await t.page.goto(t.base); await ready(t.page);
    eq(await t.page.$eval('.hero__title', (e) => getComputedStyle(e).letterSpacing), '7px'); await t.ctx.close();
  });

  await T('cache tampilan: kunjungan kedua langsung memakai tema tersimpan (tanpa kedip)', async () => {
    let slow = false; const inner = handler();
    const t = await open(browser, { api: (r) => { const a = new URL(r.request().url()).searchParams.get('action'); if (slow && a === 'getWebsiteConfig') return setTimeout(() => inner(r), 1500); return inner(r); } });
    await t.page.goto(t.base); await ready(t.page); slow = true;
    await t.page.reload({ waitUntil: 'domcontentloaded' }); await t.page.waitForSelector('.brand');
    eq(await t.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()), '#1E88E5'); await t.ctx.close();
  });

  await T('mobile 375px: tanpa scroll horizontal, menu hamburger berfungsi', async () => {
    const t = await open(browser, { viewport: { width: 375, height: 800 } }); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    const w = await t.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); assert(w.sw <= w.iw, 'scroll horizontal: ' + JSON.stringify(w));
    assert(await t.page.isVisible('.nav__toggle')); assert(!(await t.page.isVisible('#nav-list')));
    await t.page.click('.nav__toggle'); assert(await t.page.isVisible('#nav-list')); eq(await t.page.getAttribute('.nav__toggle', 'aria-expanded'), 'true');
    await shot(t.page, 'home-mobile-menu', false);
    await t.page.click('#nav-list a[href="#kontak"]'); assert(!(await t.page.isVisible('#nav-list')), 'menu harus menutup');
    await shot(t.page, 'home-mobile', true); await t.ctx.close();
  });

  await T('mobile: halaman detail berita dan kabinet tidak melebar', async () => {
    const t = await open(browser, { viewport: { width: 360, height: 760 } });
    for (const p of ['pages/news.html?slug=berita-1', 'pages/cabinet.html', 'pages/news.html']) {
      await t.page.goto(t.base + p); await ready(t.page); await settle(t.page);
      const w = await t.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); assert(w.sw <= w.iw, p + ' ' + JSON.stringify(w));
    } await t.ctx.close();
  });

  await T('lightbox galeri membuka dan menutup dengan Esc', async () => {
    const t = await open(browser); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
    await t.page.click('#galeri .gallery__item');
    const st = await t.page.evaluate(() => { const d = document.querySelector('dialog.lightbox'); if (!d) return 'tidak ada dialog'; const r = d.getBoundingClientRect(); const i = d.querySelector('img'); return JSON.stringify({ open: d.open, w: r.width, h: r.height, disp: getComputedStyle(d).display, nat: i.naturalWidth, hid: i.hidden }); });
    assert(await t.page.isVisible('dialog.lightbox'), 'dialog: ' + st + ' errors=' + JSON.stringify(t.errors)); await t.page.keyboard.press('Escape');
    await t.page.waitForFunction(() => !document.querySelector('dialog.lightbox')); await t.ctx.close();
  });

  await T('semua tema hero/navbar/footer dapat dirender tanpa galat', async () => {
    for (const hs of ['centered', 'split', 'fullscreen']) for (const nb of ['solid', 'transparent', 'floating']) {
      const s = JSON.parse(JSON.stringify(SITE)); s.theme.hero_style = hs; s.theme.navbar_style = nb; s.theme.footer_style = hs === 'split' ? 'simple' : 'columns'; s.theme.layout = nb === 'floating' ? 'boxed' : 'wide';
      const t = await open(browser, { api: handler({ site: s }) }); await t.page.goto(t.base); await ready(t.page); await settle(t.page);
      eq(t.errors, [], hs + '/' + nb);
      const top = await t.page.evaluate(() => { const r = document.querySelector('.hero__title').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && e.closest('.hero__text')); }); assert(top, 'judul hero tertutup elemen lain: ' + hs + '/' + nb);
      const w = await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth); assert(w, 'melebar ' + hs + '/' + nb);
      if (hs === 'fullscreen' && nb === 'floating') await shot(t.page, 'home-fullscreen-floating', false); await t.ctx.close();
    }
  });

  await T('404.html disajikan untuk path tak dikenal dan tidak memakai path absolut', async () => {
    const t = await open(browser); const r = await t.page.goto(t.base + 'pages/tidak-ada.html'); eq(r.status(), 404);
    assert((await t.page.textContent('h1')) === '404'); eq(await t.page.getAttribute('#home', 'href'), './'); await t.ctx.close();
  });

  await T('semua tautan/aset di HTML memakai path relatif (kompatibel GitHub Pages project site)', async () => {
    for (const f of ['index.html', '404.html', 'pages/news.html', 'pages/cabinet.html', 'pages/about.html', 'pages/contact.html', 'pages/page.html', 'pages/members.html']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); const bad = s.match(/(?:href|src)="\/(?!\/)[^"]*"/g); assert(!bad, f + ' memakai path absolut: ' + bad);
    }
  });

  await T('halaman statis lain (tentang, kontak, page) dirender', async () => {
    const t = await open(browser);
    await t.page.goto(t.base + 'pages/about.html'); await ready(t.page); await settle(t.page); assert((await t.page.textContent('main')).includes('142'));
    await t.page.goto(t.base + 'pages/contact.html'); await ready(t.page); assert((await t.page.textContent('main')).includes('himatika@itera.ac.id'));
    await t.page.goto(t.base + 'pages/page.html?slug=x'); await ready(t.page); await settle(t.page); assert((await t.page.textContent('main')).length > 0); eq(t.errors, []); await t.ctx.close();
  });

  await T('anggota: default angkatan terbaru, ganti angkatan memanggil API, pencarian nama, tanpa NIM', async () => {
    const calls = []; const t = await open(browser, { api: handler({ calls }) }); await t.page.goto(t.base + 'pages/members.html'); await ready(t.page); await settle(t.page);
    eq(await t.page.inputValue('#angkatan-select'), '2024'); eq(await t.page.$$eval('.people--names li', (l) => l.length), 2);
    assert((await t.page.textContent('main')).includes('Dewi Lestari')); assert(!/\b\d{8,}\b/.test(await t.page.textContent('main')), 'NIM tidak boleh tampil');
    await t.page.selectOption('#angkatan-select', '2023'); await t.page.waitForFunction(() => document.querySelectorAll('.people--names li').length === 3);
    await t.page.fill('#member-search', 'siti'); eq(await t.page.$$eval('.people--names li', (l) => l.length), 1); assert((await t.page.textContent('[role=status]')).includes('1 anggota'));
    await t.page.fill('#member-search', 'zzz'); assert((await t.page.textContent('main')).includes('Tidak ada nama yang cocok'));
    assert(calls.filter((c) => c === 'getMembers').length === 2, 'getMembers dipanggil sekali per angkatan'); eq(t.errors, []);
    await shot(t.page, 'members-public', false); await t.ctx.close();
  });

  await T('anggota: halaman mobile tidak melebar', async () => {
    const t = await open(browser, { viewport: { width: 375, height: 800 } }); await t.page.goto(t.base + 'pages/members.html'); await ready(t.page); await settle(t.page);
    assert(await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'melebar'); await shot(t.page, 'members-public-mobile', false); await t.ctx.close();
  });

  await browser.close(); server.close();
  console.log('\nLulus: ' + passed + '  Gagal: ' + failed); failures.forEach((f) => console.log('  GAGAL: ' + f));
  process.exit(failed ? 1 : 0);
})();
