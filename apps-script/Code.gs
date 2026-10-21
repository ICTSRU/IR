/**
 * =====================================================================
 *  نموذج تقرير حادثة تقنية معلومات — ICTD — Google Apps Script Web App
 *  v3.0 — مبني من الصفر على البيانات الفعلية الموجودة مسبقًا
 *  مبني على SRU Secure Access Kit v1.4
 *  الدخول: حسابات Google الجامعية (@sr.edu.sa) + قائمة مصرّح لهم فقط
 * ---------------------------------------------------------------------
 *  الملفات:  Code.gs · Index.html · Logos.html · Denied.html
 *  النشر:    Deploy ▸ New deployment ▸ Web app
 *            Execute as: Me  ·  Who has access: Anyone within Sulaiman Al Rajhi University
 *
 *  مهم جدًا: هذا الإصدار يرتبط مباشرة بالورقة الموجودة فعليًا
 *  "Form responses 1" داخل جدول "سجل تقارير الحوادث - ICTD"،
 *  بنفس ترتيب الأعمدة الحالي تمامًا (23 عمودًا)، ولا يُنشئ ورقة
 *  جديدة ولا يُعدّل أي صف من الـ 19 صفًا التاريخية الموجودة فيها.
 *  أي تقرير جديد يُضاف كصف جديد في نهاية نفس الورقة.
 * =====================================================================
 */

/* ▼▼▼ CONFIG ▼▼▼ */
const APP_NAME       = 'نموذج تقرير حادثة تقنية معلومات';
const APP_NAME_EN    = 'IT Incident Report';
const APP_VERSION    = '3.0';
const ALLOWED_DOMAIN = 'sr.edu.sa';
const FAVICON_URL    = 'https://ictsru.github.io/IR/assets/itoc-logo.png';

/* سجل الدخول */
const LOG_ENABLED        = true;
const LOG_SPREADSHEET_ID = '1NCehfLQXMEzvgSKB8A2Oebtna_zVYwwZvsSFg3sUrmk';
const SHEET_LOG          = 'AccessLog';
const LOG_TIMEZONE       = 'Asia/Riyadh';
const LOG_DEDUP_MINUTES  = 30;
const LOG_RETENTION_DAYS = 180;

/* قائمة الدخول */
const ACCESS_MODE           = 'LIST';
const ACCESS_SPREADSHEET_ID = '1NCehfLQXMEzvgSKB8A2Oebtna_zVYwwZvsSFg3sUrmk';
const SHEET_ACCESS          = 'AllowedUsers';
const OWNER_EMAILS          = ['m.elmahdy@sr.edu.sa'];

