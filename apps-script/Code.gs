/**
 * Code.gs — entry point Web App, router, dan middleware keamanan.
 * Deploy: Execute as "Me", Who has access "Anyone". URL publik => seluruh keamanan ada di kode ini.
 * Frontend mengirim POST dengan Content-Type text/plain (hindari preflight CORS) berisi JSON.
 */

function doGet(e) { return handle_(e, 'GET'); }
function doPost(e) { return handle_(e, 'POST'); }

// ---------- registri aksi ----------
// public:true  => tanpa login (hanya data publik, di-cache)
// session:true => membuat sesi (hanya Firebase ID Token, tanpa token aplikasi)
// perm         => izin yang dibutuhkan (null = cukup akun ACTIVE)
// write:true   => dijalankan di dalam lock; bucket => kelompok rate limit
const ACTIONS = {
  // PUBLIC
  getWebsiteConfig:     { public: true, fn: function () { return pubGetWebsiteConfig_(); } },
  getNavigation:        { public: true, fn: function () { return pubGetNavigation_(); } },
  getLatestNews:        { public: true, fn: function (p) { return pubGetLatestNews_(p); } },
  getNewsDetail:        { public: true, fn: function (p) { return pubGetNewsDetail_(p); } },
  trackNews:            { public: true, fn: function (p) { return pubTrackNews_(p); } },
  getCabinet:           { public: true, fn: function (p) { return pubGetCabinet_(p); } },
  getMembers:           { public: true, fn: function (p) { return pubGetMembers_(p); } },
  getPage:              { public: true, fn: function (p) { return pubGetPage_(p); } },
  getPublicInformation: { public: true, fn: function () { return pubGetPublicInformation_(); } },

  // SESI
  createSession:    { session: true, write: true, fn: function (c) { return sessionCreate_(c); } },
  adminLogout:      { perm: null, write: true, bucket: 'write', fn: function (c) { return adminLogout_(c); } },
  adminGetProfile:  { perm: null, fn: function (c) { return adminProfile_(c); } },

  // DASHBOARD & AUDIT
  adminGetDashboard: { perm: 'dashboard:read', fn: function (c) { return adminDashboard_(c); } },
  adminGetAuditLogs: { perm: 'audit:read', fn: function (c, p) { return adminAuditLogs_(c, p); } },

  // USERS
  adminManageUsers: { perm: 'users:manage', write: true, bucket: 'write', fn: function (c, p) { return adminManageUsers_(c, p); } },

  // BERITA
  adminListNews:  { perm: 'news:read',   fn: function (c, p) { return crudList_(newsCfg_(), p); } },
  adminGetNews:   { perm: 'news:read',   fn: function (c, p) { return crudGet_(newsCfg_(), p); } },
  adminCreateNews:{ perm: 'news:create', write: true, bucket: 'write', fn: function (c, p) { return crudCreate_(c, newsCfg_(), p); } },
  adminUpdateNews:{ perm: 'news:update', write: true, bucket: 'write', fn: function (c, p) { return crudUpdate_(c, newsCfg_(), p); } },
  adminDeleteNews:{ perm: 'news:delete', write: true, bucket: 'write', fn: function (c, p) { return crudDelete_(c, newsCfg_(), p); } },

  // HALAMAN
  adminListPages:  { perm: 'pages:read',   fn: function (c, p) { return crudList_(pagesCfg_(), p); } },
  adminGetPage:    { perm: 'pages:read',   fn: function (c, p) { return crudGet_(pagesCfg_(), p); } },
  adminCreatePage: { perm: 'pages:create', write: true, bucket: 'write', fn: function (c, p) { return crudCreate_(c, pagesCfg_(), p); } },
  adminUpdatePage: { perm: 'pages:update', write: true, bucket: 'write', fn: function (c, p) { return crudUpdate_(c, pagesCfg_(), p); } },
  adminDeletePage: { perm: 'pages:delete', write: true, bucket: 'write', fn: function (c, p) { return crudDelete_(c, pagesCfg_(), p); } },

  // ANGGOTA
  adminListMembers:  { perm: 'members:read',   fn: function (c, p) { return crudList_(memberCfg_(), p); } },
  adminCreateMember: { perm: 'members:create', write: true, bucket: 'write', fn: function (c, p) { return crudCreate_(c, memberCfg_(), p); } },
  adminUpdateMember: { perm: 'members:update', write: true, bucket: 'write', fn: function (c, p) { return crudUpdate_(c, memberCfg_(), p); } },
  adminDeleteMember: { perm: 'members:delete', write: true, bucket: 'write', fn: function (c, p) { return crudDelete_(c, memberCfg_(), p); } },

  // STRUKTUR KABINET
  adminListStruktur:  { perm: 'struktur:read',   fn: function (c, p) { return adminListStruktur_(c, p); } },
  adminCreateStruktur:{ perm: 'struktur:create', write: true, bucket: 'write', fn: function (c, p) { return crudCreate_(c, strukturCfg_(), p); } },
  adminUpdateStruktur:{ perm: 'struktur:update', write: true, bucket: 'write', fn: function (c, p) { return crudUpdate_(c, strukturCfg_(), p); } },
  adminDeleteStruktur:{ perm: 'struktur:delete', write: true, bucket: 'write', fn: function (c, p) { return crudDelete_(c, strukturCfg_(), p); } },

  // MEDIA
  adminUploadImage: { perm: 'media:upload', write: true, bucket: 'upload', fn: function (c, p) { return adminUploadImage_(c, p); } },
  adminListMedia:   { perm: 'media:read', fn: function (c, p) { return adminListMedia_(c, p); } },
  adminDeleteMedia: { perm: 'media:delete', write: true, bucket: 'write', fn: function (c, p) { return adminDeleteMedia_(c, p); } },

  // CUSTOMIZER
  adminGetSiteSettings:    { perm: 'config:read', fn: function () { return adminGetSiteSettings_(); } },
  adminUpdateWebsiteConfig:{ perm: 'config:update', write: true, bucket: 'write', fn: function (c, p) { return adminUpdateSiteKV_(c, 'config', p); } },
  adminUpdateTheme:        { perm: 'theme:update', write: true, bucket: 'write', fn: function (c, p) { return adminUpdateSiteKV_(c, 'theme', p); } },
  adminPublishSite:        { perm: 'site:publish', write: true, bucket: 'write', fn: function (c) { return adminPublishSite_(c); } },
  adminResetSite:          { perm: 'site:publish', write: true, bucket: 'write', fn: function (c, p) { return adminResetSite_(c, p); } },
  adminUpdateSections:     { perm: 'sections:update', write: true, bucket: 'write', fn: function (c, p) { return adminUpdateSections_(c, p); } },
  adminUpdateNavigation:   { perm: 'navigation:update', write: true, bucket: 'write', fn: function (c, p) { return adminNavigation_(c, p); } }
};

