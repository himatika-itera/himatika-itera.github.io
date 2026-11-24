/**
 * api.js — klien API ke Google Apps Script.
 * - Aksi publik: GET (permintaan sederhana, tanpa preflight CORS).
 * - Aksi admin: POST dengan Content-Type text/plain (tanpa preflight), kredensial di body JSON,
 *   karena Apps Script tidak dapat membaca header kustom.
 * - Setiap aksi admin membawa DUA kredensial: Firebase ID token + token aplikasi (diterbitkan server, berumur pendek).
 * Frontend tidak pernah memegang secret dan tidak pernah mengirim kata sandi ke Apps Script (kata sandi hanya ke Firebase).
 */
import { CONFIG, apiConfigured } from './config.js';

export class ApiError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

let authProvider = null;
/** auth.js mendaftarkan penyedia kredensial: { getCredentials(): Promise<{appToken, idToken}> } (ID token Firebase selalu segar; sesi aplikasi diperpanjang bila hampir habis) */
export function setAuthProvider(p) { authProvider = p; }

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
}

async function fetchJson(url, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, Object.assign({ signal: ctl.signal, redirect: 'follow', credentials: 'omit' }, init));
    if (!res.ok) throw new ApiError('NETWORK', 'Server mengembalikan status ' + res.status);
    try { return await res.json(); } catch (e) { throw new ApiError('BAD_RESPONSE', 'Respons server tidak valid'); }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', 'Tidak dapat menghubungi server');
  } finally { clearTimeout(timer); }
}

function unwrap(json) {
  if (!json || typeof json !== 'object' || typeof json.success !== 'boolean') throw new ApiError('BAD_RESPONSE', 'Respons server tidak valid');
  if (json.success) return json.data;
  throw new ApiError((json.error && json.error.code) || 'ERROR', json.message || 'Terjadi kesalahan');
}

async function publicNetwork(action, payload) {
  if (!apiConfigured()) throw new ApiError('NOT_CONFIGURED', 'API belum dikonfigurasi');
  const qs = new URLSearchParams({ action: action });
  if (payload && Object.keys(payload).length) qs.set('payload', JSON.stringify(payload));
  const url = CONFIG.API_URL + '?' + qs.toString();
  try { return unwrap(await fetchJson(url, { method: 'GET' })); }
  catch (e) {
    if (e.code === 'NETWORK' || e.code === 'TIMEOUT') return unwrap(await fetchJson(url, { method: 'GET' }));
    throw e;
  }
}

// ---------- cache data publik (stale-while-revalidate) ----------
// HANYA data yang memang publik dan hanya aksi baca. Tidak pernah menyimpan token, role, atau data admin.
const CACHEABLE = new Set(['getWebsiteConfig', 'getNavigation', 'getLatestNews', 'getNewsDetail', 'getCabinet', 'getMembers', 'getPage', 'getPublicInformation']);
const CK = 'himatika:pc:v1:', CK_MAX_ENTRIES = 60;
const inflight = new Map();
const cacheOff = () => { try { const q = new URLSearchParams(location.search); return q.has('preview') || q.has('refresh'); } catch (e) { return false; } };
const ckey = (a, p) => CK + String(CONFIG.API_URL || '').slice(-12) + '|' + a + '|' + JSON.stringify(p || {});
function cacheRead(k) {
  try { const o = JSON.parse(localStorage.getItem(k) || 'null'); if (o && typeof o.t === 'number' && o.d !== undefined && Date.now() - o.t < CONFIG.PUBLIC_CACHE_MAX_AGE_MS) return o; } catch (e) { /* cache opsional */ }
  return null;
}
function cachePrune() {
  try {
    const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(CK) === 0) { let t = 0; try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch (e) { /* rusak */ } ks.push([k, t]); } }
    ks.sort((a, b) => a[1] - b[1]); ks.slice(0, Math.max(0, ks.length - CK_MAX_ENTRIES)).forEach((x) => localStorage.removeItem(x[0]));
  } catch (e) { /* opsional */ }
}
function cacheWrite(k, d) {
  const v = JSON.stringify({ t: Date.now(), d: d });
  try { localStorage.setItem(k, v); } catch (e) { cachePrune(); try { localStorage.setItem(k, v); } catch (e2) { /* penuh/diblokir: lanjut tanpa cache */ } }
  cachePrune();
}
function revalidate(k, action, payload, old, onUpdate) {
  if (inflight.has(k)) return;
  const p = publicNetwork(action, payload).then((d) => {
    cacheWrite(k, d);
    if (onUpdate && JSON.stringify(d) !== JSON.stringify(old)) { try { onUpdate(d); } catch (e) { /* abaikan */ } }
  }).catch(() => { /* gagal diam-diam: data lama tetap tampil */ }).finally(() => inflight.delete(k));
  inflight.set(k, p);
}

