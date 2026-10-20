/**
 * =====================================================================
 *  نموذج تقرير حادثة تقنية معلومات — ICTD — Google Apps Script Web App
 *  مبني على SRU Secure Access Kit v1.4
 *  الدخول: حسابات Google الجامعية (@sr.edu.sa) + قائمة مصرّح لهم فقط
 * ---------------------------------------------------------------------
 *  الملفات:  Code.gs · Index.html · Logos.html · Denied.html
 *  النشر:    Deploy ▸ New deployment ▸ Web app
 *            Execute as: Me  ·  Who has access: Anyone within Sulaiman Al Rajhi University
 *  سجل الدخول: كل محاولة فتح → ورقة "AccessLog"
 *  قائمة الدخول: فقط البريد الإلكتروني النشط في ورقة "AllowedUsers" (ACCESS_MODE = 'LIST')
 *  التقارير: تُحفظ في ورقة "Reports" ويمكن استدعاؤها من القائمة المنسدلة في الصفحة
 * =====================================================================
 */

/* ▼▼▼ CONFIG — خاص بهذه المنصة ▼▼▼ */
const APP_NAME       = 'نموذج تقرير حادثة تقنية معلومات';
const APP_NAME_EN    = 'IT Incident Report';
const APP_VERSION    = '2.0';
const ALLOWED_DOMAIN = 'sr.edu.sa';
const FAVICON_URL    = 'https://ictsru.github.io/IncidentReport/assets/itoc-logo.png';

/* سجل الدخول */
const LOG_ENABLED        = true;
// نفس جدول "سجل تقارير الحوادث - ICTD" المستخدم مسبقًا لهذا النظام
const LOG_SPREADSHEET_ID = '1NCehfLQXMEzvgSKB8A2Oebtna_zVYwwZvsSFg3sUrmk';
const SHEET_LOG          = 'AccessLog';
const LOG_TIMEZONE       = 'Asia/Riyadh';
const LOG_DEDUP_MINUTES  = 30;
const LOG_RETENTION_DAYS = 180;

/* قائمة الدخول (من يستطيع فتح المنصة) */
const ACCESS_MODE          = 'LIST';   // قائمة مصرّح لهم فقط (وفق طلب المستخدم)
const ACCESS_SPREADSHEET_ID = '1NCehfLQXMEzvgSKB8A2Oebtna_zVYwwZvsSFg3sUrmk';
const SHEET_ACCESS        = 'AllowedUsers';
const OWNER_EMAILS        = ['m.elmahdy@sr.edu.sa']; // يسمح للمالك بالدخول دائمًا

/* القائمة الافتراضية — تُضاف بواسطة setupAccessList() (الصفوف الموجودة تبقى كما هي) */
const DEFAULT_ALLOWED = [
  // [email, name, role, notes]
  ['nabounar@sr.edu.sa',    'Nasser Abounar', 'admin', 'CIO'],
  ['m.elmahdy@sr.edu.sa',   'Mohamed ElMahdy', 'admin', 'Owner — IT Operations Manager'],
  ['n.nawaz@sr.edu.sa',     '', 'user', ''],
  ['m.omar@sr.edu.sa',      '', 'user', ''],
  ['m.saleh@sr.edu.sa',     '', 'user', ''],
  ['a.alrowedan@sr.edu.sa', '', 'user', ''],
  ['n.alrashidi@sr.edu.sa', '', 'user', ''],
  ['a.alawaji@sr.edu.sa',   '', 'user', ''],
  ['a.alaqeel@sr.edu.sa',   '', 'user', ''],
  ['a.alolayan@sr.edu.sa',  '', 'user', ''],
  ['s.albusayli@sr.edu.sa', '', 'user', ''],
  ['i.almutairi@sr.edu.sa', '', 'user', ''],
  ['a.elnadi@sr.edu.sa',    '', 'user', '']
];
const ACCESS_CACHE_SECONDS = 120;

/* التقارير */
const REPORTS_SPREADSHEET_ID = '1NCehfLQXMEzvgSKB8A2Oebtna_zVYwwZvsSFg3sUrmk';
const SHEET_REPORTS = 'Reports';
const REPORTS_MAX_LIST = 300; // أحدث عدد من التقارير تُعرض في القائمة المنسدلة
/* ▲▲▲ CONFIG ▲▲▲ */

