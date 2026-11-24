/**
 * firebase.js — pembungkus tipis Firebase Authentication (Email/Password SAJA).
 *
 * - SDK dimuat dinamis dari gstatic (tidak ada build step). Versi dikunci agar tidak berubah diam-diam.
 * - Persistensi = browserSessionPersistence: login hilang saat tab ditutup (tidak tersimpan di localStorage).
 * - initializeAuth TANPA popupRedirectResolver: tidak ada popup/iframe/Google sign-in sama sekali.
 * - Kata sandi hanya dikirim ke Firebase (HTTPS); tidak pernah ke Apps Script, tidak pernah disimpan di sini.
 */
import { CONFIG, firebaseConfigured } from './config.js';

const BASE = 'https://www.gstatic.com/firebasejs/10.12.2/';
let ready = null;

function load() {
  if (!firebaseConfigured()) return Promise.reject(Object.assign(new Error('Firebase belum dikonfigurasi'), { code: 'FIREBASE_NOT_CONFIGURED' }));
  if (!ready) {
    ready = Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js')]).then(([appM, authM]) => {
      const f = CONFIG.FIREBASE;
      const app = appM.initializeApp({ apiKey: f.apiKey, authDomain: f.authDomain, projectId: f.projectId, appId: f.appId });
      const auth = authM.initializeAuth(app, { persistence: authM.browserSessionPersistence });
      return { m: authM, auth: auth };
    }).catch((e) => { ready = null; throw Object.assign(new Error('Gagal memuat Firebase'), { code: 'FIREBASE_LOAD' }); });
  }
  return ready;
}

/** Pengguna Firebase yang sedang login di tab ini (atau null). */
export async function currentUser() { const { auth } = await load(); await auth.authStateReady(); return auth.currentUser; }

export async function signInEmailPassword(email, password) {
  const { m, auth } = await load();
  const cred = await m.signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/** ID token segar (SDK memperbarui otomatis bila hampir kedaluwarsa). */
export async function getIdToken(forceRefresh) {
  const u = await currentUser();
  if (!u) throw Object.assign(new Error('Belum login'), { code: 'auth/no-user' });
  return u.getIdToken(!!forceRefresh);
}

export async function signOutFirebase() { try { const { m, auth } = await load(); await m.signOut(auth); } catch (e) { /* abaikan */ } }

/** Pesan ramah. Kegagalan kredensial sengaja seragam (tidak membocorkan apakah email terdaftar). */
export function firebaseMessage(e) {
  const c = e && e.code;
  if (c === 'auth/network-request-failed') return 'Tidak dapat terhubung ke Firebase. Periksa koneksi internet Anda.';
  if (c === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Tunggu beberapa menit atau reset kata sandi Anda.';
  if (c === 'auth/user-disabled') return 'Akun ini dinonaktifkan.';
  if (c === 'FIREBASE_NOT_CONFIGURED') return 'Konfigurasi Firebase belum diisi di assets/js/config.js (lihat README).';
  if (c === 'FIREBASE_LOAD') return 'Gagal memuat layanan login. Periksa koneksi internet Anda.';
  if (c === 'auth/invalid-email') return 'Format email tidak valid.';
  return 'Email atau kata sandi salah.';
}
