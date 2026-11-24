/**
 * Integration.gs — pemeriksaan integrasi NYATA (Fase 5/7). Jalankan integrationCheck() di editor Apps Script
 * setelah semua Script Properties terisi. Tidak mengubah data Anda: satu file uji kecil dibuat di folder Drive lalu
 * langsung dibuang ke tempat sampah. Hasil: baris OK / PERINGATAN / GAGAL di Execution log.
 * Fungsi ini hanya mengakses layanan milik akun Anda; tidak ada data yang dikirim ke pihak lain selain Firebase lookup.
 */

/** Vonis hak akses berbagi sebuah file/folder: 'OK' | 'GAGAL' (publik) | 'PERINGATAN' (siapa saja dengan tautan di organisasi). */
function sharingVerdict_(access) {
  const a = String(access);
  if (a === 'PRIVATE') return 'OK';
  if (a === 'ANYONE' || a === 'ANYONE_WITH_LINK') return 'GAGAL';
  return 'PERINGATAN';   // DOMAIN, DOMAIN_WITH_LINK
}

function integrationCheck() {
  const rows = [];
  const add = function (level, name, detail) { rows.push(level + '  ' + name + (detail ? ' — ' + detail : '')); };
  const step = function (name, fn) { try { fn(); } catch (e) { add('GAGAL', name, String(e && e.message || e)); } };

  // 1. Properti
  step('Script Properties', function () {
    ['SPREADSHEET_ID', 'FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'APP_TOKEN_SECRET', 'DRIVE_ROOT_FOLDER_ID'].forEach(function (n) {
      add(prop_(n, false) ? 'OK' : 'GAGAL', n, prop_(n, false) ? '' : 'kosong');
    });
    const sec = prop_('APP_TOKEN_SECRET', false);
    if (sec) add(sec.length >= 32 ? 'OK' : 'GAGAL', 'APP_TOKEN_SECRET panjang', sec.length + ' karakter (min 32)');
    if (prop_('BOOTSTRAP_ADMIN_EMAIL', false)) add('PERINGATAN', 'BOOTSTRAP_ADMIN_EMAIL masih ada', 'hapus setelah Super Admin pertama berhasil login');
  });

  // 2. Google Sheets: sheet & kolom
  step('Google Sheets', function () {
    dbReset_(); ss_();
    Object.keys(SHEETS).forEach(function (n) {
      try { const c = cols_(n); add('OK', 'Sheet ' + n, (SHEETS[n].existing ? 'milik Anda, ' : '') + (sheet_(n).getLastRow() - 1) + ' baris data'); }
      catch (e) { add('GAGAL', 'Sheet ' + n, String(e.message || e)); }
    });
    const su = dbAll_('USERS').filter(function (r) { return String(r.role).toUpperCase() === 'SUPER_ADMIN' && String(r.status).toUpperCase() === 'ACTIVE'; });
    add(su.length ? 'OK' : 'GAGAL', 'Ada Super Admin aktif di USERS', su.length ? su.length + ' akun' : 'jalankan bootstrapSuperAdmin()');
  });

  // 3. Spreadsheet TIDAK boleh publik
  step('Akses publik Spreadsheet', function () {
    const f = DriveApp.getFileById(prop_('SPREADSHEET_ID', true));
    const acc = f.getSharingAccess(), v = sharingVerdict_(acc);
    add(v, 'Spreadsheet tidak publik', 'berbagi = ' + acc + (v === 'GAGAL' ? ' → UBAH ke "Dibatasi" (Restricted) di tombol Bagikan' : ''));
  });

  // 4. Drive: folder, akses tulis, akses publik folder induk
  step('Google Drive', function () {
    const root = DriveApp.getFolderById(prop_('DRIVE_ROOT_FOLDER_ID', true));
    add('OK', 'Folder induk dapat dibuka', root.getName());
    const acc = root.getSharingAccess(), v = sharingVerdict_(acc);
    add(v === 'GAGAL' ? 'PERINGATAN' : v, 'Folder induk tidak publik', 'berbagi = ' + acc + ' (hanya file gambar yang diunggah lewat dashboard yang dibuka lewat tautan)');
    const f = root.createFile(Utilities.newBlob('integration-check', 'text/plain', 'integration-check-' + Date.now() + '.txt'));
    const id = f.getId(); f.setTrashed(true);
    add('OK', 'Tulis + buang file uji ke Drive', 'id ' + id.slice(0, 6) + '… sudah di sampah');
  });

  // 5. Firebase
  step('Firebase', function () {
    const key = prop_('FIREBASE_WEB_API_KEY', false);
    if (!key) { add('GAGAL', 'Firebase lookup', 'FIREBASE_WEB_API_KEY kosong'); return; }
    const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key),
      { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: 'x' }), muteHttpExceptions: true });
    const c = res.getResponseCode();
    add(c === 400 ? 'OK' : 'GAGAL', 'Firebase accounts:lookup', 'HTTP ' + c + (c === 400 ? ' (400 INVALID_ID_TOKEN untuk token palsu = normal)' : ' ' + String(res.getContentText()).replace(/\s+/g, ' ').slice(0, 200) + ' — lihat diagnoseAuth()'));
  });

  // 6. Endpoint publik berfungsi dan tidak membocorkan data pribadi
  step('Endpoint publik', function () {
    const cfg = route_({ parameter: { action: 'getWebsiteConfig' } }, 'GET');
    add(cfg ? 'OK' : 'GAGAL', 'getWebsiteConfig');
    const mem = route_({ parameter: { action: 'getMembers' } }, 'GET');
    add(mem && !/"NIM"/.test(JSON.stringify(mem)) ? 'OK' : 'GAGAL', 'getMembers tanpa NIM');
  });

  rows.push('');
  rows.push('Pemeriksaan MANUAL (tidak bisa dicek dari skrip): Web App > Execute as: Me; Who has access: Anyone; sudah di-deploy sebagai VERSI BARU;');
  rows.push('Firebase Console > Authentication > Sign-in method hanya Email/Password; Settings > User actions > sign-up mandiri DIMATIKAN; domain GitHub Pages ada di Authorized domains.');
  const fail = rows.filter(function (r) { return r.indexOf('GAGAL') === 0; }).length, warn = rows.filter(function (r) { return r.indexOf('PERINGATAN') === 0; }).length;
  rows.push('Ringkasan: ' + fail + ' gagal, ' + warn + ' peringatan.');
  console.log(rows.join('\n'));
  return rows;
}
