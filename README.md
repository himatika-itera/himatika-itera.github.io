# Website HIMATIKA ITERA — Serverless CMS

Frontend statis (HTML/CSS/JS, tanpa build) untuk GitHub Pages. Data dari Google Sheets lewat Google Apps Script;
login admin memakai **Firebase Authentication — Email/Password saja** (tanpa Google Sign-In); token diverifikasi di server Apps Script.

## Status
- [x] Fase 1 — Arsitektur
- [x] Fase 2 — Backend Apps Script (`apps-script/`)
- [x] Fase 3 — Website publik, klien API, modul auth
- [x] Fase 4 — Dashboard Admin (`admin/`), Website Customizer, halaman Anggota per angkatan (`pages/members.html`)
- [x] Fase 5 — Pemeriksaan integrasi nyata: `integrationCheck()` di Apps Script ([docs/INTEGRASI-DAN-DEPLOY.md](docs/INTEGRASI-DAN-DEPLOY.md))
- [x] Fase 6 — Uji keamanan ([docs/KEAMANAN.md](docs/KEAMANAN.md))
- [x] Fase 7 — Panduan deploy GitHub Pages + daftar periksa penerimaan (dijalankan oleh pemilik proyek)

## Menghubungkan ke backend
Edit **satu file**: `assets/js/config.js`
- `API_URL` — URL Web App Apps Script (`https://script.google.com/macros/s/.../exec`)
- `FIREBASE` — `apiKey`, `authDomain`, `projectId`, `appId` (Firebase Console > Project settings > Your apps > Web app)

Kedua nilai ini **bukan rahasia** (selalu terlihat di browser; keamanan bertumpu pada verifikasi di server). Jangan pernah memasukkan
`APP_TOKEN_SECRET`, kunci Admin SDK/service account Firebase, kata sandi, atau isi Script Properties ke repository. Selama konfigurasi kosong,
website publik tetap tampil dengan tampilan dasar dan halaman login menampilkan peringatan (tidak memanggil server).

## Cache publik (kecepatan)
Halaman publik memakai cache browser *stale-while-revalidate* (`PUBLIC_CACHE_TTL_MS` = 20 menit di `assets/js/config.js`):
- Data yang lebih muda dari 20 menit dipakai langsung, **tanpa request** ke Apps Script (pindah halaman/refresh instan).
- Data yang lebih tua tetap tampil seketika, lalu diperbarui di latar belakang dan tampilan otomatis menyesuaikan.
- Data lebih tua dari 24 jam dibuang. `?refresh=1` di URL melewati cache; pratinjau Customizer selalu melewatinya.
- Hanya data publik yang dicache (tidak pernah token/role/data admin). Konsekuensinya, perubahan dari dashboard baru terlihat oleh pengunjung dalam ≤ 20 menit.
- Kunjungan **pertama** di perangkat baru tetap menunggu Apps Script (start dingin bisa beberapa detik). Cache server (10 menit, otomatis dibersihkan saat Anda mengubah data lewat dashboard) mempercepat permintaan berikutnya.

## Pratinjau lokal
Modul ES tidak berjalan lewat `file://`. Gunakan server statis:

    python3 -m http.server 8080      # lalu buka http://localhost:8080


## Uji
    node apps-script/test/run.js     # logika backend (mock Sheets/Cache/Drive/Firebase)
    node test/frontend.test.js       # UI di Chromium dengan API tiruan (perlu: npm i playwright)

## Catatan GitHub Pages
- Semua path relatif; halaman dinamis memakai query string (`pages/news.html?slug=...`), bukan path bersih.
- `404.html` disajikan otomatis untuk path yang tidak ada.
- Konten dimuat dari API saat halaman dibuka, jadi mesin pencari yang tidak menjalankan JavaScript hanya melihat kerangka halaman.


## Dashboard Admin (Fase 4)
Buka `admin/index.html` (setelah `assets/js/config.js` diisi). Menu mengikuti peran; server tetap memeriksa setiap aksi.

| Halaman | Fungsi | Izin minimum |
|---|---|---|
| `dashboard.html` | Ringkasan dan aktivitas terbaru | `dashboard:read` |
| `news.html`, `pages.html` | Berita dan halaman statis (editor WYSIWYG Quill, draf/terbit) | `news:read`, `pages:read` |
| `members.html` | Data anggota (sheet ANGGOTA) | `members:read` |
| `content.html` | Struktur kabinet (sheet STRUKTUR) dan menu navigasi | `struktur:read` |
| `media.html` | Pustaka gambar di Google Drive | `media:read` |
| `customizer.html` | Warna, font, hero, tata letak, bagian beranda, pratinjau langsung, Simpan draf / Terbitkan / Reset | `config:read` |
| `users.html` | Pengguna, peran, log audit | `users:manage` |

