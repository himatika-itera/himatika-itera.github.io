/**
 * crud.js — mountResource(host, R): daftar + pencarian + filter + paginasi + form tambah/ubah/hapus.
 * R: { title, noun, api:{list,get,create,update,delete}, perm (awalan izin, mis. 'news'), columns:[{label,render(row)}],
 *      filters:[{key,label,options:[[v,l]]}], fields:[spec], mode:'modal'|'page', side:[keys], search:placeholder,
 *      load(row)->Promise<row> (opsional, ambil detail penuh), toPayload(values,row), afterList(d,ctx), newDefaults }
 * Izin di UI hanyalah kenyamanan; server memeriksa setiap aksi.
 */
import { adminCall } from '../api.js';
import { h } from '../components.js';
import { can } from '../auth.js';
import { makeField } from './form.js';
import { toast, dialog, confirmDialog, handleError, busy, debounce, loadingRows, stateBox } from './ui.js';

export function mountResource(host, R) {
  const call = R.call || adminCall;
  const st = { page: 1, q: '', f: {}, size: 20 };
  const canC = can(R.perm + ':create'), canU = can(R.perm + ':update'), canD = can(R.perm + ':delete');
  const body = h('div'), pager = h('div', { class: 'pager' });
  const q = h('input', { type: 'search', class: 'input', placeholder: R.search || 'Cari…', 'aria-label': 'Cari', maxlength: '100' });
  const filterEls = (R.filters || []).map((f) => {
    const s = h('select', { class: 'select', 'aria-label': f.label }, h('option', { value: '', text: f.label + ': semua' }), (f.options || []).map((o) => h('option', { value: o[0], text: o[1] })));
    s.addEventListener('change', () => { st.f[f.key] = s.value; st.page = 1; load(); });
    s.dataset.key = f.key; return s;
  });
  const addBtn = canC ? h('button', { type: 'button', class: 'btn btn--primary', text: '+ Tambah ' + R.noun, onclick: () => openForm(null) }) : null;
  const listView = h('div', null, h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, q), filterEls, addBtn), h('div', { class: 'card' }, body), pager);
  host.replaceChildren(listView);
  q.addEventListener('input', debounce(() => { st.q = q.value.trim(); st.page = 1; load(); }, 300));

  async function load() {
    body.replaceChildren(loadingRows(5)); pager.replaceChildren();
    try {
      const p = Object.assign({ page: st.page, page_size: st.size, q: st.q }, st.f);
      Object.keys(p).forEach((k) => { if (p[k] === '' || p[k] == null) delete p[k]; });
      const d = await call(R.api.list, p);
      if (R.afterList) R.afterList(d, { filterEls: filterEls });
      if (!d.items.length) { body.replaceChildren(stateBox(st.q || Object.values(st.f).some(Boolean) ? 'Tidak ada data yang cocok.' : 'Belum ada data.')); return; }
      const head = h('tr', null, R.columns.map((c) => h('th', { scope: 'col', text: c.label })), h('th', { scope: 'col', class: 'actions' }, h('span', { class: 'sr-only', text: 'Aksi' })));
      const rows = d.items.map((row) => h('tr', null, R.columns.map((c) => h('td', { 'data-label': c.label }, c.render(row))),
        h('td', { class: 'actions' },
          (canU || R.readOnlyView) ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: canU ? 'Ubah' : 'Lihat', onclick: () => openForm(row) }) : null,
          canD ? h('button', { type: 'button', class: 'btn btn--danger btn--sm', text: 'Hapus', onclick: (e) => del(row, e.currentTarget) }) : null)));
      body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, head), h('tbody', null, rows))));
      const pages = Math.max(1, Math.ceil(d.total / d.page_size));
      pager.replaceChildren(h('span', { class: 'muted', text: d.total + ' data · halaman ' + d.page + ' dari ' + pages }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '‹ Sebelumnya', disabled: d.page <= 1, onclick: () => { st.page--; load(); } }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Berikutnya ›', disabled: d.page >= pages, onclick: () => { st.page++; load(); } }));
    } catch (e) { body.replaceChildren(stateBox('Gagal memuat data.', 'error', load)); if (e && e.code && e.code !== 'NETWORK') await handleError(e); }
  }

  async function del(row, btn) {
    const label = R.label ? R.label(row) : R.noun;
    if (!(await confirmDialog({ title: 'Hapus ' + R.noun, message: 'Hapus "' + label + '"? Tindakan ini tidak dapat dibatalkan.', confirmText: 'Hapus', danger: true }))) return;
    await busy(btn, async () => { try { await call(R.api.delete, { key: row._key }); toast(R.noun + ' dihapus.', 'success'); load(); } catch (e) { await handleError(e); } });
  }

  async function openForm(row) {
    let full = row;
    if (row && R.load) { try { full = await R.load(row); } catch (e) { await handleError(e); return; } }
    const isNew = !row, readOnly = !isNew && !canU;
    const fields = {}, form = h('form', { class: 'form-grid' + (R.mode === 'page' ? '' : ' form-grid--single'), novalidate: true });
    const side = h('div', { class: 'card card__pad' }), main = h('div');
    R.fields.forEach((spec) => {
      const f = makeField(spec); fields[spec.key] = f;
      const v = full ? full[spec.key] : (R.newDefaults ? R.newDefaults[spec.key] : undefined);
      f.set(v === undefined ? (spec.def === undefined ? '' : spec.def) : v);
      if (readOnly && f.input && 'disabled' in f.input) f.input.disabled = true;
      if (!isNew && spec.immutable && f.input) f.input.disabled = true;
      ((R.side || []).indexOf(spec.key) >= 0 ? side : main).append(f.el);
    });
    form.append(main);
    if (R.side) form.append(side);
    const collect = () => {
      const vals = {}; R.fields.forEach((s) => { if (!isNew && s.immutable) return; vals[s.key] = fields[s.key].get(); });
      return R.toPayload ? R.toPayload(vals, full) : vals;
    };
    const check = () => {
      let ok = true;
      R.fields.forEach((s) => {
        const f = fields[s.key]; let m = '';
        const v = f.get();
        if (s.required && (v === '' || v == null)) m = s.label + ' wajib diisi.';
        else if (s.pattern && v && !s.pattern.test(String(v))) m = s.patternMsg || ('Format ' + s.label + ' tidak valid.');
        f.error(m); if (m) ok = false;
      });
      if (!ok) { const first = form.querySelector('[aria-invalid="true"]'); if (first && first.focus) first.focus(); }
      return ok;
    };
    const save = async (btn, extra) => {
      if (!check()) { toast('Periksa kembali isian yang ditandai.', 'error'); return false; }
      let data = collect(); if (extra) Object.assign(data, extra);
      return busy(btn, async () => {
        try {
          if (isNew) await call(R.api.create, { data: data }); else await call(R.api.update, { key: full._key, data: data });
          toast(R.noun + ' disimpan.', 'success'); return true;
        } catch (e) { if (e && e.code === 'VALIDATION_ERROR') toast(e.message, 'error'); else await handleError(e); return false; }
      });
    };
    const title = (isNew ? 'Tambah ' : (readOnly ? 'Lihat ' : 'Ubah ')) + R.noun;
    if (R.mode === 'page') {
      const back = () => { host.replaceChildren(listView); load(); };
      const bar = h('div', { class: 'sticky-actions' },
        h('button', { type: 'button', class: 'btn btn--ghost', text: 'Batal', onclick: back }),
        ...(R.statusButtons && !readOnly ? R.statusButtons().map((sb) => h('button', { type: 'button', class: 'btn ' + (sb.kind || 'ghost'), text: sb.label, onclick: async (e) => { if (await save(e.currentTarget, { status: sb.status })) back(); } })) : []),
        !readOnly && !R.statusButtons ? h('button', { type: 'button', class: 'btn btn--primary', text: 'Simpan', onclick: async (e) => { if (await save(e.currentTarget)) back(); } }) : null);
      host.replaceChildren(h('button', { type: 'button', class: 'back-link', text: '← Kembali ke daftar', onclick: back }), h('h2', { text: title }), form, bar);
      form.addEventListener('submit', (e) => e.preventDefault());
    } else {
      form.addEventListener('submit', (e) => e.preventDefault());
      dialog({ title: title, body: form, wide: !!R.wide, actions: [{ label: readOnly ? 'Tutup' : 'Batal', kind: 'ghost', onClick: (c) => c() },
        readOnly ? null : { label: 'Simpan', kind: 'primary', onClick: async (c, b) => { if (await save(b)) { c(); load(); } } }].filter(Boolean) });
    }
  }
  load();
  return { reload: load };
}
