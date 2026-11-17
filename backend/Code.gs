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
  SPREADSHEET_ID: '1uffjYzxqhDKZ8Lf9bEtHoyLZ13_iWglEd4pONho6ALM',
  SHEET_NAME: 'Loan Applications',
  ADMIN_EMAIL: 'briantregre4174@gmail.com', // Optional: admin email for new-application alerts.
  SEND_EMAIL_ALERTS: true
};

const HEADERS = [
  'Submitted At', 'Application ID', 'Applicant Name', 'Father Name', 'Mother Name',
  'Date of Birth', 'NID (Optional)', 'Division', 'District', 'Thana / Upazila',
  'Road / Village / Area', 'Applicant Phone', 'Loan Type', 'Loan Amount (BDT)',
  'Repayment Months', 'Receive Method', 'Receive Account', 'Consent',
  'Consent Timestamp', 'Application Status', 'Fee Payment Status', 'Request ID'
];

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  if (String(params.action || '') === 'status') {
    return jsonpStatus_(String(params.requestId || ''), String(params.prefix || ''));
  }
  return HtmlService.createHtmlOutput(
    '<main style="font-family:Arial,sans-serif;padding:24px"><h2>Shohoj Cash application endpoint</h2><p>Endpoint is online. Use the website form to submit an application.</p></main>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Run once manually from the Apps Script editor to create/migrate the sheet headers. */
function setupSheet() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  ensureHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  sheet.autoResizeColumns(1, sheet.getLastColumn());
  return `Ready: ${ss.getUrl()}`;
}

function doPost(e) {
  let applicationId = '';
  // Correlates this iframe response with the exact browser submission.
  let requestId = (e && e.parameter) ? String(e.parameter.requestId || '') : '';
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
        'Not verified / pending',
        safeCell_(requestId)
      ];
      const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
      // Map by header name so any extra columns already present in the user's Sheet stay intact.
      const rowByHeader = headerRow.map(header => {
        const index = HEADERS.indexOf(String(header).trim());
        return index >= 0 ? row[index] : '';
      });
      const nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, 1, rowByHeader.length).setValues([rowByHeader]);

      // Keep applicant-supplied strings and the request ID as text.
      ['Applicant Name','Father Name','Mother Name','Date of Birth','NID (Optional)',
       'Division','District','Thana / Upazila','Road / Village / Area','Applicant Phone',
       'Loan Type','Receive Method','Receive Account','Request ID'].forEach(header => {
        const column = headerRow.indexOf(header) + 1;
        if (column > 0) sheet.getRange(nextRow, column).setNumberFormat('@');
      });
      ['Loan Amount (BDT)','Repayment Months'].forEach(header => {
        const column = headerRow.indexOf(header) + 1;
        if (column > 0) sheet.getRange(nextRow, column).setNumberFormat('0');
      });
    } finally {
      lock.releaseLock();
    }

    sendAdminAlert_(data, applicationId);
    return resultPage_({ ok: true, applicationId: applicationId, requestId: requestId });
  } catch (error) {
    console.error('Shohoj Cash submission error:', error && error.stack ? error.stack : error);
    return resultPage_({ ok: false, requestId: requestId, message: 'তথ্য সংরক্ষণ করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন অথবা যোগাযোগ করুন।' });
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
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  ensureHeaders_(sheet);
  return sheet;
}

/** Add newly introduced columns to an existing sheet without moving old data. */
function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    return;
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(v => String(v).trim());
  HEADERS.forEach(header => {
    if (!existing.includes(header)) {
      const newColumn = sheet.getLastColumn() + 1;
      sheet.getRange(1, newColumn).setValue(header).setFontWeight('bold');
      existing.push(header);
    }
  });
}

/** Public, read-only JSONP endpoint: exposes only whether a random request ID was saved. */
function jsonpStatus_(requestId, callbackName) {
  if (!/^[a-f0-9-]{16,64}$/i.test(requestId)) {
    return ContentService.createTextOutput('/* invalid request */')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(callbackName)) {
    return ContentService.createTextOutput('/* invalid callback */')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  let result;
  try {
    const sheet = getOrCreateSheet_();
    const lastRow = sheet.getLastRow();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const requestColumn = headers.indexOf('Request ID') + 1;
    const applicationColumn = headers.indexOf('Application ID') + 1;
    if (lastRow < 2 || requestColumn < 1 || applicationColumn < 1) {
      result = { ok: true, status: 'pending', requestId: requestId };
    } else {
      const match = sheet.getRange(2, requestColumn, lastRow - 1, 1)
        .createTextFinder(requestId).matchEntireCell(true).findNext();
      if (match) {
        const applicationId = sheet.getRange(match.getRow(), applicationColumn).getDisplayValue();
        result = { ok: true, status: 'saved', requestId: requestId, applicationId: applicationId };
      } else {
        result = { ok: true, status: 'pending', requestId: requestId };
      }
    }
  } catch (error) {
    console.error('Shohoj Cash status check error:', error);
    result = { ok: false, status: 'retry', requestId: requestId };
  }

  const safeJson = JSON.stringify(result)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callbackName + '(' + safeJson + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
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
  // Escape characters that could break the inline JavaScript response.
  const safeResult = JSON.stringify(result)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const html = `<!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body>
      <script>
        (function () {
          var result = ${safeResult};
          var message = Object.assign({ type: 'SHOHOJCASH_SUBMIT' }, result);
          try {
            // Use top so the message reaches the website even if Apps Script
            // wraps its HTML response in an additional sandbox iframe.
            window.top.postMessage(message, '*');
          } catch (error) {
            try { window.parent.postMessage(message, '*'); } catch (ignored) {}
          }
        })();
      </script>
      <p>Submission processed. You may return to the application page.</p>
    </body></html>`;

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