const DEFAULT_ALLOWED = [
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

/* ------------------------- التقارير (البيانات الفعلية) ------------------------- */
// نفس الجدول ونفس الورقة الموجودة فعليًا — لا يُنشئ أي منهما إن كانا موجودين
const REPORTS_SPREADSHEET_ID = '1NCehfLQXMEzvgSKB8A2Oebtna_zVYwwZvsSFg3sUrmk';
const SHEET_REPORTS = 'Form responses 1';
const REPORTS_MAX_LIST = 500;
const FORM_VERSION = '1.7'; // استمرارًا لتسلسل "إصدار النموذج" الحالي في البيانات (آخر قيمة كانت 1.6)

// مجلد المرفقات في Drive (كما في الإصدارات السابقة لهذا النظام)
const ATTACHMENTS_ROOT_FOLDER = 'مرفقات تقارير الحوادث - ICTD';
/* ▲▲▲ CONFIG ▲▲▲ */

const LOG_HEADERS = ['timestamp', 'date', 'time', 'day', 'email', 'result', 'version'];
const DAYS_AR_    = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// ترتيب الأعمدة الفعلي في الورقة — يجب ألا يتغيّر هذا الترتيب أبدًا
const REPORT_COLS = [
  'timestamp',          // الطابع الزمني
  'title',               // عنوان الحادثة
  'incidentId',          // رقم الحادثة المرجعي
  'department',          // الإدارة / القسم
  'incidentDate',        // تاريخ الحادثة
  'incidentTime',        // وقت الحادثة
  'location',            // الموقع / النظام المتأثر
  'category',            // التصنيف
  'severity',            // مستوى الخطورة
  'reporterName',        // مقدّم البلاغ
  'reporterTitle',       // المسمى الوظيفي
  'reporterContact',     // وسيلة التواصل
  'reportDate',          // تاريخ التقرير
  'description',         // وصف الحادثة
  'actionsTaken',        // الإجراءات الفورية المتخذة
  'rootCause',           // السبب الجذري
  'impact',              // تقييم الأثر
  'recommendations',     // التوصيات / الإجراءات التصحيحية
  'preparedBy',          // أُعد بواسطة
  'approvedBy',          // روجع / اعتمد بواسطة
  'attachmentCount',     // عدد المرفقات
  'attachmentNames',     // أسماء المرفقات
  'formVersion'          // إصدار النموذج
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

/**
 * يحفظ تقريرًا جديدًا (rowNumber=0) أو يُحدّث صفًا موجودًا (rowNumber>0).
 * files: [{name, mimeType, base64}] اختياري — عند التحديث بلا ملفات جديدة
 * تبقى بيانات المرفقات القديمة كما هي دون تغيير.
 * يعيد {ok, id, row}.
 */
function saveReport(data, files, rowNumber) {
  const email = requireSruUser_();
  data = data || {};
  files = files || [];
  rowNumber = Number(rowNumber) || 0;
  const sh = reportsSheet_();

  let incidentId = String(data.incidentId || '').trim();
  let timestamp = new Date();
  let attachmentCount = 0;
  let attachmentNames = '';

  if (rowNumber > 0) {
    // تحديث: حافظ على الطابع الزمني الأصلي وبيانات المرفقات إن لم تُرفع ملفات جديدة
    const existing = sh.getRange(rowNumber, 1, 1, REPORT_COLS.length).getValues()[0];
    timestamp = existing[0] instanceof Date ? existing[0] : new Date();
    attachmentCount = existing[REPORT_COLS.indexOf('attachmentCount')] || 0;
    attachmentNames = existing[REPORT_COLS.indexOf('attachmentNames')] || '';
    if (!incidentId) incidentId = existing[REPORT_COLS.indexOf('incidentId')] || '';
  }

  if (!incidentId) {
    incidentId = generateIncidentId_(sh);
  }

  let uploadedLinks = null;
  if (files.length) {
    const uploaded = uploadAttachments_(incidentId, files);
    attachmentCount = uploaded.length;
    attachmentNames = uploaded.map(f => f.name).join(', ');
    uploadedLinks = uploaded; // [{name, url}]
  }

  const rowObj = Object.assign({}, data, {
    timestamp: timestamp,
    incidentId: incidentId,
    attachmentCount: attachmentCount,
    attachmentNames: attachmentNames,
    formVersion: FORM_VERSION
  });
  const row = REPORT_COLS.map(key => rowObj[key] !== undefined ? rowObj[key] : '');

  let targetRow;
  if (rowNumber > 0) {
    sh.getRange(rowNumber, 1, 1, REPORT_COLS.length).setValues([row]);
    targetRow = rowNumber;
  } else {
    sh.appendRow(row);
    targetRow = sh.getLastRow();
  }

  const result = { ok: true, id: incidentId, row: targetRow };
  if (uploadedLinks) {
    result.attachmentNames = uploadedLinks.map(f => f.name);
    result.attachmentLinks = uploadedLinks.map(f => f.url);
  } else if (attachmentNames) {
    result.attachmentNames = attachmentNames.split(',').map(s => s.trim()).filter(Boolean);
  }
  return result;
}

/** يعيد قائمة مختصرة لكل التقارير (الأحدث أولًا) للقائمة المنسدلة. */
function listReports() {
  requireSruUser_();
  const sh = reportsSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const n = last - 1;
  const values = sh.getRange(2, 1, n, REPORT_COLS.length).getValues();
  const items = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const rowNum = i + 2;
    if (!r[REPORT_COLS.indexOf('title')]) continue; // صف فارغ
    items.push({
      row: rowNum,
      id: r[REPORT_COLS.indexOf('incidentId')] || '',
      title: r[REPORT_COLS.indexOf('title')] || '',
      incidentDate: formatMaybeDate_(r[REPORT_COLS.indexOf('incidentDate')]),
      severity: r[REPORT_COLS.indexOf('severity')] || '',
      timestamp: r[REPORT_COLS.indexOf('timestamp')] instanceof Date
        ? r[REPORT_COLS.indexOf('timestamp')].toISOString() : ''
    });
  }
  items.reverse(); // الأحدث أولًا
  return items.slice(0, REPORTS_MAX_LIST);
}

/** يعيد بيانات تقرير كاملة برقم صفه في الورقة. */
function getReport(rowNumber) {
  requireSruUser_();
  rowNumber = Number(rowNumber);
  if (!rowNumber || rowNumber < 2) return null;
  const sh = reportsSheet_();
  if (rowNumber > sh.getLastRow()) return null;
  const values = sh.getRange(rowNumber, 1, 1, REPORT_COLS.length).getValues()[0];
  const obj = { row: rowNumber };
  REPORT_COLS.forEach((key, idx) => {
    let v = values[idx];
    if (v instanceof Date) {
      v = key === 'timestamp' ? v.toISOString() : formatMaybeDate_(v);
    }
    obj[key] = v;
  });

  // تحويل أسماء المرفقات المخزنة (نص مفصول بفواصل) إلى قائمة
  const namesRaw = String(obj.attachmentNames || '');
  obj.attachmentNames = namesRaw ? namesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  // محاولة إيجاد مجلد المرفقات (إن وُجد) لعرض روابط التنزيل، مرتّبة لتطابق attachmentNames
  obj.attachmentLinks = [];
  try {
    if (obj.incidentId) {
      const folder = findIncidentFolder_(obj.incidentId);
      if (folder) {
        const byName = {};
        const it = folder.getFiles();
        while (it.hasNext()) {
          const f = it.next();
          byName[f.getName()] = f.getUrl();
        }
        obj.attachmentLinks = obj.attachmentNames.map(n => byName[n] || '');
      }
    }
  } catch (e) { /* تجاهل أي خطأ في البحث عن المرفقات */ }

  return obj;
}

function formatMaybeDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, LOG_TIMEZONE, 'yyyy-MM-dd');
  return v || '';
}