Catatan penting:
- Halaman **Anggota** publik hanya menampilkan nama anggota berstatus `AKTIF` (tanpa NIM). Tambahkan menu "Anggota" lewat *Kabinet & Navigasi* dengan URL `pages/members.html`.
- Perubahan Customizer tersimpan sebagai **draf** sampai Anda menekan *Terbitkan*. Pengaturan *bagian beranda* langsung tampil setelah disimpan.
- Gambar diperkecil (maks 1600 px) dan di-encode ulang di browser sebelum diunggah; metadata EXIF (termasuk lokasi) terbuang. Maks 5 MB.
- Urutan kabinet di website mengikuti urutan baris pada sheet STRUKTUR.
- Pengeditan bersamaan memakai prinsip "terakhir menyimpan menang".

## Menjalankan uji
```
node apps-script/test/run.js      # backend (VM tiruan Apps Script)  — 141 uji
node test/frontend.test.js        # website publik (Chromium + API tiruan) — 31 uji
node test/admin.test.js           # Dashboard Admin (Chromium + API tiruan) — 29 uji
```
Semua uji memakai Google Sheets/Drive **tiruan**; Sheets, Drive, dan Firebase asli baru diuji pada Fase 5 dengan konfigurasi Anda sendiri.

## Login admin: Firebase Authentication (Email/Password)
Alur: email + kata sandi -> **Firebase** (HTTPS) -> ID token -> aksi `createSession` di Apps Script -> token aplikasi 30 menit.
Setiap aksi admin membawa **dua** kredensial (ID token Firebase + token aplikasi) dan melewati: format -> timestamp -> pembatasan -> verifikasi ID token
-> token aplikasi -> UID cocok -> status/role/izin -> anti-replay -> batas per UID -> validasi payload.
- Kata sandi **hanya** dikirim ke Firebase. Apps Script dan sheet USERS tidak pernah melihat, menerima, atau menyimpannya.
- Hanya provider `password` yang diterima (Google, anonim, dll. ditolak di server). SDK dimuat tanpa popup/iframe.
- Sesi Firebase dan token aplikasi disimpan di `sessionStorage` per-tab (hilang saat tab ditutup). Role/izin selalu dari server.
- **Yang boleh login = user di Firebase Authentication > Users**, yang Anda buat sendiri di Console, ditambah terdaftar (email + role) di sheet USERS. Tidak ada verifikasi email, tautan, atau reset lewat email di website; ganti/reset sandi dilakukan Super Admin di Firebase Console.
- **Pendaftaran mandiri (sign-up) di Firebase WAJIB dimatikan.** Karena email tidak diverifikasi, bila sign-up terbuka penyerang dapat mendaftar dengan email calon pengelola dan mengambil undangannya. Dengan sign-up mati, hanya Anda yang bisa membuat user.
- Penguncian percobaan dan hash kata sandi dikelola Firebase.

### Setup (Anda lakukan sendiri)
1. **Firebase Console**: buat project, Authentication > Sign-in method > aktifkan **Email/Password** saja (jangan Google). Settings > Authorized domains: tambahkan domain GitHub Pages Anda.
   **Matikan pendaftaran mandiri** (Settings > User actions > *Enable create (sign-up)* off) dan buat akun pengelola lewat Authentication > Users > Add user.
2. **Apps Script** > Script Properties: `SPREADSHEET_ID`, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY` (API key web yang sama), `DRIVE_ROOT_FOLDER_ID`.
3. Jalankan `generateAppTokenSecret()` (jangan dihapus/diganti setelah dipakai) lalu `setupSheets()`.
4. Tambah Script Property sementara `BOOTSTRAP_ADMIN_EMAIL`, jalankan `bootstrapSuperAdmin()`, lalu hapus properti itu.
5. Di Firebase buat akun dengan email yang sama (Authentication > Users > Add user). Login pertama mengikat UID Firebase ke baris USERS.
6. `checkConfiguration()`, lalu deploy ulang Web App (versi baru). Isi `assets/js/config.js`.
Pengguna berikutnya: Super Admin mengundang email + role di halaman **Pengguna**, lalu membuat akun Firebase-nya di Console.

### Keterbatasan yang perlu Anda tahu
- Apps Script tidak bisa memverifikasi tanda tangan RSA, jadi ID token diverifikasi lewat `accounts:lookup` Firebase (ditambah pemeriksaan klaim); hasilnya di-cache maks 5 menit, sehingga akun yang dinonaktifkan di Firebase masih bisa lolos sampai 5 menit (penangguhan di sheet USERS berlaku seketika).
- Tidak ada MFA bawaan untuk Email/Password pada rencana gratis Firebase.
- Apps Script tidak mengetahui IP klien; pembatasan laju dilakukan per UID dan global, sedangkan percobaan login ditangani Firebase.
- Pembatasan dan cache memakai CacheService; bila Google mengosongkannya, penghitung mulai dari nol.
- GitHub Pages tidak dapat mengirim header HTTP; CSP dipasang lewat `<meta>`, sehingga `frame-ancestors` (anti-clickjacking) tidak berlaku.
