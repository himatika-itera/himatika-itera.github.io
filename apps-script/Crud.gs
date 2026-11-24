/**
 * Crud.gs — operasi CRUD generik berbasis konfigurasi.
 * cfg: { sheet, audit, spec(), beforeCreate(data, ctx), beforeUpdate(patch, existing, ctx),
 *        listOmit:[kolom], filter(row, p), sort(a, b), searchFields:[kolom] }
 * Dipanggil di dalam lock (aksi tulis). Output memakai _key sebagai pengenal baris.
 */

function crudList_(cfg, p) {
  const page = clampInt_(p.page, 1, 100000, 1), size = clampInt_(p.page_size, 1, 100, 25);
  let rows = dbAll_(cfg.sheet);
  if (cfg.filter) rows = rows.filter(function (r) { return cfg.filter(r, p); });
  const q = typeof p.q === 'string' ? p.q.trim().toLowerCase().slice(0, 100) : '';
  if (q && cfg.searchFields) {
    rows = rows.filter(function (r) { return cfg.searchFields.some(function (f) { return String(r[f]).toLowerCase().indexOf(q) >= 0; }); });
  }
  if (cfg.sort) rows.sort(cfg.sort);
  const items = rows.slice((page - 1) * size, page * size).map(function (r) {
    const o = outRow_(cfg.sheet, r);
    (cfg.listOmit || []).forEach(function (f) { delete o[f]; });
    return o;
  });
  return { items: items, total: rows.length, page: page, page_size: size };
}

function crudGet_(cfg, p) {
  const r = dbFind_(cfg.sheet, String(p.key || ''));
  if (!r) throw new ApiError('NOT_FOUND', 'Data tidak ditemukan');
  return outRow_(cfg.sheet, r);
}

function crudCreate_(ctx, cfg, p) {
  const data = validateFields_(cfg.spec(), p.data, false);
  if (cfg.beforeCreate) cfg.beforeCreate(data, ctx);
  dbInsert_(cfg.sheet, data);
  audit_(ctx, cfg.audit + '.create', keyOf_(cfg.sheet, data), 'SUCCESS', { fields: Object.keys(data) });
  invalidatePublic_();
  return outRow_(cfg.sheet, data);
}

function crudUpdate_(ctx, cfg, p) {
  const key = String(p.key || '');
  if (!key || key.length > 400) throw new ApiError('VALIDATION_ERROR', 'key wajib diisi');
  const patch = validateFields_(cfg.spec(), p.data, true);
  if (!Object.keys(patch).length) throw new ApiError('VALIDATION_ERROR', 'Tidak ada perubahan');
  const existing = dbFind_(cfg.sheet, key);
  if (!existing) throw new ApiError('NOT_FOUND', 'Data tidak ditemukan');
  if (cfg.beforeUpdate) cfg.beforeUpdate(patch, existing, ctx);
  const rec = dbUpdate_(cfg.sheet, key, patch);
  audit_(ctx, cfg.audit + '.update', key, 'SUCCESS', { fields: Object.keys(patch) });
  invalidatePublic_();
  return outRow_(cfg.sheet, rec);
}

function crudDelete_(ctx, cfg, p) {
  const key = String(p.key || '');
  if (!key || key.length > 400) throw new ApiError('VALIDATION_ERROR', 'key wajib diisi');
  dbDelete_(cfg.sheet, key);
  audit_(ctx, cfg.audit + '.delete', key, 'SUCCESS', {});
  invalidatePublic_();
  return {};
}
