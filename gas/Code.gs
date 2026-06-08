// ============================================================
// Code.gs - SLAM Space Reservations Backend
// ============================================================

const CALENDAR_IDS = {
  'cafegym':           'c_312121ab4260fc7d2045f8298fd1aa135c36d62f7dba93137d4a70c177b5ce72@group.calendar.google.com',
  'es-turf':           'c_a5a420a35120dc73009599256852b43f3707ca70a2af0ea6b3de2311d5cfce7a@group.calendar.google.com',
  'kinder-playground': 'c_e58aaacc91b7d88d6dc7937e2ee8a1799d1efdc338f60f3daefa301cdd25c91b@group.calendar.google.com'
};

const SPACE_LABELS = {
  'cafegym':           'Cafegym',
  'es-turf':           'ES Turf',
  'kinder-playground': 'Kinder Playground'
};

const SHEET_NAME   = 'Reservations';
const ALLOWED_DOMAIN = 'slamnv.org';
const ADMIN_EMAIL  = 'kenny.hin@slamnv.org';
const DAYS_AHEAD   = 90;

// Column index map (1-based)
const COL = {
  TIMESTAMP:        1,
  SUBMITTED_BY:     2,
  TEACHER_NAME:     3,
  GRADE_LEVEL:      4,
  PURPOSE:          5,
  SPACE:            6,
  DATE:             7,
  START_TIME:       8,
  END_TIME:         9,
  STATUS:           10,
  APPROVE:          11,
  CONFLICT_NOTES:   12,
  NOTIFY_CONFLICT:  13
};

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

  // Get or create sheet
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Timestamp', 'Submitted By', 'Teacher Name', 'Grade Level', 'Purpose',
      'Space', 'Date', 'Start Time', 'End Time', 'Status',
      'Approve', 'Conflict Notes', 'Send Conflict Email'
    ]);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#0B0B0B').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  // Save one row per entry
  var savedCount    = 0;
  var conflictCount = 0;

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.date || !entry.startTime || !entry.endTime) continue;

    // Check calendar for conflicts BEFORE saving
    var conflict = checkConflict(data.space, entry.date, entry.startTime, entry.endTime);

    var newRow = sheet.getLastRow() + 1;
    sheet.appendRow([
      new Date(), auth.email, data.teacherName, data.gradeLevel, data.purpose,
      data.space, entry.date, entry.startTime, entry.endTime,
      conflict ? 'CONFLICT' : 'Pending',
      false,           // Approve checkbox
      conflict || '',  // Conflict Notes
      false            // Send Conflict Email checkbox
    ]);

    // Always insert the Approve checkbox
    sheet.getRange(newRow, COL.APPROVE).insertCheckboxes();

    if (conflict) {
      // Red styling for conflict rows
      sheet.getRange(newRow, COL.STATUS)
        .setBackground('#FEE2E2').setFontColor('#991B1B').setFontWeight('bold');
      sheet.getRange(newRow, COL.CONFLICT_NOTES)
        .setBackground('#FEE2E2').setFontColor('#991B1B').setFontStyle('italic');
      sheet.getRange(newRow, COL.NOTIFY_CONFLICT)
        .insertCheckboxes()
        .setBackground('#FEE2E2');
      conflictCount++;
    } else {
      // Yellow "Pending" styling
      sheet.getRange(newRow, COL.STATUS).setBackground('#FEF9C3').setFontColor('#92400E');
    }

    savedCount++;
  }

  // Build formatted entries string for emails
  var spaceName       = SPACE_LABELS[data.space] || data.space;
  var entriesFormatted = '';
  for (var j = 0; j < entries.length; j++) {
    var ent = entries[j];
    entriesFormatted += 'Date:     ' + formatDateLong(ent.date) + '\n';
    entriesFormatted += 'Time:     ' + formatTime12(ent.startTime) + ' – ' + formatTime12(ent.endTime) + '\n';
    if (j < entries.length - 1) entriesFormatted += '\n';
  }

  // ── Email to teacher ──────────────────────────────────────
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
      'You will receive an email once an admin reviews your request.';
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
      'Each date will be individually reviewed. You will receive a separate email per date.';
  }
  MailApp.sendEmail({ to: auth.email, subject: teacherSubject, body: teacherBody });

  // ── Email to admin ────────────────────────────────────────
  // Check other spaces for same-date FYI (full day, not time-specific)
  var fyiLines = [];
  var datesChecked = {};
  for (var fi = 0; fi < entries.length; fi++) {
    var fyiDate = entries[fi].date;
    if (!datesChecked[fyiDate]) {
      datesChecked[fyiDate] = true;
      var fyiEvents = getOtherSpaceEventsOnDate(data.space, fyiDate);
      if (fyiEvents.length > 0) {
        // If multi-date, prefix each block with its date
        var prefix = entries.length > 1 ? formatDateLong(fyiDate) + ':\n  ' : '';
        fyiLines.push(prefix + fyiEvents.join('\n  '));
      }
    }
  }

  var adminSubject;
  if (conflictCount > 0) {
    adminSubject = '⚠️ CONFLICT — New Reservation — ' + data.teacherName + ' | ' + spaceName;
  } else if (savedCount === 1) {
    adminSubject = '🔔 New Reservation — ' + data.teacherName + ' | ' + spaceName + ' | ' + formatDateLong(entries[0].date);
  } else {
    adminSubject = '🔔 New Reservation — ' + data.teacherName + ' | ' + spaceName + ' | ' + savedCount + ' dates';
  }

  var adminBody =
    'A new space reservation request has been submitted.\n\n' +
    'Teacher:  ' + data.teacherName + '\n' +
    'Grade:    ' + data.gradeLevel + '\n' +
    'Purpose:  ' + data.purpose + '\n' +
    'Space:    ' + spaceName + '\n' +
    (savedCount > 1 ? '\nDATES (' + savedCount + ')\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' : '') +
    entriesFormatted +
    (savedCount > 1 ? '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' : '') +
    (conflictCount > 0
      ? '\n⚠️ ' + conflictCount + ' date(s) have CONFLICTS with existing calendar events.\n' +
        'Check the sheet — use the "Send Conflict Email" checkbox to notify the teacher.\n'
      : '') +
    (fyiLines.length > 0
      ? '\nℹ️ FYI — OTHER SPACES ALSO HAVE EVENTS ON THIS DATE\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        fyiLines.join('\n') + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '(Different space — not a conflict, just a heads-up.)\n'
      : '') +
    '\n👉 Open Reservations Sheet:\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl();

  MailApp.sendEmail({ to: ADMIN_EMAIL, subject: adminSubject, body: adminBody });

  return jsonResp({ success: true, message: 'Saved ' + savedCount + ' rows', saved: savedCount, conflicts: conflictCount });
}

