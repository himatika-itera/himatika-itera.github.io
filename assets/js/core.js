/* Inti: tema, header/footer, autentikasi (Firebase / demo), API (Google Apps Script) */
(() => {
  const C = window.HIMATIKA_CONFIG;
  const D = window.HIMATIKA_DATA;
  const ROOT = document.body.dataset.root || './';
  const PAGE = document.body.dataset.page || '';
  const PROTECTED = document.body.dataset.protected === 'true';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isPlaceholder = (v) => !v || String(v).startsWith('ISI_');
  const $ = (s, el = document) => el.querySelector(s);

  /* ---------- Toast ---------- */
  function toast(msg, type = 'ok') {
    let box = $('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.className = 'fixed bottom-4 right-4 z-[100] flex flex-col gap-2';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'fade-in max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ' +
      (type === 'err' ? 'bg-red-600 text-white' : 'bg-neutral-900 text-white dark:bg-brand-400 dark:text-neutral-900');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  /* ---------- Tema ---------- */
  function setTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  }

  /* ---------- Autentikasi ---------- */
  const SESSION = 'himatika_session';
  const Auth = {
    mock: isPlaceholder(C.firebase.apiKey),
    user: (() => { try { return JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch (e) { return null; } })(),
    fb: null,

    setUser(u) {
      this.user = u;
      try { u ? localStorage.setItem(SESSION, JSON.stringify(u)) : localStorage.removeItem(SESSION); } catch (e) {}
    },

    loadScript(src) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src));
        document.head.appendChild(s);
      });
    },

    async init() {
      if (this.mock) return;
      const v = '10.12.2';
      const base = `https://www.gstatic.com/firebasejs/${v}/`;
      await this.loadScript(base + 'firebase-app-compat.js');
      await this.loadScript(base + 'firebase-auth-compat.js');
      await this.loadScript(base + 'firebase-firestore-compat.js');
      firebase.initializeApp(C.firebase);
      this.fb = { auth: firebase.auth(), db: firebase.firestore() };
      await new Promise((resolve) => {
        let first = true;
        this.fb.auth.onAuthStateChanged(async (u) => {
          if (u) {
            if (await this.isActive(u)) this.setUser({ email: u.email, name: u.displayName || u.email });
            else { await this.fb.auth.signOut(); this.setUser(null); }
          } else this.setUser(null);
          if (first) { first = false; resolve(); } else renderHeader();
        });
      });
    },

    async isActive(u) {
      try {
        const snap = await this.fb.db.collection(C.activeMembersCollection).doc(u.email.toLowerCase()).get();
        return snap.exists && snap.data().active === true;
      } catch (e) { return false; }
    },

    async login(email, password) {
      email = email.trim().toLowerCase();
      if (this.mock) {
        const d = C.demoAccount;
        if (email === d.email && password === d.password) {
          this.setUser({ email: d.email, name: d.name });
          return this.user;
        }
        throw new Error('Email atau kata sandi salah. (Mode demo: ' + d.email + ' / ' + d.password + ')');
      }
      let cred;
      try { cred = await this.fb.auth.signInWithEmailAndPassword(email, password); }
      catch (e) { throw new Error('Email atau kata sandi salah.'); }
      if (!(await this.isActive(cred.user))) {
        await this.fb.auth.signOut();
        throw new Error('Akun Anda belum terdaftar sebagai anggota aktif. Hubungi pengurus.');
      }
      this.setUser({ email: cred.user.email, name: cred.user.displayName || cred.user.email });
      return this.user;
    },

    async logout() {
      if (this.fb) await this.fb.auth.signOut();
      this.setUser(null);
      location.href = ROOT;
    },

    async token() {
      if (this.mock) return 'demo';
      return this.fb.auth.currentUser ? this.fb.auth.currentUser.getIdToken() : '';
    }
  };

  /* ---------- API (Google Apps Script) dengan fallback demo ---------- */
  const mockKey = (k) => 'himatika_demo_' + k;
  const mockGet = (k) => { try { return JSON.parse(localStorage.getItem(mockKey(k)) || '[]'); } catch (e) { return []; } };
  const mockSet = (k, v) => { try { localStorage.setItem(mockKey(k), JSON.stringify(v)); } catch (e) {} };
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  async function mockApi(action, p) {
    if (action === 'saran.create') {
      const a = mockGet('saran'); a.push({ ...p, waktu: new Date().toISOString() }); mockSet('saran', a);
      return { ok: true };
    }
    if (action === 'letter.list') return { ok: true, rows: mockGet('letters').reverse() };
    if (action === 'letter.create') {
      const a = mockGet('letters');
      const d = new Date(p.tanggal || Date.now());
      const seq = a.filter((x) => x.tahun === d.getFullYear()).length + 1;
      const nomor = `${String(seq).padStart(3, '0')}/${p.kode}/HIMATIKA-Itera/${roman[d.getMonth()]}/${d.getFullYear()}`;
      const row = { nomor, tahun: d.getFullYear(), jenis: p.jenis, perihal: p.perihal, tujuan: p.tujuan,
        tanggal: p.tanggal, pengaju: Auth.user && Auth.user.email, waktu: new Date().toISOString() };
      a.push(row); mockSet('letters', a);
      return { ok: true, nomor };
    }
    if (action === 'esign.list') return { ok: true, rows: mockGet('esign').reverse() };
    if (action === 'esign.create') {
      const a = mockGet('esign');
      a.push({ id: 'DEMO-' + Date.now(), judul: p.judul, penandatangan: p.penandatangan, fileName: p.fileName,
        status: 'Menunggu (demo)', pengaju: Auth.user && Auth.user.email, waktu: new Date().toISOString(), url: '' });
      mockSet('esign', a);
      return { ok: true };
    }
    return { ok: false, error: 'Aksi tidak dikenal' };
  }

  async function api(action, payload = {}) {
    if (isPlaceholder(C.appsScriptUrl)) return mockApi(action, payload);
    const body = JSON.stringify({ action, token: await Auth.token(), ...payload });
    const res = await fetch(C.appsScriptUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Permintaan gagal');
    return json;
  }

  /* ---------- Header ---------- */
  const ico = {
    sun: '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    menu: '<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>',
    chev: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>'
  };

  const years = () => Object.keys(D.members).map(Number).sort((a, b) => a - b);

  function navModel() {
    const nav = [
      { label: 'Dashboard', href: ROOT, key: 'dashboard', children: [
        { label: 'Dashboard', href: ROOT },
        { label: 'Tentang Himatika', href: ROOT + 'about/' },
        { label: 'Berita / Publikasi', href: ROOT + 'news/' }
      ] },
      { label: 'Struktur', href: ROOT + 'cabinet/', key: 'cabinet', children:
        [...D.cabinets].sort((a, b) => b.order - a.order)
          .map((c) => ({ label: c.nama, href: ROOT + 'cabinet/?k=' + c.slug })) },
      { label: 'Anggota', href: ROOT + 'members/', key: 'members', children:
        years().reverse().map((y) => ({ label: 'Angkatan ' + y, href: ROOT + 'members/?year=' + y })) }
    ];
    return nav;
  }

  const memberMenu = [
    { label: 'Kalender Program Kerja', href: ROOT + 'calendar/' },
    { label: 'Pengajuan Nomor Surat', href: ROOT + 'letter-number/' },
    { label: 'Pengajuan Tanda Tangan Elektronik', href: ROOT + 'e-signature/' }
  ];

  const ddItem = (i) => `<a href="${i.href}" class="block rounded-lg px-3 py-2 text-sm hover:bg-brand-100 dark:hover:bg-neutral-800">${esc(i.label)}</a>`;

  function renderHeader() {
    const el = $('#app-header');
    if (!el) return;
    const u = Auth.user;
    const dark = document.documentElement.classList.contains('dark');
    const desktop = navModel().map((n) => `
      <div class="dropdown relative">
        <a href="${n.href}" class="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-brand-100 dark:hover:bg-neutral-800 ${(n.key === 'dashboard' ? ['dashboard', 'about', 'news'].includes(PAGE) : PAGE === n.key) ? 'text-brand-700 dark:text-brand-400' : ''}">${esc(n.label)} ${ico.chev}</a>
        <div class="dropdown-panel absolute left-0 top-full z-50 w-60 pt-2">
          <div class="max-h-80 overflow-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">${n.children.map(ddItem).join('')}</div>
        </div>
      </div>`).join('');

    const account = u ? `
      <div class="dropdown relative">
        <button class="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-brand-300 dark:bg-brand-400 dark:text-neutral-900">${esc((u.name || u.email).split(' ')[0])} ${ico.chev}</button>
        <div class="dropdown-panel absolute right-0 top-full z-50 w-72 pt-2">
          <div class="rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <p class="px-3 py-2 text-xs text-neutral-500">Menu Anggota</p>
            ${memberMenu.map(ddItem).join('')}
            <button id="btn-logout" class="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-neutral-800">Keluar</button>
          </div>
        </div>
      </div>` : `<a href="${ROOT}login/" class="rounded-full bg-brand-400 px-5 py-2 text-sm font-bold text-neutral-900 shadow hover:bg-brand-300">Login</a>`;

    const mobile = navModel().map((n) => `
      <details class="border-b border-neutral-200 dark:border-neutral-800">
        <summary class="flex items-center justify-between px-2 py-3 font-semibold">${esc(n.label)} ${ico.chev}</summary>
        <div class="pb-2 pl-3">${n.children.map(ddItem).join('')}</div>
      </details>`).join('') + (u
        ? `<details class="border-b border-neutral-200 dark:border-neutral-800" open><summary class="flex items-center justify-between px-2 py-3 font-semibold">Menu Anggota ${ico.chev}</summary><div class="pb-2 pl-3">${memberMenu.map(ddItem).join('')}<button class="btn-logout block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600">Keluar</button></div></details>`
        : `<a href="${ROOT}login/" class="mt-3 block rounded-xl bg-brand-400 px-4 py-3 text-center font-bold text-neutral-900">Login Anggota</a>`);

    el.innerHTML = `
      <header class="sticky top-0 z-40 border-b border-brand-200/60 bg-white/85 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="${ROOT}" class="flex items-center gap-2.5">
            <span class="grid h-10 w-10 place-items-center rounded-xl bg-brand-400 text-xl font-extrabold text-neutral-900 shadow">∑</span>
            <span class="leading-tight"><span class="block text-base font-extrabold">Himatika</span><span class="block text-[11px] font-medium tracking-wide text-neutral-500 dark:text-neutral-400">Itera</span></span>
          </a>
          <nav class="hidden items-center gap-1 lg:flex">${desktop}</nav>
          <div class="flex items-center gap-2">
            <button id="btn-theme" aria-label="Ganti tema" class="rounded-full p-2 hover:bg-brand-100 dark:hover:bg-neutral-800">${dark ? ico.sun : ico.moon}</button>
            <div class="hidden lg:block">${account}</div>
            <button id="btn-menu" aria-label="Menu" class="rounded-lg p-2 hover:bg-brand-100 dark:hover:bg-neutral-800 lg:hidden">${ico.menu}</button>
          </div>
        </div>
        <div id="mobile-nav" class="hidden max-h-[75vh] overflow-auto border-t border-neutral-200 px-4 pb-4 dark:border-neutral-800 lg:hidden">${mobile}</div>
      </header>`;

    $('#btn-theme').onclick = () => { setTheme(!document.documentElement.classList.contains('dark')); renderHeader(); };
    $('#btn-menu').onclick = () => $('#mobile-nav').classList.toggle('hidden');
    document.querySelectorAll('#btn-logout, .btn-logout').forEach((b) => (b.onclick = () => Auth.logout()));
  }

  /* ---------- Footer ---------- */
  function renderFooter() {
    const el = $('#app-footer');
    if (!el) return;
    const c = C.contact;
    el.innerHTML = `
      <footer class="mt-20 border-t border-brand-200/60 bg-brand-50 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2">
          <div>
            <div class="flex items-center gap-2.5">
              <span class="grid h-10 w-10 place-items-center rounded-xl bg-brand-400 text-xl font-extrabold text-neutral-900">∑</span>
              <span class="text-lg font-extrabold">Himatika Itera</span>
            </div>
            <p class="mt-3 max-w-md text-sm text-neutral-600 dark:text-neutral-400">Himpunan Mahasiswa Matematika Institut Teknologi Sumatera.</p>
            <h3 class="mt-6 text-sm font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">Kontak</h3>
            <ul class="mt-3 space-y-2 text-sm">
              <li><span class="inline-block w-24 text-neutral-500">Email</span><a class="hover:underline" href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>
              <li><span class="inline-block w-24 text-neutral-500">Instagram</span><a class="hover:underline" target="_blank" rel="noopener" href="${esc(c.instagram)}">${esc(c.instagramLabel)}</a></li>
              <li><span class="inline-block w-24 text-neutral-500">Telepon</span><a class="hover:underline" href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a></li>
              <li><span class="inline-block w-24 text-neutral-500">Facebook</span><a class="hover:underline" target="_blank" rel="noopener" href="${esc(c.facebook)}">${esc(c.facebookLabel)}</a></li>
            </ul>
          </div>
          <div>
            <h3 class="text-sm font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">Kotak Saran</h3>
            <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Sampaikan kritik dan saran untuk Himatika Itera.</p>
            <form id="saran-form" class="mt-4 space-y-3">
              <input name="nama" maxlength="80" placeholder="Nama (opsional)" class="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-300 dark:border-neutral-700 dark:bg-neutral-950" />
              <textarea name="pesan" required minlength="5" maxlength="1000" rows="4" placeholder="Tulis saran Anda…" class="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-300 dark:border-neutral-700 dark:bg-neutral-950"></textarea>
              <input name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />
              <button class="rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-bold text-neutral-900 shadow hover:bg-brand-300 disabled:opacity-60">Kirim Saran</button>
            </form>
          </div>
        </div>
        <div class="border-t border-brand-200/60 px-4 py-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
          © ${new Date().getFullYear()} Himpunan Mahasiswa Matematika Institut Teknologi Sumatera. Hak cipta dilindungi.
        </div>
      </footer>`;

    $('#saran-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector('button');
      if (f.website.value) return; // honeypot
      btn.disabled = true;
      try {
        await api('saran.create', { nama: f.nama.value.trim(), pesan: f.pesan.value.trim() });
        toast('Terima kasih! Saran Anda sudah terkirim.');
        f.reset();
      } catch (err) { toast(err.message, 'err'); }
      btn.disabled = false;
    });
  }

  /* ---------- Boot ---------- */
  async function boot() {
    renderHeader();
    renderFooter();
    try { await Auth.init(); } catch (e) { console.error(e); toast('Firebase gagal dimuat: ' + e.message, 'err'); }
    renderHeader();
    if (PROTECTED && !Auth.user) {
      location.replace(ROOT + 'login/?next=' + encodeURIComponent(location.pathname + location.search));
      return;
    }
    if (Auth.mock && (Auth.user || PAGE === 'login')) {
      const b = document.createElement('div');
      b.className = 'bg-brand-300 px-4 py-1.5 text-center text-xs font-semibold text-neutral-900';
      b.textContent = 'MODE DEMO: Firebase / Google Apps Script belum dikonfigurasi, data hanya tersimpan di browser ini.';
      document.body.prepend(b);
    }
    const run = window.HimatikaPages && window.HimatikaPages[PAGE];
    if (run) { try { await run(); } catch (e) { console.error(e); toast(e.message, 'err'); } }
  }

  window.Himatika = { esc, ROOT, Auth, api, toast, isPlaceholder, $ };
  window.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
})();
