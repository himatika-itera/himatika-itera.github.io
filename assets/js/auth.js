/**
 * auth.js — login Firebase Authentication (Email/Password) + sesi aplikasi dari server.
 *
 * Alur: email + kata sandi -> Firebase (HTTPS) -> ID token -> aksi `createSession` di Apps Script, yang memverifikasi
 * token itu dan menerbitkan token aplikasi (30 menit). Setiap aksi admin membawa KEDUANYA.
 * Kata sandi hanya pernah dikirim ke Firebase; tidak disimpan, tidak dikirim ke Apps Script.
 * Di browser hanya ada: sesi Firebase (sessionStorage, per-tab) dan token aplikasi (sessionStorage, per-tab).
 * Role/izin SELALU berasal dari respons server, bukan dari storage.
 */
import { postEnvelope, setAuthProvider, ApiError, friendlyError } from './api.js';
import * as FB from './firebase.js';

const SKEY = 'himatika:session';
const MARGIN_MS = 60 * 1000;
let state = { user: null, appToken: '', expiresAt: 0 };
const listeners = new Set();
let creating = null;

function emit() { listeners.forEach((cb) => { try { cb(getState()); } catch (e) { /* abaikan */ } }); }
export function getState() { return { user: state.user, signedIn: !!state.user, expiresAt: state.expiresAt }; }
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

function persist() { try { sessionStorage.setItem(SKEY, JSON.stringify({ t: state.appToken, e: state.expiresAt })); } catch (e) { /* opsional */ } }
function unpersist() { try { sessionStorage.removeItem(SKEY); } catch (e) { /* opsional */ } }
function clear() { state = { user: null, appToken: '', expiresAt: 0 }; unpersist(); }
function restore() {
  try { const o = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); if (o && typeof o.t === 'string' && o.e - Date.now() > MARGIN_MS) return o; } catch (e) { /* abaikan */ }
  return null;
}

/** Tukar ID token Firebase dengan token aplikasi. Panggilan bersamaan digabung. */
function createSession(idToken) {
  if (!creating) {
    creating = postEnvelope('createSession', { firebase_id_token: idToken }, {})
      .then((r) => { state = { user: r.user, appToken: r.application_token, expiresAt: r.expires_at }; persist(); return r; })
      .finally(() => { creating = null; });
  }
  return creating;
}

setAuthProvider({
  async getCredentials() {
    let idToken;
    try { idToken = await FB.getIdToken(); } catch (e) { throw new ApiError('UNAUTHENTICATED', 'Sesi login berakhir'); }
    if (!state.appToken || state.expiresAt - Date.now() <= MARGIN_MS) await createSession(idToken);   // perpanjang: sesi baru dari ID token segar
    return { appToken: state.appToken, idToken: idToken };
  }
});

const isAuthReject = (e) => e && (e.code === 'UNAUTHENTICATED' || e.code === 'TOKEN_EXPIRED' || e.code === 'UNAUTHORIZED' || e.code === 'USER_INACTIVE');

/** Dipanggil saat halaman admin dibuka: memulihkan sesi (jika masih ada) dan memvalidasinya ke server. */
export async function initAuth() {
  let fbUser;
  try { fbUser = await FB.currentUser(); } catch (e) { clear(); if (e.code === 'FIREBASE_NOT_CONFIGURED') return getState(); throw new Error(FB.firebaseMessage(e)); }
  if (!fbUser) { clear(); return getState(); }
  try {
    const idToken = await fbUser.getIdToken();
    const saved = restore();
    let ok = false;
    if (saved) {
      state = { user: null, appToken: saved.t, expiresAt: saved.e };
      try { const p = await postEnvelope('adminGetProfile', { firebase_id_token: idToken, application_token: saved.t }, {}); state.user = p.user; state.expiresAt = p.session_expires_at || saved.e; ok = true; }
      catch (e) { if (!isAuthReject(e)) throw e; clear(); }
    }
    if (!ok) await createSession(idToken);
  } catch (e) {
    clear();
    if (isAuthReject(e)) { await FB.signOutFirebase(); return getState(); }
    throw new Error(e && e.code && FB.firebaseMessage(e) !== 'Email atau kata sandi salah.' ? FB.firebaseMessage(e) : friendlyError(e));
  }
  emit(); return getState();
}

/** Login email + kata sandi. Melempar Error berpesan ramah.*/
export async function signIn(email, password) {
  let user;
  try { user = await FB.signInEmailPassword(String(email || '').trim(), String(password || '')); }
  catch (e) { throw new Error(FB.firebaseMessage(e)); }
  try { await createSession(await user.getIdToken()); }
  catch (e) {
    await FB.signOutFirebase(); clear();
    throw new Error(friendlyError(e));
  }
  emit(); return getState();
}

export async function signOut() {
  try {
    if (state.appToken) { const idToken = await FB.getIdToken(); await postEnvelope('adminLogout', { firebase_id_token: idToken, application_token: state.appToken }, {}); }
  } catch (e) { /* tetap keluar */ }
  clear(); await FB.signOutFirebase(); emit();
}

/** Pemeriksaan izin di UI hanyalah kenyamanan; server tetap memeriksa setiap aksi. */
export function can(perm) {
  const u = state.user; if (!u) return false;
  if (perm == null) return true;
  const R = {
    SUPER_ADMIN: ['*'],
    ADMIN: ['dashboard:read', 'news:*', 'pages:*', 'members:*', 'struktur:*', 'media:*', 'navigation:*', 'sections:update', 'config:*', 'theme:*', 'site:publish'],
    EDITOR: ['dashboard:read', 'news:*', 'pages:*', 'media:read', 'media:upload'], VIEWER: ['dashboard:read']
  };
  const ok = (list) => list.some((p) => p === '*' || p === perm || (p.slice(-2) === ':*' && perm.indexOf(p.slice(0, -1)) === 0));
  if (!ok(R[u.role] || [])) return false;
  return !(u.permissions && u.permissions.length) || ok(u.permissions);
}