/**
 * Aksi publik (tanpa login). Aksi baca dicache di browser:
 *  - data lebih muda dari PUBLIC_CACHE_TTL_MS: dipakai langsung, tanpa request;
 *  - lebih tua: dipakai langsung LALU diperbarui di latar belakang (opts.onUpdate dipanggil bila ada perubahan);
 *  - belum ada: menunggu jaringan. trackNews dan aksi lain tidak pernah dicache.
 */
export async function publicCall(action, payload, opts) {
  if (!CACHEABLE.has(action) || cacheOff()) return publicNetwork(action, payload);
  const k = ckey(action, payload), c = cacheRead(k);
  if (c) { if (Date.now() - c.t >= CONFIG.PUBLIC_CACHE_TTL_MS) revalidate(k, action, payload, c.d, opts && opts.onUpdate); return c.d; }
  const d = await publicNetwork(action, payload);
  cacheWrite(k, d);
  return d;
}

/** Amplop request. `fields` berisi firebase_id_token (+ application_token kecuali createSession). Selalu di body POST, tidak pernah di URL. */
export async function postEnvelope(action, fields, payload) {
  if (!apiConfigured()) throw new ApiError('NOT_CONFIGURED', 'API belum dikonfigurasi');
  const body = Object.assign({ action: action, request_id: uuid(), timestamp: Date.now(), payload: payload || {} }, fields);
  return unwrap(await fetchJson(CONFIG.API_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
  }));
}

/** Aksi admin: menambahkan ID token Firebase + token aplikasi. */
export async function adminCall(action, payload) {
  if (!authProvider) throw new ApiError('UNAUTHENTICATED', 'Belum login');
  const cred = await authProvider.getCredentials();
  return postEnvelope(action, { firebase_id_token: cred.idToken, application_token: cred.appToken }, payload);
}

/** Pesan galat yang ramah untuk ditampilkan ke pengguna. */
export function friendlyError(e) {
  const m = {
    NOT_CONFIGURED: 'Backend belum dihubungkan.', NETWORK: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
    TIMEOUT: 'Server terlalu lama merespons. Coba lagi.', BAD_RESPONSE: 'Server memberikan respons yang tidak dikenali.',
    RATE_LIMITED: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.', BUSY: 'Server sedang sibuk. Coba lagi sebentar lagi.',
    NOT_FOUND: 'Data tidak ditemukan.', UNAUTHENTICATED: 'Sesi tidak valid. Silakan login ulang.',
    UNAUTHORIZED: 'Akun ini tidak terdaftar sebagai pengelola.', FORBIDDEN: 'Anda tidak memiliki izin untuk aksi ini.',
    USER_INACTIVE: 'Akun Anda tidak aktif.', BAD_TIMESTAMP: 'Jam perangkat Anda tidak sesuai. Periksa pengaturan tanggal dan waktu.',
    TOKEN_EXPIRED: 'Sesi berakhir. Silakan login ulang.',
    UPSTREAM_ERROR: 'Layanan autentikasi sedang tidak tersedia. Coba lagi nanti.', VALIDATION_ERROR: null, CONFLICT: null
  };
  const code = e && e.code;
  if (code && m[code] !== undefined && m[code] !== null) return m[code];
  return (e && e.message) || 'Terjadi kesalahan.';
}
