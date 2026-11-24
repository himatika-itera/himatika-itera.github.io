/**
 * Kustomisasi Website: pratinjau langsung (iframe same-origin + postMessage), simpan DRAF, lalu Terbitkan.
 * Perubahan tidak tampil ke pengunjung sebelum "Terbitkan". Bagian beranda (section) berlaku langsung.
 */
import { bootAdmin } from './shell.js';
import { adminCall } from '../api.js';
import { h } from '../components.js';
import { can } from '../auth.js';
import { FONT_OPTIONS } from '../config.js';
import { makeField } from './form.js';
import { toast, confirmDialog, handleError, busy, loadingRows, stateBox } from './ui.js';

const sel = (arr) => arr.map((o) => (Array.isArray(o) ? o : [o, o]));
const GROUPS = [
  ['Identitas', 'config', [
    { key: 'site_name', label: 'Nama website', type: 'text', required: true, max: 80 }, { key: 'site_description', label: 'Deskripsi', type: 'textarea', max: 300, rows: 3 },
    { key: 'logo_url', label: 'Logo', type: 'image', folder: 'Website Assets' }, { key: 'favicon_url', label: 'Favicon', type: 'image', folder: 'Website Assets' }]],
  ['Warna', 'config', [
    { key: 'primary_color', label: 'Warna utama', type: 'color' }, { key: 'secondary_color', label: 'Warna sekunder', type: 'color' }, { key: 'accent_color', label: 'Warna aksen', type: 'color' },
    { key: 'background_color', label: 'Latar belakang', type: 'color' }, { key: 'text_color', label: 'Warna teks', type: 'color' }]],
  ['Tipografi', 'config', [
    { key: 'font_family', label: 'Font isi', type: 'select', options: sel(FONT_OPTIONS) }, { key: 'heading_font', label: 'Font judul', type: 'select', options: sel(FONT_OPTIONS) },
    { key: 'base_font_size', label: 'Ukuran dasar', type: 'range', min: 12, max: 20, unit: ' px' }]],
  ['Hero', 'config', [
    { key: 'hero_title', label: 'Judul hero', type: 'text', max: 150 }, { key: 'hero_subtitle', label: 'Subjudul', type: 'textarea', max: 300, rows: 2 }, { key: 'hero_image', label: 'Gambar hero', type: 'image', folder: 'Website Assets' }]],
  ['Sambutan', 'config', [
    { key: 'welcome_title', label: 'Judul sambutan', type: 'text', max: 100 }, { key: 'welcome_name', label: 'Nama (Ketua Himpunan)', type: 'text', max: 100 },
    { key: 'welcome_text', label: 'Teks sambutan', type: 'richtext', mini: true, folder: 'Website Assets' }]],
  ['Kontak, Footer & Kabinet', 'config', [
    { key: 'contact_email', label: 'Email kontak', type: 'text', max: 120 }, { key: 'contact_address', label: 'Alamat', type: 'textarea', max: 300, rows: 2 }, { key: 'instagram_url', label: 'URL Instagram', type: 'text', max: 300 },
    { key: 'footer_text', label: 'Teks footer', type: 'text', max: 200 }, { key: 'active_cabinet', label: 'Kabinet aktif', type: 'text', max: 100, hint: 'Nama persis seperti di kolom Kabinet. Kosongkan untuk memakai kabinet terbaru.' },
    { key: 'maintenance_mode', label: 'Mode pemeliharaan (pengunjung melihat halaman pemeliharaan)', type: 'checkbox' }]],
  ['Tampilan & Tata Letak', 'theme', [
    { key: 'layout', label: 'Tata letak', type: 'select', options: [['wide', 'Lebar'], ['boxed', 'Boxed']] }, { key: 'navbar_style', label: 'Navbar', type: 'select', options: [['solid', 'Solid'], ['transparent', 'Transparan'], ['floating', 'Mengambang']] },
    { key: 'hero_style', label: 'Gaya hero', type: 'select', options: [['centered', 'Tengah'], ['split', 'Terbagi'], ['fullscreen', 'Layar penuh']] }, { key: 'footer_style', label: 'Footer', type: 'select', options: [['simple', 'Sederhana'], ['columns', 'Kolom']] },
    { key: 'card_style', label: 'Kartu', type: 'select', options: [['flat', 'Datar'], ['elevated', 'Timbul'], ['outlined', 'Garis']] }, { key: 'button_style', label: 'Tombol', type: 'select', options: [['rounded', 'Membulat'], ['square', 'Kotak'], ['pill', 'Pil']] },
    { key: 'border_radius', label: 'Radius sudut', type: 'range', min: 0, max: 32, unit: ' px' }, { key: 'shadow_style', label: 'Bayangan', type: 'select', options: [['none', 'Tanpa'], ['soft', 'Lembut'], ['medium', 'Sedang'], ['strong', 'Kuat']] },
    { key: 'spacing', label: 'Kerapatan', type: 'select', options: [['compact', 'Rapat'], ['normal', 'Normal'], ['relaxed', 'Lega']] }]]
];

