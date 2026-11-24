/**
 * News.gs — sheet BERITA (struktur milik pemilik: id_berita, slug, judul, ringkasan, konten,
 * kategori, penulis, gambar_utama, gambar, tanggal_publikasi, tanggal_dibuat, tanggal_diperbarui,
 * status, is_featured, views, shares). Status yang dipakai: DRAFT | PUBLISHED.
 * Kolom id, tanggal, views, shares dikelola server — tidak dapat diisi dari klien.
 */

function newsCfg_() {
  return {
    sheet: 'BERITA', audit: 'news', listOmit: ['konten'], searchFields: ['judul', 'kategori', 'penulis'],
    filter: function (r, p) { return !p.status || String(r.status).toUpperCase() === String(p.status).toUpperCase(); },
        sort: function (a, b) { return (Date.parse(b.tanggal_dibuat) || 0) - (Date.parse(a.tanggal_dibuat) || 0); },
    spec: function () {
      return {
        slug: { t: 'str', max: 120, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
        judul: { t: 'str', required: true, max: 200 },
        ringkasan: { t: 'str', max: 500, def: '' },
        konten: { t: 'html', max: CFG.MAX_CELL_CHARS, def: '' },
        kategori: { t: 'str', max: 50, def: 'Umum' },
        penulis: { t: 'str', max: 100, def: '' },
        gambar_utama: { t: 'url', def: '' },
        gambar: { t: 'urllist', def: '[]' },
        tanggal_publikasi: { t: 'datetime', def: '' },
        status: { t: 'enum', values: ['DRAFT', 'PUBLISHED'], upper: true, def: 'DRAFT' },
        is_featured: { t: 'bool', def: false }
      };
    },
    beforeCreate: function (d, ctx) {
      d.slug = uniqueSlug_(d.slug || slugify_(d.judul), null);
      d.id_berita = Utilities.getUuid();
      d.tanggal_dibuat = nowIso_(); d.tanggal_diperbarui = nowIso_();
      d.views = 0; d.shares = 0;
      if (!d.penulis) d.penulis = ctx.user.nama || ctx.user.email;
      if (d.status === 'PUBLISHED' && !d.tanggal_publikasi) d.tanggal_publikasi = nowIso_();
    },
    beforeUpdate: function (patch, existing) {
      if (patch.slug !== undefined) patch.slug = uniqueSlug_(patch.slug || slugify_(existing.judul), String(existing.id_berita));
      patch.tanggal_diperbarui = nowIso_();
      if (patch.status === 'PUBLISHED' && !existing.tanggal_publikasi && !patch.tanggal_publikasi) patch.tanggal_publikasi = nowIso_();
    }
  };
}

function uniqueSlug_(base, excludeId) {
  const taken = {};
  dbAll_('BERITA').forEach(function (r) { if (String(r.id_berita) !== excludeId) taken[String(r.slug)] = true; });
  let s = base, n = 2;
  while (taken[s]) s = base + '-' + (n++);
  return s;
}

function isPublishedNow_(r) {
  if (String(r.status).toUpperCase() !== 'PUBLISHED') return false;
  const t = Date.parse(r.tanggal_publikasi);
  return isNaN(t) || t <= Date.now() + 60000;
}

function parseGambar_(v) {
  let arr = [];
  const t = String(v || '').trim();
  if (t.charAt(0) === '[') { try { arr = JSON.parse(t); } catch (e) { arr = []; } }
  else if (t) arr = t.split(/[\n,]+/);
  return (Array.isArray(arr) ? arr : []).map(function (u) { return String(u).trim(); }).filter(function (u) { return u && isSafeUrl_(u); }).slice(0, 20);
}

function newsPublicShape_(r, withContent) {
  const o = {
    id_berita: String(r.id_berita), slug: String(r.slug), judul: String(r.judul), ringkasan: String(r.ringkasan),
    kategori: String(r.kategori), penulis: String(r.penulis),
    gambar_utama: isSafeUrl_(String(r.gambar_utama || '')) ? String(r.gambar_utama || '') : '',
    gambar: parseGambar_(r.gambar), tanggal_publikasi: String(r.tanggal_publikasi),
    is_featured: isTrue_(r.is_featured), views: Number(r.views) || 0, shares: Number(r.shares) || 0
  };
  if (withContent) o.konten = sanitizeHtml_(r.konten);   // disanitasi ulang: baris bisa diisi langsung di sheet
  return o;
}

function pubGetLatestNews_(p) {
  const args = { limit: clampInt_(p.limit, 1, 20, 6), page: clampInt_(p.page, 1, 1000, 1),
    category: typeof p.category === 'string' ? p.category.slice(0, 50) : '', featured: p.featured === true || p.featured === 'true' };
  return pubCached_('news', args, function () {
    let rows = dbAll_('BERITA').filter(isPublishedNow_);
    if (args.category) rows = rows.filter(function (r) { return String(r.kategori).toLowerCase() === args.category.toLowerCase(); });
    if (args.featured) rows = rows.filter(function (r) { return isTrue_(r.is_featured); });
    rows.sort(function (a, b) { return (Date.parse(b.tanggal_publikasi) || 0) - (Date.parse(a.tanggal_publikasi) || 0); });
    return { items: rows.slice((args.page - 1) * args.limit, args.page * args.limit).map(function (r) { return newsPublicShape_(r, false); }),
             total: rows.length, page: args.page, page_size: args.limit };
  });
}

function pubGetNewsDetail_(p) {
  const slug = String(p.slug || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) throw new ApiError('NOT_FOUND', 'Berita tidak ditemukan');
  return pubCached_('newsdetail', { slug: slug }, function () {
    const r = dbAll_('BERITA').filter(function (x) { return String(x.slug) === slug && isPublishedNow_(x); })[0];
    if (!r) throw new ApiError('NOT_FOUND', 'Berita tidak ditemukan');
    return newsPublicShape_(r, true);
  });
}

/** Penghitung views/shares publik. Dedup per pengunjung anonim; tetap dapat dipalsukan (lihat dokumentasi). */
function pubTrackNews_(p) {
  const slug = String(p.slug || ''), kind = String(p.kind || ''), vid = String(p.visitor_id || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120 || ['view', 'share'].indexOf(kind) < 0 || !/^[A-Za-z0-9-]{16,64}$/.test(vid)) {
    throw new ApiError('VALIDATION_ERROR', 'Parameter tidak valid');
  }
  if (!hit_('track', CFG.TRACK_LIMIT_PER_MIN, 60)) throw new ApiError('RATE_LIMITED', 'Terlalu banyak permintaan');
  const dk = 'trk:' + sha256Hex_(kind + slug + vid).slice(0, 40);
  const c = CacheService.getScriptCache();
  if (c.get(dk)) return { counted: false };
  c.put(dk, '1', 21600);
  try {
    return withLock_(function () {
      const r = dbAll_('BERITA').filter(function (x) { return String(x.slug) === slug && isPublishedNow_(x); })[0];
      if (!r) return { counted: false };
      const f = kind === 'view' ? 'views' : 'shares';
      const patch = {}; patch[f] = (Number(r[f]) || 0) + 1;
      dbUpdate_('BERITA', String(r.id_berita), patch);
      return { counted: true };
    }, 2000);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'BUSY') return { counted: false };
    throw e;
  }
}
