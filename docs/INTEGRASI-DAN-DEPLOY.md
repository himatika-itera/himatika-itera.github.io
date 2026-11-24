# Integrasi (Fase 5) dan Deploy (Fase 7)

Urutan ini memastikan fondasi tiap langkah berfungsi sebelum lanjut. Semua nilai konfigurasi diisi oleh pemilik proyek.

## 1. Google Sheets (database privat)
1. Spreadsheet berisi sheet milik Anda: `BERITA`, `ANGGOTA`, `STRUKTUR`. Backend tidak pernah mengubah isi/struktur ketiganya (hanya menambah baris/kolom bila Anda memakai fitur CRUD, dan menambahkan kolom yang kurang lewat `setupSheets()`).
2. Tombol **Bagikan** > Akses umum = **Dibatasi**. Jangan "Siapa saja yang memiliki link". Backend berjalan sebagai Anda, jadi tidak perlu berbagi ke siapa pun.
3. Sheet lain (`USERS`, `SESSIONS`, `AUDIT_LOGS`, `WEBSITE_CONFIG`, `PAGES`, `MEDIA`, `NAVIGATION`, dll.) dibuat oleh `setupSheets()`.

## 2. Google Drive (media)
Buat folder induk (privat), salin ID-nya ke Script Property `DRIVE_ROOT_FOLDER_ID`. Hanya file gambar yang diunggah lewat dashboard yang dibuka "siapa saja dengan tautan"; folder induk tidak.

## 3. Firebase
Authentication > Sign-in method: hanya **Email/Password**. Settings > User actions: **matikan sign-up mandiri**. Authorized domains: tambahkan `<username>.github.io`. Buat user pengelola di Authentication > Users.

## 4. Apps Script
1. Script Properties: `SPREADSHEET_ID`, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `DRIVE_ROOT_FOLDER_ID`.
2. Jalankan `generateAppTokenSecret()`, `setupSheets()`, lalu (sekali) `BOOTSTRAP_ADMIN_EMAIL` + `bootstrapSuperAdmin()`; hapus properti sementara itu.
3. **Jalankan `integrationCheck()`** dan pastikan tidak ada baris `GAGAL`. Fungsi ini memeriksa properti, sheet & kolom, Spreadsheet tidak publik, akses tulis Drive (file uji langsung dibuang), Firebase lookup, Super Admin aktif, dan endpoint publik.
   Bila login bermasalah: `diagnoseAuth()` (kunci/proyek Firebase) dan `benchmarkLogin()` (kecepatan).
4. Deploy > New deployment > Web app: Execute as **Me**, Who has access **Anyone**. Setiap perubahan kode: Manage deployments > Edit > **New version**.
5. Salin URL `/exec` ke `API_URL` di `assets/js/config.js`.

## 5. GitHub Pages
1. Isi `assets/js/config.js` (`API_URL`, `FIREBASE`). Nilai ini bukan rahasia.
2. Push ke repository, Settings > Pages > Deploy from branch > `main` / root. File `.nojekyll` sudah ada.
3. Buka `https://<username>.github.io/<repo>/`. Semua path relatif sehingga berjalan di sub-path.
4. Jangan commit: `APP_TOKEN_SECRET`, kunci service account Firebase, kata sandi, isi Script Properties.

## 6. Daftar periksa penerimaan (Fase 7)
- [ ] Website publik tampil, berita/anggota/kabinet dimuat dari API.
- [ ] Admin login dengan user Firebase; akun yang tidak ada di USERS ditolak.
- [ ] Buat, ubah, hapus berita; unggah gambar; ubah warna lewat Customizer lalu Terbitkan; perubahan tampil di website.
- [ ] Buka URL Spreadsheet di jendela samaran: harus meminta login / akses ditolak.
- [ ] Buka halaman admin tanpa login: dialihkan ke login.
- [ ] `integrationCheck()` tanpa `GAGAL`.
- [ ] Tidak ada rahasia di repository (`git grep -i "APP_TOKEN_SECRET\|private_key"` kosong).
