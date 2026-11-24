import { bootAdmin } from './shell.js';
import { adminCall } from '../api.js';
import { h } from '../components.js';
import { can, getState } from '../auth.js';
import { makeField } from './form.js';
import { badge, dialog, toast, handleError, busy, fmtDateTime, loadingRows, stateBox } from './ui.js';

const ROLES = [['SUPER_ADMIN', 'Super Admin'], ['ADMIN', 'Admin'], ['EDITOR', 'Editor'], ['VIEWER', 'Viewer']];
const roleLabel = (r) => (ROLES.find((x) => x[0] === String(r).toUpperCase()) || [0, r])[1];

function usersTab(host) {
  const me = getState().user, body = h('div');
  const add = h('button', { type: 'button', class: 'btn btn--primary', text: '+ Undang pengguna', onclick: () => edit(null) });
  host.replaceChildren(h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, h('p', { class: 'muted', text: 'Undangan hanya mendaftarkan email + role. Buat akun loginnya (email & kata sandi) di Firebase Console > Authentication > Users. Hanya user yang ada di sana yang bisa login; kata sandi dikelola Firebase.' })), add), h('div', { class: 'card' }, body));
  async function load() {
    body.replaceChildren(loadingRows(4));
    try {
      const d = await adminCall('adminManageUsers', { op: 'list' });
      const rows = d.items.map((u) => {
        const self = u.uid === me.uid;
        const pending = String(u.uid).indexOf('pending:') === 0;
        return h('tr', null, h('td', { 'data-label': 'Email' }, h('span', { class: 'cell-title', text: u.email }), self ? badge('Anda') : null, pending ? badge('menunggu login pertama', 'warn') : null),
          h('td', { 'data-label': 'Nama' }, u.nama || '—'), h('td', { 'data-label': 'Role' }, roleLabel(u.role)),
          h('td', { 'data-label': 'Status' }, badge(String(u.status).toUpperCase() === 'ACTIVE' ? 'Aktif' : 'Nonaktif', String(u.status).toUpperCase() === 'ACTIVE' ? 'ok' : 'danger')),
          h('td', { 'data-label': 'Login terakhir' }, fmtDateTime(u.last_login)),
          h('td', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Ubah', onclick: () => edit(u, self) })));
      });
      body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Email', 'Nama', 'Role', 'Status', 'Login terakhir', ''].map((t) => h('th', { scope: 'col', text: t })))), h('tbody', null, rows))));
    } catch (e) { body.replaceChildren(stateBox('Gagal memuat pengguna.', 'error', load)); if (e && e.code && e.code !== 'NETWORK') await handleError(e); }
  }
  function edit(u, self) {
    const isNew = !u, F = {};
    const specs = [
      isNew ? { key: 'email', label: 'Email', type: 'text', required: true, max: 120, hint: 'Harus sama dengan email akun Firebase pengguna. Tidak dapat diubah.' } : null,
      { key: 'nama', label: 'Nama', type: 'text', max: 100 },
      { key: 'role', label: 'Role', type: 'select', options: ROLES, hint: self ? 'Anda tidak dapat mengubah role akun sendiri.' : null },
      !isNew ? { key: 'status', label: 'Status', type: 'select', options: [['ACTIVE', 'Aktif'], ['SUSPENDED', 'Ditangguhkan']], hint: self ? 'Anda tidak dapat mengubah status akun sendiri.' : null } : null,
      { key: 'permissions', label: 'Pembatasan izin (opsional)', type: 'text', max: 500, hint: 'Daftar izin dipisah koma, mis. news:*,media:read. Hanya dapat mempersempit izin role, tidak menambah.' }].filter(Boolean);
    const form = h('form', { class: 'form-grid form-grid--single', novalidate: true, onsubmit: (e) => e.preventDefault() });
    specs.forEach((s) => { const f = makeField(s); F[s.key] = f; f.set(u ? u[s.key] : (s.key === 'role' ? 'EDITOR' : '')); if (self && (s.key === 'role' || s.key === 'status')) f.input.disabled = true; form.append(f.el); });
    dialog({ title: isNew ? 'Undang pengguna' : 'Ubah pengguna: ' + u.email, body: form, actions: [{ label: 'Batal', kind: 'ghost', onClick: (c) => c() },
      { label: 'Simpan', kind: 'primary', onClick: async (c, b) => {
        const data = {}; specs.forEach((s) => { if (!(self && (s.key === 'role' || s.key === 'status'))) data[s.key] = F[s.key].get(); });
        if (isNew) {
          data.email = String(data.email).toLowerCase();
          if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(data.email)) { F.email.error('Email tidak valid.'); return; }
        }
        await busy(b, async () => { try { await adminCall('adminManageUsers', isNew ? { op: 'create', data: data } : { op: 'update', uid: u.uid, data: data }); toast('Pengguna disimpan.', 'success'); c(); load(); } catch (e) { if (e && /VALIDATION|CONFLICT|FORBIDDEN|NOT_FOUND/.test(e.code)) toast(e.message, 'error'); else await handleError(e); } });
      } }] });
  }
  load();
}

function auditTab(host) {
  const body = h('div'); host.replaceChildren(h('div', { class: 'card' }, body));
  async function load() {
    body.replaceChildren(loadingRows(5));
    try {
      const d = await adminCall('adminGetAuditLogs', { limit: 100 });
      if (!d.items.length) { body.replaceChildren(stateBox('Belum ada log.')); return; }
      body.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Waktu', 'Pengguna', 'Aksi', 'Target', 'Hasil'].map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', null, d.items.map((r) => h('tr', null, h('td', { 'data-label': 'Waktu' }, fmtDateTime(r.timestamp)), h('td', { 'data-label': 'Pengguna' }, r.email || '—'), h('td', { 'data-label': 'Aksi' }, r.action), h('td', { 'data-label': 'Target' }, String(r.target || '').slice(0, 50)), h('td', { 'data-label': 'Hasil' }, badge(r.status || '', r.status === 'SUCCESS' ? 'ok' : 'danger'))))))));
    } catch (e) { body.replaceChildren(stateBox('Gagal memuat log.', 'error', load)); if (e && e.code && e.code !== 'NETWORK') await handleError(e); }
  }
  load();
}

bootAdmin({ title: 'Pengguna & Audit', perm: 'users:manage', current: 'users', render: (c) => {
  const tabs = [['Pengguna', usersTab]]; if (can('audit:read')) tabs.push(['Log audit', auditTab]);
  const pane = h('div'), bar = h('div', { class: 'tabs', role: 'tablist' });
  const show = (i) => { bar.querySelectorAll('.tab').forEach((b, j) => b.setAttribute('aria-selected', String(i === j))); tabs[i][1](pane); };
  tabs.forEach((t, i) => bar.append(h('button', { type: 'button', class: 'tab', role: 'tab', text: t[0], onclick: () => show(i) })));
  c.replaceChildren(bar, pane); show(0);
} });
