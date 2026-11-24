/**
 * Config.gs — konstanta, skema sheet, default tema.
 * CATATAN: di editor Apps Script, pastikan file ini berada PALING ATAS urutan file.
 *
 * Script Properties yang dibutuhkan (Project Settings > Script Properties):
 *   SPREADSHEET_ID         ID spreadsheet database (privat)
 *   FIREBASE_PROJECT_ID    Project ID Firebase
 *   FIREBASE_WEB_API_KEY   Web API key Firebase (bukan rahasia, tapi disimpan di sini agar mudah diganti)
 *   APP_TOKEN_SECRET       diisi otomatis oleh generateAppTokenSecret()
 *   DRIVE_ROOT_FOLDER_ID   ID folder Drive induk untuk media
 *   BOOTSTRAP_ADMIN_EMAIL  (sementara) email Super Admin pertama; hapus setelah bootstrapSuperAdmin()
 */

const CFG = {
  SESSION_TTL_MS: 30 * 60 * 1000,
  TS_TOLERANCE_MS: 5 * 60 * 1000,
  REPLAY_TTL_S: 900,                      // harus > 2 x TS_TOLERANCE_MS
  MAX_BODY_BYTES: 300 * 1024,
  MAX_UPLOAD_BODY_BYTES: 7.5 * 1024 * 1024,
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  MAX_CELL_CHARS: 45000,                  // batas sel Google Sheets = 50.000 karakter
  USER_CACHE_S: 60,
  PUBLIC_CACHE_S: 600,
  LOCK_WAIT_MS: 10000,
  PRE_AUTH_LIMIT_PER_MIN: 300,            // batas global request admin sebelum autentikasi
  PUBLIC_LIMIT_PER_MIN: 600,
  TRACK_LIMIT_PER_MIN: 300,
  LIMITS: {                               // per UID
    read:    { max: 120, windowS: 60 },
    write:   { max: 30,  windowS: 60 },
    upload:  { max: 10,  windowS: 60 },
    session: { max: 10,  windowS: 600 }
  }
};

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'];
const USER_STATUS = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

/** Izin per role. Kolom USERS.permissions hanya dapat MEMPERSEMPIT izin ini. */
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['dashboard:read', 'news:*', 'pages:*', 'members:*', 'struktur:*', 'media:*',
          'navigation:read', 'navigation:update', 'sections:update',
          'config:read', 'config:update', 'theme:read', 'theme:update', 'site:publish'],
  EDITOR: ['dashboard:read', 'news:*', 'pages:*', 'media:read', 'media:upload'],
  VIEWER: ['dashboard:read']
};

/** Skema sheet. Sheet dengan existing:true dibuat pemilik dan TIDAK diubah strukturnya. */
const SHEETS = {
  BERITA:   { existing: true, key: 'id_berita', headers: ['id_berita', 'slug', 'judul', 'ringkasan', 'konten', 'kategori', 'penulis', 'gambar_utama', 'gambar', 'tanggal_publikasi', 'tanggal_dibuat', 'tanggal_diperbarui', 'status', 'is_featured', 'views', 'shares'] },
  ANGGOTA:  { existing: true, key: 'NIM', headers: ['NIM', 'NAMA', 'ANGKATAN', 'STATUS'] },
  STRUKTUR: { existing: true, key: ['Kabinet', 'NIM', 'Jabatan'], headers: ['Kabinet', 'NIM', 'Nama', 'Angkatan', 'Jabatan'] },
  USERS:    { key: 'uid', headers: ['uid', 'email', 'nama', 'role', 'permissions', 'status', 'created_at', 'updated_at', 'last_login'] },
  SESSIONS: { key: 'sid', headers: ['sid', 'uid', 'issued_at', 'expires_at', 'revoked'] },
  WEBSITE_CONFIG: { key: 'key', headers: ['key', 'value', 'draft_value', 'updated_at', 'updated_by'] },
  THEME:    { key: 'key', headers: ['key', 'value', 'draft_value', 'updated_at', 'updated_by'] },
  SECTIONS: { key: 'key', headers: ['key', 'label', 'enabled', 'order', 'settings_json'] },
  NAVIGATION: { key: 'id', headers: ['id', 'label', 'url', 'parent_id', 'order', 'visibility', 'target'] },
  PAGES:    { key: 'id', headers: ['id', 'title', 'slug', 'content', 'featured_image', 'status', 'created_at', 'updated_at'] },
  MEDIA:    { key: 'id', headers: ['id', 'filename', 'drive_file_id', 'public_url', 'mime_type', 'uploaded_by', 'uploaded_at'] },
  AUDIT_LOGS: { key: 'id', headers: ['id', 'uid', 'email', 'action', 'target', 'timestamp', 'status', 'details'] }
};

const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 'Nunito', 'Lato', 'Merriweather', 'Playfair Display', 'Source Sans 3'];

const DEFAULT_CONFIG = {
  site_name: 'HIMATIKA ITERA',
  site_description: 'Himpunan Mahasiswa Matematika Institut Teknologi Sumatera',
  logo_url: '', favicon_url: '',
  primary_color: '#F4C542', secondary_color: '#FFFFFF', accent_color: '#1F3A5F',
  background_color: '#F8F9FA', text_color: '#222222',
  font_family: 'Inter', heading_font: 'Poppins', base_font_size: '16',
  footer_text: '© HIMATIKA ITERA', maintenance_mode: 'false', active_cabinet: '',
  hero_title: 'Himpunan Mahasiswa Matematika ITERA',
  hero_subtitle: 'Berkarya, berkolaborasi, dan bertumbuh bersama.',
  hero_image: '', welcome_title: 'Sambutan Ketua Himpunan', welcome_name: '', welcome_text: '',
  contact_email: '', contact_address: '', instagram_url: ''
};

const DEFAULT_THEME = {
  layout: 'wide', navbar_style: 'solid', hero_style: 'centered', footer_style: 'simple',
  card_style: 'elevated', button_style: 'rounded', border_radius: '12',
  shadow_style: 'soft', spacing: 'normal', custom_css: ''
};

const DEFAULT_SECTIONS = [
  { key: 'hero', label: 'Hero', order: 1 }, { key: 'sambutan', label: 'Sambutan', order: 2 },
  { key: 'tentang', label: 'Tentang HIMATIKA', order: 3 }, { key: 'berita', label: 'Berita Terbaru', order: 4 },
  { key: 'kabinet', label: 'Kabinet Aktif', order: 5 }, { key: 'divisi', label: 'Divisi dan Departemen', order: 6 },
  { key: 'galeri', label: 'Galeri', order: 7 }, { key: 'kontak', label: 'Kontak', order: 8 }
];

const DEFAULT_NAVIGATION = [
  { label: 'Beranda', url: '#beranda', order: 1 }, { label: 'Tentang', url: '#tentang', order: 2 },
  { label: 'Berita', url: 'pages/news.html', order: 3 }, { label: 'Kabinet', url: 'pages/cabinet.html', order: 4 },
  { label: 'Kontak', url: '#kontak', order: 5 }
];

/** Baca Script Property. Error biasa (bukan ApiError) => dijawab INTERNAL tanpa membocorkan detail. */
function prop_(key, required) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if ((v === null || v === '') && required) throw new Error('Script Property belum diisi: ' + key);
  return v;
}
