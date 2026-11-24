/**
 * Token.gs — Application Token (sesi) bertanda tangan HMAC-SHA256.
 * Diterbitkan SERVER hanya setelah Firebase ID Token terverifikasi. Berumur pendek (30 menit), terikat UID,
 * dapat dicabut (SESSIONS + cache). Bukan pengganti Firebase ID Token: keduanya dikirim pada setiap request.
 */

function signToken_(payloadB64) {
  const secret = prop_('APP_TOKEN_SECRET', true);
  if (secret.length < 32) throw new Error('APP_TOKEN_SECRET terlalu pendek');
  return b64uBytes_(Utilities.computeHmacSha256Signature(payloadB64, secret));
}

/** Terbitkan sesi baru. Panggil di dalam lock. */
function issueSession_(uid) {
  const now = Date.now();
  const payload = { v: 1, sid: Utilities.getUuid(), uid: uid, iat: now, exp: now + CFG.SESSION_TTL_MS };
  const p = b64u_(JSON.stringify(payload));
  dbInsert_('SESSIONS', { sid: payload.sid, uid: uid, issued_at: payload.iat, expires_at: payload.exp, revoked: false });
  cachePut_('sess:' + payload.sid, 'ok', Math.ceil(CFG.SESSION_TTL_MS / 1000));
  return { token: p + '.' + signToken_(p), sid: payload.sid, exp: payload.exp };
}

/** Verifikasi: tanda tangan, struktur, kedaluwarsa, status pencabutan. Mengembalikan payload. */
function verifySession_(token) {
  const bad = function () { return new ApiError('UNAUTHENTICATED', 'Sesi tidak valid'); };
  if (typeof token !== 'string' || token.length > 600) throw bad();
  const parts = token.split('.');
  if (parts.length !== 2) throw bad();
  if (!safeEqual_(signToken_(parts[0]), parts[1])) throw bad();
  let pl;
  try { pl = JSON.parse(b64uDecode_(parts[0])); } catch (e) { throw bad(); }
  if (!pl || pl.v !== 1 || typeof pl.sid !== 'string' || typeof pl.uid !== 'string' || typeof pl.exp !== 'number') throw bad();
  if (Date.now() >= pl.exp) throw new ApiError('TOKEN_EXPIRED', 'Sesi kedaluwarsa');
  const state = cacheGet_('sess:' + pl.sid);
  if (state === 'revoked') throw bad();
  if (state !== 'ok') {
    const row = dbFind_('SESSIONS', pl.sid);
    if (!row || isTrue_(row.revoked)) throw bad();
    cachePut_('sess:' + pl.sid, 'ok', Math.ceil((pl.exp - Date.now()) / 1000));
  }
  return pl;
}

function revokeSession_(sid) {
  if (dbRowOfKey_('SESSIONS', sid)) dbUpdate_('SESSIONS', sid, { revoked: true });
  cachePut_('sess:' + sid, 'revoked', 21600);
}

/** Cabut semua sesi aktif milik UID (suspend, ganti role, dsb). Panggil di dalam lock. */
function revokeUserSessions_(uid) {
  const now = Date.now();
  dbAll_('SESSIONS').forEach(function (s) {
    if (String(s.uid) === String(uid) && !isTrue_(s.revoked) && Number(s.expires_at) > now) revokeSession_(String(s.sid));
  });
}
