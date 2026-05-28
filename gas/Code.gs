// ============================================================
// Code.gs — SLAM Space Reservations Backend
// ============================================================
// Deploy as Web App:
//   Execute as: Me
//   Who has access: Anyone
//
// After deploying, copy the Web App URL into js/config.js
// ============================================================

// ---- CONFIGURATION -----------------------------------------
const CALENDAR_IDS = {
  'cafegym':           'c_312121ab4260fc7d2045f8298fd1aa135c36d62f7dba93137d4a70c177b5ce72@group.calendar.google.com',
  'es-turf':           'c_a5a420a35120dc73009599256852b43f3707ca70a2af0ea6b3de2311d5cfce7a@group.calendar.google.com',
  'kinder-playground': 'c_e58aaacc91b7d88d6dc7937e2ee8a1799d1efdc338f60f3daefa301cdd25c91b@group.calendar.google.com',
};

const SPACE_LABELS = {
  'cafegym':           'Cafegym',
  'es-turf':           'ES Turf',
  'kinder-playground': 'Kinder Playground',
};

const SHEET_NAME     = 'Reservations';
const ALLOWED_DOMAIN = 'slamnv.org';
const ADMIN_EMAIL    = 'kenny.hin@slamnv.org';
const DAYS_AHEAD     = 90;

// Sheet column numbers (1-based)
const COL = {
  TIMESTAMP:    1,
  SUBMITTED_BY: 2,
  TEACHER_NAME: 3,
  GRADE_LEVEL:  4,
  PURPOSE:      5,
  SPACE:        6,
  DATE:         7,
  START_TIME:   8,
  END_TIME:     9,
  STATUS:       10,
  APPROVE:      11,  // checkbox — check to approve
};

// ============================================================
// WEB APP ENTRY POINTS
// ============================================================

function doGet(e) {
  try {
    const auth = verifyToken(e.parameter.token);
    if (!auth.valid) return jsonResponse({ error: 'Unauthorized', message: auth.message });

    return jsonResponse({ success: true, events: getAllCalendarEvents() });
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const auth = verifyToken(data.token);
    if (!auth.valid) return jsonResponse({ error: 'Unauthorized', message: auth.message });

    const required = ['teacherName','gradeLevel','purpose','space','date','startTime','endTime'];
    for (const field of required) {
      if (!data[field]) return jsonResponse({ success: false, message: 'Missing field: ' + field });
    }

    if (!CALENDAR_IDS[data.space]) return jsonResponse({ success: false, message: 'Invalid space.' });

    const conflict = checkConflict(data.space, data.date, data.startTime, data.endTime);
    if (conflict) {
      return jsonResponse({
        success: false, conflict: true,
        message: 'This space already has a reservation during that time: "' + conflict.title + '". Please choose a different time or space.',
      });
    }

    saveToSheet(data, auth.email);
    sendSubmissionEmails(data, auth.email);

    return jsonResponse({ success: true, message: 'Request submitted successfully.' });
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ error: err.message });
  }
}

// ============================================================
// TOKEN VERIFICATION
// ============================================================

function verifyToken(token) {
  if (!token) return { valid: false, message: 'No token provided.' };
  try {
    const res     = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    const payload = JSON.parse(res.getContentText());

    if (payload.error || !payload.email) return { valid: false, message: 'Invalid or expired token. Please sign in again.' };
    if (!payload.email.endsWith('@' + ALLOWED_DOMAIN)) return { valid: false, message: 'Email domain not permitted.' };

    return { valid: true, email: payload.email, name: payload.name };
  } catch (err) {
    return { valid: false, message: 'Token verification failed.' };
  }
}

// ============================================================
// CALENDAR — READ
// ============================================================

function getAllCalendarEvents() {
  const now    = new Date();
  const future = new Date();
  future.setDate(future.getDate() + DAYS_AHEAD);

  const allEvents = [];
  for (const [spaceId, calendarId] of Object.entries(CALENDAR_IDS)) {
    try {
      const cal = CalendarApp.getCalendarById(calendarId);
      if (!cal) continue;
      for (const event of cal.getEvents(now, future)) {
        allEvents.push({
          id:          event.getId(),
          title:       event.getTitle(),
          start:       event.getStartTime().toISOString(),
          end:         event.getEndTime().toISOString(),
          space:       spaceId,
          description: event.getDescription() || '',
        });
      }
    } catch (err) {
      Logger.log('Error fetching calendar ' + calendarId + ': ' + err.message);
    }
  }
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  return allEvents;
}

// ============================================================
// CONFLICT CHECK
// ============================================================

