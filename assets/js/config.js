/**
 * config.js — SATU-SATUNYA file yang perlu Anda isi untuk menghubungkan website ke backend.
 *
 * Isi API_URL dan blok FIREBASE di komputer Anda sendiri, lalu commit ke repository.
 *
 * Apakah nilai ini rahasia? TIDAK. Firebase web config dan URL Web App pasti terlihat oleh siapa pun yang
 * membuka DevTools karena browser membutuhkannya. Keamanan TIDAK bergantung pada kerahasiaan keduanya,
 * melainkan pada: kata sandi yang dikelola Firebase Authentication (Email/Password), verifikasi ID token
 * di server (Apps Script), sesi bertanda tangan, RBAC, dan validasi semua input.
 * Yang TIDAK BOLEH masuk repository: APP_TOKEN_SECRET, kunci Admin SDK/service account Firebase,
 * kata sandi apa pun, dan isi Script Properties.
 */
export const CONFIG = {
  // URL Web App Apps Script, bentuk: https://script.google.com/macros/s/XXXXXXXX/exec
  API_URL: 'https://script.google.com/macros/s/AKfycbw8Yo36psmncoaE-i1_0y5gkncBy9DpaCfmDa2_nb8LF-m8q9muezQJF36SspcFle2quA/exec',

  // Firebase web config (Project settings -> General -> Your apps -> Web app). Hanya 4 nilai ini yang dipakai.
  FIREBASE: { 
    apiKey: "AIzaSyBQYL6zsVBzwPQa8B5yL219_lDzbSoK7Ac",
    authDomain: "himatika-itera.firebaseapp.com",
    projectId: "himatika-itera",
    storageBucket: "himatika-itera.firebasestorage.app",
    messagingSenderId: "529932760940",
    appId: "1:529932760940:web:f822635fad696851dca549",
    measurementId: "G-5SPDBF7SF3"
  },

  REQUEST_TIMEOUT_MS: 45000,   // Apps Script bisa 10–30 dtk pada start dingin (permintaan pertama setelah lama tak dipakai)
  // Cache data publik di browser (stale-while-revalidate). Data < TTL dipakai tanpa request; lebih lama dari TTL tetap
  // ditampilkan seketika sambil diperbarui di latar belakang; lebih lama dari MAX_AGE dibuang. Perubahan dari dashboard
  // dapat tertunda sebanyak TTL bagi pengunjung yang baru membuka situs. Tambahkan ?refresh=1 ke URL untuk melewati cache.
  PUBLIC_CACHE_TTL_MS: 20 * 60 * 1000,
  PUBLIC_CACHE_MAX_AGE_MS: 24 * 3600 * 1000,
  SITE_CACHE_KEY: 'himatika:site:v1',
  SITE_CACHE_MAX_AGE_MS: 24 * 3600 * 1000
};

export const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 'Nunito', 'Lato', 'Merriweather', 'Playfair Display', 'Source Sans 3'];

/** Tampilan dasar yang dipakai bila API belum dikonfigurasi atau gagal. Cermin dari default di backend. */
export const FALLBACK = {
  config: {
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
  },
  theme: {
    layout: 'wide', navbar_style: 'solid', hero_style: 'centered', footer_style: 'simple',
    card_style: 'elevated', button_style: 'rounded', border_radius: '12',
    shadow_style: 'soft', spacing: 'normal', custom_css: ''
  },
  sections: [
    { key: 'hero', label: 'Hero', order: 1 }, { key: 'sambutan', label: 'Sambutan', order: 2 },
    { key: 'tentang', label: 'Tentang HIMATIKA', order: 3 }, { key: 'berita', label: 'Berita Terbaru', order: 4 },
    { key: 'kabinet', label: 'Kabinet Aktif', order: 5 }, { key: 'divisi', label: 'Divisi dan Departemen', order: 6 },
    { key: 'galeri', label: 'Galeri', order: 7 }, { key: 'kontak', label: 'Kontak', order: 8 }
  ],
  navigation: [
    { id: 'n1', label: 'Beranda', url: '#beranda', parent_id: '', order: 1, target: '_self' },
    { id: 'n2', label: 'Tentang', url: '#tentang', parent_id: '', order: 2, target: '_self' },
    { id: 'n3', label: 'Berita', url: 'pages/news.html', parent_id: '', order: 3, target: '_self' },
    { id: 'n4', label: 'Kabinet', url: 'pages/cabinet.html', parent_id: '', order: 4, target: '_self' },
    { id: 'n5', label: 'Kontak', url: '#kontak', parent_id: '', order: 5, target: '_self' }
  ]
};

export function firebaseConfigured() {
  const f = CONFIG.FIREBASE || {};
  return /^AIza[\w-]{30,}$/.test(f.apiKey || '') && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(f.authDomain || '') && /^[a-z0-9-]{4,}$/.test(f.projectId || '') && /^1:\d+:web:[a-f0-9]+$/.test(f.appId || '');
}

export function apiConfigured() {
  return /^https:\/\/script\.google\.com\/[A-Za-z0-9_\-\/]+\/exec$/.test(CONFIG.API_URL);
}
