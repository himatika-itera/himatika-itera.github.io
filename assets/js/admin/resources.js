/** resources.js — definisi sumber data (berita, halaman, anggota, struktur, navigasi) untuk mountResource. */
import { h } from '../components.js';
import { badge, fmtDateTime } from './ui.js';
import { can } from '../auth.js';

const STATUS = [['DRAFT', 'Draf'], ['PUBLISHED', 'Terbit']];
const statusBadge = (s) => badge(String(s).toUpperCase() === 'PUBLISHED' ? 'Terbit' : 'Draf', String(s).toUpperCase() === 'PUBLISHED' ? 'ok' : '');
const NIM = /^[0-9]{6,15}$/, ANG = /^[0-9]{2,4}$/;
const statusButtons = (perm) => () => [
  { label: 'Simpan sebagai draf', status: 'DRAFT', kind: 'ghost' },
  can(perm + ':update') || can(perm + ':create') ? { label: 'Terbitkan', status: 'PUBLISHED', kind: 'primary' } : null].filter(Boolean);

export const NEWS = {
  title: 'Berita', noun: 'berita', perm: 'news', mode: 'page', search: 'Cari judul, kategori, penulis…',
  api: { list: 'adminListNews', get: 'adminGetNews', create: 'adminCreateNews', update: 'adminUpdateNews', delete: 'adminDeleteNews' },
  load: (row) => import('../api.js').then((m) => m.adminCall('adminGetNews', { key: row._key })),
  label: (r) => r.judul,
  filters: [{ key: 'status', label: 'Status', options: STATUS }],
  columns: [
    { label: 'Judul', render: (r) => h('span', { class: 'cell-title', text: r.judul }) },
    { label: 'Kategori', render: (r) => r.kategori || '—' },
    { label: 'Status', render: (r) => statusBadge(r.status) },
    { label: 'Diperbarui', render: (r) => fmtDateTime(r.tanggal_diperbarui) },
    { label: 'Dilihat', render: (r) => String(r.views || 0) }],
  fields: [
    { key: 'judul', label: 'Judul', type: 'text', required: true, max: 200 },
    { key: 'ringkasan', label: 'Ringkasan', type: 'textarea', max: 500, rows: 3 },
    { key: 'konten', label: 'Konten', type: 'richtext', folder: 'News' },
    { key: 'gambar_utama', label: 'Gambar utama', type: 'image', folder: 'News' },
    { key: 'gambar', label: 'Galeri gambar', type: 'imagelist', folder: 'News' },
    { key: 'slug', label: 'Slug (URL)', type: 'text', max: 120, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMsg: 'Slug hanya huruf kecil, angka, dan tanda hubung.', hint: 'Kosongkan agar dibuat otomatis dari judul.' },
    { key: 'kategori', label: 'Kategori', type: 'text', max: 50, def: 'Umum' },
    { key: 'penulis', label: 'Penulis', type: 'text', max: 100 },
    { key: 'tanggal_publikasi', label: 'Tanggal publikasi', type: 'datetime', hint: 'Boleh dijadwalkan di masa depan.' },
    { key: 'is_featured', label: 'Tampilkan sebagai unggulan', type: 'checkbox', def: false }],
  side: ['gambar_utama', 'slug', 'kategori', 'penulis', 'tanggal_publikasi', 'is_featured'],
  statusButtons: statusButtons('news'), newDefaults: { status: 'DRAFT' },
  toPayload: (v) => { if (!v.slug) delete v.slug; return v; }
};

export const PAGES = {
  title: 'Halaman', noun: 'halaman', perm: 'pages', mode: 'page', search: 'Cari judul atau slug…',
  api: { list: 'adminListPages', get: 'adminGetPage', create: 'adminCreatePage', update: 'adminUpdatePage', delete: 'adminDeletePage' },
  load: (row) => import('../api.js').then((m) => m.adminCall('adminGetPage', { key: row._key })),
  label: (r) => r.title,
  filters: [{ key: 'status', label: 'Status', options: STATUS }],
  columns: [
    { label: 'Judul', render: (r) => h('span', { class: 'cell-title', text: r.title }) },
    { label: 'Slug', render: (r) => h('code', { text: r.slug }) },
    { label: 'Status', render: (r) => statusBadge(r.status) },
    { label: 'Diperbarui', render: (r) => fmtDateTime(r.updated_at) }],
  fields: [
    { key: 'title', label: 'Judul', type: 'text', required: true, max: 150 },
    { key: 'content', label: 'Konten', type: 'richtext', folder: 'Pages' },
    { key: 'featured_image', label: 'Gambar utama', type: 'image', folder: 'Pages' },
    { key: 'slug', label: 'Slug (URL)', type: 'text', max: 120, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMsg: 'Slug hanya huruf kecil, angka, dan tanda hubung.', hint: 'Halaman tampil di pages/page.html?slug=<slug>. Tambahkan ke Navigasi bila perlu.' }],
  side: ['featured_image', 'slug'], statusButtons: statusButtons('pages'),
  toPayload: (v) => { if (!v.slug) delete v.slug; return v; }
};

