/**
 * ICTD - سجل تقارير الحوادث
 * Google Apps Script Web App:
 *  - يستقبل بيانات نموذج تقرير الحادثة ويضيفها كصف في الشيت
 *  - يحفظ الصور المرفقة في Google Drive (فولدر رئيسي + فولدر فرعي لكل حادثة)
 *  - عند الطلب (زر "إرسال")، يُنشئ PDF للتقرير ويرسله بالبريد إلى العنوان المحدد
 *
 * خطوات التفعيل (تُنفَّذ مرة واحدة فقط بعد كل تحديث للكود):
 * 1) من داخل ملف الشيت: Extensions > Apps Script
 * 2) احذف الكود القديم بالكامل، والصق هذا الكود، ثم احفظ (Ctrl+S)
 * 3) Deploy > Manage deployments > (أيقونة القلم) > Version: New version > Deploy
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    - وافق على أي صلاحيات إضافية تُطلب (Gmail / Drive)
 * 4) لا حاجة لتغيير رابط /exec في صفحة HTML.
 */

const SHEET_NAME = "Sheet1";
const ATTACHMENTS_ROOT_FOLDER_NAME = "مرفقات تقارير الحوادث - ICTD";
const NOTIFY_EMAIL = "m.elmahdy@sr.edu.sa";

const HEADERS = [
  "الطابع الزمني","عنوان الحادثة","رقم الحادثة المرجعي","الإدارة / القسم","تاريخ الحادثة",
  "وقت الحادثة","الموقع / النظام المتأثر","التصنيف","مستوى الخطورة","مقدّم البلاغ",
  "المسمى الوظيفي","وسيلة التواصل","تاريخ التقرير","وصف الحادثة","الإجراءات الفورية المتخذة",
  "السبب الجذري","تقييم الأثر","التوصيات / الإجراءات التصحيحية","أُعد بواسطة",
  "روجع / اعتمد بواسطة","عدد المرفقات","أسماء المرفقات","رابط مجلد المرفقات (Drive)","إصدار النموذج"
];

const SEV_COLORS = {
  "حرجة": { fill: "#FBE1E1", ink: "#8A1F1F" },
  "عالية": { fill: "#FCEBD8", ink: "#8A4B10" },
  "متوسطة": { fill: "#F0EBF8", ink: "#3A1464" },
  "منخفضة": { fill: "#E4F3E8", ink: "#1F6B37" }
};

