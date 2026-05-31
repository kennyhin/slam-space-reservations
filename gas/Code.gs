// ============================================================
// Code.gs - SLAM Space Reservations Backend
// ============================================================

const CALENDAR_IDS = {
  'cafegym': 'c_312121ab4260fc7d2045f8298fd1aa135c36d62f7dba93137d4a70c177b5ce72@group.calendar.google.com',
  'es-turf': 'c_a5a420a35120dc73009599256852b43f3707ca70a2af0ea6b3de2311d5cfce7a@group.calendar.google.com',
  'kinder-playground': 'c_e58aaacc91b7d88d6dc7937e2ee8a1799d1efdc338f60f3daefa301cdd25c91b@group.calendar.google.com'
};

const SPACE_LABELS = {
  'cafegym': 'Cafegym',
  'es-turf': 'ES Turf',
  'kinder-playground': 'Kinder Playground'
};

const SHEET_NAME = 'Reservations';
const ALLOWED_DOMAIN = 'slamnv.org';
const ADMIN_EMAIL = 'kenny.hin@slamnv.org';

// ============================================================
// DATE/TIME HELPERS
// ============================================================

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  try {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { return dateStr; }
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  try {
    var parts = timeStr.split(':');
    var h = parseInt(parts[0]);
    var m = (parts[1] || '00').substring(0, 2);
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
  } catch (e) { return timeStr; }
}

// ============================================================
// WEB APP ENTRY POINT
// ============================================================

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var auth = verifyToken(data.token);
  if (!auth.valid) return jsonResp({ error: 'Unauthorized' });

  if (!data.teacherName || !data.gradeLevel || !data.purpose || !data.space) {
    return jsonResp({ success: false, message: 'Missing required field' });
  }

  // Build entries array from entries[] or flat date fields
  var entries = [];
  if (data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
    entries = data.entries;
  } else if (data.date && data.startTime && data.endTime) {
    entries = [{ date: data.date, startTime: data.startTime, endTime: data.endTime }];
  } else {
    return jsonResp({ success: false, message: 'No date entries provided' });
  }

  // Save one row per entry
  var savedCount = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.date || !entry.startTime || !entry.endTime) continue;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['Timestamp', 'Submitted By', 'Teacher Name', 'Grade Level', 'Purpose', 'Space', 'Date', 'Start Time', 'End Time', 'Status', 'Check To Approve']);
      sheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#0B0B0B').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
    var newRow = sheet.getLastRow() + 1;
    sheet.appendRow([new Date(), auth.email, data.teacherName, data.gradeLevel, data.purpose, data.space, entry.date, entry.startTime, entry.endTime, 'Pending', false]);
    sheet.getRange(newRow, 11).insertCheckboxes();
    sheet.getRange(newRow, 10).setBackground('#FEF9C3').setFontColor('#92400E');
    savedCount++;
  }

  // Build formatted entries string for emails
  var spaceName = SPACE_LABELS[data.space] || data.space;
  var entriesFormatted = '';
  for (var j = 0; j < entries.length; j++) {
    var ent = entries[j];
    entriesFormatted += 'Date:     ' + formatDateLong(ent.date) + '\n';
    entriesFormatted += 'Time:     ' + formatTime12(ent.startTime) + ' \u2013 ' + formatTime12(ent.endTime) + '\n';
    if (j < entries.length - 1) entriesFormatted += '\n';
  }

  // Email to teacher
  var teacherSubject, teacherBody;
  if (savedCount === 1) {
    teacherSubject = '\uD83D\uDCCB Reservation Request Received \u2014 ' + spaceName + ' on ' + formatDateLong(entries[0].date);
    teacherBody =
      'Hi ' + data.teacherName + ',\n\n' +
      'Your space reservation request has been received and is now pending admin approval.\n\n' +
      'REQUEST DETAILS\n' +
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
      'Space:    ' + spaceName + '\n' +
      'Purpose:  ' + data.purpose + '\n' +
      'Grade:    ' + data.gradeLevel + '\n' +
      entriesFormatted +
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n' +
      'You will receive an approval email once an admin reviews your request.';
  } else {
    teacherSubject = '\uD83D\uDCCB Reservation Request Received \u2014 ' + spaceName + ' (' + savedCount + ' dates)';
    teacherBody =
      'Hi ' + data.teacherName + ',\n\n' +
      'Your space reservation request has been received and is now pending admin approval.\n\n' +
      'REQUEST DETAILS\n' +
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
      'Space:    ' + spaceName + '\n' +
      'Purpose:  ' + data.purpose + '\n' +
      'Grade:    ' + data.gradeLevel + '\n' +
      '\nDATES (' + savedCount + ')\n' +
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
      entriesFormatted +
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n' +
      'Each date will be individually reviewed for approval. You will receive a separate approval email for each date.';
  }
  MailApp.sendEmail({ to: auth.email, subject: teacherSubject, body: teacherBody });

  // Email to admin
  var adminSubject, adminBody;
  if (savedCount === 1) {
    adminSubject = '\uD83D\uDD14 New Reservation Request \u2014 ' + data.teacherName + ' | ' + spaceName + ' | ' + formatDateLong(entries[0].date);
  } else {
    adminSubject = '\uD83D\uDD14 New Reservation Request \u2014 ' + data.teacherName + ' | ' + spaceName + ' | ' + savedCount + ' dates';
  }
  adminBody =
    'A new space reservation request has been submitted.\n\n' +
    'Teacher:  ' + data.teacherName + '\n' +
    'Grade:    ' + data.gradeLevel + '\n' +
    'Purpose:  ' + data.purpose + '\n' +
    'Space:    ' + spaceName + '\n' +
    (savedCount > 1 ? '\nDATES (' + savedCount + ')\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' : '') +
    entriesFormatted +
    (savedCount > 1 ? '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' : '') +
    '\n\uD83D\uDC49 Open Reservations Sheet to approve:\n' +
    SpreadsheetApp.getActiveSpreadsheet().getUrl();
  MailApp.sendEmail({ to: ADMIN_EMAIL, subject: adminSubject, body: adminBody });

  return jsonResp({ success: true, message: 'Saved ' + savedCount + ' rows', saved: savedCount });
}

function verifyToken(token) {
  if (!token) return { valid: false };
  try {
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    var p = JSON.parse(res.getContentText());
    if (p.error || !p.email) return { valid: false };
    if (!p.email.endsWith('@' + ALLOWED_DOMAIN)) return { valid: false };
    return { valid: true, email: p.email, name: p.name };
  } catch (err) {
    return { valid: false };
  }
}

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
