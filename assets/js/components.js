/**
 * components.js — pembangun DOM aman + komponen UI bersama.
 * Aturan: teks selalu lewat textContent; HTML dari CMS hanya lewat setHtml() (sanitizer allowlist
 * berbasis DOMParser); URL hanya lewat isSafeUrl(). Tidak ada innerHTML dari data mentah.
 */

// ---------- URL ----------
/** Sama dengan isSafeUrl_ di backend: https, mailto, #hash, path relatif. */
export function isSafeUrl(v) {
  v = String(v == null ? '' : v);
  if (!v || v.length > 1000) return false;
  if (/[\u0000- \u007f-\u009f<>"'`\\]/.test(v)) return false;
  if (/^https:\/\/[^\/]/i.test(v)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(v)) return true;
  if (/^\/\//.test(v)) return false;
  if (/^(#|\/|\.{1,2}\/)/.test(v)) return true;
  return !/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(v);
}

/** Ubah URL navigasi dari CMS menjadi URL yang benar dari halaman saat ini. */
export function resolveUrl(url, root, isHome) {
  url = String(url || '');
  if (!isSafeUrl(url)) return '#';
  if (/^(https:|mailto:)/i.test(url)) return url;
  if (url.charAt(0) === '#') return isHome ? url : root + 'index.html' + url;
  if (url.charAt(0) === '/' || url.indexOf('./') === 0 || url.indexOf('../') === 0) return url;
  return root + url;
}

// ---------- sanitizer HTML ----------
const ALLOWED = {
  P: [], BR: [], HR: [], STRONG: [], B: [], EM: [], I: [], U: [], S: [], UL: [], OL: [], LI: [], BLOCKQUOTE: [],
  H2: [], H3: [], H4: [], CODE: [], PRE: [], TABLE: [], THEAD: [], TBODY: [], TR: [], TH: [], TD: [],
  FIGURE: [], FIGCAPTION: [], A: ['href', 'title'], IMG: ['src', 'alt', 'title']
};
const DROP_WITH_CONTENT = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|NOSCRIPT|TEMPLATE|SVG|MATH|FORM|TEXTAREA|SELECT|HEAD|TITLE|LINK|META)$/;

function cleanNode(src, out) {
  src.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue)); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toUpperCase();
    if (DROP_WITH_CONTENT.test(tag)) return;
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, tag)) { cleanNode(n, out); return; }   // tag tak dikenal: simpan isinya saja
    const el = document.createElement(tag.toLowerCase());
    ALLOWED[tag].forEach((a) => {
      if (!n.hasAttribute(a)) return;
      const val = n.getAttribute(a);
      if ((a === 'href' || a === 'src') && !isSafeUrl(val)) return;
      el.setAttribute(a, val);
    });
    if (tag === 'A') { el.setAttribute('rel', 'noopener noreferrer'); }
    if (tag === 'IMG') { el.setAttribute('loading', 'lazy'); el.setAttribute('referrerpolicy', 'no-referrer'); if (!el.hasAttribute('src')) return; }
    cleanNode(n, el);
    out.appendChild(el);
  });
}

/** Isi elemen dengan HTML yang sudah disanitasi. DOMParser membuat dokumen inert: skrip/gambar tidak dieksekusi. */
export function setHtml(el, html) {
  const doc = new DOMParser().parseFromString(String(html == null ? '' : html), 'text/html');
  const frag = document.createDocumentFragment();
  cleanNode(doc.body, frag);
  el.replaceChildren(frag);
  return el;
}

// ---------- pembuat elemen ----------
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach((k) => {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = String(v);
      else if (k === 'html') setHtml(e, v);
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'href' || k === 'src') { if (isSafeUrl(v)) e.setAttribute(k, v); }
      else e.setAttribute(k, v === true ? '' : String(v));
    });
  }
  kids.flat(Infinity).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return e;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Gambar dengan fallback: bila gagal dimuat, elemen disembunyikan agar tata letak tidak rusak. */