function esc(s){
  return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function getOrCreateRootFolder(){
  const it = DriveApp.getFoldersByName(ATTACHMENTS_ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(ATTACHMENTS_ROOT_FOLDER_NAME);
}

function sanitizeFolderName(name){
  return String(name || "بدون_عنوان").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
}

function saveAttachmentsToDrive(data){
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  if (!attachments.length) return "";

  const root = getOrCreateRootFolder();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Riyadh", "yyyyMMdd_HHmmss");
  const folderName = `${sanitizeFolderName(data.incidentId || data.title)}_${stamp}`;
  const incidentFolder = root.createFolder(folderName);

  attachments.forEach((att, idx) => {
    try{
      const parts = String(att.dataUrl || "").split(",");
      const meta = parts[0] || "";
      const base64 = parts[1] || "";
      const mimeMatch = meta.match(/data:([^;]+);base64/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const bytes = Utilities.base64Decode(base64);
      const fileName = att.name || `image_${idx + 1}.jpg`;
      const blob = Utilities.newBlob(bytes, mimeType, fileName);
      incidentFolder.createFile(blob);
    }catch(err){
      // Skip a single failed image without breaking the whole save.
    }
  });

  return incidentFolder.getUrl();
}

function ensureHeaders(sheet){
  if (sheet.getLastRow() === 0){
    sheet.appendRow(HEADERS);
    return HEADERS.slice();
  }
  const lastCol = sheet.getLastColumn();
  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = HEADERS.filter(h => currentHeaders.indexOf(h) === -1);
  if (missing.length){
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    return currentHeaders.concat(missing);
  }
  return currentHeaders;
}

// Builds a self-contained RTL HTML report (inline styles, no external fonts/stylesheets)
// suitable for Apps Script's HTML->PDF blob conversion.
function buildReportHtml(data){
  const sevColor = SEV_COLORS[data.severity] || SEV_COLORS["متوسطة"];
  const genDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Riyadh", "yyyy-MM-dd HH:mm");
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];

  function fieldRow(label, value){
    return `<tr>
      <td style="border:1px solid #D9CFEC;background:#F0EBF8;color:#3A1464;font-weight:bold;padding:6px 10px;width:32%;">${esc(label)}</td>
      <td style="border:1px solid #D9CFEC;background:#ffffff;color:#241436;padding:6px 10px;">${esc(value) || "—"}</td>
    </tr>`;
  }
  function sectionHead(text, num){
    return `<div style="background:#501E8C;color:#ffffff;padding:6px 12px;font-weight:bold;font-size:13px;margin:12px 0 6px;">
      ${esc(text)} <span style="color:#E6F3FA;font-size:11px;">${esc(num)}</span>
    </div>`;
  }
  function bodyBox(text){
    const t = (text || "").trim();
    if (!t){
      return `<div style="border:1px solid #D9CFEC;background:#FBFAFD;padding:10px 12px;color:#6B5A80;font-style:italic;">لم يتم إدخال بيانات لهذا القسم.</div>`;
    }
    const lines = t.split("\n").filter(l => l.length).map(l => `<p style="margin:0 0 6px;">${esc(l)}</p>`).join("");
    return `<div style="border:1px solid #D9CFEC;background:#FBFAFD;padding:10px 12px;">${lines}</div>`;
  }
  function attachmentsSection(){
    if (!attachments.length) return "";
    const items = attachments.map((a, i) => `
      <div style="display:inline-block;width:47%;margin:1%;border:1px solid #D9CFEC;vertical-align:top;">
        <img src="${a.dataUrl}" style="width:100%;display:block;">
        <div style="font-size:9px;color:#6B5A80;text-align:center;padding:3px;">${esc(a.name || "")} (${i + 1})</div>
      </div>`).join("");
    return sectionHead("المرفقات (الصور)", "٩") + `<div>${items}</div>`;
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,Tahoma,sans-serif;font-size:12px;color:#241436;direction:rtl;">

  <div style="background:#3A1464;color:#fff;padding:14px 16px;margin-bottom:12px;">
    <h1 style="margin:0 0 4px;font-size:18px;">تقرير حادثة تقنية معلومات</h1>
    <p style="margin:0 0 10px;font-size:12px;color:#E6F3FA;font-style:italic;">${esc(data.title || "حادثة بدون عنوان")}</p>
    <table style="width:100%;font-size:10px;color:#E6F3FA;"><tr>
      <td style="text-align:right;"><b>رقم الحادثة:</b> ${esc(data.incidentId) || "—"}</td>
      <td style="text-align:left;"><b>تاريخ إنشاء التقرير:</b> ${esc(genDate)}</td>
    </tr></table>
  </div>

  <div style="background:${sevColor.fill};color:${sevColor.ink};border:1px solid #D9CFEC;padding:8px 12px;margin-bottom:12px;font-weight:bold;">
    مستوى الخطورة: ${esc(data.severity) || "—"}
  </div>

  ${sectionHead("بيانات الحادثة", "١")}
  <table style="width:100%;border-collapse:collapse;">
    ${fieldRow("الإدارة / القسم", data.department)}
    ${fieldRow("تاريخ الحادثة", data.incidentDate)}
    ${fieldRow("وقت الحادثة", data.incidentTime)}
    ${fieldRow("الموقع / النظام المتأثر", data.location)}
    ${fieldRow("التصنيف", data.category)}
  </table>

  ${sectionHead("بيانات مقدّم البلاغ", "٢")}
  <table style="width:100%;border-collapse:collapse;">
    ${fieldRow("مقدّم البلاغ", data.reporterName)}
    ${fieldRow("المسمى الوظيفي", data.reporterTitle)}
    ${fieldRow("وسيلة التواصل", data.reporterContact)}
    ${fieldRow("تاريخ التقرير", data.reportDate)}
  </table>

  ${sectionHead("وصف الحادثة", "٣")}
  ${bodyBox(data.description)}

  ${sectionHead("الإجراءات الفورية المتخذة", "٤")}
  ${bodyBox(data.actionsTaken)}

  ${sectionHead("السبب الجذري", "٥")}
  ${bodyBox(data.rootCause)}

  ${sectionHead("تقييم الأثر", "٦")}
  ${bodyBox(data.impact)}

  ${sectionHead("التوصيات / الإجراءات التصحيحية", "٧")}
  ${bodyBox(data.recommendations)}

  ${sectionHead("الاعتماد", "٨")}
  <table style="width:100%;border-collapse:collapse;">
    ${fieldRow("أُعد بواسطة", data.preparedBy)}
    ${fieldRow("روجع / اعتمد بواسطة", data.approvedBy)}
  </table>

  ${attachmentsSection()}

  <div style="margin-top:16px;padding-top:6px;border-top:1px solid #D9CFEC;font-size:9px;color:#6B5A80;">
    مستند داخلي — سري &nbsp;|&nbsp; جامعة سليمان الراجحي — ICTD
  </div>
</body>
</html>`;
}

function emailReportPdf(data, folderUrl){
  const html = buildReportHtml(data);
  const pdfBlob = Utilities.newBlob(html, "text/html", "report.html").getAs("application/pdf");
  const safeTitle = sanitizeFolderName(data.title || "تقرير_حادثة");
  pdfBlob.setName(`تقرير_حادثة_${safeTitle}.pdf`);

  const bodyLines = [
    "تم استلام تقرير حادثة جديد عبر نموذج ICTD.",
    "",
    `العنوان: ${data.title || "—"}`,
    `الإدارة / القسم: ${data.department || "—"}`,
    `مستوى الخطورة: ${data.severity || "—"}`,
    `مقدّم البلاغ: ${data.reporterName || "—"}`
  ];
  if (folderUrl) bodyLines.push("", `مجلد الصور المرفقة على Drive: ${folderUrl}`);

  GmailApp.sendEmail(NOTIFY_EMAIL, `تقرير حادثة: ${data.title || "بدون عنوان"}`, bodyLines.join("\n"), {
    attachments: [pdfBlob],
    name: "نظام تقارير حوادث ICTD"
  });
}

function doPost(e){
  try{
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    const headers = ensureHeaders(sheet);

    const data = JSON.parse(e.postData.contents);
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    const folderUrl = saveAttachmentsToDrive(data);

    const valueMap = {
      "الطابع الزمني": new Date(),
      "عنوان الحادثة": data.title || "",
      "رقم الحادثة المرجعي": data.incidentId || "",
      "الإدارة / القسم": data.department || "",
      "تاريخ الحادثة": data.incidentDate || "",
      "وقت الحادثة": data.incidentTime || "",
      "الموقع / النظام المتأثر": data.location || "",
      "التصنيف": data.category || "",
      "مستوى الخطورة": data.severity || "",
      "مقدّم البلاغ": data.reporterName || "",
      "المسمى الوظيفي": data.reporterTitle || "",
      "وسيلة التواصل": data.reporterContact || "",
      "تاريخ التقرير": data.reportDate || "",
      "وصف الحادثة": data.description || "",
      "الإجراءات الفورية المتخذة": data.actionsTaken || "",
      "السبب الجذري": data.rootCause || "",
      "تقييم الأثر": data.impact || "",
      "التوصيات / الإجراءات التصحيحية": data.recommendations || "",
      "أُعد بواسطة": data.preparedBy || "",
      "روجع / اعتمد بواسطة": data.approvedBy || "",
      "عدد المرفقات": attachments.length,
      "أسماء المرفقات": attachments.map(a => a.name).join(", "),
      "رابط مجلد المرفقات (Drive)": folderUrl,
      "إصدار النموذج": data.version || ""
    };

    const row = headers.map(h => (h in valueMap) ? valueMap[h] : "");
    sheet.appendRow(row);

    if (data.sendEmail){
      emailReportPdf(data, folderUrl);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "ok", folderUrl: folderUrl }))
      .setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(){
  return ContentService.createTextOutput(JSON.stringify({ status: "ready" }))
    .setMimeType(ContentService.MimeType.JSON);
}