function checkConflict(space, date, startTime, endTime) {
  const calendarId = CALENDAR_IDS[space];
  if (!calendarId) return null;

  const startDt    = new Date(date + 'T' + startTime + ':00');
  const endDt      = new Date(date + 'T' + endTime   + ':00');
  const checkStart = new Date(startDt.getTime() + 60000);
  const checkEnd   = new Date(endDt.getTime()   - 60000);

  try {
    const cal      = CalendarApp.getCalendarById(calendarId);
    if (!cal) return null;
    const conflicts = cal.getEvents(checkStart, checkEnd);
    if (conflicts.length > 0) return { title: conflicts[0].getTitle() };
  } catch (err) {
    Logger.log('Conflict check error: ' + err.message);
  }
  return null;
}

// ============================================================
// GOOGLE SHEETS — SAVE + SETUP
// ============================================================

function saveToSheet(data, submitterEmail) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ['Timestamp','Submitted By','Teacher Name','Grade Level','Purpose','Space','Date','Start Time','End Time','Status','Approve ☐'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0B0B0B').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 10, 145);
    sheet.setColumnWidth(COL.APPROVE, 80);
  }

  const newRow = sheet.getLastRow() + 1;
  sheet.appendRow([
    new Date(), submitterEmail,
    data.teacherName, data.gradeLevel, data.purpose,
    data.space, data.date, data.startTime, data.endTime,
    'Pending', false,
  ]);

  // Add a proper checkbox in the Approve column
  sheet.getRange(newRow, COL.APPROVE).insertCheckboxes();

  // Color the status cell yellow for Pending
  sheet.getRange(newRow, COL.STATUS).setBackground('#FEF9C3').setFontColor('#92400E');
}

// ============================================================
// CHECKBOX APPROVAL — onEdit trigger
// ============================================================
// IMPORTANT: This requires an INSTALLABLE trigger, not a simple one.
// Set it up once:
//   1. In Apps Script, click the clock icon (Triggers) in the left sidebar
//   2. Click "+ Add Trigger"
//   3. Function: onEdit | Event source: From spreadsheet | Event type: On edit
//   4. Save and grant permissions
// ============================================================

function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();

  // Only act on the Reservations sheet, Approve column, data rows
  if (sheet.getName() !== SHEET_NAME) return;
  if (range.getColumn() !== COL.APPROVE) return;
  if (range.getRow() < 2) return;

  const isChecked = e.value === 'TRUE' || e.value === true;
  if (!isChecked) return;

  const row = range.getRow();

  try {
    approveRow(row, sheet);
  } catch (err) {
    Logger.log('onEdit approval error: ' + err.message);
    // Uncheck the box so admin can try again
    range.setValue(false);
    SpreadsheetApp.getUi().alert('Error during approval: ' + err.message);
  }
}

function approveRow(row, sheet) {
  const values = sheet.getRange(row, 1, 1, COL.APPROVE).getValues()[0];
  const submitterEmail = values[COL.SUBMITTED_BY - 1];
  const teacherName    = values[COL.TEACHER_NAME - 1];
  const gradeLevel     = values[COL.GRADE_LEVEL  - 1];
  const purpose        = values[COL.PURPOSE       - 1];
  const space          = values[COL.SPACE         - 1];
  const date           = values[COL.DATE          - 1];
  const startTime      = values[COL.START_TIME    - 1];
  const endTime        = values[COL.END_TIME      - 1];
  const status         = values[COL.STATUS        - 1];

  if (status === 'Approved') {
    sheet.getRange(row, COL.APPROVE).setValue(false);
    SpreadsheetApp.getUi().alert('This reservation is already approved.');
    return;
  }

  // Final conflict check
  const conflict = checkConflict(String(space), String(date), String(startTime), String(endTime));
  if (conflict) {
    sheet.getRange(row, COL.APPROVE).setValue(false);
    SpreadsheetApp.getUi().alert('⚠️ Conflict: "' + conflict.title + '" is already booked in ' + (SPACE_LABELS[space] || space) + ' at that time.\n\nApproval cancelled.');
    return;
  }

  // Add to Google Calendar
  const calendarId = CALENDAR_IDS[String(space)];
  if (!calendarId) {
    sheet.getRange(row, COL.APPROVE).setValue(false);
    SpreadsheetApp.getUi().alert('Calendar ID not found for space: ' + space);
    return;
  }

  const cal     = CalendarApp.getCalendarById(calendarId);
  const startDt = new Date(date + 'T' + startTime + ':00');
  const endDt   = new Date(date + 'T' + endTime   + ':00');
  const title   = purpose + ' — ' + teacherName + ' (' + gradeLevel + ')';
  const desc    = 'Teacher: ' + teacherName + '\nGrade: ' + gradeLevel + '\nPurpose: ' + purpose + '\nSpace: ' + (SPACE_LABELS[space] || space) + '\nSubmitted by: ' + submitterEmail;

  cal.createEvent(title, startDt, endDt, { description: desc });

  // Update sheet: mark Approved, keep checkbox checked
  sheet.getRange(row, COL.STATUS).setValue('Approved').setBackground('#D1FAE5').setFontColor('#065F46');

  // Send approval email to the teacher
  sendApprovalEmail(submitterEmail, teacherName, space, date, startTime, endTime, purpose);

  SpreadsheetApp.getUi().alert('✅ Approved! Event added to the ' + (SPACE_LABELS[space] || space) + ' calendar and approval email sent to ' + submitterEmail + '.');
}

