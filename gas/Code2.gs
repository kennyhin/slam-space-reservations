// ============================================================
// Code2.gs — SLAM Space Reservations Backend (v2)
// This is a COMPLETELY NEW FILE to avoid any caching issues
// DEPLOY THIS AS A SEPARATE WEB APP
// ============================================================

const CALENDAR_IDS_V2 = {
  'cafegym':           'c_312121ab4260fc7d2045f8298fd1aa135c36d62f7dba93137d4a70c177b5ce72@group.calendar.google.com',
  'es-turf':           'c_a5a420a35120dc73009599256852b43f3707ca70a2af0ea6b3de2311d5cfce7a@group.calendar.google.com',
  'kinder-playground': 'c_e58aaacc91b7d88d6dc7937e2ee8a1799d1efdc338f60f3daefa301cdd25c91b@group.calendar.google.com',
};

const SPACE_LABELS_V2 = {
  'cafegym':           'Cafegym',
  'es-turf':           'ES Turf',
  'kinder-playground': 'Kinder Playground',
};

const COL_V2 = {
  TIMESTAMP: 1, SUBMITTED_BY: 2, TEACHER_NAME: 3, GRADE_LEVEL: 4,
  PURPOSE: 5, SPACE: 6, DATE: 7, START_TIME: 8, END_TIME: 9, STATUS: 10, APPROVE: 11,
};

function doPostV2(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const auth = verifyTokenV2(data.token);
    if (!auth.valid) return jsonResponseV2({ error: 'Unauthorized', message: auth.message });

    const required = ['teacherName', 'gradeLevel', 'purpose', 'space'];
    for (const field of required) {
      if (!data[field]) return jsonResponseV2({ success: false, message: 'Missing field: ' + field });
    }
    if (!CALENDAR_IDS_V2[data.space]) return jsonResponseV2({ success: false, message: 'Invalid space.' });

    let entries = [];
    if (data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      entries = data.entries;
    } else if (data.date) {
      entries = [{ date: data.date, startTime: data.startTime, endTime: data.endTime }];
    } else {
      return jsonResponseV2({ success: false, message: 'No date entries provided.' });
    }

    for (const entry of entries) {
      if (!entry.date || !entry.startTime || !entry.endTime) {
        return jsonResponseV2({ success: false, message: 'Each entry must have date, startTime, and endTime.' });
      }
    }

    const savedDates = [];
    for (const entry of entries) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('Reservations');
      if (!sheet) {
        sheet = ss.insertSheet('Reservations');
        sheet.appendRow(['Timestamp','Submitted By','Teacher Name','Grade Level','Purpose','Space','Date','Start Time','End Time','Status','Check To Approve']);
        sheet.getRange(1,1,1,11).setFontWeight('bold').setBackground('#0B0B0B').setFontColor('#FFFFFF');
        sheet.setFrozenRows(1);
      }
      const newRow = sheet.getLastRow() + 1;
      sheet.appendRow([new Date(), auth.email, data.teacherName, data.gradeLevel, data.purpose, data.space, entry.date, entry.startTime, entry.endTime, 'Pending', false]);
      sheet.getRange(newRow, 11).insertCheckboxes();
      sheet.getRange(newRow, 10).setBackground('#FEF9C3').setFontColor('#92400E');
      savedDates.push(entry);
    }

    // Send one email listing ALL dates
    const spaceName = SPACE_LABELS_V2[data.space] || data.space;
    const sorted = [...savedDates].sort((a, b) => new Date(a.date) - new Date(b.date));
    let dateList = '';
    sorted.forEach((entry, i) => {
      const d = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      dateList += '  ' + (i+1) + '. ' + d + ' · ' + entry.startTime + ' – ' + entry.endTime + '\n';
    });
    MailApp.sendEmail({ to: auth.email, subject: '📋 Reservation Received — ' + spaceName + ' (' + savedDates.length + ' dates)', body: 'Hi ' + data.teacherName + ',\n\nYour reservation request has been received.\n\nDates (' + savedDates.length + '):\n' + dateList + '\nEach date will be individually approved.' });
    MailApp.sendEmail({ to: 'kenny.hin@slamnv.org', subject: '🔔 New Reservation — ' + data.teacherName + ' | ' + spaceName + ' (' + savedDates.length + ' dates)', body: 'Teacher: ' + data.teacherName + '\nSpace: ' + spaceName + '\nDates (' + savedDates.length + '):\n' + dateList + '\n👉 Open the Reservations Sheet to approve.' });

    return jsonResponseV2({ success: true, message: 'V2 submitted ' + savedDates.length + ' rows', count: savedDates.length });
  } catch (err) {
    return jsonResponseV2({ error: err.message });
  }
}

function verifyTokenV2(token) {
  if (!token) return { valid: false, message: 'No token.' };
  try {
    const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    const p = JSON.parse(res.getContentText());
    if (p.error || !p.email) return { valid: false, message: 'Invalid token.' };
    if (!p.email.endsWith('@slamnv.org')) return { valid: false, message: 'Wrong domain.' };
    return { valid: true, email: p.email, name: p.name };
  } catch (err) {
    return { valid: false, message: 'Token check failed.' };
  }
}

function jsonResponseV2(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
