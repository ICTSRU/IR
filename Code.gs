/**
 * ICTD - سجل تقارير الحوادث
 * Google Apps Script Web App لاستقبال بيانات نموذج تقرير الحادثة، إضافتها كصف في الشيت،
 * وحفظ الصور المرفقة في Google Drive ضمن فولدر رئيسي وفولدر فرعي مستقل لكل حادثة.
 *
 * خطوات التفعيل (تُنفَّذ مرة واحدة فقط):
 * 1) من داخل ملف الشيت: Extensions > Apps Script
 * 2) احذف أي كود قديم، والصق هذا الكود بالكامل، ثم احفظ (Ctrl+S)
 * 3) Deploy > Manage deployments > (أيقونة القلم) > Version: New version > Deploy
 *    (تحديث نفس الرابط الحالي، بدون الحاجة لرابط /exec جديد)
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4) لا حاجة لتغيير أي شيء في صفحة HTML — نفس رابط /exec المستخدم حاليًا يعمل.
 */

const SHEET_NAME = "Sheet1"; // عدّل الاسم إذا كانت الورقة باسم مختلف
const ATTACHMENTS_ROOT_FOLDER_NAME = "مرفقات تقارير الحوادث - ICTD";

// ترتيب الأعمدة المعتمد في الشيت (يشمل العمود الجديد لرابط مجلد المرفقات)
const HEADERS = [
  "الطابع الزمني","عنوان الحادثة","رقم الحادثة المرجعي","الإدارة / القسم","تاريخ الحادثة",
  "وقت الحادثة","الموقع / النظام المتأثر","التصنيف","مستوى الخطورة","مقدّم البلاغ",
  "المسمى الوظيفي","وسيلة التواصل","تاريخ التقرير","وصف الحادثة","الإجراءات الفورية المتخذة",
  "السبب الجذري","تقييم الأثر","التوصيات / الإجراءات التصحيحية","أُعد بواسطة",
  "روجع / اعتمد بواسطة","عدد المرفقات","أسماء المرفقات","رابط مجلد المرفقات (Drive)","إصدار النموذج"
];

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

// Ensures the sheet's header row (row 1) contains every column in HEADERS,
// appending any missing ones at the end without disturbing existing columns/data.
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
