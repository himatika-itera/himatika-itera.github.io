/**
 * KONFIGURASI WEBSITE HIMATIKA ITERA
 * Ganti semua nilai yang diawali "ISI_" dengan nilai asli.
 * Selama masih "ISI_", website berjalan dalam MODE DEMO (data disimpan di browser saja).
 */
window.HIMATIKA_CONFIG = {
  // Firebase (Console Firebase > Project settings > Your apps > Web app)
  firebase: {
    apiKey: "ISI_API_KEY",
    authDomain: "ISI_PROJECT.firebaseapp.com",
    projectId: "ISI_PROJECT_ID",
    appId: "ISI_APP_ID"
  },

  // Koleksi Firestore berisi dokumen per email anggota aktif: members/{email} -> { active: true }
  activeMembersCollection: "members",

  // URL Web App Google Apps Script (lihat apps-script/Code.gs dan README.md)
  appsScriptUrl: "ISI_URL_APPS_SCRIPT",

  // Google Spreadsheet Kalender Program Kerja (harus dibagikan "Siapa saja yang memiliki link: Pelihat")
  calendarSheetId: "ISI_ID_SPREADSHEET_KALENDER",
  calendarSheetName: "Kalender",

  // Akun demo (hanya dipakai saat Firebase belum diisi)
  demoAccount: { email: "demo@himatika.local", password: "himatika123", name: "Anggota Demo" },

  // Kontak footer (GANTI dengan data resmi)
  contact: {
    email: "himatika@lk.itera.ac.id",
    instagram: "https://www.instagram.com/himatika_itera",
    instagramLabel: "@himatika_itera",
    phone: "+62 000-0000-0000",
    facebook: "https://facebook.com/",
    facebookLabel: "Himatika ITERA"
  },

  siteName: "Himatika Itera",
  foundedYear: 2017
};
