/**
 * ui.js — notifikasi, dialog, penanganan galat, utilitas kecil untuk Dashboard Admin.
 * Seluruh teks lewat textContent (via h()); tidak ada innerHTML dari data.
 */
import { h } from '../components.js';
import { friendlyError } from '../api.js';

let toastHost = null;
export function toast(msg, type, ms) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', role: 'region', 'aria-label': 'Notifikasi' }); document.body.append(toastHost); }
  const t = h('div', { class: 'toast toast--' + (type || 'info'), role: type === 'error' ? 'alert' : 'status' },
    h('span', { text: msg }), h('button', { class: 'toast__x', type: 'button', 'aria-label': 'Tutup', text: '×', onclick: () => t.remove() }));
  toastHost.append(t);
  const life = ms === undefined ? (type === 'error' ? 7000 : 4000) : ms;
  if (life) setTimeout(() => t.remove(), life);
  return t;
}

/** Dialog modal berbasis <dialog>. actions: [{label, kind, onClick(close, btn), disabled}] */
export function dialog(opts) {
  const dlg = h('dialog', { class: 'modal' + (opts.wide ? ' modal--wide' : ''), 'aria-label': opts.title });
  const close = () => { if (dlg.open) dlg.close(); };
  const foot = h('div', { class: 'modal__foot' });
  (opts.actions || []).forEach((a) => {
    const b = h('button', { type: 'button', class: 'btn btn--' + (a.kind || 'ghost'), text: a.label, disabled: a.disabled });
    b.addEventListener('click', () => a.onClick && a.onClick(close, b));
    foot.append(b);
  });
  dlg.append(h('div', { class: 'modal__head' }, h('h2', { text: opts.title }), h('button', { class: 'modal__x', type: 'button', 'aria-label': 'Tutup', text: '×', onclick: close })),
    h('div', { class: 'modal__body' }, opts.body), (opts.actions || []).length ? foot : null);
  dlg.addEventListener('close', () => { dlg.remove(); if (opts.onClose) opts.onClose(); });
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  return { el: dlg, close: close, foot: foot };
}

export function confirmDialog(o) {
  return new Promise((resolve) => {
    let answered = false; const done = (v) => { if (!answered) { answered = true; resolve(v); } };
    dialog({
      title: o.title || 'Konfirmasi', body: h('p', { text: o.message }), onClose: () => done(false),
      actions: [{ label: o.cancelText || 'Batal', kind: 'ghost', onClick: (c) => { done(false); c(); } },
        { label: o.confirmText || 'Ya', kind: o.danger ? 'danger' : 'primary', onClick: (c) => { done(true); c(); } }]
    });
  });
}

/** Penanganan galat standar: sesi tidak sah => keluar ke halaman login; lainnya => toast. */
export async function handleError(e, fallback) {
  const c = e && e.code;
  if (c === 'UNAUTHENTICATED' || c === 'USER_INACTIVE' || c === 'TOKEN_EXPIRED') {
    toast(friendlyError(e), 'error');
    try { const a = await import('../auth.js'); await a.signOut(); } catch (x) { /* abaikan */ }
    location.replace('index.html'); return;
  }
  toast(friendlyError(e) || fallback || 'Terjadi kesalahan.', 'error');
}

/** Jalankan aksi async pada tombol: nonaktifkan selama berjalan. */
export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
}

export function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }

export function fmtDateTime(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function badge(text, kind) { return h('span', { class: 'badge' + (kind ? ' badge--' + kind : ''), text: text }); }
export function loadingRows(n) { return h('div', { 'aria-hidden': 'true' }, Array.from({ length: n || 4 }, () => h('div', { class: 'skeleton' }))); }
export function stateBox(msg, kind, onRetry) {
  return h('div', { class: 'state' + (kind === 'error' ? ' state--error' : ''), role: kind === 'error' ? 'alert' : 'status' }, h('p', { text: msg }),
    onRetry ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Coba lagi', onclick: onRetry }) : null);
}
