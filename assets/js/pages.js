/* Logika per halaman */
(() => {
  const { esc, ROOT, Auth, api, toast, isPlaceholder, $ } = window.Himatika;
  const D = window.HIMATIKA_DATA;
  const C = window.HIMATIKA_CONFIG;
  const qs = new URLSearchParams(location.search);

  const newest = () => [...D.cabinets].sort((a, b) => b.order - a.order);
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const avatar = (n, size = 'h-12 w-12 text-base') =>
    `<div class="${size} grid shrink-0 place-items-center rounded-full bg-brand-400 font-bold text-neutral-900">${esc(initials(n))}</div>`;
  const card = 'rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900';
  const input = 'w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-300 dark:border-neutral-700 dark:bg-neutral-950';
  const btnPrimary = 'rounded-xl bg-brand-400 px-5 py-2.5 text-sm font-bold text-neutral-900 shadow hover:bg-brand-300 disabled:opacity-60';
  const fmtDate = (s) => {
    const d = new Date(s);
    return isNaN(d) ? esc(s) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const empty = (msg) => `<div class="rounded-2xl border border-dashed border-brand-400/60 bg-brand-50 p-8 text-center text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">${msg}</div>`;

  const newsCard = (n) => `
    <article class="${card} fade-in flex flex-col">
      <div class="flex items-center gap-2 text-xs">
        <span class="rounded-full bg-brand-100 px-2.5 py-1 font-semibold text-brand-800 dark:bg-brand-400/20 dark:text-brand-300">${esc(n.kategori)}</span>
        ${n.sample ? '<span class="rounded-full bg-neutral-200 px-2 py-1 font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Contoh</span>' : ''}
        <span class="ml-auto text-neutral-500">${fmtDate(n.tanggal)}</span>
      </div>
      <h3 class="mt-3 text-lg font-bold leading-snug">${esc(n.judul)}</h3>
      <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">${esc(n.ringkasan)}</p>
      <details class="mt-3 text-sm">
        <summary class="font-semibold text-brand-700 hover:underline dark:text-brand-400">Baca selengkapnya</summary>
        <p class="mt-2 whitespace-pre-line text-neutral-700 dark:text-neutral-300">${esc(n.isi)}</p>
      </details>
    </article>`;

  const people = (c) => [
    { role: 'Ketua Umum Himpunan (Kahim)', p: c.kahim },
    { role: 'Sekretaris Jenderal (Sekjen)', p: c.sekjen }
  ];

  const pages = {};

  /* ===== Dashboard ===== */
  pages.dashboard = () => {
    const cur = newest()[0];
    const yrs = new Date().getFullYear() - C.foundedYear;
    const stats = [
      [C.foundedYear, 'Tahun berdiri'],
      [yrs, 'Tahun berkiprah'],
      [D.cabinets.length, 'Kabinet'],
      [Object.keys(D.members).length, 'Angkatan']
    ];
    $('#stats').innerHTML = stats.map(([v, l]) => `
      <div class="${card} text-center"><div class="text-3xl font-extrabold text-brand-600 dark:text-brand-400">${v}</div><div class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">${l}</div></div>`).join('');

    $('#current-cabinet').innerHTML = `
      <div class="${card} border-brand-400/60 bg-gradient-to-br from-brand-100 to-white dark:from-brand-400/10 dark:to-neutral-900">
        <p class="text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-brand-400">Kabinet saat ini · Periode ke-${cur.order}</p>
        <h3 class="mt-1 text-2xl font-extrabold">${esc(cur.nama)}</h3>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          ${people(cur).map((x) => `<div class="flex items-center gap-3">${avatar(x.p.nama, 'h-14 w-14 text-lg')}<div><div class="font-semibold">${esc(x.p.nama)}</div><div class="text-xs text-neutral-500">${x.role}</div></div></div>`).join('')}
        </div>
        <a href="${ROOT}cabinet/?k=${cur.slug}" class="mt-6 inline-block ${btnPrimary}">Lihat struktur kepengurusan</a>
      </div>`;

    $('#timeline').innerHTML = [...D.cabinets].sort((a, b) => a.order - b.order).map((c, i, arr) => `
      <li class="relative pl-8 ${i < arr.length - 1 ? 'pb-6' : ''}">
        ${i < arr.length - 1 ? '<span class="absolute left-[11px] top-5 h-full w-0.5 bg-brand-300 dark:bg-neutral-700"></span>' : ''}
        <span class="absolute left-0 top-1 grid h-6 w-6 place-items-center rounded-full ${c.order === arr.length ? 'bg-brand-500 ring-4 ring-brand-200 dark:ring-brand-400/30' : 'bg-brand-300'} text-[10px] font-bold text-neutral-900">${c.order}</span>
        <a href="${ROOT}cabinet/?k=${c.slug}" class="font-bold hover:text-brand-700 dark:hover:text-brand-400">${esc(c.nama)}</a>
        <p class="text-sm text-neutral-600 dark:text-neutral-400">Kahim: ${esc(c.kahim.nama)} · Sekjen: ${esc(c.sekjen.nama)}</p>
      </li>`).join('');

    $('#latest-news').innerHTML = [...D.news].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)).slice(0, 3).map(newsCard).join('');
    $('#misi-preview').innerHTML = D.misi.map((m, i) => `<li class="flex gap-3"><span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-400 text-sm font-bold text-neutral-900">${i + 1}</span><span class="text-sm">${esc(m)}</span></li>`).join('');
  };

  /* ===== Tentang ===== */
  pages.about = () => {
    $('#visi').textContent = D.visi;
    $('#misi').innerHTML = D.misi.map((m, i) => `<li class="flex gap-3"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-400 font-bold text-neutral-900">${i + 1}</span><span>${esc(m)}</span></li>`).join('');
  };

  /* ===== Berita ===== */
  pages.news = () => {
    const list = [...D.news].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    $('#news-list').innerHTML = list.length ? list.map(newsCard).join('') : empty('Belum ada berita.');
  };

  /* ===== Struktur ===== */
  pages.cabinet = () => {
    const slug = qs.get('k');
    const c = D.cabinets.find((x) => x.slug === slug);
    if (!c) {
      $('#cabinet-detail').classList.add('hidden');
      $('#cabinet-grid').innerHTML = newest().map((k) => `
        <a href="${ROOT}cabinet/?k=${k.slug}" class="${card} fade-in group block transition hover:-translate-y-1 hover:border-brand-400 hover:shadow-lg">
          <div class="flex items-center justify-between">
            <span class="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800 dark:bg-brand-400/20 dark:text-brand-300">Periode ke-${k.order}</span>
            ${k.order === D.cabinets.length ? '<span class="text-xs font-bold text-green-600">● Saat ini</span>' : ''}
          </div>
          <h3 class="mt-4 text-xl font-extrabold group-hover:text-brand-700 dark:group-hover:text-brand-400">${esc(k.nama)}</h3>
          <dl class="mt-3 space-y-1 text-sm">
            <div><dt class="inline text-neutral-500">Kahim: </dt><dd class="inline font-medium">${esc(k.kahim.nama)}</dd></div>
            <div><dt class="inline text-neutral-500">Sekjen: </dt><dd class="inline font-medium">${esc(k.sekjen.nama)}</dd></div>
          </dl>
          <span class="mt-4 inline-block text-sm font-semibold text-brand-700 dark:text-brand-400">Lihat struktur →</span>
        </a>`).join('');
      return;
    }
    document.title = c.nama + ' · Himatika Itera';
    $('#cabinet-list').classList.add('hidden');
    const det = $('#cabinet-detail');
    det.classList.remove('hidden');
    const org = c.divisi.length
      ? `<div class="mt-8 grid gap-5 md:grid-cols-2">${c.divisi.map((d) => `
          <div class="${card}"><h3 class="font-bold text-brand-700 dark:text-brand-400">${esc(d.nama)}</h3>
          <ul class="mt-3 space-y-2">${(d.anggota || []).map((a) => `<li class="flex items-center gap-3">${avatar(a.nama, 'h-9 w-9 text-xs')}<div><div class="text-sm font-semibold">${esc(a.nama)}</div><div class="text-xs text-neutral-500">${esc(a.jabatan || '')}</div></div></li>`).join('')}</ul></div>`).join('')}</div>`
      : `<div class="mt-8">${empty('Struktur lengkap (departemen/divisi dan staf) kabinet ini belum diisi.<br>Isi pada <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">assets/js/data.js</code> bagian <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">divisi</code>.')}</div>`;
    det.innerHTML = `
      <a href="${ROOT}cabinet/" class="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400">← Semua kabinet</a>
      <p class="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700 dark:text-brand-400">Periode ke-${c.order}${c.periode ? ' · ' + esc(c.periode) : ''}</p>
      <h1 class="text-3xl font-extrabold md:text-4xl">${esc(c.nama)}</h1>
      ${c.tema ? `<p class="mt-2 text-neutral-600 dark:text-neutral-400">${esc(c.tema)}</p>` : ''}
      <div class="mt-8 flex flex-col items-center">
        <div class="grid w-full gap-4 sm:max-w-2xl sm:grid-cols-2">
          ${people(c).map((x) => `<div class="${card} border-brand-400/60 text-center">${avatar(x.p.nama, 'mx-auto h-16 w-16 text-xl')}<div class="mt-3 font-bold">${esc(x.p.nama)}</div><div class="text-xs text-neutral-500">NIM ${esc(x.p.nim)}</div><div class="mt-1 text-xs font-semibold text-brand-700 dark:text-brand-400">${x.role}</div></div>`).join('')}
        </div>
      </div>
      ${org}`;
  };

  /* ===== Anggota ===== */
  pages.members = () => {
    const yrs = Object.keys(D.members).map(Number).sort((a, b) => b - a);
    let year = Number(qs.get('year')) || yrs[0];
    if (!yrs.includes(year)) year = yrs[0];
    const pills = $('#year-pills');
    const render = () => {
      pills.innerHTML = yrs.map((y) => `<button data-y="${y}" class="rounded-full px-4 py-1.5 text-sm font-semibold ${y === year ? 'bg-brand-400 text-neutral-900 shadow' : 'bg-white text-neutral-600 hover:bg-brand-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'} border border-neutral-200 dark:border-neutral-800">${y}</button>`).join('');
      pills.querySelectorAll('button').forEach((b) => (b.onclick = () => {
        year = Number(b.dataset.y);
        history.replaceState(null, '', '?year=' + year);
        render();
      }));
      const term = $('#member-search').value.trim().toLowerCase();
      const all = D.members[year] || [];
      const rows = all.filter((m) => !term || m.nama.toLowerCase().includes(term) || String(m.nim).includes(term));
      $('#member-title').textContent = 'Angkatan ' + year;
      $('#member-count').textContent = all.length ? rows.length + ' dari ' + all.length + ' anggota' : '';
      $('#member-body').innerHTML = all.length
        ? `<div class="overflow-x-auto ${card} p-0"><table class="w-full text-left text-sm"><thead class="bg-brand-100 text-xs uppercase text-brand-900 dark:bg-neutral-800 dark:text-brand-300"><tr><th class="px-4 py-3">No</th><th class="px-4 py-3">Nama</th><th class="px-4 py-3">NIM</th><th class="px-4 py-3">Status</th></tr></thead><tbody>${rows.map((m, i) => `<tr class="border-t border-neutral-200 dark:border-neutral-800"><td class="px-4 py-3">${i + 1}</td><td class="px-4 py-3 font-medium">${esc(m.nama)}</td><td class="px-4 py-3">${esc(m.nim)}</td><td class="px-4 py-3">${esc(m.status || '-')}</td></tr>`).join('')}</tbody></table></div>`
        : empty(`Data anggota angkatan ${year} belum diisi.<br>Tambahkan pada <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">assets/js/data.js</code> bagian <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">members</code>.`);
    };
    $('#member-search').addEventListener('input', render);
    render();
  };

  /* ===== Login ===== */
  pages.login = () => {
    if (Auth.user) { location.replace(ROOT + 'calendar/'); return; }
    const f = $('#login-form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]'), err = $('#login-error');
      btn.disabled = true; err.textContent = '';
      try {
        await Auth.login(f.email.value, f.password.value);
        const next = qs.get('next');
        location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : ROOT + 'calendar/';
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  };

  /* ===== Kalender Program Kerja ===== */
  const parseCell = (c) => {
    if (!c) return '';
    const v = c.v;
    if (typeof v === 'string' && v.startsWith('Date(')) {
      const [y, m, d] = v.slice(5, -1).split(',').map(Number);
      return new Date(y, m, d);
    }
    return c.f ?? v ?? '';
  };
  const toDate = (v) => {
    if (v instanceof Date) return v;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  async function loadEvents() {
    if (isPlaceholder(C.calendarSheetId)) return D.sampleEvents.map((e) => ({ ...e, mulai: toDate(e.mulai), selesai: toDate(e.selesai) }));
    const url = `https://docs.google.com/spreadsheets/d/${C.calendarSheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(C.calendarSheetName)}`;
    const txt = await (await fetch(url)).text();
    const json = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return json.table.rows.map((r) => {
      const c = r.c.map(parseCell);
      const mulai = toDate(c[0]);
      return { mulai, selesai: toDate(c[1]) || mulai, kegiatan: c[2], divisi: c[3], lokasi: c[4], status: c[5] };
    }).filter((e) => e.mulai && e.kegiatan);
  }

  pages.calendar = async () => {
    let events = [];
    try { events = await loadEvents(); } catch (e) { toast('Gagal memuat spreadsheet kalender. Pastikan dibagikan sebagai pelihat.', 'err'); }
    let cur = new Date(); cur.setDate(1);
    const names = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const render = () => {
      const y = cur.getFullYear(), m = cur.getMonth();
      $('#cal-title').textContent = cur.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const first = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      const today = new Date();
      const onDay = (d) => events.filter((e) => d >= new Date(e.mulai.getFullYear(), e.mulai.getMonth(), e.mulai.getDate()) && d <= e.selesai);
      let cells = names.map((n) => `<div class="py-2 text-center text-xs font-bold uppercase text-neutral-500">${n.slice(0, 3)}</div>`).join('');
      for (let i = 0; i < first; i++) cells += '<div></div>';
      for (let d = 1; d <= days; d++) {
        const dt = new Date(y, m, d), ev = onDay(dt);
        cells += `<div class="min-h-[64px] rounded-lg border p-1.5 text-xs ${sameDay(dt, today) ? 'border-brand-500 bg-brand-100 dark:bg-brand-400/10' : 'border-neutral-200 dark:border-neutral-800'}">
          <div class="font-semibold">${d}</div>
          ${ev.slice(0, 2).map((e) => `<div class="mt-1 truncate rounded bg-brand-400 px-1 py-0.5 text-[10px] font-semibold text-neutral-900" title="${esc(e.kegiatan)}">${esc(e.kegiatan)}</div>`).join('')}
          ${ev.length > 2 ? `<div class="mt-0.5 text-[10px] text-neutral-500">+${ev.length - 2} lagi</div>` : ''}</div>`;
      }
      $('#cal-grid').innerHTML = cells;
      const monthEv = events.filter((e) => e.mulai <= new Date(y, m + 1, 0) && e.selesai >= new Date(y, m, 1)).sort((a, b) => a.mulai - b.mulai);
      $('#cal-list').innerHTML = monthEv.length ? monthEv.map((e) => `
        <li class="${card} flex flex-wrap items-start gap-x-4 gap-y-1">
          <div class="w-36 shrink-0 text-sm font-bold text-brand-700 dark:text-brand-400">${fmtDate(e.mulai)}${sameDay(e.mulai, e.selesai) ? '' : '<br><span class="font-medium text-neutral-500">s.d. ' + fmtDate(e.selesai) + '</span>'}</div>
          <div class="min-w-0 flex-1"><div class="font-semibold">${esc(e.kegiatan)}</div><div class="text-sm text-neutral-500">${esc([e.divisi, e.lokasi].filter(Boolean).join(' · '))}</div></div>
          ${e.status ? `<span class="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-400/20 dark:text-brand-300">${esc(e.status)}</span>` : ''}
        </li>`).join('') : `<li>${empty('Tidak ada kegiatan pada bulan ini.')}</li>`;
    };
    $('#cal-prev').onclick = () => { cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); render(); };
    $('#cal-next').onclick = () => { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); render(); };
    $('#cal-today').onclick = () => { cur = new Date(); cur.setDate(1); render(); };
    if (!isPlaceholder(C.calendarSheetId)) $('#cal-open').href = `https://docs.google.com/spreadsheets/d/${C.calendarSheetId}/edit`;
    else $('#cal-open').classList.add('hidden');
    render();
  };

  /* ===== Pengajuan Nomor Surat ===== */
  pages['letter-number'] = () => {
    const f = $('#letter-form');
    f.jenis.innerHTML = D.letterTypes.map((t) => `<option value="${t.kode}">${esc(t.nama)} (${t.kode})</option>`).join('');
    f.tanggal.value = new Date().toISOString().slice(0, 10);
    const loadList = async () => {
      try {
        const { rows } = await api('letter.list');
        $('#letter-body').innerHTML = rows.length ? rows.map((r) => `<tr class="border-t border-neutral-200 dark:border-neutral-800"><td class="px-4 py-3 font-mono text-xs font-semibold">${esc(r.nomor)}</td><td class="px-4 py-3">${esc(r.perihal)}</td><td class="px-4 py-3">${esc(r.tujuan)}</td><td class="px-4 py-3 whitespace-nowrap">${fmtDate(r.tanggal)}</td></tr>`).join('')
          : '<tr><td colspan="4" class="px-4 py-6 text-center text-neutral-500">Belum ada pengajuan.</td></tr>';
      } catch (e) { toast(e.message, 'err'); }
    };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      const t = D.letterTypes.find((x) => x.kode === f.jenis.value);
      try {
        const r = await api('letter.create', { kode: t.kode, jenis: t.nama, perihal: f.perihal.value.trim(), tujuan: f.tujuan.value.trim(), tanggal: f.tanggal.value });
        $('#letter-result').innerHTML = `<div class="fade-in rounded-xl border border-brand-400 bg-brand-100 p-4 dark:bg-brand-400/10"><p class="text-xs font-semibold uppercase text-brand-800 dark:text-brand-300">Nomor surat Anda</p><p class="mt-1 break-all font-mono text-lg font-bold">${esc(r.nomor)}</p><button id="copy-no" class="mt-2 text-sm font-semibold underline">Salin nomor</button></div>`;
        $('#copy-no').onclick = () => { navigator.clipboard.writeText(r.nomor); toast('Nomor disalin'); };
        f.perihal.value = ''; f.tujuan.value = '';
        loadList();
      } catch (ex) { toast(ex.message, 'err'); }
      btn.disabled = false;
    });
    loadList();
  };

  /* ===== Pengajuan Tanda Tangan Elektronik ===== */
  const MAX_MB = 5;
  const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  pages['e-signature'] = () => {
    const f = $('#esign-form');
    const loadList = async () => {
      try {
        const { rows } = await api('esign.list');
        $('#esign-body').innerHTML = rows.length ? rows.map((r) => `<tr class="border-t border-neutral-200 dark:border-neutral-800"><td class="px-4 py-3 font-medium">${r.url ? `<a class="text-brand-700 underline dark:text-brand-400" target="_blank" rel="noopener" href="${esc(r.url)}">${esc(r.judul)}</a>` : esc(r.judul)}</td><td class="px-4 py-3">${esc(r.penandatangan)}</td><td class="px-4 py-3"><span class="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-400/20 dark:text-brand-300">${esc(r.status)}</span></td><td class="px-4 py-3 whitespace-nowrap">${fmtDate(r.waktu)}</td></tr>`).join('')
          : '<tr><td colspan="4" class="px-4 py-6 text-center text-neutral-500">Belum ada pengajuan.</td></tr>';
      } catch (e) { toast(e.message, 'err'); }
    };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = f.berkas.files[0];
      if (!file) return toast('Pilih berkas PDF terlebih dahulu.', 'err');
      if (file.type !== 'application/pdf') return toast('Berkas harus berformat PDF.', 'err');
      if (file.size > MAX_MB * 1024 * 1024) return toast(`Ukuran berkas maksimal ${MAX_MB} MB.`, 'err');
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Mengirim…';
      try {
        await api('esign.create', {
          judul: f.judul.value.trim(), penandatangan: f.penandatangan.value, catatan: f.catatan.value.trim(),
          fileName: file.name, mime: file.type, data: await toBase64(file)
        });
        toast('Pengajuan terkirim.');
        f.reset();
        loadList();
      } catch (ex) { toast(ex.message, 'err'); }
      btn.disabled = false; btn.textContent = 'Ajukan Tanda Tangan';
    });
    loadList();
  };

  window.HimatikaPages = pages;
})();
