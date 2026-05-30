// ============================================================
// Code.gs — SLAM Space Reservations Backend
// ============================================================
// FIRST-TIME SETUP (do this once after pasting):
//   1. Select the "setup" function from the dropdown
//   2. Click Run ▶ — grant all permissions when prompted
//   3. Done. Use the SLAM Reservations menu in the Sheet to approve.
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
  APPROVE:      11,
};

// ============================================================
// FIRST-TIME SETUP — run this once manually from Apps Script
// ============================================================

function setup() {
  const ui = SpreadsheetApp.getUi();

  // Pre-authorize all required services
  MailApp.getRemainingDailyQuota();
  CalendarApp.getDefaultCalendar();

  // Try to access each space calendar explicitly
  for (const [spaceId, calId] of Object.entries(CALENDAR_IDS)) {
    try {
      const cal = CalendarApp.getCalendarById(calId);
      if (!cal) throw new Error('null');
      Logger.log('Calendar OK: ' + spaceId);
    } catch (err) {
      Logger.log('Calendar NOT accessible: ' + spaceId + ' — ' + err.message);
    }
  }

  onOpen();

  ui.alert('✅ Setup complete! All permissions granted.\n\nNow refresh the Google Sheet, click a Pending row, then use:\nSLAM Reservations → Approve Selected Row');
}

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

    const required = ['teacherName', 'gradeLevel', 'purpose', 'space'];
    for (const field of required) {
      if (!data[field]) return jsonResponse({ success: false, message: 'Missing field: ' + field });
    }

    if (!CALENDAR_IDS[data.space]) return jsonResponse({ success: false, message: 'Invalid space.' });

    // Support both legacy single-date and new multi-date entries
    let entries = [];
    if (data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
      entries = data.entries;
    } else if (data.date) {
      // Legacy single-date submission
      entries = [{ date: data.date, startTime: data.startTime, endTime: data.endTime }];
    } else {
      return jsonResponse({ success: false, message: 'No date entries provided.' });
    }

    // Validate all entries first
    for (const entry of entries) {
      if (!entry.date || !entry.startTime || !entry.endTime) {
        return jsonResponse({ success: false, message: 'Each entry must have date, startTime, and endTime.' });
      }
    }

    // Check conflicts for every entry — report the first one found
    for (const entry of entries) {
      const conflict = checkConflict(data.space, entry.date, entry.startTime, entry.endTime);
      if (conflict) {
        return jsonResponse({
          success: false, conflict: true,
          message: 'Conflict on ' + formatDateLong(entry.date) + ' (' + formatTime12(entry.startTime) + ' – ' + formatTime12(entry.endTime) + '): "' + conflict.title + '". Please choose a different time or date.',
        });
      }
    }

    // All clear — save one row per entry and collect dates for email
    const savedDates = [];
    for (const entry of entries) {
      saveToSheet({
        teacherName: data.teacherName,
        gradeLevel:  data.gradeLevel,
        purpose:     data.purpose,
        space:       data.space,
        date:        entry.date,
        startTime:   entry.startTime,
        endTime:     entry.endTime,
      }, auth.email);
      savedDates.push(entry);
    }

    sendSubmissionEmailsMulti(data, auth.email, savedDates);

    return jsonResponse({
      success: true,
      message: 'Request submitted for ' + entries.length + ' date' + (entries.length > 1 ? 's' : '') + '.',
    });
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
    const cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) return null;
    const conflicts = cal.getEvents(checkStart, checkEnd);
    if (conflicts.length > 0) return { title: conflicts[0].getTitle() };
  } catch (err) {
    Logger.log('Conflict check error: ' + err.message);
  }
  return null;
}

// ============================================================
// GOOGLE SHEETS — SAVE
// ============================================================
// NOTE: There is NO onEdit trigger. Approvals are done exclusively
// via the SLAM Reservations menu → Approve Selected Row.
// ============================================================

function saveToSheet(data, submitterEmail) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = ['Timestamp', 'Submitted By', 'Teacher Name', 'Grade Level', 'Purpose', 'Space', 'Date', 'Start Time', 'End Time', 'Status', 'Check To Approve'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0B0B0B').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 10, 145);
    sheet.setColumnWidth(COL.APPROVE, 120);
  }

  const newRow = sheet.getLastRow() + 1;
  sheet.appendRow([
    new Date(), submitterEmail,
    data.teacherName, data.gradeLevel, data.purpose,
    data.space, data.date, data.startTime, data.endTime,
    'Pending', false,
  ]);

  sheet.getRange(newRow, COL.APPROVE).insertCheckboxes();
  sheet.getRange(newRow, COL.STATUS).setBackground('#FEF9C3').setFontColor('#92400E');
}

