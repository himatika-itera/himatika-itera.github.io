/**
 * theme.js — menerapkan konfigurasi tema sebagai CSS Variables + atribut data-*.
 * Semua nilai divalidasi ulang di sini (defense in depth): nilai dari cache/API yang tidak sah
 * diganti default, sehingga tidak ada nilai mentah yang masuk ke CSS.
 */
import { FALLBACK, FONT_OPTIONS } from './config.js';
import { isSafeUrl } from './components.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const ENUMS = {
  layout: ['wide', 'boxed'], navbar_style: ['solid', 'transparent', 'floating'],
  hero_style: ['centered', 'split', 'fullscreen'], footer_style: ['simple', 'columns'],
  card_style: ['flat', 'elevated', 'outlined'], button_style: ['rounded', 'square', 'pill'],
  shadow_style: ['none', 'soft', 'medium', 'strong'], spacing: ['compact', 'normal', 'relaxed']
};

function rgb(hex) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
function toHex(c) { return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
function mix(a, b, t) { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v * (1 - t) + y[i] * t)); }
function lum(hex) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb(hex).map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
/** Warna teks (hitam/putih) dengan kontras terbaik di atas `bg`. */
export function readableOn(bg) { return contrast(bg, '#111111') >= contrast(bg, '#FFFFFF') ? '#111111' : '#FFFFFF'; }

function col(v, def) { return typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : def; }
function en(k, v, def) { return ENUMS[k].indexOf(v) >= 0 ? v : def; }
function font(v, def) { return FONT_OPTIONS.indexOf(v) >= 0 ? v : def; }
function num(v, min, max, def) { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : def; }

const SHADOWS = {
  none: 'none', soft: '0 2px 12px rgba(16,24,40,.08)',
  medium: '0 6px 20px rgba(16,24,40,.14)', strong: '0 12px 32px rgba(16,24,40,.22)'
};
const PADS = { compact: '3rem', normal: '5rem', relaxed: '7rem' };

let fontLink = null, sheet = null;

function loadFonts(families) {
  const uniq = Array.from(new Set(families));
  const href = 'https://fonts.googleapis.com/css2?' + uniq.map((f) => 'family=' + f.replace(/ /g, '+') + ':wght@400;500;600;700').join('&') + '&display=swap';
  if (!fontLink) { fontLink = document.createElement('link'); fontLink.rel = 'stylesheet'; document.head.appendChild(fontLink); }
  if (fontLink.getAttribute('href') !== href) fontLink.setAttribute('href', href);
}

/** CSS kustom dipasang lewat constructable stylesheet (tidak memerlukan 'unsafe-inline' pada CSP). */
function applyCustomCss(css) {
  const clean = String(css || '').replace(/[<>\\]/g, '').replace(/@import[^;]*;?/gi, '').slice(0, 8000);
  try {
    if (!('adoptedStyleSheets' in document) || typeof CSSStyleSheet === 'undefined') return;
    if (!sheet) sheet = new CSSStyleSheet();
    sheet.replaceSync(clean);
    if (document.adoptedStyleSheets.indexOf(sheet) < 0) document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
  } catch (e) { /* CSS kustom bersifat opsional */ }
}

export function applyTheme(config, theme) {
  const d = FALLBACK.config, t = FALLBACK.theme;
  config = config || {}; theme = theme || {};
  const root = document.documentElement, set = (k, v) => root.style.setProperty(k, v);

  const primary = col(config.primary_color, d.primary_color), secondary = col(config.secondary_color, d.secondary_color);
  const accent = col(config.accent_color, d.accent_color), bg = col(config.background_color, d.background_color), text = col(config.text_color, d.text_color);
  const body = font(config.font_family, d.font_family), head = font(config.heading_font, d.heading_font);
  const radius = num(theme.border_radius, 0, 32, 12);

  set('--primary-color', primary); set('--primary-dark', mix(primary, '#000000', 0.18)); set('--primary-soft', mix(primary, '#FFFFFF', 0.85));
  set('--primary-contrast', readableOn(primary));
  set('--secondary-color', secondary); set('--accent-color', accent); set('--accent-contrast', readableOn(accent));
  set('--background-color', bg); set('--text-color', text);
  set('--muted-color', mix(text, bg, 0.42)); set('--border-color', mix(text, bg, 0.86)); set('--surface-color', secondary);
  set('--border-radius', radius + 'px');
  set('--font-body', '"' + body + '", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
  set('--font-heading', '"' + head + '", "' + body + '", system-ui, sans-serif');
  set('--base-font-size', num(config.base_font_size, 12, 20, 16) + 'px');
  const shadow = en('shadow_style', theme.shadow_style, t.shadow_style), spacing = en('spacing', theme.spacing, t.spacing);
  set('--shadow', SHADOWS[shadow]); set('--section-pad', PADS[spacing]);
  const layout = en('layout', theme.layout, t.layout);
  set('--max-width', layout === 'boxed' ? '1040px' : '1200px');

  Object.keys(ENUMS).forEach((k) => { root.dataset[k.replace(/_style$/, '').replace(/_(.)/g, (m, c) => c.toUpperCase())] = en(k, theme[k], t[k]); });
  loadFonts([body, head]);
  applyCustomCss(theme.custom_css);
}

/** Judul, deskripsi, favicon, dan tag Open Graph. */
export function setDocumentMeta(config, pageTitle, description) {
  const name = (config && config.site_name) || FALLBACK.config.site_name;
  const title = pageTitle ? pageTitle + ' — ' + name : name + ' — ' + ((config && config.site_description) || '');
  document.title = title.replace(/\s+—\s*$/, '');
  const desc = String(description || (config && config.site_description) || '').slice(0, 200);
  const upsert = (sel, make, val) => {
    let el = document.head.querySelector(sel);
    if (!el) { el = make(); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };
  const meta = (attr, key) => () => { const m = document.createElement('meta'); m.setAttribute(attr, key); return m; };
  upsert('meta[name="description"]', meta('name', 'description'), desc);
  upsert('meta[property="og:title"]', meta('property', 'og:title'), document.title);
  upsert('meta[property="og:description"]', meta('property', 'og:description'), desc);
  upsert('meta[property="og:site_name"]', meta('property', 'og:site_name'), name);
  if (config && config.favicon_url && isSafeUrl(config.favicon_url)) {
    let link = document.head.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.setAttribute('href', config.favicon_url);
  }
}
