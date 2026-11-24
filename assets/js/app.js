/**
 * app.js — pemuat konten website publik.
 * Alur: tema dari cache (tanpa kedip) -> getWebsiteConfig -> render header/footer -> render halaman.
 * Bila API gagal atau belum dikonfigurasi, website tetap tampil dengan tampilan dasar (tidak crash).
 */
import { CONFIG, FALLBACK, apiConfigured } from './config.js';
import { publicCall, friendlyError, uuid } from './api.js';
import { applyTheme, setDocumentMeta } from './theme.js';
import { h, img, fmtDate, setHtml, isSafeUrl, skeleton, emptyState, errorState, renderHeader, renderFooter, newsCard, personCard, sectionHead, openLightbox } from './components.js';

const ROOT = document.body.dataset.root || '';
const PAGE = document.body.dataset.page || 'home';
const IS_HOME = PAGE === 'home';
const QS = new URLSearchParams(location.search);
const main = document.getElementById('main');
let SITE = FALLBACK;

// ---------- cache tampilan (hanya data tampilan, bukan data auth) ----------
function loadCache() {
  try {
    const o = JSON.parse(localStorage.getItem(CONFIG.SITE_CACHE_KEY) || 'null');
    if (o && o.d && Date.now() - o.t < CONFIG.SITE_CACHE_MAX_AGE_MS) return o.d;
  } catch (e) { /* cache opsional */ }
  return null;
}
function saveCache(d) { try { localStorage.setItem(CONFIG.SITE_CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { /* opsional */ } }

function normalize(d) {
  const f = FALLBACK;
  return {
    config: Object.assign({}, f.config, (d && d.config) || {}),
    theme: Object.assign({}, f.theme, (d && d.theme) || {}),
    sections: Array.isArray(d && d.sections) ? d.sections : f.sections,
    navigation: Array.isArray(d && d.navigation) && d.navigation.length ? d.navigation : f.navigation
  };
}

function paintChrome() {
  const ctx = { root: ROOT, isHome: IS_HOME };
  renderHeader(document.getElementById('site-header'), SITE, ctx);
  renderFooter(document.getElementById('site-footer'), SITE, ctx);
}

// ---------- pemanggilan data dengan memo + penanganan galat per bagian ----------
const memo = new Map();
function data(action, payload, onUpdate) {
  const k = action + '|' + JSON.stringify(payload || {});
  if (!memo.has(k)) memo.set(k, publicCall(action, payload, { onUpdate: onUpdate }).catch((e) => { memo.delete(k); throw e; }));
  return memo.get(k);
}

/** Isi `host` secara asinkron: skeleton -> hasil / kosong / galat (dengan tombol coba lagi). */
function fill(host, loader, render, opts) {
  const o = opts || {};
  const run = async () => {
    host.replaceChildren(skeleton(o.skeleton || 3, o.skeletonClass));
    try {
      const redraw = (nd) => { try { const o2 = render(nd); if (o2 !== null && o2 !== undefined) host.replaceChildren(o2); } catch (e) { /* tampilan lama tetap */ } };
      const d = await loader(redraw);   // loader boleh meneruskan `redraw` agar data baru dari cache-revalidasi tampil otomatis
      const out = render(d);
      if (out === null || out === undefined) { host.replaceChildren(emptyState(o.empty || 'Belum ada data.')); if (o.hideIfEmpty) o.hideIfEmpty(); return; }
      host.replaceChildren(out);
    } catch (e) {
      host.replaceChildren(errorState(e.code === 'NOT_CONFIGURED' ? 'Konten belum tersedia.' : friendlyError(e), e.code === 'NOT_CONFIGURED' ? null : run));
    }
  };
  return run();
}

function section(id, cls, ...kids) { return h('section', { class: 'section ' + (cls || ''), id: id, 'aria-labelledby': id ? id + '-title' : null }, h('div', { class: 'container' }, kids)); }
function titled(title, lead, id) { const hd = sectionHead(title, lead); hd.querySelector('h2').id = id + '-title'; return hd; }

// ---------- bagian beranda ----------
const SECTIONS = {
  hero(site) {
    const c = site.config;
    const pic = img(c.hero_image, '', 'hero__img');
    return h('section', { class: 'hero', id: 'beranda', 'aria-labelledby': 'hero-title' },
      h('div', { class: 'container hero__inner' },
        h('div', { class: 'hero__text' },
          h('p', { class: 'eyebrow', text: c.site_name }),
          h('h1', { id: 'hero-title', class: 'hero__title', text: c.hero_title }),
          c.hero_subtitle ? h('p', { class: 'hero__sub', text: c.hero_subtitle }) : null,
          h('div', { class: 'hero__cta' },
            h('a', { class: 'btn btn--primary', href: ROOT + 'pages/news.html', text: 'Baca Berita' }),
            h('a', { class: 'btn btn--ghost', href: IS_HOME ? '#tentang' : ROOT + 'pages/about.html', text: 'Kenali Kami' }))),
        pic ? h('figure', { class: 'hero__media' }, pic) : null));
  },

  sambutan(site) {
    const c = site.config;
    if (!String(c.welcome_text || '').trim()) return null;
    const body = h('div', { class: 'prose' }); setHtml(body, c.welcome_text);
    return section('sambutan', 'section--alt', titled(c.welcome_title || 'Sambutan', '', 'sambutan'),
      h('div', { class: 'welcome' }, body, c.welcome_name ? h('p', { class: 'welcome__name', text: c.welcome_name }) : null));
  },

  tentang(site) {
    const host = h('div');
    const sec = section('tentang', '', titled('Tentang ' + site.config.site_name, '', 'tentang'), host);
    fill(host, async () => {
      const [pg, info] = await Promise.allSettled([data('getPage', { slug: 'tentang' }), data('getPublicInformation')]);
      return { page: pg.status === 'fulfilled' ? pg.value : null, info: info.status === 'fulfilled' ? info.value : null };
    }, (d) => aboutBody(site, d.page, d.info), { skeleton: 1 });
    return sec;
  },

  berita(site) {
    const host = h('div');
    const sec = section('berita', 'section--alt', titled('Berita Terbaru', 'Kabar dan kegiatan terbaru dari HIMATIKA.', 'berita'), host,
      h('p', { class: 'section__more' }, h('a', { class: 'btn btn--outline', href: ROOT + 'pages/news.html', text: 'Semua berita' })));
    fill(host, (u) => data('getLatestNews', { limit: 6 }, u), (d) => d.items && d.items.length ? h('div', { class: 'grid grid--3' }, d.items.map((n) => newsCard(n, ROOT))) : null,
      { empty: 'Belum ada berita yang dipublikasikan.', skeleton: 3 });
    return sec;
  },

  kabinet(site) {
    const host = h('div');
    const sec = section('kabinet', '', titled('Kabinet Aktif', '', 'kabinet'), host,
      h('p', { class: 'section__more' }, h('a', { class: 'btn btn--outline', href: ROOT + 'pages/cabinet.html', text: 'Lihat struktur lengkap' })));
    fill(host, (u) => data('getCabinet', {}, u), (d) => {
      if (!d.items || !d.items.length) return null;
      return h('div', null, d.kabinet ? h('p', { class: 'cabinet__name', text: d.kabinet }) : null,
        h('ul', { class: 'people' }, d.items.slice(0, 8).map(personCard)));
    }, { empty: 'Struktur kabinet belum tersedia.', skeleton: 4, skeletonClass: 'skeleton-grid--4' });
    return sec;
  },

  divisi(site) {
    const host = h('div');
    const sec = section('divisi', 'section--alt', titled('Divisi dan Departemen', '', 'divisi'), host);
    fill(host, (u) => data('getCabinet', {}, u), (d) => {
      const groups = groupByDepartment(d.items || []);
      if (!groups.length) { sec.hidden = true; return null; }
      return h('div', { class: 'grid grid--3' }, groups.map((g) => h('article', { class: 'card card--pad' },
        h('h3', { class: 'card__title', text: g.name }), h('ul', { class: 'mini-list' }, g.members.map((m) => h('li', null, h('strong', { text: m.Nama }), ' ', h('span', { class: 'muted', text: m.Jabatan })))))));
    }, { empty: '', hideIfEmpty: () => { sec.hidden = true; }, skeleton: 3 });
    return sec;
  },

  galeri(site) {
    const host = h('div');
    const sec = section('galeri', '', titled('Galeri', 'Dokumentasi kegiatan HIMATIKA.', 'galeri'), host);
    fill(host, (u) => data('getLatestNews', { limit: 12 }, u), (d) => {
      const urls = [];
      (d.items || []).forEach((n) => { [n.gambar_utama].concat(n.gambar || []).forEach((u) => { if (u && isSafeUrl(u) && urls.indexOf(u) < 0) urls.push(u); }); });
      if (!urls.length) { sec.hidden = true; return null; }
      return h('ul', { class: 'gallery' }, urls.slice(0, 12).map((u) => {
        const i = img(u, 'Foto kegiatan');
        return h('li', null, h('button', { type: 'button', class: 'gallery__item', 'aria-label': 'Perbesar foto', onclick: () => openLightbox(u, 'Foto kegiatan') }, i));
      }));
    }, { empty: '', hideIfEmpty: () => { sec.hidden = true; }, skeleton: 4, skeletonClass: 'skeleton-grid--4' });
    return sec;
  },

  kontak(site) {
    const c = site.config;
    return section('kontak', 'section--alt', titled('Kontak', 'Hubungi kami untuk informasi dan kolaborasi.', 'kontak'), contactBody(c));
  }
};

/** Kelompokkan jabatan menjadi departemen berdasarkan kata kunci pada nama jabatan (heuristik). */
function groupByDepartment(items) {
  const re = /\b(?:departemen|divisi|biro|dinas|kementerian)\s+(.+)$/i, map = new Map();
  items.forEach((m) => {
    const x = re.exec(String(m.Jabatan || ''));
    if (!x) return;
    const name = x[1].trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(m);
  });
  return Array.from(map, ([name, members]) => ({ name: name, members: members }));
}

function aboutBody(site, page, info) {
  const wrap = h('div', { class: 'about' });
  const text = h('div', { class: 'prose' });
  if (page && page.content) setHtml(text, page.content); else text.append(h('p', { text: site.config.site_description }));
  wrap.append(text);
  if (info) {
    const stat = (n, label) => h('div', { class: 'stat' }, h('strong', { class: 'stat__num', text: String(n) }), h('span', { class: 'stat__label', text: label }));
    wrap.append(h('div', { class: 'stats' }, stat(info.total_anggota, 'Anggota terdaftar'), stat(info.total_berita, 'Berita terbit'), info.kabinet_aktif ? stat(info.kabinet_aktif, 'Kabinet aktif') : null));
  }
  return wrap;
}

function contactBody(c) {
  const rows = [];
  if (c.contact_email) rows.push(h('li', null, h('span', { class: 'contact__label', text: 'Email' }), h('a', { href: 'mailto:' + c.contact_email, text: c.contact_email })));
  if (c.contact_address) rows.push(h('li', null, h('span', { class: 'contact__label', text: 'Alamat' }), h('span', { text: c.contact_address })));
  if (c.instagram_url) rows.push(h('li', null, h('span', { class: 'contact__label', text: 'Instagram' }), h('a', { href: c.instagram_url, text: c.instagram_url.replace(/^https:\/\/(www\.)?/, ''), target: '_blank', rel: 'noopener noreferrer' })));
  return rows.length ? h('ul', { class: 'contact' }, rows) : emptyState('Informasi kontak belum diisi.');
}

// ---------- halaman ----------
function pageHeader(title, lead) { return h('header', { class: 'page-head' }, h('div', { class: 'container' }, h('h1', { class: 'page-head__title', text: title }), lead ? h('p', { class: 'page-head__lead', text: lead }) : null)); }

const PAGES = {
  home() {
    setDocumentMeta(SITE.config, '', '');
    const list = SITE.sections.slice().sort((a, b) => a.order - b.order);
    const els = list.map((s) => (Object.prototype.hasOwnProperty.call(SECTIONS, s.key) ? SECTIONS[s.key](SITE) : null)).filter(Boolean);
    main.replaceChildren(...(els.length ? els : [section('', '', emptyState('Belum ada bagian yang ditampilkan.'))]));
  },

  news() {
    const slug = QS.get('slug');
    if (slug) return newsDetail(slug);
    setDocumentMeta(SITE.config, 'Berita', 'Berita dan kegiatan terbaru HIMATIKA.');
    const host = h('div'), more = h('p', { class: 'section__more' });
    main.replaceChildren(pageHeader('Berita', 'Kabar dan kegiatan terbaru dari HIMATIKA.'), section('', '', host, more));
    let page = 1; const grid = h('div', { class: 'grid grid--3' });
    const load = async () => {
      more.replaceChildren();
      try {
        const d = await publicCall('getLatestNews', { limit: 9, page: page });
        if (page === 1 && !d.items.length) { host.replaceChildren(emptyState('Belum ada berita yang dipublikasikan.')); return; }
        d.items.forEach((n) => grid.append(newsCard(n, ROOT)));
        if (page === 1) host.replaceChildren(grid);
        if (page * d.page_size < d.total) more.replaceChildren(h('button', { class: 'btn btn--outline', type: 'button', text: 'Muat lebih banyak', onclick: () => { page++; load(); } }));
      } catch (e) { (page === 1 ? host : more).replaceChildren(errorState(friendlyError(e), load)); }
    };
    host.replaceChildren(skeleton(3)); load();
  },

  cabinet() {
    setDocumentMeta(SITE.config, 'Kabinet', 'Struktur kepengurusan HIMATIKA.');
    const select = h('select', { id: 'cabinet-select', class: 'select', 'aria-label': 'Pilih kabinet' }), host = h('div'), bar = h('div', { class: 'toolbar' });
    main.replaceChildren(pageHeader('Struktur Kabinet', 'Pengurus HIMATIKA per periode.'), section('', '', bar, host));
    const show = (name) => fill(host, (u) => publicCall('getCabinet', name ? { kabinet: name } : {}, { onUpdate: u }), (d) => {
      if (!bar.childElementCount && d.daftar_kabinet && d.daftar_kabinet.length > 1) {
        d.daftar_kabinet.forEach((k) => select.append(h('option', { value: k, text: k, selected: k === d.kabinet })));
        select.addEventListener('change', () => show(select.value));
        bar.append(h('label', { for: 'cabinet-select', class: 'toolbar__label', text: 'Kabinet:' }), select);
      }
      return d.items && d.items.length ? h('div', null, h('p', { class: 'cabinet__name', text: d.kabinet }), h('ul', { class: 'people' }, d.items.map(personCard))) : null;
    }, { empty: 'Struktur kabinet belum tersedia.', skeleton: 4, skeletonClass: 'skeleton-grid--4' });
    show('');
  },

  members() {
    setDocumentMeta(SITE.config, 'Anggota', 'Daftar anggota HIMATIKA berdasarkan angkatan.');
    const select = h('select', { id: 'angkatan-select', class: 'select', 'aria-label': 'Pilih angkatan' });
    const search = h('input', { type: 'search', class: 'select', id: 'member-search', placeholder: 'Cari nama…', 'aria-label': 'Cari nama anggota', autocomplete: 'off', maxlength: '60' });
    const count = h('span', { class: 'muted', role: 'status', 'aria-live': 'polite' });
    const bar = h('div', { class: 'toolbar' }), host = h('div');
    main.replaceChildren(pageHeader('Anggota', 'Anggota aktif HIMATIKA berdasarkan angkatan.'), section('', '', bar, host));
    let items = [], built = false;
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const list = q ? items.filter((m) => m.nama.toLowerCase().indexOf(q) >= 0) : items;
      count.textContent = list.length + ' anggota' + (q ? ' ditemukan' : '');
      host.replaceChildren(list.length ? h('ul', { class: 'people people--names' }, list.map((m) => personCard({ Nama: m.nama, Jabatan: '', Angkatan: '' }))) : emptyState(q ? 'Tidak ada nama yang cocok.' : 'Belum ada anggota pada angkatan ini.'));
    };
    const show = (year) => fill(host, (u) => publicCall('getMembers', year ? { angkatan: year } : {}, { onUpdate: u }), (d) => {
      if (!built) {
        built = true;
        if (!d.angkatan_list.length) return null;
        d.angkatan_list.forEach((y) => select.append(h('option', { value: y.angkatan, text: (y.angkatan === 'Lainnya' ? 'Lainnya' : 'Angkatan ' + y.angkatan) + ' (' + y.total + ')', selected: y.angkatan === d.angkatan })));
        select.addEventListener('change', () => { search.value = ''; show(select.value); });
        search.addEventListener('input', draw);
        bar.append(h('label', { for: 'angkatan-select', class: 'toolbar__label', text: 'Angkatan:' }), select, search, count);
      }
      items = d.items || []; draw(); return host.firstChild || h('div');
    }, { empty: 'Belum ada anggota yang ditampilkan.', skeleton: 6, skeletonClass: 'skeleton-grid--4' });
    show('');
  },

  about() {
    setDocumentMeta(SITE.config, 'Tentang', SITE.config.site_description);
    const host = h('div');
    main.replaceChildren(pageHeader('Tentang ' + SITE.config.site_name, SITE.config.site_description), section('', '', host));
    fill(host, async () => {
      const [pg, info] = await Promise.allSettled([data('getPage', { slug: 'tentang' }), data('getPublicInformation')]);
      return { page: pg.status === 'fulfilled' ? pg.value : null, info: info.status === 'fulfilled' ? info.value : null };
    }, (d) => aboutBody(SITE, d.page, d.info), { skeleton: 1 });
  },

  contact() {
    setDocumentMeta(SITE.config, 'Kontak', 'Hubungi HIMATIKA.');
    main.replaceChildren(pageHeader('Kontak', 'Hubungi kami untuk informasi dan kolaborasi.'), section('', '', contactBody(SITE.config)));
  },

  page() {
    const slug = QS.get('slug') || '';
    const host = h('div');
    main.replaceChildren(section('', '', host));
    fill(host, (u) => data('getPage', { slug: slug }, u), (d) => {
      setDocumentMeta(SITE.config, d.title, '');
      const body = h('div', { class: 'prose' }); setHtml(body, d.content);
      return h('article', null, h('h1', { class: 'article__title', text: d.title }), img(d.featured_image, '', 'article__img'), body);
    }, { empty: 'Halaman tidak ditemukan.', skeleton: 1 });
  }
};

function visitorId() {
  try { let v = localStorage.getItem('himatika:vid'); if (!v) { v = uuid(); localStorage.setItem('himatika:vid', v); } return v; } catch (e) { return uuid(); }
}
function track(slug, kind) {
  if (!apiConfigured()) return;
  const key = 'himatika:tr:' + kind + ':' + slug;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { /* lanjut */ }
  publicCall('trackNews', { slug: slug, kind: kind, visitor_id: visitorId() }).catch(() => { /* penghitung bersifat opsional */ });
}

function newsDetail(slug) {
  const host = h('div');
  main.replaceChildren(section('', '', h('p', { class: 'back' }, h('a', { href: ROOT + 'pages/news.html', text: '← Semua berita' })), host));
  fill(host, (u) => publicCall('getNewsDetail', { slug: slug }, { onUpdate: u }), (d) => {
    setDocumentMeta(SITE.config, d.judul, d.ringkasan);
    const body = h('div', { class: 'prose' }); setHtml(body, d.konten);
    const share = h('button', { class: 'btn btn--outline', type: 'button', text: 'Bagikan', onclick: async () => {
      const url = location.href;
      try { if (navigator.share) await navigator.share({ title: d.judul, url: url }); else { await navigator.clipboard.writeText(url); share.textContent = 'Tautan disalin'; } track(slug, 'share'); } catch (e) { /* dibatalkan */ }
    } });
    const extra = (d.gambar || []).filter((u) => u !== d.gambar_utama);
    track(slug, 'view');
    return h('article', { class: 'article' },
      h('div', { class: 'card__meta' }, d.kategori ? h('span', { class: 'tag', text: d.kategori }) : null, h('time', { datetime: d.tanggal_publikasi, text: fmtDate(d.tanggal_publikasi) }), d.penulis ? h('span', { class: 'muted', text: 'oleh ' + d.penulis }) : null),
      h('h1', { class: 'article__title', text: d.judul }),
      img(d.gambar_utama, '', 'article__img'), body,
      extra.length ? h('ul', { class: 'gallery' }, extra.map((u) => h('li', null, h('button', { type: 'button', class: 'gallery__item', 'aria-label': 'Perbesar foto', onclick: () => openLightbox(u, '') }, img(u, ''))))) : null,
      h('div', { class: 'article__foot' }, share));
  }, { empty: 'Berita tidak ditemukan.', skeleton: 1 });
}

function renderMaintenance() {
  main.replaceChildren(h('section', { class: 'maintenance' }, h('div', { class: 'container' },
    h('p', { class: 'brand__mark brand__mark--lg', 'aria-hidden': 'true', text: 'Σ' }),
    h('h1', { text: 'Website sedang dalam pemeliharaan' }),
    h('p', { class: 'muted', text: 'Kami sedang melakukan pembaruan. Silakan kembali beberapa saat lagi.' }))));
}

function notice(msg, onRetry) {
  const bar = h('div', { class: 'notice', role: 'status' }, h('span', { text: msg }), onRetry ? h('button', { class: 'notice__btn', type: 'button', text: 'Coba lagi', onclick: onRetry }) : null);
  document.body.prepend(bar); return bar;
}


// ---------- pratinjau langsung dari Dashboard (iframe same-origin) ----------
// Hanya menerima pesan dari jendela induk berorigin sama. Seluruh nilai tetap divalidasi oleh applyTheme()
// dan dirender lewat textContent / setHtml, sehingga pesan palsu tidak dapat menyuntikkan skrip.
function listenForPreview() {
  if (!QS.has('preview') || window.parent === window) return;
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const m = obj(e.data); if (m.type !== 'himatika-preview') return;
    const sections = Array.isArray(m.sections) ? m.sections.filter((s) => s && typeof s.key === 'string').map((s) => ({ key: s.key, label: String(s.label || ''), order: Number(s.order) || 0 })) : SITE.sections;
    SITE = normalize({ config: Object.assign({}, SITE.config, obj(m.config)), theme: Object.assign({}, SITE.theme, obj(m.theme)), sections: sections, navigation: SITE.navigation });
    applyTheme(SITE.config, SITE.theme); paintChrome();
    if (PAGE === 'home') PAGES.home();
  });
  window.parent.postMessage({ type: 'himatika-preview-ready' }, location.origin);
}

