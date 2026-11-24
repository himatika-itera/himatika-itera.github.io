import { bootAdmin } from './shell.js';
import { adminCall } from '../api.js';
import { h } from '../components.js';
import { can } from '../auth.js';
import { badge, fmtDateTime, handleError, loadingRows } from './ui.js';

bootAdmin({ title: 'Dashboard', perm: 'dashboard:read', current: 'dashboard', render: async (c, ctx) => {
  c.replaceChildren(loadingRows(4));
  let d; try { d = await adminCall('adminGetDashboard', {}); } catch (e) { await handleError(e); return; }
  const t = d.totals || {};
  const stat = (label, v, sub) => h('div', { class: 'card stat-card' }, h('div', { class: 'stat-card__n', text: String(v == null ? 0 : v) }), h('div', { class: 'stat-card__l', text: label }), sub ? h('div', { class: 'stat-card__s', text: sub }) : null);
  const quick = [['news.html', 'Tulis berita', 'news:create'], ['media.html', 'Unggah media', 'media:upload'], ['customizer.html', 'Kustomisasi website', 'config:update'], ['members.html', 'Kelola anggota', 'members:read']]
    .filter((q) => can(q[2])).map((q) => h('a', { class: 'btn btn--ghost', href: q[0], text: q[1] }));
  c.replaceChildren(...[
    h('p', { class: 'muted', text: 'Halo, ' + (ctx.user.nama || ctx.user.email) + '.' }),
    d.site && d.site.maintenance_mode ? h('div', { class: 'alert alert--warn', role: 'status', text: 'Mode pemeliharaan sedang aktif: pengunjung melihat halaman pemeliharaan.' }) : null,
    h('div', { class: 'grid-stats' }, stat('Berita', t.news, (t.news_published || 0) + ' terbit · ' + (t.news_draft || 0) + ' draf'), stat('Halaman', t.pages), stat('Anggota', t.members), stat('Pengguna', t.users)),
    quick.length ? h('div', { class: 'toolbar' }, quick) : null,
    h('div', { class: 'card' }, h('div', { class: 'card__head' }, h('h2', { text: 'Aktivitas terbaru' })),
      (d.recent_activity || []).length ? h('ul', { class: 'list' }, d.recent_activity.map((a) => h('li', null, h('span', { text: a.action + (a.target ? ' · ' + String(a.target).slice(0, 40) : '') }), badge(a.status || '', a.status === 'SUCCESS' ? 'ok' : 'danger'), h('span', { class: 'muted', text: (a.email ? a.email + ' · ' : '') + fmtDateTime(a.timestamp) })))) : h('p', { class: 'muted card__pad', text: 'Belum ada aktivitas.' }))].filter(Boolean));
} });
