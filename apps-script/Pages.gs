/** Pages.gs — halaman statis kustom (sheet PAGES). Status: DRAFT | PUBLISHED. */

function pagesCfg_() {
  return {
    sheet: 'PAGES', audit: 'page', listOmit: ['content'], searchFields: ['title', 'slug'],
    filter: function (r, p) { return !p.status || String(r.status).toUpperCase() === String(p.status).toUpperCase(); },
        sort: function (a, b) { return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0); },
    spec: function () {
      return {
        title: { t: 'str', required: true, max: 150 },
        slug: { t: 'str', max: 120, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
        content: { t: 'html', max: CFG.MAX_CELL_CHARS, def: '' },
        featured_image: { t: 'url', def: '' },
        status: { t: 'enum', values: ['DRAFT', 'PUBLISHED'], upper: true, def: 'DRAFT' }
      };
    },
    beforeCreate: function (d) {
      d.slug = uniquePageSlug_(d.slug || slugify_(d.title), null);
      d.id = Utilities.getUuid(); d.created_at = nowIso_(); d.updated_at = nowIso_();
    },
    beforeUpdate: function (patch, existing) {
      if (patch.slug !== undefined) patch.slug = uniquePageSlug_(patch.slug || slugify_(existing.title), String(existing.id));
      patch.updated_at = nowIso_();
    }
  };
}

function uniquePageSlug_(base, excludeId) {
  const taken = {};
  dbAll_('PAGES').forEach(function (r) { if (String(r.id) !== excludeId) taken[String(r.slug)] = true; });
  let s = base, n = 2;
  while (taken[s]) s = base + '-' + (n++);
  return s;
}

function pubGetPage_(p) {
  const slug = String(p.slug || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) throw new ApiError('NOT_FOUND', 'Halaman tidak ditemukan');
  return pubCached_('page', { slug: slug }, function () {
    const r = dbAll_('PAGES').filter(function (x) { return String(x.slug) === slug && String(x.status).toUpperCase() === 'PUBLISHED'; })[0];
    if (!r) throw new ApiError('NOT_FOUND', 'Halaman tidak ditemukan');
    return { title: String(r.title), slug: String(r.slug), content: sanitizeHtml_(r.content),
             featured_image: isSafeUrl_(String(r.featured_image || '')) ? String(r.featured_image || '') : '' };
  });
}