// ============================================================
// EMAIL NOTIFICATIONS
// ============================================================

function sendSubmissionEmails(data, submitterEmail) {
  const spaceName = SPACE_LABELS[data.space] || data.space;
  const dateStr   = formatDateLong(data.date);
  const timeStr   = formatTime12(data.startTime) + ' – ' + formatTime12(data.endTime);

  // --- Email to the teacher who submitted ---
  const submitterBody =
    'Hi ' + data.teacherName + ',\n\n' +
    'Your space reservation request has been received and is now pending admin approval.\n\n' +
    'REQUEST DETAILS\n' +
    '────────────────────────\n' +
    'Space:    ' + spaceName        + '\n' +
    'Date:     ' + dateStr          + '\n' +
    'Time:     ' + timeStr          + '\n' +
    'Purpose:  ' + data.purpose     + '\n' +
    'Grade:    ' + data.gradeLevel  + '\n' +
    '────────────────────────';

  MailApp.sendEmail({
    to:      submitterEmail,
    subject: '📋 Reservation Request Received — ' + spaceName + ' on ' + dateStr,
    body:    submitterBody,
  });

  // --- Email to admin ---
  const adminBody =
    'A new space reservation request has been submitted.\n\n' +
    'SUBMITTED BY: ' + submitterEmail + '\n\n' +
    'Teacher:  ' + data.teacherName  + '\n' +
    'Grade:    ' + data.gradeLevel   + '\n' +
    'Purpose:  ' + data.purpose      + '\n' +
    'Space:    ' + spaceName         + '\n' +
    'Date:     ' + dateStr           + '\n' +
    'Time:     ' + timeStr           + '\n\n' +
    'Open the Google Sheet and check the "Approve ☐" checkbox in column K to approve this request.\n' +
    'Approving will automatically add the event to the calendar and email the teacher.';

  MailApp.sendEmail({
    to:      ADMIN_EMAIL,
    subject: '🔔 New Reservation Request — ' + data.teacherName + ' | ' + spaceName + ' | ' + dateStr,
    body:    adminBody,
  });
}

function sendApprovalEmail(submitterEmail, teacherName, space, date, startTime, endTime, purpose) {
  const spaceName = SPACE_LABELS[space] || space;
  const dateStr   = formatDateLong(date);
  const timeStr   = formatTime12(startTime) + ' – ' + formatTime12(endTime);

  const body =
    'Hi ' + teacherName + ',\n\n' +
    'Your space reservation has been approved! It has been added to the ' + spaceName + ' calendar.\n\n' +
    'APPROVED RESERVATION\n' +
    '────────────────────────\n' +
    'Space:    ' + spaceName + '\n' +
    'Date:     ' + dateStr   + '\n' +
    'Time:     ' + timeStr   + '\n' +
    'Purpose:  ' + purpose   + '\n' +
    '────────────────────────';

  MailApp.sendEmail({
    to:      submitterEmail,
    subject: '✅ Reservation Approved — ' + spaceName + ' on ' + dateStr,
    body:    body,
  });
}

// ============================================================
// ADMIN MENU (fallback — appears in Google Sheet)
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SLAM Reservations')
    .addItem('✅ Approve Selected Row', 'approveSelected')
    .addItem('❌ Deny Selected Row',    'denySelected')
    .addToUi();
}

function approveSelected() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) { SpreadsheetApp.getUi().alert('No Reservations sheet found.'); return; }
  const row = sheet.getActiveRange().getRow();
  if (row < 2) { SpreadsheetApp.getUi().alert('Please click on a data row first.'); return; }
  approveRow(row, sheet);
}

function denySelected() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const row   = sheet.getActiveRange().getRow();
  if (row < 2) { SpreadsheetApp.getUi().alert('Please select a data row.'); return; }
  sheet.getRange(row, COL.STATUS).setValue('Denied').setBackground('#FEE2E2').setFontColor('#991B1B');
  SpreadsheetApp.getUi().alert('Reservation marked as Denied.');
}

// ============================================================
// HELPERS
// ============================================================

function formatDateLong(val) {
  if (!val) return '';
  try {
    // Google Sheets returns Date objects; fallback handles plain strings
    const d = (val instanceof Date) ? val : new Date(String(val).length === 10 ? val + 'T00:00:00' : val);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { return String(val); }
}

function formatTime12(val) {
  if (val === null || val === undefined || val === '') return '';
  try {
    if (val instanceof Date) {
      // Sheets stores times as Date objects anchored at 12/30/1899
      const h = val.getHours();
      const m = String(val.getMinutes()).padStart(2, '0');
      return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
    }
    const parts = String(val).split(':');
    const h = parseInt(parts[0]);
    const m = (parts[1] || '00').substring(0, 2);
    return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
  } catch (e) { return String(val); }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
