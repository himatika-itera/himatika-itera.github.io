# Keamanan dan pengujian (Fase 6)

## Model ancaman singkat
Frontend (GitHub Pages) tidak dipercaya. Seluruh keputusan akses ada di Apps Script. Rahasia hanya di Script Properties.

## Pipeline setiap aksi admin (urutan penting)
format amplop -> timestamp (±5 mnt) -> batas global pra-autentikasi -> ID token Firebase (klaim + `accounts:lookup`, hanya provider `password`)
-> token aplikasi HMAC (30 mnt, dapat dicabut) -> UID token = UID Firebase -> status/role/izin (RBAC) -> anti-replay (`request_id`)
-> batas per UID -> validasi payload -> eksekusi -> audit log.

## Matriks uji Fase 6 (`node apps-script/test/run.js`, 141 uji)
| Skenario | Hasil yang diharapkan | Uji |
|---|---|---|
| Request tanpa login | `UNAUTHENTICATED` | tanpa `firebase_id_token` / `application_token` ditolak; aksi admin via GET ditolak |
| Token kedaluwarsa | `TOKEN_EXPIRED` | ID token kedaluwarsa; token aplikasi >30 mnt; jam maju 61 mnt |
| Token palsu | `UNAUTHENTICATED` | lookup 400, aud/iss salah, alg `none`/HS256, sampah, HMAC dirusak, payload diubah, secret lain |
| UID tidak terdaftar | `UNAUTHORIZED` | akun Firebase sah tetapi tidak ada di USERS |
| User nonaktif | `USER_INACTIVE` | login ditolak; suspend mencabut sesi aktif |
| Role tanpa izin | `FORBIDDEN` | VIEWER/EDITOR/ADMIN di aksi di luar izin; `permissions` hanya mempersempit; tidak bisa naikkan role sendiri |
| Replay request | `REPLAY` / ditolak | `request_id` dipakai ulang; `request_id` tidak valid |
| Spam request | `RATE_LIMITED` | tulis 30/mnt per UID; sesi 10/10 mnt (upload dikonfigurasi 10/mnt memakai mekanisme yang sama, belum diuji terpisah); publik 600/mnt; global pra-autentikasi 300/mnt (tidak memanggil Google berlebihan) |
| Manipulasi payload | `VALIDATION_ERROR` / `NOT_FOUND`, tidak pernah `INTERNAL` | 18 aksi × 20 bentuk payload ganjil; prototype pollution; field server (id, views, tanggal) tidak dapat disuntik; key lintas sheet |
| Upload berbahaya | `VALIDATION_ERROR` | magic bytes ≠ MIME; skrip/HTML menyamar gambar; SVG; >5 MB; folder di luar allowlist; base64 rusak |
| Data sensitif bocor | tidak ada | respons tanpa token/secret/kata sandi; publik tanpa NIM |
| XSS/formula | dinetralkan | sanitasi HTML/CSS/URL di server dan klien; `= + - @` diawali tanda petik |

Tes frontend (`node test/frontend.test.js`, `node test/admin.test.js`) memeriksa CSP ketat tanpa inline script, tidak ada `localStorage` untuk role/sandi, dan kata sandi tidak pernah dikirim ke Apps Script.

## Batasan yang jujur
- Pengujian memakai Sheets/Drive/Firebase **tiruan**. Perilaku nyata diperiksa oleh `integrationCheck()` pada akun Anda.
- Apps Script tidak dapat memverifikasi RSA; token diverifikasi lewat `accounts:lookup` dan di-cache ≤5 menit (akun yang dimatikan di Firebase bisa lolos sampai 5 menit; penangguhan di USERS berlaku seketika).
- Tidak mengetahui IP klien; batas laju per UID dan global. Banjir request dapat menghabiskan batas global (denial of service kecil) tetapi tidak membuka akses.
- Counter laju di CacheService, tidak atomik dan dapat dikosongkan Google.
- GitHub Pages tidak bisa mengirim header HTTP: CSP lewat `<meta>`, tanpa `frame-ancestors` (anti-clickjacking).
- Tidak ada MFA bawaan untuk Email/Password.
- Sign-up mandiri Firebase wajib dimatikan karena email tidak diverifikasi.
