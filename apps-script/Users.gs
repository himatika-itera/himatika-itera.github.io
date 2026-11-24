/**
 * Users.gs — pengguna, sesi login, manajemen user (RBAC).
 * Identitas utama = Firebase UID. Admin baru didaftarkan dengan email (uid 'pending:<email>')
 * dan di-bind ke UID asli pada login pertama (akun dibuat admin di Firebase Console; sign-up mandiri wajib dimatikan).
 * Kata sandi dikelola Firebase; sheet ini tidak menyimpan kata sandi apa pun.
 */

function splitPerms_(s) {
  return String(s || '').split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return /^[a-z_*]+:[a-z_*]+$/.test(x); });
}
function userFromRow_(r) {
  return {
    uid: String(r.uid), email: String(r.email).toLowerCase(), nama: String(r.nama || ''),
    role: String(r.role).toUpperCase(), permissions: splitPerms_(r.permissions), status: String(r.status).toUpperCase()
  };
}
function publicUser_(u) { return { uid: u.uid, email: u.email, nama: u.nama, role: u.role, permissions: u.permissions, status: u.status }; }

function getUser_(uid) {
  const ck = 'user:' + uid;
  const c = cacheGet_(ck);
  if (c) return c;
  const row = dbFind_('USERS', uid);
  if (!row) return null;
  const u = userFromRow_(row);
  if (ROLES.indexOf(u.role) < 0) return null;         // role tidak dikenal => tanpa akses
  cachePut_(ck, u, CFG.USER_CACHE_S);
  return u;
}
function invalidateUser_(uid) { CacheService.getScriptCache().remove('user:' + uid); }

/** Cari user berdasarkan UID; jika belum ada, bind baris 'pending:<email>' (akun Firebase sah). Di dalam lock. */
function resolveUserForLogin_(identity) {
  const u = getUser_(identity.uid);
  if (u) return u;
  const pendingKey = 'pending:' + identity.email;
  if (!dbFind_('USERS', pendingKey)) return null;
  dbUpdate_('USERS', pendingKey, { uid: identity.uid, updated_at: nowIso_() });
  invalidateUser_(identity.uid);
  audit_({ uid: identity.uid, email: identity.email }, 'user.bind_uid', identity.uid, 'SUCCESS', {});
  return getUser_(identity.uid);
}

/** Aksi createSession: ID Token sudah diverifikasi; terbitkan application token. */
function sessionCreate_(ctx) {
  const id = ctx.identity;
  const user = resolveUserForLogin_(id);
  if (!user) { console.warn('login ditolak: akun tidak terdaftar'); throw new ApiError('UNAUTHORIZED', 'Akun tidak terdaftar sebagai pengelola'); }
  if (user.status !== 'ACTIVE') {
    audit_({ uid: user.uid, email: user.email }, 'auth.login', '', 'DENIED', { reason: user.status });
    throw new ApiError('USER_INACTIVE', 'Akun tidak aktif');
  }
  const s = issueSession_(user.uid);
  dbUpdate_('USERS', user.uid, { last_login: nowIso_(), email: id.email, nama: user.nama || id.name });
  invalidateUser_(user.uid);
  audit_({ uid: user.uid, email: user.email }, 'auth.login', s.sid, 'SUCCESS', {});
  return { application_token: s.token, expires_at: s.exp, user: publicUser_(getUser_(user.uid)) };
}

function adminProfile_(ctx) { return { user: publicUser_(ctx.user), session_expires_at: ctx.sess.exp }; }

function adminLogout_(ctx) {
  revokeSession_(ctx.sess.sid);
  audit_(ctx, 'auth.logout', ctx.sess.sid, 'SUCCESS', {});
  return {};
}

/** adminManageUsers — hanya SUPER_ADMIN (izin users:manage). op: list | create | update */
function adminManageUsers_(ctx, p) {
  const op = String(p.op || '');
  if (op === 'list') {
    return { items: dbAll_('USERS').filter(function (r) { return String(r.uid); }).map(function (r) { return outRow_('USERS', r); }) };
  }
  if (op === 'create') {
    const d = validateFields_({
      email: { t: 'email', required: true, max: 120 }, nama: { t: 'str', max: 100, def: '' },
      role: { t: 'enum', values: ROLES, required: true, upper: true }, permissions: { t: 'str', max: 500, def: '' }
    }, p.data, false);
    const email = d.email.toLowerCase();
    if (dbAll_('USERS').some(function (r) { return String(r.email).toLowerCase() === email; })) throw new ApiError('CONFLICT', 'Email sudah terdaftar');
    const rec = { uid: 'pending:' + email, email: email, nama: d.nama, role: d.role, permissions: splitPerms_(d.permissions).join(','), status: 'ACTIVE', created_at: nowIso_(), updated_at: nowIso_(), last_login: '' };
    dbInsert_('USERS', rec);
    audit_(ctx, 'user.create', rec.uid, 'SUCCESS', { email: email, role: rec.role });
    return outRow_('USERS', rec);
  }
  if (op === 'update') {
    const uid = String(p.uid || '');
    if (!uid || uid.length > 200) throw new ApiError('VALIDATION_ERROR', 'uid wajib diisi');
    const target = dbFind_('USERS', uid);
    if (!target) throw new ApiError('NOT_FOUND', 'Pengguna tidak ditemukan');
    const cur = userFromRow_(target);
    const d = validateFields_({
      nama: { t: 'str', max: 100 }, role: { t: 'enum', values: ROLES, upper: true },
      status: { t: 'enum', values: USER_STATUS, upper: true }, permissions: { t: 'str', max: 500 }
    }, p.data, true);
    if (!Object.keys(d).length) throw new ApiError('VALIDATION_ERROR', 'Tidak ada perubahan');
    const sensitive = d.role !== undefined || d.status !== undefined || d.permissions !== undefined;
    if (uid === ctx.uid && ((d.role !== undefined && d.role !== cur.role) || (d.status !== undefined && d.status !== cur.status))) {
      throw new ApiError('FORBIDDEN', 'Tidak dapat mengubah role atau status akun sendiri');
    }
    const newRole = d.role !== undefined ? d.role : cur.role, newStatus = d.status !== undefined ? d.status : cur.status;
    if (cur.role === 'SUPER_ADMIN' && cur.status === 'ACTIVE' && (newRole !== 'SUPER_ADMIN' || newStatus !== 'ACTIVE')) {
      const others = dbAll_('USERS').filter(function (r) { return String(r.uid) !== uid && String(r.role).toUpperCase() === 'SUPER_ADMIN' && String(r.status).toUpperCase() === 'ACTIVE'; });
      if (!others.length) throw new ApiError('CONFLICT', 'Harus ada minimal satu Super Admin aktif');
    }
    if (d.permissions !== undefined) d.permissions = splitPerms_(d.permissions).join(',');
    d.updated_at = nowIso_();
    dbUpdate_('USERS', uid, d);
    invalidateUser_(uid);
    if (sensitive) revokeUserSessions_(uid);
    audit_(ctx, 'user.update', uid, 'SUCCESS', { fields: Object.keys(d) });
    return outRow_('USERS', dbFind_('USERS', uid));
  }
  throw new ApiError('VALIDATION_ERROR', 'op tidak dikenal');
}
