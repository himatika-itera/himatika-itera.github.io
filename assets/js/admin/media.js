/**
 * media.js — unggah gambar ke Google Drive lewat backend, pustaka media, dan pemilih gambar.
 * Gambar diperkecil (maks 1600 px) dan di-encode ulang di browser sebelum diunggah: ukuran lebih kecil,
 * dan metadata EXIF (termasuk lokasi GPS) ikut terbuang. GIF diunggah apa adanya.
 */
import { adminCall } from '../api.js';
import { h, img as imgEl, isSafeUrl } from '../components.js';
import { can } from '../auth.js';
import { toast, dialog, handleError, fmtDateTime, confirmDialog, debounce, loadingRows, stateBox, busy } from './ui.js';

const MAX_BYTES = 5 * 1024 * 1024, MAX_SIDE = 1600;
export const FOLDERS = [['News', 'Berita'], ['Pages', 'Halaman'], ['Members', 'Anggota'], ['Cabinet', 'Kabinet'], ['Website Assets', 'Aset Website']];
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

async function prepare(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Format tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.');
  let blob = file, mime = file.type;
  if (file.type !== 'image/gif') {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('File gambar rusak atau tidak dapat dibaca.'); }
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
    blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
    if (!blob) throw new Error('Gagal memproses gambar.');
    mime = blob.type;
  }
  if (!EXT[mime]) throw new Error('Format hasil pemrosesan tidak didukung.');
  if (blob.size > MAX_BYTES) throw new Error('Ukuran gambar melebihi 5 MB.');
  return { blob: blob, mime: mime };
}
function toBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Gagal membaca file.')); r.readAsDataURL(blob); });
}

/** Unggah satu file. Mengembalikan rekaman MEDIA ({public_url, ...}). */
export async function uploadImage(file, folder) {
  const p = await prepare(file);
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '_').slice(0, 80) || 'gambar';
  return adminCall('adminUploadImage', { filename: base + '.' + EXT[p.mime], mime_type: p.mime, folder: folder || 'News', data_base64: await toBase64(p.blob) });
}

function dropzone(onFiles, multiple) {
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: multiple ? true : null, hidden: true });
  const zone = h('div', { class: 'dropzone' }, h('p', { text: 'Tarik gambar ke sini, atau' }),
    h('button', { type: 'button', class: 'btn btn--ghost', text: 'Pilih file…', onclick: () => input.click() }),
    h('p', { class: 'small', text: 'JPG, PNG, WebP, atau GIF. Gambar diperkecil otomatis (maks 1600 px).' }), input);
  input.addEventListener('change', () => { if (input.files.length) onFiles(Array.from(input.files)); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
  zone.addEventListener('drop', (e) => { const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (f.length) onFiles(f); });
  return zone;
}

/** Unggah banyak file berurutan dengan laporan hasil. */
async function uploadMany(files, folder, onEach) {
  for (const f of files) {
    try { const rec = await uploadImage(f, folder); toast('Terunggah: ' + f.name, 'success', 2500); if (onEach) onEach(rec); }
    catch (e) { if (e && e.code) await handleError(e); else toast(f.name + ': ' + e.message, 'error'); }
  }
}

function mediaCard(rec, o) {
  const thumb = imgEl(rec.public_url, rec.filename, '');
  const pick = h('button', { type: 'button', class: 'media-item__img', 'aria-label': (o.select ? 'Pilih ' : 'Lihat ') + rec.filename }, thumb || h('span', { class: 'small', text: 'Tidak ada pratinjau' }));
  const card = h('div', { class: 'media-item', 'aria-pressed': 'false' }, pick,
    h('div', { class: 'media-item__meta' }, h('span', { class: 'media-item__name', text: rec.filename, title: rec.filename }), h('span', { class: 'muted', text: fmtDateTime(rec.uploaded_at) })));
  if (o.select) pick.addEventListener('click', () => o.select(rec, card));
  else pick.addEventListener('click', () => window.open(rec.public_url, '_blank', 'noopener'));
  if (o.actions) card.append(h('div', { class: 'media-item__btns' }, o.actions(rec, card)));
  return card;
}

/** Pustaka media berpaginasi. o: {select(rec, card), actions(rec, card), pageSize} */
export function mediaLibrary(o) {
  const host = h('div'), grid = h('div', { class: 'media-grid' }), more = h('div', { class: 'toolbar', style: null });
  const st = { page: 1, q: '', total: 0 };
  const q = h('input', { type: 'search', class: 'input', placeholder: 'Cari nama file…', 'aria-label': 'Cari media', maxlength: '60' });
  const status = h('div');
  async function load(reset) {
    if (reset) { st.page = 1; grid.replaceChildren(); }
    status.replaceChildren(loadingRows(2)); more.replaceChildren();
    try {
      const d = await adminCall('adminListMedia', { page: st.page, page_size: o.pageSize || 24, q: st.q });
      st.total = d.total; status.replaceChildren();
      d.items.forEach((r) => grid.append(mediaCard(r, o)));
      if (!d.total) status.replaceChildren(stateBox(st.q ? 'Tidak ada media yang cocok.' : 'Belum ada media. Unggah gambar pertama Anda.'));
      if (st.page * d.page_size < d.total) more.replaceChildren(h('button', { type: 'button', class: 'btn btn--ghost', text: 'Muat lebih banyak', onclick: () => { st.page++; load(false); } }));
    } catch (e) { status.replaceChildren(stateBox('Gagal memuat media.', 'error', () => load(reset))); if (e && e.code && e.code !== 'NETWORK') await handleError(e); }
  }
  q.addEventListener('input', debounce(() => { st.q = q.value.trim(); load(true); }, 300));
  host.append(h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, q)), grid, status, more);
  return { el: host, reload: () => load(true), prepend: (rec) => { grid.prepend(mediaCard(rec, o)); status.replaceChildren(); }, load: load };
}

