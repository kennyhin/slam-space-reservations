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
const DAYS_AHEAD = 90;

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

  // Send email to teacher
  var spaceName = SPACE_LABELS[data.space] || data.space;
  var dateList = '';
  for (var j = 0; j < entries.length; j++) {
    var ent = entries[j];
    dateList += '  ' + (j + 1) + '. ' + ent.date + ' ' + ent.startTime + '-' + ent.endTime + '\n';
  }
  MailApp.sendEmail({
    to: auth.email,
    subject: 'Reservation Received - ' + spaceName + ' (' + savedCount + ' dates)',
    body: 'Hi ' + data.teacherName + ',\n\nYour reservation has been received.\n\nDates:\n' + dateList + '\nEach date will be individually approved.'
  });

  // Send email to admin
  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: 'New Reservation - ' + data.teacherName + ' | ' + spaceName + ' (' + savedCount + ' dates)',
    body: 'Teacher: ' + data.teacherName + '\nGrade: ' + data.gradeLevel + '\nSpace: ' + spaceName + '\nDates:\n' + dateList
  });

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
