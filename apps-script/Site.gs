/**
 * Site.gs — Website Customizer: konfigurasi, tema, section, navigasi.
 * Alur: Save Changes = tulis ke draft_value; Publish Changes = salin draft ke value (live);
 * Reset = hapus draft (scope 'draft') atau kembalikan ke default (scope 'all').
 * Live Preview dilakukan di klien memakai nilai draft dari adminGetSiteSettings.
 * draft_value disimpan sebagai JSON string agar "kosong" (hapus logo) dibedakan dari "tidak ada draft".
 */

function siteConfigSpec_() {
  const font = { t: 'enum', values: FONT_OPTIONS };
  return {
    site_name: { t: 'str', max: 80, required: true }, site_description: { t: 'str', max: 300 },
    logo_url: { t: 'url' }, favicon_url: { t: 'url' },
    primary_color: { t: 'color' }, secondary_color: { t: 'color' }, accent_color: { t: 'color' },
    background_color: { t: 'color' }, text_color: { t: 'color' },
    font_family: font, heading_font: font, base_font_size: { t: 'int', min: 12, max: 20 },
    footer_text: { t: 'str', max: 200 }, maintenance_mode: { t: 'bool' }, active_cabinet: { t: 'str', max: 100 },
    hero_title: { t: 'str', max: 150 }, hero_subtitle: { t: 'str', max: 300 }, hero_image: { t: 'url' },
    welcome_title: { t: 'str', max: 100 }, welcome_name: { t: 'str', max: 100 }, welcome_text: { t: 'html', max: 4000 },
    contact_email: { t: 'email', max: 120 }, contact_address: { t: 'str', max: 300 }, instagram_url: { t: 'url' }
  };
}
function themeSpec_() {
  return {
    layout: { t: 'enum', values: ['wide', 'boxed'] }, navbar_style: { t: 'enum', values: ['solid', 'transparent', 'floating'] },
    hero_style: { t: 'enum', values: ['centered', 'split', 'fullscreen'] }, footer_style: { t: 'enum', values: ['simple', 'columns'] },
    card_style: { t: 'enum', values: ['flat', 'elevated', 'outlined'] }, button_style: { t: 'enum', values: ['rounded', 'square', 'pill'] },
    border_radius: { t: 'int', min: 0, max: 32 }, shadow_style: { t: 'enum', values: ['none', 'soft', 'medium', 'strong'] },
    spacing: { t: 'enum', values: ['compact', 'normal', 'relaxed'] }, custom_css: { t: 'css' }
  };
}
function siteKv_(which) {
  return which === 'config'
    ? { sheet: 'WEBSITE_CONFIG', spec: siteConfigSpec_(), defaults: DEFAULT_CONFIG }
    : { sheet: 'THEME', spec: themeSpec_(), defaults: DEFAULT_THEME };
}

/** {key: {value, draft}} — draft undefined bila tidak ada draft. */
function kvRead_(sheetName) {
  const out = {};
  dbAll_(sheetName).forEach(function (r) {
    let draft;
    if (r.draft_value !== '' && r.draft_value !== undefined) { try { draft = JSON.parse(String(r.draft_value)); } catch (e) { draft = undefined; } }
    out[String(r.key)] = { value: String(r.value), draft: draft };
  });
  return out;
}

/** Nilai dari sheet divalidasi ulang saat dipublikasikan (baris bisa diedit manual); gagal => default. */
function safeKv_(spec, key, raw, def) {
  try {
    const v = validateValue_(key, spec[key], spec[key].t === 'bool' ? String(raw) : raw);
    return String(v);
  } catch (e) { return def; }
}

function publishedKv_(which) {
  const k = siteKv_(which), kv = kvRead_(k.sheet), out = {};
  Object.keys(k.defaults).forEach(function (key) {
    out[key] = kv[key] ? safeKv_(k.spec, key, kv[key].value, k.defaults[key]) : k.defaults[key];
  });
  return out;
}

function navRows_() {
  return dbAll_('NAVIGATION').filter(function (r) { return String(r.visibility).toUpperCase() === 'VISIBLE' && isSafeUrl_(String(r.url)); })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); })
    .map(function (r) { return { id: String(r.id), label: String(r.label), url: String(r.url), parent_id: String(r.parent_id), order: Number(r.order) || 0, target: String(r.target) === '_blank' ? '_blank' : '_self' }; });
}

function pubGetNavigation_() { return pubCached_('nav', {}, function () { return { items: navRows_() }; }); }

function pubGetWebsiteConfig_() {
  return pubCached_('site', {}, function () {
    return {
      config: publishedKv_('config'), theme: publishedKv_('theme'),
      sections: dbAll_('SECTIONS').filter(function (r) { return isTrue_(r.enabled); })
        .sort(function (a, b) { return Number(a.order) - Number(b.order); })
        .map(function (r) { return { key: String(r.key), label: String(r.label), order: Number(r.order) || 0 }; }),
      navigation: navRows_()
    };
  });
}

function adminGetSiteSettings_() {
  return {
    config: kvRead_('WEBSITE_CONFIG'), theme: kvRead_('THEME'),
    sections: dbAll_('SECTIONS').map(function (r) { return outRow_('SECTIONS', r); }),
    navigation: dbAll_('NAVIGATION').map(function (r) { return outRow_('NAVIGATION', r); }),
    defaults: { config: DEFAULT_CONFIG, theme: DEFAULT_THEME }, options: { fonts: FONT_OPTIONS }
  };
}