// ============================================================
// ADMIN MENU
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SLAM Reservations')
    .addItem('✅ Approve Selected Row', 'approveSelected')
    .addItem('❌ Deny Selected Row',    'denySelected')
    .addToUi();
}

function approveSelected() {
  const ui    = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  if (!sheet) { ui.alert('Error: No Reservations sheet found.'); return; }

  const row = sheet.getActiveRange().getRow();
  if (row < 2) { ui.alert('Please click on a data row first (not the header row).'); return; }

  const status = sheet.getRange(row, COL.STATUS).getValue();
  if (status === 'Approved') { ui.alert('This row is already approved.'); return; }

  try {
    approveRow(row, sheet, ui);
  } catch (err) {
    Logger.log('Approval error on row ' + row + ': ' + err.message + '\n' + err.stack);
    ui.alert('Approval failed.\n\nError: ' + err.message + '\n\nCheck Apps Script Execution Log for details.');
  }
}

function denySelected() {
  const ui    = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const row = sheet.getActiveRange().getRow();
  if (row < 2) { ui.alert('Please select a data row.'); return; }

  sheet.getRange(row, COL.STATUS).setValue('Denied').setBackground('#FEE2E2').setFontColor('#991B1B');
  ui.alert('Reservation marked as Denied.');
}

// ============================================================
// APPROVAL LOGIC
// ============================================================

function approveRow(row, sheet, ui) {
  const values         = sheet.getRange(row, 1, 1, COL.APPROVE).getValues()[0];
  const submitterEmail = String(values[COL.SUBMITTED_BY - 1]);
  const teacherName    = String(values[COL.TEACHER_NAME - 1]);
  const gradeLevel     = String(values[COL.GRADE_LEVEL  - 1]);
  const purpose        = String(values[COL.PURPOSE      - 1]);
  const space          = String(values[COL.SPACE        - 1]);
  const date           = values[COL.DATE       - 1];
  const startTime      = values[COL.START_TIME - 1];
  const endTime        = values[COL.END_TIME   - 1];
  const requestedAt    = values[COL.TIMESTAMP  - 1];

  const spaceName = SPACE_LABELS[space] || space;
  const tz        = Session.getScriptTimeZone();
  const dateStr   = formatDateLong(date);
  const startStr  = formatTime12(startTime);
  const endStr    = formatTime12(endTime);

  // Rebuild ISO date/time strings from whatever Sheets gives us
  const dateISO  = (date instanceof Date)
    ? Utilities.formatDate(date, tz, 'yyyy-MM-dd')
    : String(date);
  const startISO = (startTime instanceof Date)
    ? Utilities.formatDate(startTime, tz, 'HH:mm')
    : String(startTime);
  const endISO   = (endTime instanceof Date)
    ? Utilities.formatDate(endTime, tz, 'HH:mm')
    : String(endTime);

  const startDt    = new Date(dateISO + 'T' + startISO + ':00');
  const endDt      = new Date(dateISO + 'T' + endISO   + ':00');
  const approvedAt = new Date();

  const requestedStr = (requestedAt instanceof Date)
    ? Utilities.formatDate(requestedAt, tz, 'MMM d, yyyy h:mm a')
    : String(requestedAt);
  const approvedStr = Utilities.formatDate(approvedAt, tz, 'MMM d, yyyy h:mm a');

  // Create event on admin's personal calendar
  const title = purpose + ' (' + teacherName + ')';
  const desc  = spaceName + ' · ' + gradeLevel;
  CalendarApp.getDefaultCalendar().createEvent(title, startDt, endDt, { description: desc });

  // Update sheet status
  sheet.getRange(row, COL.STATUS).setValue('Approved').setBackground('#D1FAE5').setFontColor('#065F46');
  sheet.getRange(row, COL.APPROVE).setValue(true);

  // Email the teacher
  sendApprovalEmail(submitterEmail, teacherName, space, dateStr, startStr, endStr, purpose);

  // Build Google Calendar link for that month
  const year   = Utilities.formatDate(startDt, tz, 'yyyy');
  const month  = Utilities.formatDate(startDt, tz, 'M');
  const day    = Utilities.formatDate(startDt, tz, 'd');
  const calUrl = 'https://calendar.google.com/calendar/r/month/' + year + '/' + month + '/' + day;

  ui.alert(
    '✅ APPROVED\n\n' +
    title + '\n' +
    spaceName + '  ·  ' + dateStr + '\n' +
    startStr + ' – ' + endStr + '\n\n' +
    'Approval email sent to ' + submitterEmail + '\n\n' +
    'Open calendar:\n' + calUrl
  );
}

