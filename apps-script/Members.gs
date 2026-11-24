/**
 * Members.gs — sheet ANGGOTA (NIM, NAMA, ANGKATAN, STATUS) dan STRUKTUR (Kabinet, NIM, Nama, Angkatan, Jabatan).
 * NIM adalah data pribadi: TIDAK dikembalikan oleh endpoint publik.
 * Baris STRUKTUR tidak punya id; kuncinya gabungan Kabinet|NIM|Jabatan (dikirim klien sebagai `key` = _key).
 */

function memberCfg_() {
  return {
    sheet: 'ANGGOTA', audit: 'member', searchFields: ['NIM', 'NAMA', 'ANGKATAN'],
    filter: function (r, p) {
      return (!p.angkatan || String(r.ANGKATAN) === String(p.angkatan)) && (!p.status || String(r.STATUS).toUpperCase() === String(p.status).toUpperCase());
    },
    spec: function () {
      return {
        NIM: { t: 'str', required: true, pattern: /^[0-9]{6,15}$/ },
        NAMA: { t: 'str', required: true, max: 120 },
        ANGKATAN: { t: 'str', max: 10, pattern: /^[0-9]{2,4}$/, def: '' },
        STATUS: { t: 'str', max: 30, upper: true, def: 'AKTIF' }
      };
    }
  };
}

function strukturCfg_() {
  return {
    sheet: 'STRUKTUR', audit: 'struktur', searchFields: ['Kabinet', 'Nama', 'Jabatan'],
    filter: function (r, p) { return !p.kabinet || String(r.Kabinet) === String(p.kabinet); },
    spec: function () {
      return {
        Kabinet: { t: 'str', required: true, max: 100 },
        NIM: { t: 'str', required: true, pattern: /^[0-9]{6,15}$/ },
        Nama: { t: 'str', max: 120, def: '' },
        Angkatan: { t: 'str', max: 10, pattern: /^[0-9]{2,4}$/, def: '' },
        Jabatan: { t: 'str', required: true, max: 120 }
      };
    },
    // Nama/Angkatan boleh dikosongkan bila NIM terdaftar di ANGGOTA.
    beforeCreate: function (d) {
      if (!d.Nama || !d.Angkatan) {
        const m = dbFind_('ANGGOTA', d.NIM);
        if (!m && !d.Nama) throw new ApiError('VALIDATION_ERROR', 'Nama wajib diisi atau NIM harus terdaftar di ANGGOTA');
        if (m) { if (!d.Nama) d.Nama = String(m.NAMA); if (!d.Angkatan) d.Angkatan = String(m.ANGKATAN); }
      }
    }
  };
}

function activeCabinet_(rows) {
  const kv = kvRead_('WEBSITE_CONFIG');
  const v = kv.active_cabinet ? kv.active_cabinet.value : '';
  if (v) return v;
  return rows.length ? String(rows[rows.length - 1].Kabinet) : '';
}

/** Struktur kabinet publik: tanpa NIM. Urutan baris sheet dipertahankan (urutan = hierarki jabatan). */
function pubGetCabinet_(p) {
  const want = typeof p.kabinet === 'string' ? p.kabinet.slice(0, 100) : '';
  return pubCached_('cabinet', { k: want }, function () {
    const rows = dbAll_('STRUKTUR');
    const list = [];
    rows.forEach(function (r) { const k = String(r.Kabinet); if (list.indexOf(k) < 0) list.push(k); });
    const name = want && list.indexOf(want) >= 0 ? want : activeCabinet_(rows);
    return {
      kabinet: name, daftar_kabinet: list,
      items: rows.filter(function (r) { return String(r.Kabinet) === name; })
        .map(function (r) { return { Nama: String(r.Nama), Angkatan: String(r.Angkatan), Jabatan: String(r.Jabatan) }; })
    };
  });
}

function pubGetPublicInformation_() {
  return pubCached_('info', {}, function () {
    const rows = dbAll_('STRUKTUR');
    return {
      total_anggota: dbCount_('ANGGOTA'),
      total_berita: dbAll_('BERITA').filter(isPublishedNow_).length,
      kabinet_aktif: activeCabinet_(rows)
    };
  });
}

/**
 * Daftar anggota publik per angkatan: hanya nama (TANPA NIM), hanya STATUS AKTIF.
 * Tanpa parameter => angkatan terbaru. Respons kecil karena hanya satu angkatan per panggilan.
 */
function pubGetMembers_(p) {
  const want = typeof p.angkatan === 'string' ? p.angkatan.trim().slice(0, 10) : '';
  return pubCached_('members', { a: want }, function () {
    const rows = dbAll_('ANGGOTA').filter(function (r) { return String(r.STATUS).toUpperCase() === 'AKTIF' && String(r.NAMA).trim() !== ''; });
    const by = {};
    rows.forEach(function (r) { const y = String(r.ANGKATAN || '').trim() || 'Lainnya'; (by[y] = by[y] || []).push(String(r.NAMA).trim()); });
    const years = Object.keys(by).sort(function (a, b) {
      if (a === 'Lainnya') return 1; if (b === 'Lainnya') return -1;
      return (Number(b) || 0) - (Number(a) || 0);
    });
    const sel = want && by[want] ? want : (years[0] || '');
    const names = sel ? by[sel].slice().sort(function (a, b) { return a.localeCompare(b, 'id'); }) : [];
    return {
      angkatan: sel,
      angkatan_list: years.map(function (y) { return { angkatan: y, total: by[y].length }; }),
      items: names.map(function (n) { return { nama: n }; }),
      total: rows.length
    };
  });
}

/** adminListStruktur: daftar + nama-nama kabinet (untuk filter, datalist, dan pilihan kabinet aktif). */
function adminListStruktur_(ctx, p) {
  const r = crudList_(strukturCfg_(), p), seen = {}, list = [];
  dbAll_('STRUKTUR').forEach(function (x) { const k = String(x.Kabinet); if (!seen[k]) { seen[k] = true; list.push(k); } });
  r.kabinet_list = list;
  return r;
}

