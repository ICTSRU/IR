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
const APP_VERSION    = '3.8';
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
const SHEET_REPORTS = 'Untitled';
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
  'formVersion',         // إصدار النموذج
  'extraSections'        // مقاطع إضافية (JSON: [{title, content}]) — عمود يُضاف تلقائيًا
];

/* ----------------------------- Web app ------------------------------ */

function doGet(e) {
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

  const page = (e && e.parameter && e.parameter.page) || '';
  const t = HtmlService.createTemplateFromFile(page === 'reports' ? 'Reports' : 'Index');
  t.baseUrl   = ScriptApp.getService().getUrl();
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
    formVersion: FORM_VERSION,
    extraSections: JSON.stringify(cleanExtra_(data.extraSections))
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

/** يعيد كل التقارير كاملة (الأحدث أولًا) لصفحة الاطلاع والطباعة. */
function listAllReports() {
  requireSruUser_();
  const sh = reportsSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, REPORT_COLS.length).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r[REPORT_COLS.indexOf('title')]) continue;
    const obj = { row: i + 2 };
    REPORT_COLS.forEach((key, idx) => {
      let v = r[idx];
      if (v instanceof Date) v = key === 'timestamp' ? Utilities.formatDate(v, LOG_TIMEZONE, 'yyyy-MM-dd HH:mm') : formatMaybeDate_(v);
      obj[key] = (v === null || v === undefined) ? '' : String(v);
    });
    out.push(obj);
  }
  out.reverse();
  return out.slice(0, REPORTS_MAX_LIST);
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

  obj.extraSections = parseExtra_(obj.extraSections);

  // روابط Drive لملفات المرفقات (مرتّبة لتطابق attachmentNames)
  obj.attachmentLinks = obj.attachmentNames.map(() => '');
  try {
    if (obj.attachmentNames.length) {
      const byName = {};
      findAttachmentFiles_(obj.incidentId, obj.attachmentNames).forEach(f => { byName[f.getName()] = f.getUrl(); });
      obj.attachmentLinks = obj.attachmentNames.map(n => byName[n] || '');
    }
  } catch (e) { /* تجاهل أي خطأ في البحث عن المرفقات */ }

  return obj;
}

/* ------------------------- صور المرفقات والشعارات ------------------------- */

/** ملفات مرفقات تقرير: من مجلد الحادثة، وإلا بالبحث عن الأسماء داخل المجلد الجذري (للتقارير القديمة). */
function findAttachmentFiles_(incidentId, names) {
  const files = [];
  try {
    const root = getOrCreateRootAttachmentsFolder_();
    const folder = incidentId ? findIncidentFolder_(incidentId, root) : null;
    if (folder) {
      const it = folder.getFiles();
      while (it.hasNext()) files.push(it.next());
      return files;
    }
    names = (names || []).filter(Boolean);
    if (!names.length) return files;
    const found = {};
    names.forEach(nm => { const it = root.getFilesByName(nm); if (it.hasNext()) found[nm] = it.next(); });
    const folders = root.getFolders();
    let n = 0;
    while (folders.hasNext() && n < 500) {
      const f = folders.next(); n++;
      names.forEach(nm => {
        if (found[nm]) return;
        const it = f.getFilesByName(nm);
        if (it.hasNext()) found[nm] = it.next();
      });
      if (names.every(nm => found[nm])) break;
    }
    names.forEach(nm => { if (found[nm]) files.push(found[nm]); });
  } catch (e) { console.error('findAttachmentFiles_: ' + e); }
  return files;
}

function namesList_(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
  return String(v || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** مرفقات تقرير محفوظ (صور بمحتواها + روابط Drive) للعرض داخل الصفحة والمستندات. */
function getAttachmentImages(rowNumber) {
  requireSruUser_();
  const r = getReport(Number(rowNumber));
  if (!r) return [];
  return getAttachmentImages_(r.incidentId, 10, r.attachmentNames);
}

function getAttachmentImages_(incidentId, maxCount, names) {
  const out = [];
  try {
    const files = findAttachmentFiles_(incidentId, namesList_(names));
    for (let i = 0; i < files.length && out.length < (maxCount || 10); i++) {
      const f = files[i];
      const mime = f.getMimeType() || '';
      if (mime.indexOf('image/') !== 0) continue;
      let blob;
      if (f.getSize() > 2500000) {
        blob = f.getThumbnail(); // الصور الكبيرة: نسخة مصغّرة لتفادي تضخّم الملف
        if (!blob) continue;
      } else {
        blob = f.getBlob();
      }
      out.push({ name: f.getName(), mime: blob.getContentType() || mime, base64: Utilities.base64Encode(blob.getBytes()), url: f.getUrl() });
    }
  } catch (e) { console.error('getAttachmentImages_: ' + e); }
  return out;
}

/** شعارات SRU و ICTD (data URI) من Logos.html. */
function getLogos_() {
  const res = {};
  try {
    const txt = HtmlService.createHtmlOutputFromFile('Logos').getContent();
    const re = /(sru|ictd)\s*:\s*"(data:image\/[a-z]+;base64,[^"]+)"/g;
    let m;
    while ((m = re.exec(txt)) !== null) res[m[1]] = m[2];
  } catch (e) { console.error('getLogos_: ' + e); }
  return res;
}

