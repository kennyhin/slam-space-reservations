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
// WEB APP ENTRY POINTS
// ============================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'getEvents') return getEvents(e);
    return jsonResp({ error: 'Invalid action' });
  } catch (err) {
    return jsonResp({ error: err && err.message ? err.message : String(err) });
  }
}

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
    entriesFormatted += 'Time:     ' + formatTime12(ent.startTime) + ' – ' + formatTime12(ent.endTime) + '\n';
    if (j < entries.length - 1) entriesFormatted += '\n';
  }

  // Email to teacher
  var teacherSubject, teacherBody;
  if (savedCount === 1) {
    teacherSubject = '📋 Reservation Request Received — ' + spaceName + ' on ' + formatDateLong(entries[0].date);
    teacherBody =
      'Hi ' + data.teacherName + ',\n\n' +
      'Your space reservation request has been received and is now pending admin approval.\n\n' +
      'REQUEST DETAILS\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Space:    ' + spaceName + '\n' +
      'Purpose:  ' + data.purpose + '\n' +
      'Grade:    ' + data.gradeLevel + '\n' +
      entriesFormatted +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'You will receive an approval email once an admin reviews your request.';
  } else {
    teacherSubject = '📋 Reservation Request Received — ' + spaceName + ' (' + savedCount + ' dates)';
    teacherBody =
      'Hi ' + data.teacherName + ',\n\n' +
      'Your space reservation request has been received and is now pending admin approval.\n\n' +
      'REQUEST DETAILS\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Space:    ' + spaceName + '\n' +
      'Purpose:  ' + data.purpose + '\n' +
      'Grade:    ' + data.gradeLevel + '\n' +
      '\nDATES (' + savedCount + ')\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      entriesFormatted +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'Each date will be individually reviewed for approval. You will receive a separate approval email for each date.';
  }
  MailApp.sendEmail({ to: auth.email, subject: teacherSubject, body: teacherBody });

  // Email to admin
  var adminSubject, adminBody;
  if (savedCount === 1) {
    adminSubject = '🔔 New Reservation Request — ' + data.teacherName + ' | ' + spaceName + ' | ' + formatDateLong(entries[0].date);
  } else {
    adminSubject = '🔔 New Reservation Request — ' + data.teacherName + ' | ' + spaceName + ' | ' + savedCount + ' dates';
  }
  adminBody =
    'A new space reservation request has been submitted.\n\n' +
    'Teacher:  ' + data.teacherName + '\n' +
    'Grade:    ' + data.gradeLevel + '\n' +
    'Purpose:  ' + data.purpose + '\n' +
    'Space:    ' + spaceName + '\n' +
    (savedCount > 1 ? '\nDATES (' + savedCount + ')\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' : '') +
    entriesFormatted +
    (savedCount > 1 ? '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' : '') +
    '\n👉 Open Reservations Sheet to approve:\n' +
    SpreadsheetApp.getActiveSpreadsheet().getUrl();
  MailApp.sendEmail({ to: ADMIN_EMAIL, subject: adminSubject, body: adminBody });

  return jsonResp({ success: true, message: 'Saved ' + savedCount + ' rows', saved: savedCount });
}