export function img(url, alt, cls) {
  if (!isSafeUrl(url)) return null;
  const i = h('img', { src: url, alt: alt || '', class: cls || '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
  i.addEventListener('error', () => { i.hidden = true; });
  return i;
}

// ---------- status UI ----------
export function skeleton(n, cls) {
  return h('div', { class: 'skeleton-grid ' + (cls || ''), 'aria-hidden': 'true' },
    Array.from({ length: n || 3 }, () => h('div', { class: 'skeleton' })));
}
export function emptyState(msg) { return h('div', { class: 'state state--empty', role: 'status' }, h('p', { text: msg })); }
export function errorState(msg, onRetry) {
  return h('div', { class: 'state state--error', role: 'alert' },
    h('p', { text: msg }),
    onRetry ? h('button', { class: 'btn btn--outline', type: 'button', text: 'Coba lagi', onclick: onRetry }) : null);
}

// ---------- header & footer ----------
function navTree(items) {
  const byParent = {};
  (items || []).forEach((n) => { (byParent[n.parent_id || ''] = byParent[n.parent_id || ''] || []).push(n); });
  const top = byParent[''] || [];
  return top.map((n) => ({ item: n, children: byParent[n.id] || [] }));
}

function navLink(n, ctx) {
  const href = resolveUrl(n.url, ctx.root, ctx.isHome);
  const a = h('a', { href: href, text: n.label, class: 'nav__link' });
  if (n.target === '_blank') { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
  try {
    const u = new URL(href, location.href);
    if (u.origin === location.origin && u.pathname === location.pathname && (!u.hash || ctx.isHome === false)) a.setAttribute('aria-current', 'page');
  } catch (e) { /* abaikan */ }
  return a;
}

export function renderHeader(host, site, ctx) {
  const c = site.config;
  const logo = img(c.logo_url, '', 'brand__logo');
  const brand = h('a', { class: 'brand', href: ctx.isHome ? '#beranda' : ctx.root + 'index.html', 'aria-label': c.site_name + ' — beranda' },
    logo || h('span', { class: 'brand__mark', 'aria-hidden': 'true', text: 'Σ' }),
    h('span', { class: 'brand__name', text: c.site_name }));

  const list = h('ul', { class: 'nav__list', id: 'nav-list' });
  navTree(site.navigation).forEach(({ item, children }) => {
    const li = h('li', { class: 'nav__item' + (children.length ? ' nav__item--has-sub' : '') }, navLink(item, ctx));
    if (children.length) li.append(h('ul', { class: 'nav__sub' }, children.map((ch) => h('li', null, navLink(ch, ctx)))));
    list.append(li);
  });

  const toggle = h('button', { class: 'nav__toggle', type: 'button', 'aria-label': 'Buka menu', 'aria-expanded': 'false', 'aria-controls': 'nav-list' },
    h('span', { class: 'nav__bar' }), h('span', { class: 'nav__bar' }), h('span', { class: 'nav__bar' }));
  const close = () => { list.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Buka menu'); };
  toggle.addEventListener('click', () => {
    const open = list.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
  });
  list.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  host.replaceChildren(h('div', { class: 'container nav' }, brand, h('nav', { 'aria-label': 'Navigasi utama', class: 'nav__wrap' }, list), toggle));
}

export function renderFooter(host, site, ctx) {
  const c = site.config;
  const links = navTree(site.navigation).map(({ item }) => h('li', null, navLink(item, ctx)));
  const contact = [];
  if (c.contact_email) contact.push(h('li', null, h('a', { href: 'mailto:' + c.contact_email, text: c.contact_email })));
  if (c.contact_address) contact.push(h('li', { text: c.contact_address }));
  if (c.instagram_url) contact.push(h('li', null, h('a', { href: c.instagram_url, text: 'Instagram', target: '_blank', rel: 'noopener noreferrer' })));
  host.replaceChildren(h('div', { class: 'container footer__inner' },
    h('div', { class: 'footer__about' }, h('strong', { class: 'footer__title', text: c.site_name }), h('p', { text: c.site_description })),
    links.length ? h('div', { class: 'footer__col' }, h('strong', { class: 'footer__heading', text: 'Navigasi' }), h('ul', { class: 'footer__list' }, links)) : null,
    contact.length ? h('div', { class: 'footer__col' }, h('strong', { class: 'footer__heading', text: 'Kontak' }), h('ul', { class: 'footer__list' }, contact)) : null,
    h('p', { class: 'footer__copy', text: c.footer_text })));
}

// ---------- kartu ----------
export function newsCard(n, root) {
  const href = root + 'pages/news.html?slug=' + encodeURIComponent(n.slug);
  const pic = img(n.gambar_utama, '', 'card__img');
  return h('article', { class: 'card news-card' },
    h('a', { class: 'card__media', href: href, tabindex: '-1', 'aria-hidden': 'true' }, pic || h('span', { class: 'card__placeholder', text: 'Σ' })),
    h('div', { class: 'card__body' },
      h('div', { class: 'card__meta' }, n.kategori ? h('span', { class: 'tag', text: n.kategori }) : null, h('time', { datetime: n.tanggal_publikasi, text: fmtDate(n.tanggal_publikasi) })),
      h('h3', { class: 'card__title' }, h('a', { href: href, text: n.judul })),
      n.ringkasan ? h('p', { class: 'card__text', text: n.ringkasan }) : null));
}

export function personCard(p) {
  return h('li', { class: 'person' },
    h('span', { class: 'person__avatar', 'aria-hidden': 'true', text: (String(p.Nama || '?').trim().charAt(0) || '?').toUpperCase() }),
    h('div', null, h('strong', { class: 'person__name', text: p.Nama }), h('span', { class: 'person__role', text: p.Jabatan }),
      p.Angkatan ? h('span', { class: 'person__year', text: 'Angkatan ' + p.Angkatan }) : null));
}

export function sectionHead(title, lead, extra) {
  return h('header', { class: 'section__head' }, h('h2', { class: 'section__title', text: title }), lead ? h('p', { class: 'section__lead', text: lead }) : null, extra || null);
}

/** Lightbox gambar memakai <dialog> bawaan (fokus & tombol Esc ditangani browser). */
export function openLightbox(url, alt) {
  if (!isSafeUrl(url)) return;
  const dlg = h('dialog', { class: 'lightbox', 'aria-label': 'Pratinjau gambar' },
    h('img', { src: url, alt: alt || '', referrerpolicy: 'no-referrer' }),
    h('button', { class: 'lightbox__close', type: 'button', 'aria-label': 'Tutup', text: '×', onclick: () => dlg.close() }));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
