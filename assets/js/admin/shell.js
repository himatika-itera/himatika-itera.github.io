/**
 * shell.js — kerangka Dashboard Admin. bootAdmin({ title, perm, current, render(content, ctx) })
 * Menyaring menu dengan can(); server tetap menjadi penentu akses. Tanpa sesi => kembali ke login.
 */
import { initAuth, getState, signOut, can } from '../auth.js';
import { h } from '../components.js';
import { toast, stateBox } from './ui.js';

export const NAV = [
  ['dashboard.html', 'Dashboard', 'dashboard:read', 'dashboard'], ['news.html', 'Berita', 'news:read', 'news'], ['pages.html', 'Halaman', 'pages:read', 'pages'],
  ['members.html', 'Anggota', 'members:read', 'members'], ['content.html', 'Kabinet & Navigasi', 'struktur:read', 'content'], ['media.html', 'Media', 'media:read', 'media'],
  ['customizer.html', 'Kustomisasi Website', 'config:read', 'customizer'], ['users.html', 'Pengguna & Audit', 'users:manage', 'users']
];

export async function bootAdmin(o) {
  const root = document.getElementById('app');
  root.replaceChildren(h('div', { class: 'screen' }, h('p', { class: 'muted', text: 'Memuat…' })));
  let s;
  try { s = await initAuth(); } catch (e) { root.replaceChildren(h('div', { class: 'screen' }, stateBox(e.message || 'Gagal memuat.', 'error'))); document.body.dataset.ready = 'error'; return; }
  if (!s.signedIn) { location.replace('index.html'); return; }
  const user = getState().user;
  if (o.perm && !can(o.perm)) {
    root.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'login-card' }, h('h1', { text: 'Akses ditolak' }), h('p', { text: 'Peran Anda tidak memiliki izin untuk halaman ini.' }), h('a', { class: 'btn btn--primary', href: 'dashboard.html', text: 'Ke Dashboard' }))));
    document.body.dataset.ready = 'denied'; return;
  }
  const shell = h('div', { class: 'shell' });
  const links = NAV.filter((n) => can(n[2])).map((n) => h('a', { class: 'side__link', href: n[0], 'aria-current': n[3] === o.current ? 'page' : null, text: n[1] }));
  const side = h('aside', { class: 'side', id: 'side' }, h('div', { class: 'side__brand' }, h('span', { class: 'logo-mark', text: 'Σ' }), h('span', { text: 'HIMATIKA Admin' })),
    h('nav', { class: 'side__nav', 'aria-label': 'Menu admin' }, links),
    h('div', { class: 'side__foot' }, h('a', { href: '../index.html', target: '_blank', rel: 'noopener', text: 'Lihat website ↗' })));
  const menu = h('button', { class: 'menu-btn', type: 'button', 'aria-label': 'Buka menu', 'aria-controls': 'side', text: '☰', onclick: () => shell.classList.toggle('is-open') });
  const top = h('header', { class: 'top' }, menu, h('h1', { class: 'top__title', text: o.title }),
    h('div', { class: 'top__user' }, h('span', { class: 'top__email', text: (user.email || '') + ' · ' + user.role }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Keluar', onclick: async () => { await signOut(); location.replace('index.html'); } })));
  const content = h('main', { class: 'content', id: 'main', tabindex: '-1' });
  shell.append(side, h('div', { class: 'scrim', onclick: () => shell.classList.remove('is-open') }), h('div', { class: 'main-col' }, top, content));
  root.replaceChildren(shell);
  try { await o.render(content, { user: user }); }
  catch (e) { content.replaceChildren(stateBox('Terjadi kesalahan saat memuat halaman.', 'error')); toast(e.message || 'Kesalahan', 'error'); }
  document.body.dataset.ready = '1';
}