const LOG_HEADERS = ['timestamp', 'date', 'time', 'day', 'email', 'result', 'version'];
const DAYS_AR_    = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const REPORT_HEADERS = [
  'id', 'updatedAt', 'submittedBy', 'title', 'department', 'incidentDate', 'incidentTime',
  'location', 'category', 'severity', 'reporterName', 'reporterTitle', 'reporterContact',
  'reportDate', 'description', 'actionsTaken', 'rootCause', 'impact', 'recommendations',
  'preparedBy', 'approvedBy', 'dataJson'
];

/* ----------------------------- Web app ------------------------------ */

function doGet() {
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status !== 'ok') {
    logAccess_(email || '(unknown)', status === 'list' ? 'not-listed' : 'denied');
    const d = HtmlService.createTemplateFromFile('Denied');
    d.appName = APP_NAME; d.appNameEn = APP_NAME_EN;
    d.userEmail = email || '';
    d.reason = status;
    return d.evaluate().setTitle(APP_NAME + ' | غير مصرح')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  logAccess_(email, 'granted');

  const t = HtmlService.createTemplateFromFile('Index');
  t.appName   = APP_NAME;
  t.appNameEn = APP_NAME_EN;
  t.version   = APP_VERSION;
  t.userEmail = email;
  const out = t.evaluate().setTitle(APP_NAME_EN + ' | ' + APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (FAVICON_URL) out.setFaviconUrl(FAVICON_URL);
  return out;
}

/* ------------------- استدعاءات الصفحة (Reports) ----------------------- */
/*  كل دالة تُستدعى عبر google.script.run يجب أن تبدأ بـ requireSruUser_()  */

/** يحفظ تقريرًا جديدًا أو يحدّث تقريرًا موجودًا (إن وُجد نفس id). يعيد {ok, id}. */
function saveReport(data) {
  const email = requireSruUser_();
  data = data || {};
  const sh = reportsSheet_(true);

  let id = String(data.incidentId || '').trim();
  const existingRow = id ? findReportRow_(sh, id) : 0;

  if (!id) {
    id = generateIncidentId_(sh);
  }

  const now = new Date();
  const dataJson = safeJson_(Object.assign({}, data, { incidentId: id }));
  const row = [
    id, now, email,
    data.title || '', data.department || '', data.incidentDate || '', data.incidentTime || '',
    data.location || '', data.category || '', data.severity || '',
    data.reporterName || '', data.reporterTitle || '', data.reporterContact || '', data.reportDate || '',
    data.description || '', data.actionsTaken || '', data.rootCause || '', data.impact || '',
    data.recommendations || '', data.preparedBy || '', data.approvedBy || '', dataJson
  ];

  if (existingRow) {
    sh.getRange(existingRow, 1, 1, REPORT_HEADERS.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
  return { ok: true, id: id };
}

/** يعيد قائمة مختصرة لأحدث التقارير (للقائمة المنسدلة). */
function listReports() {
  requireSruUser_();
  const sh = reportsSheet_(false);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const n = Math.min(last - 1, 2000); // سقف أمان للقراءة
  const startRow = last - n + 1;
  const idCol = REPORT_HEADERS.indexOf('id') + 1;
  const values = sh.getRange(startRow, 1, n, REPORT_HEADERS.length).getValues();

  const items = values
    .filter(r => r[idCol - 1])
    .map(r => ({
      id: r[0], updatedAt: r[1] instanceof Date ? r[1].toISOString() : String(r[1] || ''),
      title: r[3], department: r[4], incidentDate: r[5], severity: r[9]
    }))
    .reverse()
    .slice(0, REPORTS_MAX_LIST);
  return items;
}

/** يعيد بيانات تقرير كاملة بمعرّفه، لتعبئة النموذج منها. */
function getReport(id) {
  requireSruUser_();
  const sh = reportsSheet_(false);
  if (!sh) return null;
  const row = findReportRow_(sh, id);
  if (!row) return null;
  const jsonCol = REPORT_HEADERS.indexOf('dataJson') + 1;
  const json = sh.getRange(row, jsonCol, 1, 1).getValue();
  try { return JSON.parse(json); } catch (e) { return null; }
}

function findReportRow_(sh, id) {
  if (!sh || sh.getLastRow() < 2) return 0;
  const idCol = REPORT_HEADERS.indexOf('id') + 1;
  const ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function generateIncidentId_(sh) {
  const year = new Date().getFullYear();
  const prefix = 'INC-' + year + '-';
  let max = 0;
  if (sh && sh.getLastRow() > 1) {
    const idCol = REPORT_HEADERS.indexOf('id') + 1;
    const ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
    ids.forEach(r => {
      const s = String(r[0] || '');
      if (s.indexOf(prefix) === 0) {
        const n = parseInt(s.slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
  }
  return prefix + String(max + 1).padStart(3, '0');
}

function reportsSheet_(create) {
  const ss = REPORTS_SPREADSHEET_ID ? SpreadsheetApp.openById(REPORTS_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_REPORTS);
  if (!sh && create) {
    sh = ss.insertSheet(SHEET_REPORTS);
    sh.getRange(1, 1, 1, REPORT_HEADERS.length).setValues([REPORT_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#501e8c');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    sh.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }
  return sh;
}

/* ------------------------------ Access ------------------------------ */

function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}
function isAllowed_(email) {
  return !!email && email.endsWith('@' + ALLOWED_DOMAIN);
}
function requireSruUser_() {
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status === 'domain') throw new Error('غير مصرح — الدخول لمنسوبي الجامعة فقط');
  if (status === 'list') throw new Error('غير مصرح — حسابك غير مضاف إلى قائمة المصرّح لهم');
  return email;
}

/* ---------------------------- Access list --------------------------- */

const ACCESS_HEADERS = ['email', 'name', 'role', 'active', 'notes'];

function accessStatus_(email) {
  if (!isAllowed_(email)) return 'domain';
  if (ACCESS_MODE !== 'LIST') return 'ok';
  if (OWNER_EMAILS.map(e => e.toLowerCase()).indexOf(email) !== -1) return 'ok';
  return allowedEmails_().indexOf(email) !== -1 ? 'ok' : 'list';
}

function allowedEmails_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('acl_v1');
  if (hit) return JSON.parse(hit);
  let list = [];
  try {
    const sh = accessSheet_(false);
    if (sh && sh.getLastRow() > 1) {
      list = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
        .filter(r => r[0] && r[3] !== false && String(r[3]).toUpperCase() !== 'FALSE')
        .map(r => String(r[0]).trim().toLowerCase());
    }
  } catch (e) { console.error('allowedEmails_ failed: ' + e); }
  cache.put('acl_v1', JSON.stringify(list), ACCESS_CACHE_SECONDS);
  return list;
}

function accessSheet_(create) {
  const ss = ACCESS_SPREADSHEET_ID ? SpreadsheetApp.openById(ACCESS_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_ACCESS);
  if (!sh && create) {
    sh = ss.insertSheet(SHEET_ACCESS);
    sh.getRange(1, 1, 1, ACCESS_HEADERS.length).setValues([ACCESS_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#501e8c');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    [260, 200, 100, 70, 260].forEach((w, i) => sh.setColumnWidth(i + 1, w));
    sh.getRange(2, 4, 300, 1).insertCheckboxes();
    sh.getRange('A1').setNote('البريد الجامعي كاملًا — name@sr.edu.sa');
    sh.getRange('C1').setNote('admin / user (للتوثيق — يمكن استخدامه لاحقًا لصلاحيات أدق)');
    sh.getRange('D1').setNote('ألغِ العلامة لإيقاف الوصول دون حذف الصف');
  }
  return sh;
}

/** تشغّل مرة واحدة من المحرر: تنشئ تبويب AllowedUsers وتضيف المالك والفريق الافتراضي. */
function setupAccessList() {
  const sh = accessSheet_(true);
  const n = Math.max(sh.getLastRow() - 1, 0);
  const data = n ? sh.getRange(2, 1, n, 5).getValues() : [];

  const kept = data.filter(r => String(r[0]).trim())
    .map(r => [String(r[0]).trim(), r[1], r[2], r[3] === true || String(r[3]).toUpperCase() === 'TRUE', r[4]]);
  const have = kept.map(r => r[0].toLowerCase());

  const seed = OWNER_EMAILS.map(e => [e, 'Owner', 'admin', 'owner'])
    .concat(typeof DEFAULT_ALLOWED !== 'undefined' ? DEFAULT_ALLOWED : []);
  let added = 0;
  seed.forEach(r => {
    const e = String(r[0]).trim().toLowerCase();
    if (e && have.indexOf(e) === -1) {
      kept.push([e, r[1] || '', r[2] || 'user', true, r[3] || 'added by setupAccessList']);
      have.push(e); added++;
    }
  });

  if (n) sh.getRange(2, 1, n, 5).clearContent();
  const rows = Math.max(n, kept.length, 50);
  sh.getRange(2, 4, rows, 1).insertCheckboxes();
  if (kept.length) sh.getRange(2, 1, kept.length, 5).setValues(kept);

  CacheService.getScriptCache().remove('acl_v1');
  console.log('AllowedUsers ready: ' + kept.length + ' entries (' + added + ' added).');
  try { SpreadsheetApp.getActive().toast('قائمة المصرّح لهم جاهزة: ' + kept.length + ' بريدًا (أُضيف ' + added + ').', SHEET_ACCESS, 8); } catch (e) {}
}

/* ---------------------------- Access log ---------------------------- */

function logAccess_(email, result) {
  if (!LOG_ENABLED) return;
  try {
    if (LOG_DEDUP_MINUTES > 0 && result === 'granted') {
      const cache = CacheService.getScriptCache();
      const key = 'log_' + email;
      if (cache.get(key)) return;
      cache.put(key, '1', LOG_DEDUP_MINUTES * 60);
    }
    const now = new Date();
    const f = p => Utilities.formatDate(now, LOG_TIMEZONE, p);
    getLogSheet_().appendRow([now, f('yyyy-MM-dd'), f('HH:mm:ss'), DAYS_AR_[Number(f('u')) % 7],
      email, result === 'granted' ? 'دخول' : (result === 'not-listed' ? 'غير مدرج' : 'مرفوض'), APP_VERSION]);
  } catch (e) {
    console.error('logAccess_ failed: ' + e);
  }
}

function getLogSheet_() {
  const ss = LOG_SPREADSHEET_ID ? SpreadsheetApp.openById(LOG_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet: bind the script to a Sheet or set LOG_SPREADSHEET_ID');
  let sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#3a1464');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    [170, 100, 80, 80, 260, 80, 70].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  }
  return sh;
}

function showLogSummary() {
  const sh = getLogSheet_();
  const ui = SpreadsheetApp.getUi();
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('سجل الدخول', 'لا توجد سجلات بعد.', ui.ButtonSet.OK); return; }
  const since = new Date(Date.now() - 30 * 864e5);
  const rows = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues()
    .filter(r => r[0] instanceof Date && r[0] >= since && r[5] === 'دخول');
  const users = {};
  rows.forEach(r => { users[r[4]] = (users[r[4]] || 0) + 1; });
  const top = Object.keys(users).sort((a, b) => users[b] - users[a]).slice(0, 10)
    .map((u, i) => (i + 1) + '. ' + u + ' — ' + users[u]).join('\n');
  ui.alert('سجل الدخول — آخر 30 يومًا — ' + APP_NAME,
    'عدد الزيارات: ' + rows.length + '\nعدد المستخدمين: ' + Object.keys(users).length + '\n\nالأكثر دخولًا:\n' + (top || '—'),
    ui.ButtonSet.OK);
}

function purgeOldLogs() {
  const sh = getLogSheet_();
  const last = sh.getLastRow();
  let removed = 0;
  if (last > 1) {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 864e5);
    const stamps = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = stamps.length - 1; i >= 0; i--) {
      if (stamps[i][0] instanceof Date && stamps[i][0] < cutoff) { sh.deleteRow(i + 2); removed++; }
    }
  }
  SpreadsheetApp.getActive().toast('حُذف ' + removed + ' سجل أقدم من ' + LOG_RETENTION_DAYS + ' يومًا.', APP_NAME_EN, 6);
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu(APP_NAME_EN)
      .addItem('إعداد قائمة المصرّح لهم (AllowedUsers)', 'setupAccessList')
      .addSeparator()
      .addItem('ملخص سجل الدخول (30 يومًا)', 'showLogSummary')
      .addItem('حذف سجلات الدخول القديمة', 'purgeOldLogs')
      .addSeparator()
      .addItem('عرض رابط المنصة', 'showWebAppUrl')
      .addToUi();
  } catch (e) { /* standalone script: no sheet UI */ }
}

function showWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('رابط ' + APP_NAME, ScriptApp.getService().getUrl() || 'لم يُنشر بعد: Deploy ▸ New deployment ▸ Web app', ui.ButtonSet.OK);
}

/* ----------------------------- Helpers ------------------------------ */

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function safeJson_(obj) {
  var s = JSON.stringify(obj).replace(/</g, '\u003c');
  s = s.split(String.fromCharCode(8232)).join("\u2028");
  s = s.split(String.fromCharCode(8233)).join("\u2029");
  return s;
}
