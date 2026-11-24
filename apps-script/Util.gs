/** Util.gs — error, sanitasi, validasi, cache, lock, encoding. */

class ApiError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

let LOCK_HELD_ = false;

function nowIso_() { return new Date().toISOString(); }
function isTrue_(v) { return v === true || String(v).toLowerCase() === 'true'; }
function clampInt_(v, min, max, def) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function pick_(o, fields) { const r = {}; fields.forEach(function (f) { r[f] = o[f] === undefined ? '' : o[f]; }); return r; }

// ---------- encoding / hashing ----------
function b64u_(str) { return Utilities.base64EncodeWebSafe(str, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function b64uBytes_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function b64uDecode_(s) {
  while (s.length % 4) s += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString('UTF-8');
}
function sha256Hex_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b < 0 ? b + 256 : b)).toString(16).padStart(2, '0'); }).join('');
}
/** Perbandingan waktu-konstan untuk string. */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function slugify_(s) {
  const x = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return x || 'item';
}

// ---------- URL, HTML, CSS ----------
/** URL aman: https, mailto, #hash, path relatif. Menolak javascript:, data:, //host, spasi/kutip/kontrol. */
function isSafeUrl_(v) {
  v = String(v);
  if (v.length > 1000) return false;
  if (/[\u0000-\u0020\u007f-\u009f<>"'`\\]/.test(v)) return false;
  if (/^https:\/\/[^\/]/i.test(v)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(v)) return true;
  if (/^\/\//.test(v)) return false;
  if (/^(#|\/|\.{1,2}\/)/.test(v)) return true;
  return !/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(v);
}
function escAttr_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const HTML_ALLOWED = {
  p: [], br: [], hr: [], strong: [], b: [], em: [], i: [], u: [], s: [], ul: [], ol: [], li: [], blockquote: [],
  h2: [], h3: [], h4: [], code: [], pre: [], table: [], thead: [], tbody: [], tr: [], th: [], td: [],
  figure: [], figcaption: [], a: ['href', 'title'], img: ['src', 'alt', 'title']
};
const HTML_STRAY_RE = new RegExp('<(?!\\/?(?:' + Object.keys(HTML_ALLOWED).join('|') + ')(?:\\s[^<>]*)?>)', 'g');

/** Sanitasi HTML berbasis allowlist (tanpa DOM). Dipakai saat menyimpan DAN saat menampilkan. */
function sanitizeHtml_(html) {
  let s = String(html == null ? '' : html);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|select)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, function (m, tag, attrs) {
    tag = tag.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(HTML_ALLOWED, tag)) return '';
    if (m.charAt(1) === '/') return '</' + tag + '>';
    const allowed = HTML_ALLOWED[tag], out = [];
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a;
    while ((a = re.exec(attrs))) {
      const name = a[1].toLowerCase();
      let val = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : a[4]);
      if (allowed.indexOf(name) < 0) continue;
      val = val.replace(/&amp;/g, '&');
      if ((name === 'href' || name === 'src') && !isSafeUrl_(val)) continue;
      out.push(name + '="' + escAttr_(val) + '"');
    }
    if (tag === 'a') out.push('rel="noopener noreferrer"');
    if (tag === 'img') out.push('loading="lazy"');
    return '<' + tag + (out.length ? ' ' + out.join(' ') : '') + '>';
  });
  return s.replace(HTML_STRAY_RE, '&lt;');
}

/** Sanitasi CSS kustom: buang @import, expression(), javascript:, url() non-https, kurung sudut, backslash. */
function sanitizeCss_(css) {
  let s = String(css || '');
  s = s.replace(/[<>\\]/g, '');
  s = s.replace(/@import[^;]*;?/gi, '');
  s = s.replace(/expression\s*\(/gi, '(');
  s = s.replace(/javascript\s*:/gi, '');
  s = s.replace(/-moz-binding\s*:[^;}]*/gi, '');
  s = s.replace(/behavior\s*:[^;}]*/gi, '');
  s = s.replace(/url\(\s*(['"]?)(?!https:\/\/|\/(?!\/)|\.\/|assets\/)[^)]*\)/gi, 'none');
  return s.trim();
}

// ---------- validasi field ----------
/**
 * Validasi berbasis skema. Hanya field yang ada di spec yang disalin (anti mass-assignment).
 * partial=true: untuk update (field yang tidak dikirim dilewati).
 */
function validateFields_(spec, input, partial) {
  const out = {};
  input = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  Object.keys(spec).forEach(function (k) {
    const s = spec[k];
    const present = Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined && input[k] !== null;
    if (!present) {
      if (!partial && s.required) throw new ApiError('VALIDATION_ERROR', 'Field "' + k + '" wajib diisi');
      if (!partial && s.def !== undefined) out[k] = s.def;
      return;
    }
    out[k] = validateValue_(k, s, input[k]);
  });
  return out;
}

function validateValue_(k, s, v) {
  const bad = function (m) { return new ApiError('VALIDATION_ERROR', 'Field "' + k + '" tidak valid' + (m ? ': ' + m : '')); };
  switch (s.t) {
    case 'str': case 'email': {
      if (typeof v !== 'string' && typeof v !== 'number') throw bad();
      let x = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      if (s.upper) x = x.toUpperCase();
      if (s.required && !x) throw bad('wajib diisi');
      if (x && s.max && x.length > s.max) throw bad('terlalu panjang');
      if (x && s.t === 'email' && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(x)) throw bad();
      if (x && s.pattern && !s.pattern.test(x)) throw bad();
      return x;
    }
    case 'html': {
      if (typeof v !== 'string') throw bad();
      const x = sanitizeHtml_(v).trim();
      if (s.required && !x) throw bad('wajib diisi');
      if (x.length > (s.max || CFG.MAX_CELL_CHARS)) throw bad('terlalu panjang');
      return x;
    }
    case 'css': {
      if (typeof v !== 'string' || v.length > 8000) throw bad();
      return sanitizeCss_(v);
    }
    case 'url': {
      if (typeof v !== 'string') throw bad();
      const x = v.trim();
      if (!x) { if (s.required) throw bad('wajib diisi'); return ''; }
      if (!isSafeUrl_(x)) throw bad();
      return x;
    }
    case 'urllist': {
      let arr = v;
      if (!Array.isArray(arr)) {
        const t = String(v).trim();
        if (!t) arr = [];
        else if (t.charAt(0) === '[') { try { arr = JSON.parse(t); } catch (e) { throw bad(); } }
        else arr = t.split(/[\n,]+/);
      }
      if (!Array.isArray(arr) || arr.length > 20) throw bad();
      arr = arr.map(function (u) { return String(u).trim(); }).filter(Boolean);
      arr.forEach(function (u) { if (!isSafeUrl_(u)) throw bad(); });
      const j = JSON.stringify(arr);
      if (j.length > 4000) throw bad('terlalu panjang');
      return j;
    }
    case 'color': {
      if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v.trim())) throw bad();
      return v.trim().toUpperCase();
    }
    case 'enum': {
      let x = String(v).trim();
      if (s.upper) x = x.toUpperCase();
      if (s.values.indexOf(x) < 0) throw bad();
      return x;
    }
    case 'bool': {
      if (v === true || v === 'true' || v === 'TRUE') return true;
      if (v === false || v === 'false' || v === 'FALSE') return false;
      throw bad();
    }
    case 'int': {
      const n = Number(v);
      if (typeof v === 'boolean' || v === '' || !Number.isInteger(n)) throw bad();
      if ((s.min !== undefined && n < s.min) || (s.max !== undefined && n > s.max)) throw bad('di luar rentang');
      return n;
    }
    case 'datetime': {
      if (v === '') return '';
      const d = new Date(v);
      if (typeof v !== 'string' || isNaN(d.getTime())) throw bad();
      return d.toISOString();
    }
    default: throw new Error('tipe spec tidak dikenal: ' + s.t);
  }
}

// ---------- cache, rate limit, lock ----------
function cacheGet_(k) {
  try { const v = CacheService.getScriptCache().get(k); return v === null || v === undefined ? null : JSON.parse(v); } catch (e) { return null; }
}
function cachePut_(k, v, ttlS) {
  try {
    const s = JSON.stringify(v);
    if (s.length > 90000) return;                 // batas CacheService 100 KB/nilai
    CacheService.getScriptCache().put(k, s, Math.max(1, Math.min(21600, ttlS || 60)));
  } catch (e) { /* cache best-effort */ }
}
/** Hitung hit; true bila masih di bawah batas. Counter tidak atomik (toleransi kecil). */
function hit_(key, max, windowS) {
  const cache = CacheService.getScriptCache();
  const bucket = Math.floor(Date.now() / (windowS * 1000));
  const k = 'rl:' + key + ':' + bucket;
  const n = parseInt(cache.get(k) || '0', 10) + 1;
  cache.put(k, String(n), windowS + 5);
  return n <= max;
}
function pubVersion_() {
  const c = CacheService.getScriptCache();
  let v = c.get('pubver');
  if (!v) { v = Utilities.getUuid().slice(0, 8); c.put('pubver', v, 21600); }
  return v;
}
function invalidatePublic_() { CacheService.getScriptCache().remove('pubver'); }
function pubCached_(name, args, fn) {
  const key = 'pub:' + pubVersion_() + ':' + name + ':' + sha256Hex_(JSON.stringify(args)).slice(0, 32);
  const hit = cacheGet_(key);
  if (hit !== null) return hit;
  const val = fn();
  cachePut_(key, val, CFG.PUBLIC_CACHE_S);
  return val;
}
/** Jalankan fn di dalam LockService (tidak reentrant-safe di Apps Script, jadi dilacak manual). */
function withLock_(fn, waitMs) {
  if (LOCK_HELD_) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || CFG.LOCK_WAIT_MS)) throw new ApiError('BUSY', 'Server sedang sibuk, coba lagi');
  LOCK_HELD_ = true;
  try { return fn(); } finally { LOCK_HELD_ = false; lock.releaseLock(); }
}
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
