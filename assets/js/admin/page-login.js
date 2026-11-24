import { initAuth, signIn } from '../auth.js';
import { apiConfigured, firebaseConfigured } from '../config.js';

const form = document.getElementById('login-form'), box = document.getElementById('login-msg'), btn = document.getElementById('login-btn');
const email = document.getElementById('email'), pass = document.getElementById('password'), toggle = document.getElementById('toggle-pw');
const show = (m, kind) => { box.className = 'alert alert--' + (kind || 'error'); box.textContent = m; box.hidden = !m; };
const go = () => location.replace('dashboard.html');
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
toggle.addEventListener('click', () => { const t = pass.type === 'password'; pass.type = t ? 'text' : 'password'; toggle.textContent = t ? 'Sembunyikan' : 'Tampilkan'; toggle.setAttribute('aria-pressed', String(t)); });
(async () => {
  if (!apiConfigured() || !firebaseConfigured()) {
    show('Konfigurasi belum diisi. Isi API_URL dan FIREBASE di assets/js/config.js (lihat README).', 'warn'); btn.disabled = true; document.body.dataset.ready = 'unconfigured'; return;
  }
  try { const s = await initAuth(); if (s.signedIn) { go(); return; } } catch (e) { show(e.message); }
  btn.disabled = false; document.body.dataset.ready = '1'; email.focus();
})();
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!EMAIL_RE.test(email.value.trim()) || !pass.value) { show('Email dan kata sandi wajib diisi dengan benar.'); return; }
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); show('Memproses… permintaan pertama bisa memakan waktu hingga setengah menit.', 'info');
  try { await signIn(email.value, pass.value); pass.value = ''; go(); }
  catch (err) { pass.value = ''; show(err.message, 'error'); btn.disabled = false; btn.removeAttribute('aria-busy'); pass.focus(); }
});