// ============================================================
// EMAIL NOTIFICATIONS
// ============================================================

function sendSubmissionEmails(data, submitterEmail) {
  // Legacy single-date wrapper — delegates to multi-date version
  const spaceName = SPACE_LABELS[data.space] || data.space;
  const dateStr   = formatDateLong(data.date);
  const timeStr   = formatTime12(data.startTime) + ' – ' + formatTime12(data.endTime);
  sendSubmissionEmailsMulti(data, submitterEmail, [{ date: data.date, startTime: data.startTime, endTime: data.endTime }]);
}

function sendSubmissionEmailsMulti(data, submitterEmail, entries) {
  const spaceName = SPACE_LABELS[data.space] || data.space;
  const sheetUrl  = SpreadsheetApp.getActiveSpreadsheet().getUrl();

  // Build entries list string
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  let entriesListTeacher = '';
  let entriesListAdmin = '';
  sortedEntries.forEach((entry, i) => {
    const d = formatDateLong(entry.date);
    const t = formatTime12(entry.startTime) + ' – ' + formatTime12(entry.endTime);
    entriesListTeacher += '  ' + (i + 1) + '. ' + d + ' · ' + t + '\n';
    entriesListAdmin  += '  ' + (i + 1) + '. ' + d + ' · ' + t + '\n';
  });

  const count = entries.length;
  const dateLabel = count === 1 ? formatDateLong(entries[0].date) : count + ' dates';

  // Email to teacher
  MailApp.sendEmail({
    to:      submitterEmail,
    subject: '📋 Reservation Request Received — ' + spaceName + ' · ' + dateLabel,
    body:
      'Hi ' + data.teacherName + ',\n\n' +
      'Your space reservation request has been received and is now pending admin approval.\n\n' +
      'REQUEST DETAILS\n' +
      '────────────────────────\n' +
      'Space:    ' + spaceName + '\n' +
      'Purpose:  ' + data.purpose + '\n' +
      'Grade:    ' + data.gradeLevel + '\n' +
      'Dates (' + count + '):\n' + entriesListTeacher +
      '────────────────────────\n\n' +
      'You will receive a separate approval email for each date.',
  });

  // Email to admin (Kenny)
  MailApp.sendEmail({
    to:      ADMIN_EMAIL,
    subject: '🔔 New Reservation Request — ' + data.teacherName + ' | ' + spaceName + ' | ' + dateLabel,
    body:
      'A new space reservation request has been submitted.\n\n' +
      'Teacher:  ' + data.teacherName + '\n' +
      'Grade:    ' + data.gradeLevel + '\n' +
      'Purpose:  ' + data.purpose + '\n' +
      'Space:    ' + spaceName + '\n' +
      'Dates (' + count + '):\n' + entriesListAdmin + '\n' +
      '👉 Open Reservations Sheet to approve:\n' + sheetUrl,
  });
}

function sendApprovalEmail(submitterEmail, teacherName, space, dateStr, startStr, endStr, purpose) {
  const spaceName = SPACE_LABELS[space] || space;

  MailApp.sendEmail({
    to:      submitterEmail,
    subject: '✅ Reservation Approved — ' + spaceName + ' on ' + dateStr,
    body:
      'Hi ' + teacherName + ',\n\n' +
      'Your space reservation has been approved!\n\n' +
      'APPROVED RESERVATION\n' +
      '────────────────────────\n' +
      'Space:    ' + spaceName           + '\n' +
      'Date:     ' + dateStr             + '\n' +
      'Time:     ' + startStr + ' – ' + endStr + '\n' +
      'Purpose:  ' + purpose             + '\n' +
      '────────────────────────',
  });
}

// ============================================================
// HELPERS
// ============================================================

function formatDateLong(val) {
  if (!val) return '';
  try {
    const d = (val instanceof Date) ? val : new Date(String(val).length === 10 ? val + 'T00:00:00' : val);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { return String(val); }
}

function formatTime12(val) {
  if (val === null || val === undefined || val === '') return '';
  try {
    if (val instanceof Date) {
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