function getEvents(e) {
  var token = '';
  if (e && e.parameter && e.parameter.token) token = String(e.parameter.token);
  var auth = verifyToken(token);
  if (!auth.valid) return jsonResp({ error: 'Unauthorized' });

  var now = new Date();
  var to = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

  var events = [];
  Object.keys(CALENDAR_IDS).forEach(function(spaceId) {
    var cal = CalendarApp.getCalendarById(CALENDAR_IDS[spaceId]);
    if (!cal) return;
    var raw = cal.getEvents(now, to);
    for (var i = 0; i < raw.length; i++) {
      var ev = raw[i];
      events.push({
        id: spaceId + '::' + encodeURIComponent(ev.getId()),
        title: ev.getTitle(),
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        space: spaceId,
        description: ev.getDescription() || ''
      });
    }
  });

  return jsonResp({ events: events });
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

// ============================================================
// APPROVAL SYSTEM
// ============================================================
// HOW TO INSTALL:
//   1. Open the Apps Script editor (Extensions > Apps Script)
//   2. Paste/deploy this file
//   3. Run createApproveTrigger() ONCE from the editor
//      (Run > Run function > createApproveTrigger)
//   4. Grant permissions when prompted
//
// After that, checking the "Check To Approve" checkbox on any
// row will automatically:
//   • Create a calendar event on the space's calendar
//   • Update the row status to "Approved" (green)
//   • Email the teacher a confirmation
// ============================================================

function createApproveTrigger() {
  // Remove any existing onEditApprove triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditApprove') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onEditApprove')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  Logger.log('✅ Approval trigger installed successfully.');
}

function onEditApprove(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (col !== 11) return;   // Only "Check To Approve" column
  if (row <= 1) return;     // Skip header row
  if (String(e.value) !== 'TRUE') return;  // Only fire on check, not uncheck

  // Don't double-process an already-approved row
  var statusCell = sheet.getRange(row, 10);
  if (statusCell.getValue() === 'Approved') return;

  // Read all data from this row
  var rowData = sheet.getRange(row, 1, 1, 11).getValues()[0];
  var teacherEmail = rowData[1];  // Col B: Submitted By
  var teacherName  = rowData[2];  // Col C: Teacher Name
  var gradeLevel   = rowData[3];  // Col D: Grade Level
  var purpose      = rowData[4];  // Col E: Purpose
  var spaceId      = rowData[5];  // Col F: Space
  var dateVal      = rowData[6];  // Col G: Date
  var startTimeVal = rowData[7];  // Col H: Start Time
  var endTimeVal   = rowData[8];  // Col I: End Time

  var spaceName = SPACE_LABELS[spaceId] || spaceId;

  // Normalize date — could be a Date object or a string like "2025-06-15"
  var dateStr = normalizeDate(dateVal);

  // Normalize times — could be Date objects (time fractions) or "HH:MM" strings
  var startTimeStr = normalizeTime(startTimeVal);
  var endTimeStr   = normalizeTime(endTimeVal);

  // Build Date objects for calendar event
  var startDt = parseDateTime(dateStr, startTimeStr);
  var endDt   = parseDateTime(dateStr, endTimeStr);

  // Create calendar event — catch errors (e.g., write access not granted)
  var calNote = '';
  try {
    var calId = CALENDAR_IDS[spaceId];
    if (calId) {
      var cal = CalendarApp.getCalendarById(calId);
      if (cal) {
        var eventTitle = spaceName + ' — ' + teacherName + ' (' + gradeLevel + ')';
        var eventDesc  = 'Purpose: ' + purpose + '\nRequested by: ' + teacherEmail;
        cal.createEvent(eventTitle, startDt, endDt, { description: eventDesc });
      } else {
        calNote = 'Note: Could not find calendar for ' + spaceName + '. Please add the event manually.';
      }
    }
  } catch (err) {
    calNote = 'Note: Calendar event could not be created automatically (' + err.message + '). Please add it manually.';
  }

  // Mark row as Approved (green)
  statusCell.setValue('Approved');
  statusCell.setBackground('#DCFCE7').setFontColor('#166534');
  sheet.getRange(row, 11).setBackground('#DCFCE7');

  // Send confirmation email to the teacher
  var dateLong = formatDateLong(dateStr);
  var subject  = '✅ Reservation Approved — ' + spaceName + ' on ' + dateLong;
  var body =
    'Hi ' + teacherName + ',\n\n' +
    'Great news! Your space reservation has been approved.\n\n' +
    'APPROVED RESERVATION\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    'Space:    ' + spaceName + '\n' +
    'Purpose:  ' + purpose + '\n' +
    'Grade:    ' + gradeLevel + '\n' +
    'Date:     ' + dateLong + '\n' +
    'Time:     ' + formatTime12(startTimeStr) + ' – ' + formatTime12(endTimeStr) + '\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    'This reservation is now on the SLAM Reservations calendar.\n' +
    (calNote ? '\n' + calNote + '\n' : '') +
    '\n— SLAM Athletics Administration';

  MailApp.sendEmail({ to: teacherEmail, subject: subject, body: body });
}

// ── Helpers ──────────────────────────────────────────────────

function normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var y  = val.getFullYear();
    var mo = String(val.getMonth() + 1).padStart(2, '0');
    var d  = String(val.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + d;
  }
  return String(val).split('T')[0];  // handle ISO strings too
}

function normalizeTime(val) {
  if (!val) return '00:00';
  if (val instanceof Date) {
    // Sheets stores time-only as a fractional day starting from Dec 30 1899
    var h = val.getHours();
    var m = val.getMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  return String(val);  // already "HH:MM"
}

function parseDateTime(dateStr, timeStr) {
  // dateStr: "YYYY-MM-DD", timeStr: "HH:MM" (24h)
  var timeParts = timeStr.split(':');
  var h = parseInt(timeParts[0]) || 0;
  var m = parseInt(timeParts[1]) || 0;
  var dt = new Date(dateStr + 'T00:00:00');
  dt.setHours(h, m, 0, 0);
  return dt;
}