/**
 * Pemilih gambar (modal): tab Pustaka / Unggah / URL.
 * Mengembalikan Promise<string|string[]|null> (URL). multiple=true => array.
 */
export function pickImage(o) {
  const opt = o || {};
  return new Promise((resolve) => {
    const chosen = new Map(); let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const folder = h('select', { class: 'select', 'aria-label': 'Folder tujuan', style: null }, FOLDERS.map((f) => h('option', { value: f[0], text: f[1], selected: f[0] === (opt.folder || 'News') })));
    const count = h('span', { class: 'muted small', role: 'status' });
    const upd = () => { count.textContent = chosen.size ? chosen.size + ' dipilih' : ''; };
    const select = (rec, card) => {
      if (!opt.multiple) { chosen.clear(); body.querySelectorAll('.media-item[aria-pressed="true"]').forEach((c) => c.setAttribute('aria-pressed', 'false')); }
      if (chosen.has(rec.public_url)) { chosen.delete(rec.public_url); card.setAttribute('aria-pressed', 'false'); } else { chosen.set(rec.public_url, rec); card.setAttribute('aria-pressed', 'true'); }
      upd();
    };
    const lib = mediaLibrary({ select: select, pageSize: 18 });
    const up = h('div', null, h('div', { class: 'field' }, h('label', { class: 'field__label', text: 'Simpan di folder' }), folder),
      dropzone((files) => uploadMany(opt.multiple ? files : files.slice(0, 1), folder.value, (rec) => { lib.prepend(rec); select(rec, lib.el.querySelector('.media-item')); showTab('lib'); }), opt.multiple));
    const urlIn = h('input', { type: 'text', class: 'input', placeholder: 'https://…', 'aria-label': 'URL gambar', maxlength: '1000' });
    const urlPane = h('div', null, h('div', { class: 'field' }, h('label', { class: 'field__label', text: 'URL gambar (https)' }), urlIn, h('p', { class: 'field__hint', text: 'Gunakan hanya bila gambar sudah tersedia di internet.' })));
    const panes = { lib: lib.el, up: up, url: urlPane };
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const showTab = (k) => { Object.keys(panes).forEach((p) => { panes[p].hidden = p !== k; }); tabs.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.k === k))); };
    [['lib', 'Pustaka'], ['up', 'Unggah baru'], ['url', 'Dari URL']].forEach(([k, l]) => { if (k === 'up' && !can('media:upload')) return; tabs.append(h('button', { type: 'button', class: 'tab', role: 'tab', 'data-k': k, text: l, onclick: () => showTab(k) })); });
    const body = h('div', null, tabs, panes.lib, panes.up, panes.url);
    showTab('lib'); lib.reload();
    dialog({
      title: opt.multiple ? 'Pilih gambar' : 'Pilih gambar', body: body, wide: true, onClose: () => finish(null),
      actions: [{ label: 'Batal', kind: 'ghost', onClick: (c) => { finish(null); c(); } },
        { label: 'Gunakan', kind: 'primary', onClick: (c) => {
          let urls = Array.from(chosen.keys());
          const u = urlIn.value.trim();
          if (!urls.length && u) { if (!/^https:\/\//i.test(u) || !isSafeUrl(u)) { toast('URL harus diawali https:// dan valid.', 'error'); return; } urls = [u]; }
          if (!urls.length) { toast('Pilih minimal satu gambar.', 'error'); return; }
          finish(opt.multiple ? urls : urls[0]); c();
        } }]
    }).foot.prepend(count);
  });
}

/** Halaman Media penuh. */
export function mountMediaPage(host) {
  const canUpload = can('media:upload'), canDelete = can('media:delete');
  const folder = h('select', { class: 'select', 'aria-label': 'Folder tujuan', style: null }, FOLDERS.map((f) => h('option', { value: f[0], text: f[1] })));
  const lib = mediaLibrary({
    pageSize: 24,
    actions: (rec, card) => [
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Salin URL', onclick: async () => { try { await navigator.clipboard.writeText(rec.public_url); toast('URL disalin.', 'success'); } catch (e) { toast(rec.public_url, 'info', 12000); } } }),
      canDelete ? h('button', { type: 'button', class: 'btn btn--danger btn--sm', text: 'Hapus', onclick: async (ev) => {
        if (!(await confirmDialog({ title: 'Hapus media', message: 'Hapus "' + rec.filename + '"? Gambar yang masih dipakai di berita/halaman akan rusak.', confirmText: 'Hapus', danger: true }))) return;
        await busy(ev.currentTarget, async () => { try { await adminCall('adminDeleteMedia', { key: rec._key || rec.id }); card.remove(); toast('Media dihapus.', 'success'); } catch (e) { await handleError(e); } });
      } }) : null
    ]
  });
  host.replaceChildren(...[
    canUpload ? h('div', { class: 'card card__pad', style: null }, h('div', { class: 'field' }, h('label', { class: 'field__label', text: 'Simpan di folder' }), folder),
      dropzone((files) => uploadMany(files, folder.value, (rec) => lib.prepend(rec)), true)) : null,
    h('div', { class: 'card card__pad' }, lib.el)].filter(Boolean));
  lib.reload();
}
