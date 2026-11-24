/**
 * Auth.gs — verifikasi Firebase ID Token (login Email/Password).
 *
 * KETERBATASAN: Apps Script tidak punya fungsi verifikasi signature RSA (hanya penandatanganan).
 * Maka verifikasi signature dilakukan oleh Google lewat Identity Toolkit `accounts:lookup`
 * (menolak token palsu/kedaluwarsa/dicabut/akun dinonaktifkan), DITAMBAH validasi klaim lokal
 * (aud, iss, exp, iat, sub, provider). Token TIDAK PERNAH hanya di-decode lalu dipercaya.
 * Hasil verifikasi di-cache singkat (maks 5 menit) agar tidak memanggil Google di setiap request.
 *
 * Kata sandi sepenuhnya ditangani Firebase (hash, pembatasan percobaan, reset lewat email); backend ini
 * TIDAK PERNAH menerima atau menyimpan kata sandi.
 *
 * Daftar login = Firebase Authentication > Users (dibuat admin di Console). Verifikasi email TIDAK dipakai.
 * Konsekuensi: pendaftaran mandiri (sign-up) di Firebase WAJIB dimatikan; bila terbuka, siapa pun dapat
 * mendaftar dengan email calon pengelola lalu mengambil undangan 'pending:<email>' di sheet USERS.
 */

const ALLOWED_SIGN_IN_PROVIDERS_ = ['password'];

function verifyIdToken_(idToken) {
  const bad = function (m) { return new ApiError('UNAUTHENTICATED', m || 'Token Firebase tidak valid'); };
  if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 4096) throw bad();
  const parts = idToken.split('.');
  if (parts.length !== 3 || parts.some(function (p) { return !/^[A-Za-z0-9_-]+$/.test(p); })) throw bad();

  const cacheKey = 'idt:' + sha256Hex_(idToken);
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  let header, claims;
  try { header = JSON.parse(b64uDecode_(parts[0])); claims = JSON.parse(b64uDecode_(parts[1])); } catch (e) { throw bad(); }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') throw bad();

  const projectId = prop_('FIREBASE_PROJECT_ID', true);
  const now = Math.floor(Date.now() / 1000), skew = 60;
  if (claims.aud !== projectId) throw bad();
  if (claims.iss !== 'https://securetoken.google.com/' + projectId) throw bad();
  if (typeof claims.exp !== 'number' || claims.exp <= now - skew) throw new ApiError('TOKEN_EXPIRED', 'Token Firebase kedaluwarsa');
  if (typeof claims.iat !== 'number' || claims.iat > now + skew) throw bad();
  if (typeof claims.auth_time === 'number' && claims.auth_time > now + skew) throw bad();
  if (typeof claims.sub !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(claims.sub)) throw bad();
  if (!claims.firebase || ALLOWED_SIGN_IN_PROVIDERS_.indexOf(claims.firebase.sign_in_provider) < 0) throw bad('Metode login tidak diizinkan');

  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(prop_('FIREBASE_WEB_API_KEY', true)),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true }
  );
  const code = res.getResponseCode();
  if (code === 400 || code === 401 || code === 403) {
    // Alasan sebenarnya hanya ke log Apps Script (Executions), tidak ke klien. Lihat diagnoseAuth() di Setup.gs.
    console.warn('accounts:lookup ditolak HTTP ' + code + ': ' + String(res.getContentText()).slice(0, 300));
    throw bad();
  }
  if (code !== 200) throw new ApiError('UPSTREAM_ERROR', 'Layanan autentikasi sedang tidak tersedia');

  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { throw bad(); }
  const u = body && body.users && body.users[0];
  if (!u || u.localId !== claims.sub || u.disabled === true) throw bad();
  if (!u.email) throw bad();

  const identity = { uid: u.localId, email: String(u.email).toLowerCase(), name: String(u.displayName || claims.name || '').slice(0, 100) };
  cachePut_(cacheKey, identity, Math.min(300, claims.exp - now));
  return identity;
}
