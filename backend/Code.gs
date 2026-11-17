/**
 * Shohoj Cash - Google Sheets application receiver
 *
 * IMPORTANT:
 * - Run this from a Google Sheet (Extensions > Apps Script).
 * - Keep the spreadsheet private; never publish it to the web.
 * - This endpoint stores applications only. It is NOT a payment gateway.
 * - For production use, add CAPTCHA / rate limiting and complete a security review.
 */
const CONFIG = {
  SPREADSHEET_ID: 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE',
  SHEET_NAME: 'Loan Applications',
  ADMIN_EMAIL: '', // Optional: admin email for new-application alerts.
  SEND_EMAIL_ALERTS: false
};

const HEADERS = [
  'Submitted At', 'Application ID', 'Applicant Name', 'Father Name', 'Mother Name',
  'Date of Birth', 'NID (Optional)', 'Division', 'District', 'Thana / Upazila',
  'Road / Village / Area', 'Applicant Phone', 'Loan Type', 'Loan Amount (BDT)',
  'Repayment Months', 'Receive Method', 'Receive Account', 'Consent',
  'Consent Timestamp', 'Application Status', 'Fee Payment Status'
];

function doGet() {
  return HtmlService.createHtmlOutput(
    '<main style="font-family:Arial,sans-serif;padding:24px"><h2>Shohoj Cash application endpoint</h2><p>Endpoint is online. Use the website form to submit an application.</p></main>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Run once manually from the Apps Script editor to create the sheet header. */
function setupSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return `Ready: ${ss.getUrl()}`;
}

function doPost(e) {
  let applicationId = '';
  try {
    if (!e || !e.parameter || !e.parameter.payload) {
      throw new Error('Missing payload');
    }
    const data = JSON.parse(e.parameter.payload);
    validateApplication_(data);
    applicationId = createApplicationId_();

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = getOrCreateSheet_();
      const now = new Date();
      const row = [
        now,
        applicationId,
        safeCell_(data.name),
        safeCell_(data.fatherName),
        safeCell_(data.motherName),
        safeCell_(data.dob),
        safeCell_(data.nid),
        safeCell_(data.division),
        safeCell_(data.district),
        safeCell_(data.thana),
        safeCell_(data.road),
        safeCell_(data.phone),
        safeCell_(data.loanType),
        Number(data.loanAmount),
        Number(data.duration),
        safeCell_(data.receiveMethod),
        safeCell_(data.receiveNumber),
        'Yes',
        now,
        'Pending review',
        'Not verified / pending'
      ];
      const nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);
      // Keep all applicant-provided values as text to avoid spreadsheet formula execution.
      [3,4,5,6,7,8,9,10,11,12,13,16,17].forEach(col => sheet.getRange(nextRow, col).setNumberFormat('@'));
      sheet.getRange(nextRow, 14, 1, 2).setNumberFormat('0');
    } finally {
      lock.releaseLock();
    }

    sendAdminAlert_(data, applicationId);
    return resultPage_({ ok: true, applicationId: applicationId });
  } catch (error) {
    console.error('Shohoj Cash submission error:', error && error.stack ? error.stack : error);
    return resultPage_({ ok: false, message: 'তথ্য সংরক্ষণ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন অথবা যোগাযোগ করুন।' });
  }
}

function getSpreadsheet_() {
  const configuredId = String(CONFIG.SPREADSHEET_ID || '').trim();
  if (configuredId && configuredId !== 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE') {
    return SpreadsheetApp.openById(configuredId);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Set CONFIG.SPREADSHEET_ID to your Google Sheet ID.');
}

function getOrCreateSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function validateApplication_(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid data');
  if (String(data.website || '').trim()) throw new Error('Bot detected');
  const requiredText = ['name', 'fatherName', 'motherName', 'phone', 'loanType', 'receiveMethod', 'receiveNumber'];
  requiredText.forEach(key => {
    if (!String(data[key] || '').trim()) throw new Error('Missing required field: ' + key);
  });
  if (!/^01[3-9]\d{8}$/.test(String(data.phone))) throw new Error('Invalid phone');
  if (!/^01[3-9]\d{8}$/.test(String(data.receiveNumber))) throw new Error('Invalid receive account');
  const amounts = [5000,10000,20000,25000,30000,40000,50000,75000,100000,150000,200000,250000,300000,400000,500000];
  if (!amounts.includes(Number(data.loanAmount))) throw new Error('Invalid loan amount');
  if (![3,6,12].includes(Number(data.duration))) throw new Error('Invalid duration');
  if (!['ব্যক্তিগত ঋণ','শিক্ষা সহায়তা ঋণ','নতুন উদ্যোক্তা ঋণ','কৃষি ঋণ'].includes(String(data.loanType))) throw new Error('Invalid loan type');
  if (!['bKash','Nagad'].includes(String(data.receiveMethod))) throw new Error('Invalid receive method');
  if (data.consent !== true) throw new Error('Consent missing');
  if (String(data.name).length > 100 || String(data.fatherName).length > 100 || String(data.motherName).length > 100) throw new Error('Name too long');
}

function safeCell_(value) {
  const text = String(value == null ? '' : value).trim();
  return /^[=+@\-]/.test(text) ? "'" + text : text;
}

function createApplicationId_() {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd');
  const suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return 'SC-' + stamp + '-' + suffix;
}

function sendAdminAlert_(data, applicationId) {
  if (!CONFIG.SEND_EMAIL_ALERTS || !CONFIG.ADMIN_EMAIL) return;
  try {
    const subject = 'নতুন ঋণ আবেদন: ' + applicationId;
    // NID is deliberately excluded from email notifications.
    const body = [
      'সহজ ক্যাশে একটি নতুন আবেদন জমা হয়েছে।',
      'আবেদন নম্বর: ' + applicationId,
      'নাম: ' + data.name,
      'মোবাইল: ' + data.phone,
      'ঋণের ধরন: ' + data.loanType,
      'পরিমাণ: ' + data.loanAmount + ' টাকা',
      'মেয়াদ: ' + data.duration + ' মাস',
      'টাকা গ্রহণ: ' + data.receiveMethod + ' / ' + data.receiveNumber,
      '',
      'সম্পূর্ণ আবেদন দেখতে ব্যক্তিগত Google Sheet খুলুন।'
    ].join('\n');
    MailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, body);
  } catch (mailError) {
    // The Sheet save should remain successful even if email quota or permissions fail.
    console.error('Admin email alert failed:', mailError);
  }
}

function resultPage_(result) {
  const safeResult = JSON.stringify(result).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <script>
      (function () {
        var result = ${safeResult};
        try { window.parent.postMessage(Object.assign({ type: 'SHOHOJCASH_SUBMIT' }, result), '*'); } catch (e) {}
      })();
    </script>
    <p>Submission processed. You may return to the application page.</p>
  </body></html>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