function getEvents(e) {
  var token = '';
  if (e && e.parameter && e.parameter.token) token = String(e.parameter.token);
  var auth = verifyToken(token);
  if (!auth.valid) return jsonResp({ error: 'Unauthorized' });

  var now = new Date();
  var to  = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

  var events = [];
  Object.keys(CALENDAR_IDS).forEach(function(spaceId) {
    var cal = CalendarApp.getCalendarById(CALENDAR_IDS[spaceId]);
    if (!cal) return;
    var raw = cal.getEvents(now, to);
    for (var i = 0; i < raw.length; i++) {
      var ev = raw[i];
      events.push({
        id:          spaceId + '::' + encodeURIComponent(ev.getId()),
        title:       ev.getTitle(),
        start:       ev.getStartTime().toISOString(),
        end:         ev.getEndTime().toISOString(),
        space:       spaceId,
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
    var p   = JSON.parse(res.getContentText());
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
// CONFLICT CHECK
// ============================================================
// Returns a string describing conflicting event(s), or null if clear.

// Returns array of FYI strings for OTHER spaces that have ANY events on the same date.
// Used to inform admin — not a conflict, just a heads-up.
function getOtherSpaceEventsOnDate(excludeSpaceId, dateStr) {
  var fyi = [];
  try {
    var startDt = new Date(dateStr + 'T00:00:00');
    var endDt   = new Date(dateStr + 'T23:59:59');
    Object.keys(CALENDAR_IDS).forEach(function(spaceId) {
      if (spaceId === excludeSpaceId) return;  // Skip the space being requested
      var cal = CalendarApp.getCalendarById(CALENDAR_IDS[spaceId]);
      if (!cal) return;
      var events = cal.getEvents(startDt, endDt);
      if (events.length === 0) return;
      var label = SPACE_LABELS[spaceId] || spaceId;
      var names = events.map(function(ev) {
        var s    = ev.getStartTime();
        var h    = s.getHours(), m = s.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        var h12  = h % 12 || 12;
        var mStr = m < 10 ? '0' + m : '' + m;
        return '"' + ev.getTitle() + '" at ' + h12 + ':' + mStr + ' ' + ampm;
      });
      fyi.push(label + ': ' + names.join(', '));
    });
  } catch (err) {
    // Silently ignore — FYI is informational only, don't block anything
  }
  return fyi;
}

function checkConflict(spaceId, dateStr, startTimeStr, endTimeStr) {
  try {
    var calId = CALENDAR_IDS[spaceId];
    if (!calId) return null;
    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) return null;

    var startDt = parseDateTime(dateStr, startTimeStr);
    var endDt   = parseDateTime(dateStr, endTimeStr);
    var events  = cal.getEvents(startDt, endDt);
    if (events.length === 0) return null;

    return events.map(function(ev) {
      var s    = ev.getStartTime();
      var h    = s.getHours(), m = s.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      var h12  = h % 12 || 12;
      var mStr = m < 10 ? '0' + m : '' + m;
      return '"' + ev.getTitle() + '" at ' + h12 + ':' + mStr + ' ' + ampm;
    }).join('; ');
  } catch (err) {
    return null;  // Don't block submission if calendar check fails
  }
}

// ============================================================
// APPROVAL & CONFLICT NOTIFICATION SYSTEM
// ============================================================
// HOW TO INSTALL (one-time setup):
//   1. Open Apps Script editor: Extensions → Apps Script
//   2. Paste/sync this file into Code.gs
//   3. Run createApproveTrigger() once (Run menu → Run function)
//   4. Grant permissions when prompted
//
// COLUMN K  — "Approve" checkbox
//   Checks calendar for conflicts at approval time.
//   If clear  → creates calendar event + emails teacher approval
//   If conflict → blocks, unchecks box, emails admin a warning
//
// COLUMN M  — "Send Conflict Email" checkbox
//   Sends teacher a polite conflict notice + asks them to re-submit
//   Updates status → "CONFLICT - Notified"
// ============================================================

function createApproveTrigger() {
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
  if (row <= 1) return;                        // Skip header
  if (String(e.value) !== 'TRUE') return;      // Only act on check, not uncheck

  if (col === COL.APPROVE)          handleApproval(sheet, row);
  else if (col === COL.NOTIFY_CONFLICT) handleConflictNotification(sheet, row);
}

// ── Approval ─────────────────────────────────────────────────

function handleApproval(sheet, row) {
  var statusCell    = sheet.getRange(row, COL.STATUS);
  var currentStatus = statusCell.getValue();
  if (currentStatus === 'Approved') return;  // Already done

  var rowData      = sheet.getRange(row, 1, 1, 13).getValues()[0];
  var teacherEmail = rowData[COL.SUBMITTED_BY - 1];
  var teacherName  = rowData[COL.TEACHER_NAME - 1];
  var gradeLevel   = rowData[COL.GRADE_LEVEL - 1];
  var purpose      = rowData[COL.PURPOSE - 1];
  var spaceId      = rowData[COL.SPACE - 1];
  var dateVal      = rowData[COL.DATE - 1];
  var startTimeVal = rowData[COL.START_TIME - 1];
  var endTimeVal   = rowData[COL.END_TIME - 1];

  var spaceName    = SPACE_LABELS[spaceId] || spaceId;
  var dateStr      = normalizeDate(dateVal);
  var startTimeStr = normalizeTime(startTimeVal);
  var endTimeStr   = normalizeTime(endTimeVal);

  // Re-check for conflict right at approval time (something may have changed)
  var conflict = checkConflict(spaceId, dateStr, startTimeStr, endTimeStr);
  if (conflict) {
    // Block — uncheck the approve box, flag the row, alert admin
    sheet.getRange(row, COL.APPROVE).setValue(false);
    statusCell.setValue('CONFLICT').setBackground('#FEE2E2').setFontColor('#991B1B').setFontWeight('bold');
    sheet.getRange(row, COL.CONFLICT_NOTES)
      .setValue('Conflicts with: ' + conflict)
      .setBackground('#FEE2E2').setFontColor('#991B1B').setFontStyle('italic');
    // Make sure the Notify checkbox is there
    var notifyCell = sheet.getRange(row, COL.NOTIFY_CONFLICT);
    if (notifyCell.getValue() === '' || notifyCell.getValue() === false) {
      notifyCell.insertCheckboxes();
    }
    notifyCell.setValue(false).setBackground('#FEE2E2');

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: '⚠️ Approval Blocked — Conflict on ' + spaceName + ' (' + formatDateLong(dateStr) + ')',
      body:
        'Approval was blocked for ' + teacherName + '\'s reservation.\n\n' +
        'Space:    ' + spaceName + '\n' +
        'Date:     ' + formatDateLong(dateStr) + '\n' +
        'Time:     ' + formatTime12(startTimeStr) + ' – ' + formatTime12(endTimeStr) + '\n\n' +
        'Conflicts with: ' + conflict + '\n\n' +
        'Use the "Send Conflict Email" checkbox (col M) in the sheet to notify the teacher.'
    });
    return;
  }

  // No conflict — create calendar event
  var startDt = parseDateTime(dateStr, startTimeStr);
  var endDt   = parseDateTime(dateStr, endTimeStr);
  var calNote = '';
  try {
    var cal = CalendarApp.getCalendarById(CALENDAR_IDS[spaceId]);
    if (cal) {
      cal.createEvent(
        spaceName + ' — ' + teacherName + ' (' + gradeLevel + ')',
        startDt, endDt,
        { description: 'Purpose: ' + purpose + '\nRequested by: ' + teacherEmail }
      );
    }
  } catch (err) {
    calNote = 'Note: Calendar event could not be created automatically (' + err.message + '). Please add it manually.';
  }

  // Mark row green / Approved
  statusCell.setValue('Approved').setBackground('#DCFCE7').setFontColor('#166534').setFontWeight('normal');
  sheet.getRange(row, COL.APPROVE).setBackground('#DCFCE7');

  // Email teacher confirmation
  MailApp.sendEmail({
    to: teacherEmail,
    subject: '✅ Reservation Approved — ' + spaceName + ' on ' + formatDateLong(dateStr),
    body:
      'Hi ' + teacherName + ',\n\n' +
      'Great news! Your space reservation has been approved.\n\n' +
      'APPROVED RESERVATION\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Space:    ' + spaceName + '\n' +
      'Purpose:  ' + purpose + '\n' +
      'Grade:    ' + gradeLevel + '\n' +
      'Date:     ' + formatDateLong(dateStr) + '\n' +
      'Time:     ' + formatTime12(startTimeStr) + ' – ' + formatTime12(endTimeStr) + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'This reservation is now on the SLAM Reservations calendar.\n' +
      (calNote ? '\n' + calNote + '\n' : '') +
      '\n— SLAM Athletics Administration'
  });
}

// ── Conflict Notification ─────────────────────────────────────

function handleConflictNotification(sheet, row) {
  var statusCell = sheet.getRange(row, COL.STATUS);
  if (statusCell.getValue() === 'CONFLICT - Notified') return;  // Already sent

  var rowData       = sheet.getRange(row, 1, 1, 13).getValues()[0];
  var teacherEmail  = rowData[COL.SUBMITTED_BY - 1];
  var teacherName   = rowData[COL.TEACHER_NAME - 1];
  var gradeLevel    = rowData[COL.GRADE_LEVEL - 1];
  var purpose       = rowData[COL.PURPOSE - 1];
  var spaceId       = rowData[COL.SPACE - 1];
  var dateVal       = rowData[COL.DATE - 1];
  var startTimeVal  = rowData[COL.START_TIME - 1];
  var endTimeVal    = rowData[COL.END_TIME - 1];
  var conflictNotes = rowData[COL.CONFLICT_NOTES - 1];

  var spaceName    = SPACE_LABELS[spaceId] || spaceId;
  var dateStr      = normalizeDate(dateVal);
  var startTimeStr = normalizeTime(startTimeVal);
  var endTimeStr   = normalizeTime(endTimeVal);

  MailApp.sendEmail({
    to: teacherEmail,
    subject: '⚠️ Reservation Conflict — ' + spaceName + ' on ' + formatDateLong(dateStr),
    body:
      'Hi ' + teacherName + ',\n\n' +
      'Unfortunately, your space reservation request has a scheduling conflict and cannot be approved.\n\n' +
      'YOUR REQUEST\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Space:    ' + spaceName + '\n' +
      'Purpose:  ' + purpose + '\n' +
      'Grade:    ' + gradeLevel + '\n' +
      'Date:     ' + formatDateLong(dateStr) + '\n' +
      'Time:     ' + formatTime12(startTimeStr) + ' – ' + formatTime12(endTimeStr) + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      (conflictNotes ? 'CONFLICT\n' + conflictNotes + '\n\n' : '') +
      'Please visit the SLAM Reservations site to submit a new request for a different time or date.\n\n' +
      '— SLAM Athletics Administration'
  });

  // Update status to show notification was sent
  statusCell.setValue('CONFLICT - Notified').setBackground('#FECACA').setFontColor('#7F1D1D');
  sheet.getRange(row, COL.NOTIFY_CONFLICT).setBackground('#FECACA');
}

// ── Date/Time Normalizers (sheet values can be Date objects or strings) ──

function normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var y  = val.getFullYear();
    var mo = String(val.getMonth() + 1).padStart(2, '0');
    var d  = String(val.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + d;
  }
  return String(val).split('T')[0];
}

function normalizeTime(val) {
  if (!val) return '00:00';
  if (val instanceof Date) {
    var h = val.getHours();
    var m = val.getMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  return String(val);
}

function parseDateTime(dateStr, timeStr) {
  var parts = timeStr.split(':');
  var h  = parseInt(parts[0]) || 0;
  var m  = parseInt(parts[1]) || 0;
  var dt = new Date(dateStr + 'T00:00:00');
  dt.setHours(h, m, 0, 0);
  return dt;
}
