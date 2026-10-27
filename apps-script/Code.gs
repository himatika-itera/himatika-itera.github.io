/**
 * BACKEND HIMATIKA ITERA (Google Apps Script)
 * Menyimpan: kotak saran, nomor surat, dan pengajuan tanda tangan elektronik.
 *
 * Cara pasang: lihat README.md bagian "Google Apps Script".
 * Script Properties yang wajib diisi (Project Settings > Script properties):
 *   FIREBASE_API_KEY  : API key web app Firebase (untuk memverifikasi token login)
 *   DB_SPREADSHEET_ID : ID spreadsheet database (boleh dikosongkan, akan dibuat otomatis di Drive)
 *   DRIVE_FOLDER_ID   : ID folder Google Drive untuk menyimpan berkas (boleh dikosongkan, dibuat otomatis)
 */

const SHEETS = {
  saran: ['Waktu', 'Nama', 'Pesan'],
  letters: ['Waktu', 'Nomor', 'Tahun', 'Kode', 'Jenis', 'Perihal', 'Tujuan', 'Tanggal', 'Pengaju'],
  esign: ['Waktu', 'ID', 'Judul', 'Penandatangan', 'Catatan', 'NamaBerkas', 'URL', 'Status', 'Pengaju']
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const MAX_BYTES = 5 * 1024 * 1024;

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

function folder_() {
  let id = prop_('DRIVE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const f = DriveApp.createFolder('Himatika ITERA - Berkas Website');
  PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_ID', f.getId());
  return f;
}

function db_() {
  let id = prop_('DB_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Himatika ITERA - Database Website');
  DriveApp.getFileById(ss.getId()).moveTo(folder_());
  PropertiesService.getScriptProperties().setProperty('DB_SPREADSHEET_ID', ss.getId());
  return ss;
}

function sheet_(name) {
  const ss = db_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Verifikasi token Firebase; mengembalikan email atau null. */
function verify_(token) {
  if (!token) return null;
  try {
    const res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + prop_('FIREBASE_API_KEY'),
      { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true }
    );
    const data = JSON.parse(res.getContentText());
    return data.users && data.users[0] ? String(data.users[0].email).toLowerCase() : null;
  } catch (e) { return null; }
}

function rows_(name, filterFn) {
  const sh = sheet_(name);
  const vals = sh.getDataRange().getValues();
  const head = vals.shift();
  return vals.map(function (r) {
    const o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  }).filter(filterFn || function () { return true; });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const action = req.action;

    // Publik (tanpa login)
    if (action === 'saran.create') {
      const pesan = String(req.pesan || '').slice(0, 1000);
      if (pesan.length < 5) return json_({ ok: false, error: 'Pesan terlalu pendek' });
      sheet_('saran').appendRow([new Date(), String(req.nama || '').slice(0, 80), pesan]);
      return json_({ ok: true });
    }

    // Khusus anggota (token Firebase valid)
    const email = verify_(req.token);
    if (!email) return json_({ ok: false, error: 'Sesi tidak valid, silakan login ulang' });

    if (action === 'letter.create') {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        const d = new Date(req.tanggal || new Date());
        const tahun = d.getFullYear();
        const seq = rows_('letters', function (r) { return Number(r.Tahun) === tahun; }).length + 1;
        const nomor = ('00' + seq).slice(-3) + '/' + req.kode + '/HIMATIKA-ITERA/' + ROMAN[d.getMonth()] + '/' + tahun;
        sheet_('letters').appendRow([new Date(), nomor, tahun, req.kode, req.jenis, req.perihal, req.tujuan, d, email]);
        return json_({ ok: true, nomor: nomor });
      } finally { lock.releaseLock(); }
    }

    if (action === 'letter.list') {
      const rows = rows_('letters', function (r) { return String(r.Pengaju).toLowerCase() === email; }).reverse().map(function (r) {
        return { nomor: r.Nomor, perihal: r.Perihal, tujuan: r.Tujuan, tanggal: new Date(r.Tanggal).toISOString() };
      });
      return json_({ ok: true, rows: rows });
    }

    if (action === 'esign.create') {
      const bytes = Utilities.base64Decode(req.data);
      if (bytes.length > MAX_BYTES) return json_({ ok: false, error: 'Berkas lebih dari 5 MB' });
      if (req.mime !== 'application/pdf') return json_({ ok: false, error: 'Berkas harus PDF' });
      const id = 'TTE-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss');
      const file = folder_().createFile(Utilities.newBlob(bytes, 'application/pdf', id + ' - ' + String(req.fileName).slice(0, 100)));
      sheet_('esign').appendRow([new Date(), id, req.judul, req.penandatangan, req.catatan || '', req.fileName, file.getUrl(), 'Menunggu', email]);
      return json_({ ok: true, id: id });
    }

    if (action === 'esign.list') {
      const rows = rows_('esign', function (r) { return String(r.Pengaju).toLowerCase() === email; }).reverse().map(function (r) {
        return { id: r.ID, judul: r.Judul, penandatangan: r.Penandatangan, status: r.Status, url: r.URL, waktu: new Date(r.Waktu).toISOString() };
      });
      return json_({ ok: true, rows: rows });
    }

    return json_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
