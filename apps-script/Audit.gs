/** Audit.gs — audit log. Tidak pernah mencatat token, secret, atau data base64. */

function redact_(d) {
  try {
    return JSON.stringify(d || {}, function (k, v) {
      return /token|secret|password|base64|authorization/i.test(k) ? '[REDACTED]' : v;
    }).slice(0, 1000);
  } catch (e) { return ''; }
}

/** Kegagalan audit tidak boleh menggagalkan request. */
function audit_(ctx, action, target, status, details) {
  try {
    withLock_(function () {
      dbInsert_('AUDIT_LOGS', {
        id: Utilities.getUuid(), uid: (ctx && ctx.uid) || '', email: (ctx && ctx.email) || '',
        action: action, target: String(target || '').slice(0, 200), timestamp: nowIso_(),
        status: status, details: redact_(details)
      });
    });
  } catch (e) { console.error('audit gagal: ' + e); }
}