/* ------------------------- تصدير PDF من الخادم ------------------------- */

/** يعيد PDF (base64) لتقرير واحد (rowNumber) أو لكل التقارير (rowNumber = 0). */
function exportReportsPdf(rowNumber) {
  requireSruUser_();
  rowNumber = Number(rowNumber) || 0;
  let items;
  if (rowNumber > 0) {
    const r = getReport(rowNumber);
    items = r ? [r] : [];
  } else {
    items = listAllReports();
  }
  if (!items.length) throw new Error('لا توجد تقارير للتصدير.');
  const perReport = rowNumber > 0 ? 10 : 3;
  items.forEach(d => { d._images = getAttachmentImages_(d.incidentId, perReport, d.attachmentNames); });
  const html = buildPdfHtml_(items);
  const blob = Utilities.newBlob(html, 'text/html', 'report.html').getAs('application/pdf');
  const name = rowNumber > 0
    ? 'تقرير_حادثة_' + (items[0].incidentId || ('صف' + rowNumber)) + '.pdf'
    : 'سجل_تقارير_الحوادث.pdf';
  return { name: name, base64: Utilities.base64Encode(blob.getBytes()) };
}

function arNum_(n) {
  return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'.charAt(Number(d)));
}

function pdfEsc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function buildPdfHtml_(items) {
  const LOGO = getLogos_();
  const TH = 'width:28%;background:#f0ebf8;color:#000000;border:1px solid #bfb2d6;padding:5px 9px;text-align:right;font-weight:bold;';
  const TD = 'border:1px solid #bfb2d6;padding:5px 9px;text-align:right;color:#000000;';
  const H2 = 'color:#000000;font-weight:bold;font-size:13pt;border-bottom:2px solid #000000;padding:2px 0 3px;margin:14px 0 6px;text-align:right;';
  const BOX = 'border:1px solid #bfb2d6;padding:8px 10px;text-align:right;line-height:1.7;color:#000000;';
  const row = (l, v) => '<tr><td style="' + TH + '">' + l + '</td><td style="' + TD + '">' + (pdfEsc_(v) || '—') + '</td></tr>';
  const tbl = rows => '<table style="width:100%;border-collapse:collapse;" dir="rtl">' + rows + '</table>';
  const sec = (t, n) => '<div style="' + H2 + '">' + n + ' — ' + t + '</div>';
  const box = t => '<div style="' + BOX + '">' + (pdfEsc_(t) || '—') + '</div>';
  const SEV = { 'حرجة': '#8a1f1f', 'عالية': '#8a4b10', 'متوسطة': '#3a1464', 'منخفضة': '#1f6b37' };
  const gen = Utilities.formatDate(new Date(), LOG_TIMEZONE, 'dd/MM/yyyy');
  const logoImg = (k, h) => LOGO[k] ? '<img src="' + LOGO[k] + '" height="' + h + '">' : '';

  const pages = items.map((d, i) => {
    const names = Array.isArray(d.attachmentNames) ? d.attachmentNames : String(d.attachmentNames || '').split(',').map(s => s.trim()).filter(Boolean);
    const extras = parseExtra_(d.extraSections);
    const imgs = (d._images || []).map(im =>
      '<div style="margin:10px 0;text-align:center;"><div style="font-weight:bold;text-align:right;color:#000000;font-size:9.5pt;margin-bottom:3px;">' + pdfEsc_(im.name) + '</div>' +
      '<img src="data:' + im.mime + ';base64,' + im.base64 + '" style="max-width:520px;max-height:640px;border:1px solid #bfb2d6;"></div>').join('');
    const attBlock = (names.length || imgs) ? (names.length ? tbl(names.map((n, k) => row('مرفق ' + (k + 1), n)).join('')) : '') + imgs : box('');
    return '<div dir="rtl" style="' + (i < items.length - 1 ? 'page-break-after:always;' : '') + '">' +
      '<table style="width:100%;border-bottom:2px solid #501e8c;" dir="rtl"><tr>' +
        '<td style="text-align:right;">' + logoImg('sru', 44) + '</td>' +
        '<td style="text-align:left;" dir="ltr">' + logoImg('ictd', 48) + '</td></tr></table>' +
      '<div style="border-top:3px solid #501e8c;border-bottom:3px solid #501e8c;padding:10px 4px;margin-top:8px;text-align:right;">' +
        '<div style="font-size:19pt;font-weight:bold;color:#000000;">تقرير حادثة تقنية معلومات</div>' +
        '<div style="font-size:11.5pt;font-weight:bold;color:#222222;">' + pdfEsc_(d.title || 'حادثة بدون عنوان') + '</div>' +
        '<div style="font-size:9.5pt;margin-top:6px;font-weight:bold;color:#000000;">رقم الحادثة: ' + (pdfEsc_(d.incidentId) || '—') + ' &nbsp;|&nbsp; تاريخ الإنشاء: ' + gen + '</div></div>' +
      '<div style="margin:8px 0;padding:6px 12px;border:1px solid #bfb2d6;font-weight:bold;text-align:right;color:' + (SEV[d.severity] || '#3a1464') + ';">مستوى الخطورة: ' + (pdfEsc_(d.severity) || '—') + '</div>' +
      sec('بيانات الحادثة', '١') + tbl(row('الإدارة / القسم', d.department) + row('تاريخ الحادثة', d.incidentDate) + row('وقت الحادثة', d.incidentTime) + row('الموقع / النظام المتأثر', d.location) + row('التصنيف', d.category)) +
      sec('بيانات مقدّم البلاغ', '٢') + tbl(row('مقدّم البلاغ', d.reporterName) + row('المسمى الوظيفي', d.reporterTitle) + row('وسيلة التواصل', d.reporterContact) + row('تاريخ التقرير', d.reportDate)) +
      sec('وصف الحادثة', '٣') + box(d.description) +
      sec('الإجراءات الفورية المتخذة', '٤') + box(d.actionsTaken) +
      sec('السبب الجذري', '٥') + box(d.rootCause) +
      sec('تقييم الأثر', '٦') + box(d.impact) +
      sec('التوصيات / الإجراءات التصحيحية', '٧') + box(d.recommendations) +
      extras.map((s, k) => sec(pdfEsc_(s.title || 'مقطع إضافي'), arNum_(8 + k)) + box(s.content)).join('') +
      sec('الاعتماد', arNum_(8 + extras.length)) + tbl(row('أُعد بواسطة', d.preparedBy) + row('روجع / اعتمد بواسطة', d.approvedBy)) +
      sec('المرفقات', arNum_(9 + extras.length)) + attBlock +
      '<div style="margin-top:10px;border-top:1px solid #bfb2d6;font-size:8pt;color:#444444;text-align:right;">مستند داخلي — سري</div></div>';
  }).join('');

  return '<html dir="rtl"><head><meta charset="utf-8"></head><body dir="rtl" style="font-family:Arial,Tahoma,sans-serif;font-size:10.5pt;color:#000000;direction:rtl;">' + pages + '</body></html>';
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

function cleanExtra_(v) {
  if (!Array.isArray(v)) return [];
  return v.map(s => ({ title: String((s && s.title) || '').trim(), content: String((s && s.content) || '').trim() }))
          .filter(s => s.title || s.content).slice(0, 20);
}
function parseExtra_(v) {
  if (Array.isArray(v)) return cleanExtra_(v);
  try { return cleanExtra_(JSON.parse(String(v || '[]'))); } catch (e) { return []; }
}

/** يتأكد من وجود أعمدة الجدول الحالية (يضيف عمود «مقاطع إضافية» عند أول استخدام دون المساس بالبيانات). */
function ensureColumns_(sh) {
  const need = REPORT_COLS.length;
  if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
  const hc = sh.getRange(1, need);
  if (!String(hc.getValue() || '').trim()) hc.setValue('مقاطع إضافية');
  return sh;
}

function reportsSheet_() {
  return ensureColumns_(findReportsSheet_());
}

function findReportsSheet_() {
  const ss = SpreadsheetApp.openById(REPORTS_SPREADSHEET_ID);
  // 1) بالاسم المحدد (إن وُجد)
  let sh = SHEET_REPORTS ? ss.getSheetByName(SHEET_REPORTS) : null;
  if (sh) return sh;
  // 2) بالتعرّف على ترويسة الأعمدة الفعلية (لا يعتمد على اسم التبويب)
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    if (s.getLastColumn() < 3 || s.getLastRow() < 1) continue;
    const head = s.getRange(1, 1, 1, 3).getValues()[0].map(v => String(v).trim());
    if (head[1] === 'عنوان الحادثة' && head[2] === 'رقم الحادثة المرجعي') return s;
  }
  // 3) لا يوجد: لا ننشئ تبويبًا جديدًا حمايةً للبيانات
  throw new Error('تعذّر إيجاد ورقة التقارير. التبويبات الموجودة: ' + sheets.map(s => '"' + s.getName() + '"').join('، '));
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