/** Save Changes: validasi lalu tulis ke draft_value. custom_css hanya untuk pemegang izin css:update. */
function adminUpdateSiteKV_(ctx, which, p) {
  const k = siteKv_(which), values = (p.values && typeof p.values === 'object' && !Array.isArray(p.values)) ? p.values : {};
  const keys = Object.keys(values);
  if (!keys.length) throw new ApiError('VALIDATION_ERROR', 'Tidak ada perubahan');
  keys.forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(k.spec, key)) throw new ApiError('VALIDATION_ERROR', 'Field tidak dikenal: ' + String(key).slice(0, 40)); });
  if (keys.indexOf('custom_css') >= 0 && !hasPermission_(ctx.user, 'css:update')) throw new ApiError('FORBIDDEN', 'Tidak memiliki izin mengubah CSS kustom');
  const data = validateFields_(k.spec, values, true);
  Object.keys(data).forEach(function (key) {
    const raw = JSON.stringify(String(data[key])), now = nowIso_();
    if (dbRowOfKey_(k.sheet, key)) dbUpdate_(k.sheet, key, { draft_value: raw, updated_at: now, updated_by: ctx.email });
    else dbInsert_(k.sheet, { key: key, value: k.defaults[key], draft_value: raw, updated_at: now, updated_by: ctx.email });
  });
  audit_(ctx, 'site.' + which + '.draft', k.sheet, 'SUCCESS', { keys: Object.keys(data) });
  return { saved: Object.keys(data) };
}

/** Publish Changes: draft -> value (live). */
function adminPublishSite_(ctx) {
  let n = 0;
  ['config', 'theme'].forEach(function (which) {
    const k = siteKv_(which), kv = kvRead_(k.sheet);
    Object.keys(kv).forEach(function (key) {
      if (kv[key].draft === undefined || !Object.prototype.hasOwnProperty.call(k.spec, key)) return;
      dbUpdate_(k.sheet, key, { value: String(kv[key].draft), draft_value: '', updated_at: nowIso_(), updated_by: ctx.email });
      n++;
    });
  });
  invalidatePublic_();
  audit_(ctx, 'site.publish', '', 'SUCCESS', { changed: n });
  return { published: n };
}

/** Reset to Default. scope 'draft' = buang draft; 'all' = kembalikan nilai live ke default. */
function adminResetSite_(ctx, p) {
  const scope = String(p.scope || 'draft');
  if (['draft', 'all'].indexOf(scope) < 0) throw new ApiError('VALIDATION_ERROR', 'scope tidak valid');
  ['config', 'theme'].forEach(function (which) {
    const k = siteKv_(which);
    dbAll_(k.sheet).forEach(function (r) {
      const key = String(r.key), patch = { draft_value: '', updated_at: nowIso_(), updated_by: ctx.email };
      if (scope === 'all' && Object.prototype.hasOwnProperty.call(k.defaults, key)) patch.value = k.defaults[key];
      dbUpdate_(k.sheet, key, patch);
    });
  });
  invalidatePublic_();
  audit_(ctx, 'site.reset', scope, 'SUCCESS', {});
  return { scope: scope };
}

/** Aktif/nonaktif dan urutan section (langsung live). */
function adminUpdateSections_(ctx, p) {
  const items = Array.isArray(p.items) ? p.items : [];
  if (!items.length || items.length > 20) throw new ApiError('VALIDATION_ERROR', 'items tidak valid');
  const keys = dbColumn_('SECTIONS', 'key').map(String), changes = [];
  items.forEach(function (it) {
    const d = validateFields_({ key: { t: 'str', required: true, max: 40 }, enabled: { t: 'bool' }, order: { t: 'int', min: 0, max: 99 } }, it, true);
    if (keys.indexOf(d.key) < 0) throw new ApiError('VALIDATION_ERROR', 'Section tidak dikenal');
    changes.push(d);
  });
  changes.forEach(function (d) { const patch = {}; if (d.enabled !== undefined) patch.enabled = d.enabled; if (d.order !== undefined) patch.order = d.order; if (Object.keys(patch).length) dbUpdate_('SECTIONS', d.key, patch); });
  invalidatePublic_();
  audit_(ctx, 'site.sections', '', 'SUCCESS', { count: changes.length });
  return {};
}

function navigationCfg_() {
  return {
    sheet: 'NAVIGATION', audit: 'nav',
    spec: function () {
      return {
        label: { t: 'str', required: true, max: 60 }, url: { t: 'url', required: true },
        parent_id: { t: 'str', max: 64, def: '' }, order: { t: 'int', min: 0, max: 999, def: 0 },
        visibility: { t: 'enum', values: ['VISIBLE', 'HIDDEN'], upper: true, def: 'VISIBLE' },
        target: { t: 'enum', values: ['_self', '_blank'], def: '_self' }
      };
    },
    beforeCreate: function (d) { d.id = Utilities.getUuid(); }
  };
}

function adminNavigation_(ctx, p) {
  const op = String(p.op || '');
  if (op === 'create') return crudCreate_(ctx, navigationCfg_(), p);
  if (op === 'update') return crudUpdate_(ctx, navigationCfg_(), p);
  if (op === 'delete') return crudDelete_(ctx, navigationCfg_(), p);
  throw new ApiError('VALIDATION_ERROR', 'op tidak dikenal');
}