// ---------- boot ----------
async function boot() {
  const cached = loadCache();
  SITE = normalize(cached || FALLBACK);
  applyTheme(SITE.config, SITE.theme); paintChrome();

  let degraded = null;
  if (apiConfigured()) {
    // Konfigurasi dari cache (≤ TTL atau basi) dipakai seketika tanpa menunggu jaringan; versi baru diterapkan di latar belakang.
    const apply = (raw) => { SITE = normalize(raw); saveCache(SITE); applyTheme(SITE.config, SITE.theme); paintChrome(); };
    try { apply(await publicCall('getWebsiteConfig', undefined, { onUpdate: apply })); } catch (e) { degraded = e; }
  } else { degraded = { code: 'NOT_CONFIGURED' }; }

  if (degraded && degraded.code !== 'NOT_CONFIGURED' && !cached) notice('Sebagian konten gagal dimuat, menampilkan tampilan dasar. ' + friendlyError(degraded), () => location.reload());

  if (String(SITE.config.maintenance_mode) === 'true' && !QS.has('preview')) { setDocumentMeta(SITE.config, 'Pemeliharaan', ''); renderMaintenance(); document.documentElement.dataset.ready = '1'; return; }
  (PAGES[PAGE] || PAGES.home)();
  listenForPreview();
  document.documentElement.dataset.ready = '1';
}

boot().catch((e) => {
  console.error(e);
  main.replaceChildren(errorState('Terjadi kesalahan saat memuat halaman.', () => location.reload()));
});
