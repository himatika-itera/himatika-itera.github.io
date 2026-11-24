/** Security.gs — validasi request, anti-replay, RBAC. */

function validateEnvelope_(req, needApp) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw new ApiError('BAD_REQUEST', 'Format request tidak valid');
  if (typeof req.request_id !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(req.request_id)) throw new ApiError('BAD_REQUEST', 'request_id tidak valid');
  if (typeof req.timestamp !== 'number' || !isFinite(req.timestamp)) throw new ApiError('BAD_REQUEST', 'timestamp tidak valid');
  if (typeof req.firebase_id_token !== 'string' || !req.firebase_id_token) throw new ApiError('UNAUTHENTICATED', 'Token Firebase tidak ada');
  if (needApp && (typeof req.application_token !== 'string' || !req.application_token)) throw new ApiError('UNAUTHENTICATED', 'Token aplikasi tidak ada');
  if (req.payload !== undefined && (req.payload === null || typeof req.payload !== 'object' || Array.isArray(req.payload))) throw new ApiError('BAD_REQUEST', 'payload tidak valid');
}

function checkTimestamp_(ts) {
  if (Math.abs(Date.now() - ts) > CFG.TS_TOLERANCE_MS) throw new ApiError('BAD_TIMESTAMP', 'Waktu request di luar batas toleransi');
}

/** Tolak request_id yang sudah dipakai oleh UID yang sama. Dipanggil di dalam lock untuk aksi tulis. */
function checkReplay_(uid, requestId) {
  const key = 'rid:' + sha256Hex_(uid + ':' + requestId).slice(0, 40);
  const c = CacheService.getScriptCache();
  if (c.get(key)) throw new ApiError('REPLAY', 'Request sudah pernah diproses');
  c.put(key, '1', CFG.REPLAY_TTL_S);
}

function permAllows_(list, needed) {
  return list.some(function (p) {
    return p === '*' || p === needed || (p.length > 2 && p.slice(-2) === ':*' && needed.indexOf(p.slice(0, -1)) === 0);
  });
}

/** Izin efektif = izin role; kolom permissions pengguna hanya boleh mempersempit. */
function hasPermission_(user, needed) {
  const rp = Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, user.role) ? ROLE_PERMISSIONS[user.role] : null;
  if (!rp || !permAllows_(rp, needed)) return false;
  if (user.permissions && user.permissions.length && !permAllows_(user.permissions, needed)) return false;
  return true;
}