// ---------- router ----------
function handle_(e, method) {
  try {
    const data = route_(e, method);
    return jsonOut_({ success: true, message: 'Request berhasil', data: data === undefined ? null : data, error: null });
  } catch (err) {
    if (err instanceof ApiError) return jsonOut_({ success: false, message: err.message, data: null, error: { code: err.code } });
    console.error(err && err.stack ? err.stack : String(err));
    return jsonOut_({ success: false, message: 'Terjadi kesalahan pada server', data: null, error: { code: 'INTERNAL' } });
  }
}

function route_(e, method) {
  const req = parseRequest_(e, method);
  if (!req.action) return { service: 'himatika-api', status: 'ok' };
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, req.action)) throw new ApiError('NOT_FOUND', 'Aksi tidak dikenal');
  const def = ACTIONS[req.action];
  if (def.public) {
    if (!hit_('pub', CFG.PUBLIC_LIMIT_PER_MIN, 60)) throw new ApiError('RATE_LIMITED', 'Terlalu banyak permintaan');
    return def.fn(isPlainObj_(req.payload) ? req.payload : {});
  }
  if (method !== 'POST') throw new ApiError('BAD_REQUEST', 'Aksi ini hanya melalui POST');
  return runAdmin_(req, def);
}

function isPlainObj_(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

function parseRequest_(e, method) {
  if (!e) throw new ApiError('BAD_REQUEST', 'Request kosong');
  if (method === 'POST') {
    const body = e.postData && e.postData.contents;
    if (typeof body !== 'string' || !body) throw new ApiError('BAD_REQUEST', 'Body kosong');
    if (body.length > CFG.MAX_UPLOAD_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Request terlalu besar');
    let req;
    try { req = JSON.parse(body); } catch (x) { throw new ApiError('BAD_REQUEST', 'JSON tidak valid'); }
    if (!isPlainObj_(req) || typeof req.action !== 'string' || !/^[A-Za-z]{3,40}$/.test(req.action)) throw new ApiError('BAD_REQUEST', 'action tidak valid');
    if (req.action !== 'adminUploadImage' && body.length > CFG.MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Request terlalu besar');
    return req;
  }
  const prm = e.parameter || {};
  if (prm.action === undefined) return {};
  if (typeof prm.action !== 'string' || !/^[A-Za-z]{3,40}$/.test(prm.action)) throw new ApiError('BAD_REQUEST', 'action tidak valid');
  let payload = {};
  if (typeof prm.payload === 'string') {
    if (prm.payload.length > 2000) throw new ApiError('PAYLOAD_TOO_LARGE', 'Parameter terlalu besar');
    try { payload = JSON.parse(prm.payload); } catch (x) { throw new ApiError('BAD_REQUEST', 'payload tidak valid'); }
  } else {
    Object.keys(prm).forEach(function (k) { if (k !== 'action' && typeof prm[k] === 'string' && prm[k].length <= 500) payload[k] = prm[k]; });
  }
  return { action: prm.action, payload: payload };
}

/** Pipeline keamanan untuk seluruh aksi administratif (urutan penting). */
function runAdmin_(req, def) {
  validateEnvelope_(req, !def.session);                              // 1-2 parameter & format
  checkTimestamp_(req.timestamp);                                    // 9 toleransi waktu (murah, lebih dulu)
  if (!hit_('preauth', CFG.PRE_AUTH_LIMIT_PER_MIN, 60)) throw new ApiError('RATE_LIMITED', 'Terlalu banyak permintaan');
  const identity = verifyIdToken_(req.firebase_id_token);            // 3 Firebase ID Token

  const ctx = { uid: identity.uid, email: identity.email, identity: identity, requestId: req.request_id, action: req.action, user: null, sess: null };
  if (!def.session) {
    ctx.sess = verifySession_(req.application_token);                // 4-5 token aplikasi & kedaluwarsa
    if (ctx.sess.uid !== identity.uid) throw new ApiError('UNAUTHORIZED', 'Sesi tidak cocok dengan akun');  // 6 UID
    const user = getUser_(identity.uid);                             // 7 status, role, permission
    if (!user) throw new ApiError('UNAUTHORIZED', 'Akun tidak terdaftar');
    if (user.status !== 'ACTIVE') throw new ApiError('USER_INACTIVE', 'Akun tidak aktif');
    ctx.user = user; ctx.nama = user.nama;
    if (def.perm && !hasPermission_(user, def.perm)) {
      audit_(ctx, req.action, '', 'DENIED', { permission: def.perm });
      throw new ApiError('FORBIDDEN', 'Anda tidak memiliki izin untuk aksi ini');
    }
  }
  const bucket = def.session ? 'session' : (def.bucket || 'read');
  const exec = function () {
    checkReplay_(identity.uid, req.request_id);                      // 8 replay
    const lim = CFG.LIMITS[bucket];
    if (!hit_(bucket + ':' + identity.uid, lim.max, lim.windowS)) throw new ApiError('RATE_LIMITED', 'Terlalu banyak permintaan');
    return def.fn(ctx, isPlainObj_(req.payload) ? req.payload : {}, req);  // 10-11 validasi payload & eksekusi
  };
  return def.write ? withLock_(exec) : exec();
}

// ---------- dashboard & audit ----------
function adminDashboard_(ctx) {
  const statuses = dbColumn_('BERITA', 'status').map(function (s) { return String(s).toUpperCase(); });
  const kv = kvRead_('WEBSITE_CONFIG');
  let recent = hasPermission_(ctx.user, 'audit:read')
    ? dbTail_('AUDIT_LOGS', 10, 0).reverse()
    : dbTail_('AUDIT_LOGS', 100, 0).filter(function (r) { return String(r.uid) === ctx.uid; }).reverse().slice(0, 10);
  recent = recent.map(function (r) { return { action: r.action, target: r.target, timestamp: r.timestamp, status: r.status, email: r.email }; });
  return {
    totals: {
      news: statuses.length, news_published: statuses.filter(function (s) { return s === 'PUBLISHED'; }).length,
      news_draft: statuses.filter(function (s) { return s === 'DRAFT'; }).length,
      pages: dbCount_('PAGES'), members: dbCount_('ANGGOTA'), users: dbCount_('USERS')
    },
    site: { maintenance_mode: kv.maintenance_mode ? isTrue_(kv.maintenance_mode.value) : false },
    recent_activity: recent
  };
}

function adminAuditLogs_(ctx, p) {
  const limit = clampInt_(p.limit, 1, 200, 50), skip = clampInt_(p.skip, 0, 100000, 0);
  return { items: dbTail_('AUDIT_LOGS', limit, skip).reverse() };
}
