/**
 * Media.gs — upload gambar ke Google Drive.
 * Validasi: allowlist MIME (SVG ditolak, risiko XSS), magic bytes harus cocok dengan MIME, maks 5 MB,
 * nama file acak. Hanya file yang diunggah lewat modul ini yang dibuka "anyone with link";
 * folder induk TIDAK dibuka. Dokumen privat tidak boleh diunggah lewat jalur ini.
 */

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MEDIA_FOLDERS = ['Website Assets', 'News', 'Cabinet', 'Members', 'Pages'];

function detectImageMime_(b) {
  const u = function (i) { return (b[i] === undefined ? -1 : (b[i] & 255)); };
  if (u(0) === 0xFF && u(1) === 0xD8 && u(2) === 0xFF) return 'image/jpeg';
  if (u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4E && u(3) === 0x47 && u(4) === 0x0D && u(5) === 0x0A && u(6) === 0x1A && u(7) === 0x0A) return 'image/png';
  if (u(0) === 0x47 && u(1) === 0x49 && u(2) === 0x46 && u(3) === 0x38 && (u(4) === 0x37 || u(4) === 0x39) && u(5) === 0x61) return 'image/gif';
  if (u(0) === 0x52 && u(1) === 0x49 && u(2) === 0x46 && u(3) === 0x46 && u(8) === 0x57 && u(9) === 0x45 && u(10) === 0x42 && u(11) === 0x50) return 'image/webp';
  return '';
}

function mediaFolder_(name) {
  const root = DriveApp.getFolderById(prop_('DRIVE_ROOT_FOLDER_ID', true));
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function adminUploadImage_(ctx, p) {
  const d = validateFields_({
    filename: { t: 'str', required: true, max: 120 },
    mime_type: { t: 'enum', values: Object.keys(IMAGE_TYPES), required: true },
    folder: { t: 'enum', values: MEDIA_FOLDERS, def: 'News' }
  }, p, false);
  const b64 = p.data_base64;
  if (typeof b64 !== 'string' || !b64) throw new ApiError('VALIDATION_ERROR', 'data_base64 wajib diisi');
  if (b64.length > Math.ceil(CFG.MAX_UPLOAD_BYTES * 4 / 3) + 8) throw new ApiError('PAYLOAD_TOO_LARGE', 'Ukuran file melebihi batas');
  if (!/^[A-Za-z0-9+\/]+={0,2}$/.test(b64)) throw new ApiError('VALIDATION_ERROR', 'data_base64 tidak valid');
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > CFG.MAX_UPLOAD_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Ukuran file melebihi batas');
  if (detectImageMime_(bytes) !== d.mime_type) throw new ApiError('VALIDATION_ERROR', 'Isi file tidak sesuai tipe gambar');

  const stored = Utilities.getUuid() + '.' + IMAGE_TYPES[d.mime_type];
  const file = mediaFolder_(d.folder).createFile(Utilities.newBlob(bytes, d.mime_type, stored));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { file.setTrashed(true); throw e; }
  const rec = {
    id: Utilities.getUuid(), filename: d.filename.replace(/[\\\/]/g, '_'), drive_file_id: file.getId(),
    public_url: 'https://lh3.googleusercontent.com/d/' + file.getId(), mime_type: d.mime_type,
    uploaded_by: ctx.email, uploaded_at: nowIso_()
  };
  dbInsert_('MEDIA', rec);
  audit_(ctx, 'media.upload', rec.id, 'SUCCESS', { folder: d.folder, mime: d.mime_type, size: bytes.length });
  return outRow_('MEDIA', rec);
}

function adminListMedia_(ctx, p) {
  return crudList_({ sheet: 'MEDIA', searchFields: ['filename'], sort: function (a, b) { return (Date.parse(b.uploaded_at) || 0) - (Date.parse(a.uploaded_at) || 0); } }, p);
}

function adminDeleteMedia_(ctx, p) {
  const key = String(p.key || '');
  const row = dbFind_('MEDIA', key);
  if (!row) throw new ApiError('NOT_FOUND', 'Media tidak ditemukan');
  try { DriveApp.getFileById(String(row.drive_file_id)).setTrashed(true); } catch (e) { console.warn('file Drive tidak dapat dihapus: ' + e); }
  dbDelete_('MEDIA', key);
  audit_(ctx, 'media.delete', key, 'SUCCESS', {});
  invalidatePublic_();
  return {};
}