export const MEMBERS = {
  title: 'Anggota', noun: 'anggota', perm: 'members', mode: 'modal', search: 'Cari NIM, nama, angkatan…',
  api: { list: 'adminListMembers', create: 'adminCreateMember', update: 'adminUpdateMember', delete: 'adminDeleteMember' },
  label: (r) => r.NAMA,
  filters: [{ key: 'status', label: 'Status', options: [['AKTIF', 'Aktif'], ['NONAKTIF', 'Nonaktif'], ['ALUMNI', 'Alumni']] }],
  columns: [{ label: 'NIM', render: (r) => String(r.NIM) }, { label: 'Nama', render: (r) => h('span', { class: 'cell-title', text: r.NAMA }) },
    { label: 'Angkatan', render: (r) => String(r.ANGKATAN || '—') }, { label: 'Status', render: (r) => badge(String(r.STATUS || '—'), String(r.STATUS).toUpperCase() === 'AKTIF' ? 'ok' : '') }],
  fields: [
    { key: 'NIM', label: 'NIM', type: 'text', required: true, max: 15, pattern: NIM, patternMsg: 'NIM harus 6–15 digit angka.', immutable: true, hint: 'NIM tidak dapat diubah setelah dibuat. NIM tidak pernah ditampilkan di website publik.' },
    { key: 'NAMA', label: 'Nama', type: 'text', required: true, max: 120 },
    { key: 'ANGKATAN', label: 'Angkatan', type: 'text', max: 4, pattern: ANG, patternMsg: 'Angkatan 2–4 digit, mis. 2023.' },
    { key: 'STATUS', label: 'Status', type: 'select', options: [['AKTIF', 'Aktif'], ['NONAKTIF', 'Nonaktif'], ['ALUMNI', 'Alumni']], def: 'AKTIF', hint: 'Hanya anggota berstatus AKTIF yang tampil di halaman Anggota.' }],
  newDefaults: { STATUS: 'AKTIF' }
};

export const STRUKTUR = {
  title: 'Struktur Kabinet', noun: 'jabatan', perm: 'struktur', mode: 'modal', search: 'Cari kabinet, nama, jabatan…',
  api: { list: 'adminListStruktur', create: 'adminCreateStruktur', update: 'adminUpdateStruktur', delete: 'adminDeleteStruktur' },
  label: (r) => r.Jabatan + ' — ' + r.Nama,
  filters: [{ key: 'kabinet', label: 'Kabinet', options: [] }],
  afterList: (d, ctx) => {
    const sel = ctx.filterEls.find((s) => s.dataset.key === 'kabinet'); if (!sel || !d.kabinet_list) return;
    const cur = sel.value; Array.from(sel.options).slice(1).forEach((o) => o.remove());
    d.kabinet_list.forEach((k) => sel.append(h('option', { value: k, text: k }))); sel.value = cur;
  },
  columns: [{ label: 'Kabinet', render: (r) => String(r.Kabinet) }, { label: 'Jabatan', render: (r) => h('span', { class: 'cell-title', text: r.Jabatan }) },
    { label: 'Nama', render: (r) => String(r.Nama || '—') }, { label: 'Angkatan', render: (r) => String(r.Angkatan || '—') }],
  fields: [
    { key: 'Kabinet', label: 'Kabinet', type: 'text', required: true, max: 100, hint: 'Contoh: Kabinet Sinergi 2025/2026.' },
    { key: 'Jabatan', label: 'Jabatan', type: 'text', required: true, max: 120 },
    { key: 'NIM', label: 'NIM', type: 'text', required: true, max: 15, pattern: NIM, patternMsg: 'NIM harus 6–15 digit angka.' },
    { key: 'Nama', label: 'Nama', type: 'text', max: 120, hint: 'Kosongkan bila NIM sudah terdaftar di Anggota.' },
    { key: 'Angkatan', label: 'Angkatan', type: 'text', max: 4, pattern: ANG, patternMsg: 'Angkatan 2–4 digit.' }],
  toPayload: (v) => { ['Nama', 'Angkatan'].forEach((k) => { if (!v[k]) delete v[k]; }); return v; },
  note: 'Urutan tampil di website mengikuti urutan baris pada sheet STRUKTUR.'
};

export const NAVIGATION = {
  title: 'Navigasi', noun: 'menu', perm: 'navigation', mode: 'modal',
  fields: [
    { key: 'label', label: 'Label', type: 'text', required: true, max: 40 },
    { key: 'url', label: 'URL', type: 'text', required: true, max: 300, datalist: ['#beranda', '#tentang', '#kontak', 'pages/news.html', 'pages/cabinet.html', 'pages/members.html', 'pages/about.html', 'pages/contact.html'], hint: 'Tautan internal (mis. pages/members.html) atau https://…' },
    { key: 'order', label: 'Urutan', type: 'number', min: 0, def: 1 },
    { key: 'visibility', label: 'Tampilan', type: 'select', options: [['VISIBLE', 'Tampil'], ['HIDDEN', 'Disembunyikan']], def: 'VISIBLE' },
    { key: 'target', label: 'Buka di', type: 'select', options: [['_self', 'Tab yang sama'], ['_blank', 'Tab baru']], def: '_self' }]
};

// Navigasi memakai satu endpoint dengan `op`; daftar diambil dari adminGetSiteSettings.
import { adminCall } from '../api.js';
NAVIGATION.api = { list: 'list', create: 'create', update: 'update', delete: 'delete' };
NAVIGATION.label = (r) => r.label;
NAVIGATION.columns = [
  { label: 'Label', render: (r) => h('span', { class: 'cell-title', text: r.label }) }, { label: 'URL', render: (r) => h('code', { text: r.url }) },
  { label: 'Urutan', render: (r) => String(r.order) }, { label: 'Tampilan', render: (r) => badge(String(r.visibility).toUpperCase() === 'VISIBLE' ? 'Tampil' : 'Tersembunyi', String(r.visibility).toUpperCase() === 'VISIBLE' ? 'ok' : '') }];
NAVIGATION.call = async (op, p) => {
  if (op === 'list') {
    const s = await adminCall('adminGetSiteSettings', {});
    const items = (s.navigation || []).slice().sort((a, b) => Number(a.order) - Number(b.order));
    return { items: items, total: items.length, page: 1, page_size: 1000 };
  }
  return adminCall('adminUpdateNavigation', Object.assign({ op: op }, p));
};