function generateIncidentId_(sh) {
  const year = new Date().getFullYear();
  const prefix = 'INC-' + year + '-';
  let max = 0;
  const last = sh.getLastRow();
  if (last > 1) {
    const idCol = REPORT_COLS.indexOf('incidentId') + 1;
    const ids = sh.getRange(2, idCol, last - 1, 1).getValues();
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

function reportsSheet_() {
  const ss = SpreadsheetApp.openById(REPORTS_SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_REPORTS);
  if (!sh) throw new Error('تعذّر إيجاد الورقة "' + SHEET_REPORTS + '" — تحقق من اسم التبويب في الجدول.');
  return sh;
}

/* ---------------------------- المرفقات (Drive) ---------------------------- */

function uploadAttachments_(incidentId, files) {
  const folder = getOrCreateIncidentFolder_(incidentId);
  const uploaded = [];
  files.forEach(f => {
    try {
      const bytes = Utilities.base64Decode(f.base64);
      const blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', f.name || 'ملف');
      const file = folder.createFile(blob);
      uploaded.push({ name: file.getName(), url: file.getUrl() });
    } catch (e) {
      console.error('uploadAttachments_ failed for ' + f.name + ': ' + e);
    }
  });
  return uploaded;
}

function getOrCreateIncidentFolder_(incidentId) {
  const root = getOrCreateRootAttachmentsFolder_();
  const existing = findIncidentFolder_(incidentId, root);
  if (existing) return existing;
  return root.createFolder(incidentId);
}

function findIncidentFolder_(incidentId, rootOpt) {
  const root = rootOpt || getOrCreateRootAttachmentsFolder_();
  const it = root.getFoldersByName(incidentId);
  return it.hasNext() ? it.next() : null;
}

function getOrCreateRootAttachmentsFolder_() {
  const it = DriveApp.getFoldersByName(ATTACHMENTS_ROOT_FOLDER);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(ATTACHMENTS_ROOT_FOLDER);
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