bootAdmin({ title: 'Kustomisasi Website', perm: 'config:read', current: 'customizer', render: async (c) => {
  c.replaceChildren(loadingRows(5));
  let S; try { S = await adminCall('adminGetSiteSettings', {}); } catch (e) { await handleError(e); return; }
  const canEdit = can('config:update') && can('theme:update'), canPub = can('site:publish'), canCss = can('css:update'), canSec = can('sections:update');
  const F = { config: {}, theme: {} }, dirty = { config: new Set(), theme: new Set() }, cur = { config: {}, theme: {} };
  const dots = {};
  const frame = h('iframe', { class: 'cz__frame', title: 'Pratinjau website', src: '../index.html?preview=1', sandbox: 'allow-scripts allow-same-origin' });
  let ready = false, sections = S.sections.map((s) => ({ key: s.key, label: s.label, enabled: String(s.enabled).toLowerCase() === 'true', order: Number(s.order) || 0 }));
  const hasDraft = () => ['config', 'theme'].some((w) => Object.keys(S[w]).some((k) => S[w][k].draft !== undefined));
  const status = h('p', { class: 'muted small', role: 'status' });
  const refreshStatus = () => { status.textContent = dirty.config.size + dirty.theme.size ? 'Ada perubahan yang belum disimpan.' : (hasDraft() ? 'Draf tersimpan, belum diterbitkan.' : 'Semua perubahan sudah terbit.'); };

  function push() {
    if (!ready || !frame.contentWindow) return;
    const secs = sections.filter((s) => s.enabled).map((s) => ({ key: s.key, label: s.label, order: s.order }));
    frame.contentWindow.postMessage({ type: 'himatika-preview', config: Object.assign({}, cur.config), theme: Object.assign({}, cur.theme), sections: secs }, location.origin);
  }
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.source === frame.contentWindow && e.data && e.data.type === 'himatika-preview-ready') { ready = true; push(); } });

  const onChange = (which) => (key) => { cur[which][key] = String(F[which][key].get()); dirty[which].add(key); if (dots[which + key]) dots[which + key].hidden = false; refreshStatus(); push(); };
  const initial = (which, key) => { const e = S[which][key]; const v = e ? (e.draft !== undefined ? e.draft : e.value) : S.defaults[which][key]; return v; };

  const panel = h('div', { class: 'cz__fields' });
  const mkGroup = (title, which, specs) => {
    const d = h('details', { class: 'cz__group' }, h('summary', { text: title }), h('div', { class: 'cz__fields' }));
    specs.forEach((s) => {
      const f = makeField(s, onChange(which)); F[which][s.key] = f;
      const v = initial(which, s.key); cur[which][s.key] = String(v == null ? '' : v);
      f.set(s.type === 'checkbox' ? String(v).toLowerCase() === 'true' : v);
      if (!canEdit && f.input && 'disabled' in f.input) f.input.disabled = true;
      d.lastChild.append(f.el);
    });
    return d;
  };
  GROUPS.forEach((g, i) => { const d = mkGroup(g[0], g[1], g[2]); if (i === 0) d.open = true; panel.append(d); });

  if (canCss) {
    const d = h('details', { class: 'cz__group' }, h('summary', { text: 'CSS kustom (lanjutan)' }), h('div', { class: 'cz__fields' }));
    const f = makeField({ key: 'custom_css', label: 'CSS', type: 'textarea', rows: 8, max: 20000, hint: 'Hanya Super Admin. Disaring server: @import, url() eksternal, expression, dan sejenisnya dibuang.' }, onChange('theme'));
    F.theme.custom_css = f; const v = initial('theme', 'custom_css'); cur.theme.custom_css = String(v || ''); f.set(v); d.lastChild.append(f.el); panel.append(d);
  }
  // Bagian beranda: berlaku langsung (bukan draf).
  const secBox = h('div');
  const drawSecs = () => secBox.replaceChildren(...sections.slice().sort((a, b) => a.order - b.order).map((s, i, arr) => h('div', { class: 'sec-row' },
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.enabled, disabled: !canSec, onchange: (e) => { s.enabled = e.target.checked; secDirty(); } }), h('span', { text: s.label })),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '↑', 'aria-label': 'Naikkan ' + s.label, disabled: !canSec || i === 0, onclick: () => move(arr, i, -1) }),
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '↓', 'aria-label': 'Turunkan ' + s.label, disabled: !canSec || i === arr.length - 1, onclick: () => move(arr, i, 1) }))));
  const secSave = h('button', { type: 'button', class: 'btn btn--primary btn--sm', text: 'Simpan bagian beranda', disabled: true, hidden: !canSec });
  function move(arr, i, d) { const a = arr[i], b = arr[i + d]; const t = a.order; a.order = b.order; b.order = t; if (a.order === b.order) { arr.forEach((s, k) => { s.order = k + 1; }); const x = arr[i].order; arr[i].order = arr[i + d].order; arr[i + d].order = x; } secDirty(); drawSecs(); }
  function secDirty() { secSave.disabled = false; push(); }
  secSave.addEventListener('click', () => busy(secSave, async () => { try { await adminCall('adminUpdateSections', { items: sections.map((s) => ({ key: s.key, enabled: s.enabled, order: s.order })) }); toast('Bagian beranda disimpan (langsung tampil).', 'success'); secSave.disabled = true; } catch (e) { await handleError(e); } }));
  drawSecs();
  panel.append(h('details', { class: 'cz__group' }, h('summary', { text: 'Bagian beranda' }), h('div', { class: 'cz__fields' }, h('p', { class: 'field__hint', text: 'Aktifkan/nonaktifkan dan urutkan. Bagian ini langsung tampil ke pengunjung setelah disimpan.' }), secBox, secSave)));

  async function save(btn) {
    const out = {};
    for (const w of ['config', 'theme']) {
      const vals = {}; dirty[w].forEach((k) => { const v = F[w][k].get(); vals[k] = typeof v === 'boolean' ? String(v) : String(v); });
      if (Object.keys(vals).length) out[w] = vals;
    }
    if (!out.config && !out.theme) { toast('Tidak ada perubahan.', 'info'); return true; }
    return busy(btn, async () => {
      try {
        if (out.config) await adminCall('adminUpdateWebsiteConfig', { values: out.config });
        if (out.theme) await adminCall('adminUpdateTheme', { values: out.theme });
        ['config', 'theme'].forEach((w) => { Object.keys(out[w] || {}).forEach((k) => { S[w][k] = Object.assign(S[w][k] || { value: String(S.defaults[w][k]) }, { draft: out[w][k] }); }); dirty[w].clear(); });
        Object.values(dots).forEach((d) => { d.hidden = true; });
        toast('Draf tersimpan. Klik "Terbitkan" agar tampil ke pengunjung.', 'success'); refreshStatus(); return true;
      } catch (e) { if (e && e.code === 'VALIDATION_ERROR') toast(e.message, 'error'); else await handleError(e); return false; }
    });
  }
  const bSave = h('button', { type: 'button', class: 'btn btn--ghost', text: 'Simpan draf', hidden: !canEdit, onclick: (e) => save(e.currentTarget) });
  const bPub = h('button', { type: 'button', class: 'btn btn--primary', text: 'Terbitkan', hidden: !canPub, onclick: async (e) => {
    if (!(await confirmDialog({ title: 'Terbitkan perubahan', message: 'Perubahan akan langsung tampil ke seluruh pengunjung. Lanjutkan?', confirmText: 'Terbitkan' }))) return;
    const b = e.currentTarget; if (!(await save(b))) return;
    await busy(b, async () => { try { const r = await adminCall('adminPublishSite', {}); Object.keys(S).forEach((w) => { if (w === 'config' || w === 'theme') Object.keys(S[w]).forEach((k) => { if (S[w][k].draft !== undefined) { S[w][k].value = String(S[w][k].draft); S[w][k].draft = undefined; } }); }); toast('Diterbitkan (' + r.published + ' pengaturan).', 'success'); refreshStatus(); } catch (x) { await handleError(x); } });
  } });
  const bReset = h('button', { type: 'button', class: 'btn btn--danger btn--sm btn--wide', text: 'Reset…', hidden: !canPub, onclick: async () => {
    const all = await confirmDialog({ title: 'Reset pengaturan', message: 'Pilih "Reset semua" untuk mengembalikan SEMUA pengaturan (termasuk yang sudah terbit) ke bawaan. Batal untuk menutup.', confirmText: 'Reset semua', danger: true });
    if (!all) { const dr = await confirmDialog({ title: 'Buang draf', message: 'Buang draf yang belum diterbitkan dan kembali ke tampilan yang sedang terbit?', confirmText: 'Buang draf' }); if (!dr) return; await doReset('draft'); return; }
    await doReset('all');
  } });
  async function doReset(scope) { try { await adminCall('adminResetSite', { scope: scope }); toast('Reset selesai.', 'success'); location.reload(); } catch (e) { await handleError(e); } }

  const devices = h('div', { class: 'cz__devices', role: 'group', 'aria-label': 'Ukuran pratinjau' }, [['Desktop', '100%'], ['Tablet', '768px'], ['Ponsel', '390px']].map(([l, w], i) =>
    h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: l, 'aria-pressed': String(i === 0), onclick: (e) => { frame.style.width = w; devices.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } })));
  frame.addEventListener('load', () => { ready = false; });   // pesan "ready" dari halaman menandai siap menerima
  c.replaceChildren(h('div', { class: 'cz' },
    h('div', { class: 'cz__panel' }, h('div', { class: 'cz__bar' }, bSave, bPub, bReset), status, !canEdit ? h('div', { class: 'alert alert--info', text: 'Anda hanya dapat melihat pengaturan.' }) : null, panel),
    h('div', { class: 'cz__preview' }, devices, h('div', { class: 'cz__frame-wrap' }, frame))));
  refreshStatus();
} });
