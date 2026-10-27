# Website Himatika ITERA

Website statis (HTML + JavaScript + Tailwind CSS yang sudah dikompilasi ke `assets/css/tailwind.css`) dengan tema kuning dan mode gelap/terang, siap di-deploy ke GitHub Pages.

## Struktur URL

| Menu | Alamat |
|---|---|
| Dashboard | `/` (alias `/dashboard/`) |
| Tentang Himatika | `/about/` |
| Berita / Publikasi | `/news/` |
| Struktur (8 kabinet) | `/cabinet/` dan detail `/cabinet/?k=axioma` |
| Anggota | `/members/` dan `/members/?year=2023` |
| Login | `/login/` |
| Kalender Program Kerja | `/calendar/` |
| Pengajuan Nomor Surat | `/letter-number/` |
| Pengajuan Tanda Tangan Elektronik | `/e-signature/` |

Kotak saran dan kontak ada di footer semua halaman.

## Mencoba secara lokal

```bash
python3 -m http.server 8000
# buka http://localhost:8000
```

Selama `assets/js/config.js` belum diisi, website berjalan di **mode demo**: login memakai `demo@himatika.local` / `himatika123`, dan data (nomor surat, TTE, saran) hanya tersimpan di browser.

## Mengubah tampilan (Tailwind)

CSS Tailwind sudah dikompilasi, jadi situs tidak bergantung pada CDN. Jika Anda mengubah kelas Tailwind di HTML/JS, kompilasi ulang dengan [Tailwind CLI v3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v3.4.17):

```bash
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > in.css
./tailwindcss -c tailwind.config.js -i in.css -o assets/css/tailwind.css --minify
```

## Mengisi data

Semua konten ada di `assets/js/data.js`:

- `cabinets[].divisi`: struktur departemen/divisi + staf tiap kabinet (Kahim & Sekjen sudah terisi).
- `members[tahun]`: daftar anggota per angkatan 2016-2024.
- `news`: berita/publikasi (saat ini contoh).
- `letterTypes`: jenis surat dan kode untuk penomoran.

Kontak footer ada di `assets/js/config.js` bagian `contact` (masih placeholder).

## Mengaktifkan Firebase (login anggota aktif)

1. Buat project di Firebase Console, aktifkan **Authentication > Email/Password**.
2. Buat web app, salin konfigurasinya ke `config.js` (`firebase`).
3. Aktifkan **Firestore**. Untuk tiap anggota aktif buat dokumen `members/{email-huruf-kecil}` dengan field `active: true`. Keluar dari keanggotaan cukup ubah menjadi `false`.
4. Tambahkan akun pengguna di Authentication, dan tambahkan domain `himatika-itera.github.io` (serta `himatika.ma.itera.ac.id` nanti) di **Authentication > Settings > Authorized domains**.
5. Aturan Firestore yang disarankan:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /members/{email} {
      allow read: if request.auth != null && request.auth.token.email.lower() == email;
      allow write: if false;
    }
  }
}
```

## Mengaktifkan Google Apps Script (nomor surat, TTE, kotak saran)

1. Buka script.google.com, buat project baru, tempel isi `apps-script/Code.gs`.
2. Project Settings > Script properties: isi `FIREBASE_API_KEY` (API key yang sama dengan di `config.js`). `DB_SPREADSHEET_ID` dan `DRIVE_FOLDER_ID` boleh kosong, lalu dibuat otomatis di Drive pertama kali dipakai.
3. Deploy > New deployment > Web app: *Execute as* = Me, *Who has access* = Anyone. Salin URL-nya ke `config.js` (`appsScriptUrl`).
4. Database tersimpan sebagai Google Spreadsheet di Drive (sheet `saran`, `letters`, `esign`), berkas PDF TTE tersimpan di folder Drive yang sama. Nomor surat dan TTE hanya dapat diakses dengan token Firebase yang valid.

## Kalender Program Kerja (Google Spreadsheets)

Buat sheet bernama `Kalender` dengan kolom berurutan: **Tanggal Mulai, Tanggal Selesai, Nama Kegiatan, Divisi, Lokasi, Status** (baris pertama = judul kolom). Bagikan dengan *Anyone with the link: Viewer*, lalu isi `calendarSheetId` di `config.js`.

## Deploy ke GitHub Pages

1. Buat repositori `himatika-itera.github.io` di organisasi/akun `himatika-itera`, lalu unggah seluruh isi folder ini.
2. Settings > Pages > Deploy from a branch > `main` / root.
3. Untuk domain resmi nanti: tambahkan berkas `CNAME` berisi `himatika.ma.itera.ac.id` dan atur DNS sesuai instruksi instansi. Semua tautan sudah relatif/berbasis akar sehingga tidak perlu diubah.

## Catatan keamanan

Situs statis tidak dapat menyembunyikan kode di sisi klien. Pembatasan akses sebenarnya ditegakkan oleh Firebase (Auth + aturan Firestore) dan verifikasi token di Apps Script. Jangan menaruh data sensitif di `data.js`.
