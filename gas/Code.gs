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

const SHEET_NAME     = 'Reservations';
const ALLOWED_DOMAIN = 'slamnv.org';
const ADMIN_EMAIL    = 'kenny.hin@slamnv.org';
const DAYS_AHEAD     = 90;
const ADMIN_PAGE_URL = 'https://kennyhin.github.io/slam-space-reservations/admin.html';

// Column index map (1-based)
const COL = {
  TIMESTAMP:       1,
  SUBMITTED_BY:    2,
  TEACHER_NAME:    3,
  GRADE_LEVEL:     4,
  PURPOSE:         5,
  SPACE:           6,
  DATE:            7,
  START_TIME:      8,
  END_TIME:        9,
  STATUS:          10,
  APPROVE:         11,
  CONFLICT_NOTES:  12,
  NOTIFY_CONFLICT: 13,
  ROW_ID:          14
};

// ============================================================
// DATE / TIME HELPERS
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
    var h    = parseInt(parts[0]);
    var m    = (parts[1] || '00').substring(0, 2);
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12  = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
  } catch (e) { return timeStr; }
}

function generateRowId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================================
// WEB APP ENTRY POINTS
// ============================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'getEvents')   return getEvents(e);
    if (action === 'getAdminRow') return getAdminRow(e);
    return jsonResp({ error: 'Invalid action' });
  } catch (err) {
    return jsonResp({ error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Route admin API actions
    if (data.action === 'approveRow')        return approveRowApi(data);
    if (data.action === 'denyRow')           return denyRowApi(data);
    if (data.action === 'sendConflictEmail') return sendConflictEmailApi(data);

    // Default: teacher form submission
    return handleFormSubmission(data);
  } catch (err) {
    return jsonResp({ error: err && err.message ? err.message : String(err) });
  }
}

// ============================================================
// FORM SUBMISSION
// ============================================================

function handleFormSubmission(data) {
  var auth = verifyToken(data.token);
  if (!auth.valid) return jsonResp({ error: 'Unauthorized' });

  if (!data.teacherName || !data.gradeLevel || !data.purpose || !data.space) {
    return jsonResp({ success: false, message: 'Missing required field' });
  }

  var entries = [];
  if (data.entries && Array.isArray(data.entries) && data.entries.length > 0) {
    entries = data.entries;
  } else if (data.date && data.startTime && data.endTime) {
    entries = [{ date: data.date, startTime: data.startTime, endTime: data.endTime }];
  } else {
    return jsonResp({ success: false, message: 'No date entries provided' });
  }

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Timestamp', 'Submitted By', 'Teacher Name', 'Grade Level', 'Purpose',
      'Space', 'Date', 'Start Time', 'End Time', 'Status',
      'Approve', 'Conflict Notes', 'Send Conflict Email', 'Row ID'
    ]);
    sheet.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#0B0B0B').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }

  var savedCount    = 0;
  var conflictCount = 0;
  var savedRowIds   = [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.date || !entry.startTime || !entry.endTime) continue;

    var conflict = checkConflict(data.space, entry.date, entry.startTime, entry.endTime);
    var rowId    = generateRowId();

    var newRow = sheet.getLastRow() + 1;
    sheet.appendRow([
      new Date(), auth.email, data.teacherName, data.gradeLevel, data.purpose,
      data.space, entry.date, entry.startTime, entry.endTime,
      conflict ? 'CONFLICT' : 'Pending',
      false,
      conflict || '',
      conflict ? false : '',
      rowId
    ]);

    sheet.getRange(newRow, COL.APPROVE).insertCheckboxes();

    if (conflict) {
      sheet.getRange(newRow, COL.STATUS).setBackground('#FEE2E2').setFontColor('#991B1B').setFontWeight('bold');
      sheet.getRange(newRow, COL.CONFLICT_NOTES).setBackground('#FEE2E2').setFontColor('#991B1B').setFontStyle('italic');
      sheet.getRange(newRow, COL.NOTIFY_CONFLICT).insertCheckboxes().setBackground('#FEE2E2');
      conflictCount++;
    } else {
      sheet.getRange(newRow, COL.STATUS).setBackground('#FEF9C3').setFontColor('#92400E');
    }

    savedRowIds.push({ rowId: rowId, date: entry.date, conflict: conflict });
    savedCount++;
  }

  var spaceName        = SPACE_LABELS[data.space] || data.space;
  var entriesFormatted = '';
  for (var j = 0; j < entries.length; j++) {
    var ent = entries[j];
    entriesFormatted += 'Date:     ' + formatDateLong(ent.date) + '\n';
    entriesFormatted += 'Time:     ' + formatTime12(ent.startTime) + ' – ' + formatTime12(ent.endTime) + '\n';
    if (j < entries.length - 1) entriesFormatted += '\n';
  }

  // ── Email teacher ─────────────────────────────────────────
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
      'Grade:    ' + data.gradeLevel + '\n\n' +
      'DATES (' + savedCount + ')\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      entriesFormatted +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'Each date will be individually reviewed. You will receive a separate email per date.';
  }
  MailApp.sendEmail({ to: auth.email, subject: teacherSubject, body: teacherBody });

  // ── FYI: other spaces on same date ───────────────────────
  var fyiLines     = [];
  var datesChecked = {};
  for (var fi = 0; fi < entries.length; fi++) {
    var fyiDate = entries[fi].date;
    if (!datesChecked[fyiDate]) {
      datesChecked[fyiDate] = true;
      var fyiEvents = getOtherSpaceEventsOnDate(data.space, fyiDate);
      if (fyiEvents.length > 0) {
        var prefix = entries.length > 1 ? formatDateLong(fyiDate) + ':\n  ' : '';
        fyiLines.push(prefix + fyiEvents.join('\n  '));
      }
    }
  }

  // ── Email admin — one click-to-review link per row ────────
  var adminSubject;
  if (conflictCount > 0) {
    adminSubject = '⚠️ CONFLICT — New Reservation — ' + data.teacherName + ' | ' + spaceName;
  } else if (savedCount === 1) {
    adminSubject = '🔔 New Reservation — ' + data.teacherName + ' | ' + spaceName + ' | ' + formatDateLong(entries[0].date);
  } else {
    adminSubject = '🔔 New Reservation — ' + data.teacherName + ' | ' + spaceName + ' | ' + savedCount + ' dates';
  }

  var approvalLinks = '';
  for (var k = 0; k < savedRowIds.length; k++) {
    var rd = savedRowIds[k];
    approvalLinks +=
      (savedRowIds.length > 1 ? '  ' + formatDateLong(rd.date) + ':\n  ' : '  ') +
      ADMIN_PAGE_URL + '?id=' + rd.rowId +
      (rd.conflict ? '  ⚠️ CONFLICT' : '') + '\n';
  }

  var adminBody =
    'A new space reservation request has been submitted.\n\n' +
    'Teacher:  ' + data.teacherName + '\n' +
    'Grade:    ' + data.gradeLevel  + '\n' +
    'Purpose:  ' + data.purpose     + '\n' +
    'Space:    ' + spaceName        + '\n' +
    (savedCount > 1 ? '\nDATES (' + savedCount + ')\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' : '\n') +
    entriesFormatted +
    (savedCount > 1 ? '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' : '') +
    (conflictCount > 0
      ? '\n⚠️ ' + conflictCount + ' date(s) have CONFLICTS with existing calendar events.\n'
      : '') +
    (fyiLines.length > 0
      ? '\nℹ️ FYI — OTHER SPACES ALSO HAVE EVENTS ON THIS DATE\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        fyiLines.join('\n') + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '(Different space — not a conflict.)\n'
      : '') +
    '\n👉 REVIEW & APPROVE:\n' + approvalLinks +
    '\n📊 View all in spreadsheet:\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl();

  MailApp.sendEmail({ to: ADMIN_EMAIL, subject: adminSubject, body: adminBody });

  return jsonResp({ success: true, saved: savedCount, conflicts: conflictCount });
}

// ============================================================
// GET EVENTS (calendar feed — accepts optional date range)
// ============================================================

function getEvents(e) {
  var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  var auth  = verifyToken(token);
  if (!auth.valid) return jsonResp({ error: 'Unauthorized' });

  var now, to;
  if (e.parameter.startDate && e.parameter.endDate) {
    now = new Date(e.parameter.startDate + 'T00:00:00');
    to  = new Date(e.parameter.endDate   + 'T23:59:59');
  } else {
    now = new Date();
    to  = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  }

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

// ============================================================
// ADMIN API — GET ROW BY ID
// ============================================================

function getAdminRow(e) {
  var token = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  var rowId = (e && e.parameter && e.parameter.id)    ? String(e.parameter.id)    : '';

  var auth = verifyToken(token);
  if (!auth.valid)          return jsonResp({ error: 'Unauthorized' });
  if (!isAdmin(auth.email)) return jsonResp({ error: 'Admin access required' });
  if (!rowId)               return jsonResp({ error: 'Missing row ID' });

  var sheet = getSheet();
  if (!sheet) return jsonResp({ error: 'Sheet not found' });

  var row = findRowById(sheet, rowId);
  if (!row) return jsonResp({ error: 'Request not found' });

  return jsonResp({ row: row });
}

// ============================================================
// ADMIN API — APPROVE
// ============================================================

function approveRowApi(data) {
  var auth = verifyToken(data.token);
  if (!auth.valid)          return jsonResp({ error: 'Unauthorized' });
  if (!isAdmin(auth.email)) return jsonResp({ error: 'Admin access required' });
  if (!data.id)             return jsonResp({ error: 'Missing row ID' });

  var sheet = getSheet();
  if (!sheet) return jsonResp({ error: 'Sheet not found' });

  var row = findRowById(sheet, data.id);
  if (!row) return jsonResp({ error: 'Request not found' });

  var statusCell = sheet.getRange(row.rowIndex, COL.STATUS);
  if (statusCell.getValue() === 'Approved') {
    return jsonResp({ success: true, message: 'Already approved' });
  }

  // Re-check for conflict at approval time
  var conflict = checkConflict(row.spaceId, row.date, row.startTime, row.endTime);
  if (conflict) {
    statusCell.setValue('CONFLICT').setBackground('#FEE2E2').setFontColor('#991B1B').setFontWeight('bold');
    sheet.getRange(row.rowIndex, COL.CONFLICT_NOTES)
      .setValue('Conflicts with: ' + conflict).setBackground('#FEE2E2').setFontColor('#991B1B');
    return jsonResp({ error: 'conflict', conflictNotes: conflict });
  }

  // Create calendar event
  var startDt = parseDateTime(row.date, row.startTime);
  var endDt   = parseDateTime(row.date, row.endTime);
  var calNote = '';
  try {
    var cal = CalendarApp.getCalendarById(CALENDAR_IDS[row.spaceId]);
    if (cal) {
      cal.createEvent(
        row.spaceName + ' — ' + row.teacherName + ' (' + row.gradeLevel + ')',
        startDt, endDt,
        { description: 'Purpose: ' + row.purpose + '\nRequested by: ' + row.teacherEmail }
      );
    }
  } catch (err) {
    calNote = 'Calendar event could not be created automatically: ' + err.message;
  }

  // Update sheet
  statusCell.setValue('Approved').setBackground('#DCFCE7').setFontColor('#166534').setFontWeight('normal');
  sheet.getRange(row.rowIndex, COL.APPROVE).setValue(true).setBackground('#DCFCE7');

  // Email teacher
  MailApp.sendEmail({
    to: row.teacherEmail,
    subject: '✅ Reservation Approved — ' + row.spaceName + ' on ' + formatDateLong(row.date),
    body:
      'Hi ' + row.teacherName + ',\n\n' +
      'Great news! Your space reservation has been approved.\n\n' +
      'APPROVED RESERVATION\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Space:    ' + row.spaceName + '\n' +
      'Purpose:  ' + row.purpose   + '\n' +
      'Grade:    ' + row.gradeLevel + '\n' +
      'Date:     ' + formatDateLong(row.date) + '\n' +
      'Time:     ' + formatTime12(row.startTime) + ' – ' + formatTime12(row.endTime) + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'This reservation is now on the SLAM Reservations calendar.\n' +
      (calNote ? '\nNote: ' + calNote + '\n' : '') +
      '\n— SLAM Athletics Administration'
  });

  return jsonResp({ success: true });
}

// ============================================================
// ADMIN API — DENY
// ============================================================

function denyRowApi(data) {
  var auth = verifyToken(data.token);
  if (!auth.valid)          return jsonResp({ error: 'Unauthorized' });
  if (!isAdmin(auth.email)) return jsonResp({ error: 'Admin access required' });
  if (!data.id)             return jsonResp({ error: 'Missing row ID' });

  var sheet = getSheet();
  if (!sheet) return jsonResp({ error: 'Sheet not found' });

  var row = findRowById(sheet, data.id);
  if (!row) return jsonResp({ error: 'Request not found' });

  var reason = (data.reason || '').trim() || 'No reason provided.';

  sheet.getRange(row.rowIndex, COL.STATUS)
    .setValue('Denied')
    .setBackground('#E5E7EB').setFontColor('#374151').setFontWeight('bold');

  MailApp.sendEmail({
    to: row.teacherEmail,
    subject: '❌ Reservation Request Denied — ' + row.spaceName + ' on ' + formatDateLong(row.date),
    body:
      'Hi ' + row.teacherName + ',\n\n' +
      'Unfortunately, your space reservation request has been denied.\n\n' +
      'REQUEST DETAILS\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Space:    ' + row.spaceName  + '\n' +
      'Purpose:  ' + row.purpose    + '\n' +
      'Grade:    ' + row.gradeLevel + '\n' +
      'Date:     ' + formatDateLong(row.date) + '\n' +
      'Time:     ' + formatTime12(row.startTime) + ' – ' + formatTime12(row.endTime) + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'REASON\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      reason + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      'Please visit the SLAM Reservations site to submit a new request if needed.\n\n' +
      '— SLAM Athletics Administration'
  });

  return jsonResp({ success: true });
}

// ============================================================
// ADMIN API — SEND CONFLICT EMAIL
// ============================================================

function sendConflictEmailApi(data) {
  var auth = verifyToken(data.token);
  if (!auth.valid)          return jsonResp({ error: 'Unauthorized' });
  if (!isAdmin(auth.email)) return jsonResp({ error: 'Admin access required' });
  if (!data.id)             return jsonResp({ error: 'Missing row ID' });

  var sheet = getSheet();
  if (!sheet) return jsonResp({ error: 'Sheet not found' });

  var row = findRowById(sheet, data.id);
  if (!row) return jsonResp({ error: 'Request not found' });

  MailApp.sendEmail({
    to: row.teacherEmail,
    subject: '⚠️ Reservation Conflict — ' + row.spaceName + ' on ' + formatDateLong(row.date),
    body:
      'Hi ' + row.teacherName + ',\n\n' +
      'Unfortunately, your space reservation request has a scheduling conflict and cannot be approved at this time.\n\n' +
      'YOUR REQUEST\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Space:    ' + row.spaceName  + '\n' +
      'Purpose:  ' + row.purpose    + '\n' +
      'Grade:    ' + row.gradeLevel + '\n' +
      'Date:     ' + formatDateLong(row.date) + '\n' +
      'Time:     ' + formatTime12(row.startTime) + ' – ' + formatTime12(row.endTime) + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      (row.conflictNotes ? 'CONFLICT\n' + row.conflictNotes + '\n\n' : '') +
      'Please visit the SLAM Reservations site to submit a new request for a different time or date.\n\n' +
      '— SLAM Athletics Administration'
  });

  sheet.getRange(row.rowIndex, COL.STATUS)
    .setValue('CONFLICT - Notified').setBackground('#FECACA').setFontColor('#7F1D1D');

  return jsonResp({ success: true });
}

// ============================================================
// AUTH & SHARED HELPERS
// ============================================================

function isAdmin(email) {
  return email === ADMIN_EMAIL;
}

function verifyToken(token) {
  if (!token) return { valid: false };
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
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

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function findRowById(sheet, rowId) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][COL.ROW_ID - 1]) === String(rowId)) {
      var r = values[i];
      return {
        id:            rowId,
        rowIndex:      i + 1,
        teacherEmail:  r[COL.SUBMITTED_BY    - 1],
        teacherName:   r[COL.TEACHER_NAME    - 1],
        gradeLevel:    r[COL.GRADE_LEVEL     - 1],
        purpose:       r[COL.PURPOSE         - 1],
        spaceId:       r[COL.SPACE           - 1],
        spaceName:     SPACE_LABELS[r[COL.SPACE - 1]] || r[COL.SPACE - 1],
        date:          normalizeDate(r[COL.DATE       - 1]),
        startTime:     normalizeTime(r[COL.START_TIME - 1]),
        endTime:       normalizeTime(r[COL.END_TIME   - 1]),
        status:        r[COL.STATUS          - 1],
        conflictNotes: r[COL.CONFLICT_NOTES  - 1] || ''
      };
    }
  }
  return null;
}

// ============================================================
// CONFLICT CHECK & FYI
// ============================================================

function checkConflict(spaceId, dateStr, startTimeStr, endTimeStr) {
  try {
    var calId = CALENDAR_IDS[spaceId];
    if (!calId) return null;
    var cal    = CalendarApp.getCalendarById(calId);
    if (!cal)  return null;
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
    return null;
  }
}

function getOtherSpaceEventsOnDate(excludeSpaceId, dateStr) {
  var fyi = [];
  try {
    var startDt = new Date(dateStr + 'T00:00:00');
    var endDt   = new Date(dateStr + 'T23:59:59');
    Object.keys(CALENDAR_IDS).forEach(function(spaceId) {
      if (spaceId === excludeSpaceId) return;
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
  } catch (err) {}
  return fyi;
}

// ============================================================
// APPROVAL TRIGGER (spreadsheet checkbox — col K)
// Run createApproveTrigger() once from the Apps Script editor.
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
  Logger.log('✅ Approval trigger installed.');
}

function onEditApprove(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (row <= 1) return;
  if (String(e.value) !== 'TRUE') return;
  if (col === COL.APPROVE)          handleApproval(sheet, row);
  else if (col === COL.NOTIFY_CONFLICT) handleConflictNotification(sheet, row);
}

function handleApproval(sheet, row) {
  var statusCell = sheet.getRange(row, COL.STATUS);
  if (statusCell.getValue() === 'Approved') return;

  var rowData      = sheet.getRange(row, 1, 1, 14).getValues()[0];
  var teacherEmail = rowData[COL.SUBMITTED_BY  - 1];
  var teacherName  = rowData[COL.TEACHER_NAME  - 1];
  var gradeLevel   = rowData[COL.GRADE_LEVEL   - 1];
  var purpose      = rowData[COL.PURPOSE       - 1];
  var spaceId      = rowData[COL.SPACE         - 1];
  var spaceName    = SPACE_LABELS[spaceId] || spaceId;
  var dateStr      = normalizeDate(rowData[COL.DATE       - 1]);
  var startTimeStr = normalizeTime(rowData[COL.START_TIME - 1]);
  var endTimeStr   = normalizeTime(rowData[COL.END_TIME   - 1]);

  var conflict = checkConflict(spaceId, dateStr, startTimeStr, endTimeStr);
  if (conflict) {
    sheet.getRange(row, COL.APPROVE).setValue(false);
    statusCell.setValue('CONFLICT').setBackground('#FEE2E2').setFontColor('#991B1B').setFontWeight('bold');
    sheet.getRange(row, COL.CONFLICT_NOTES).setValue('Conflicts with: ' + conflict).setBackground('#FEE2E2').setFontColor('#991B1B');
    var nc = sheet.getRange(row, COL.NOTIFY_CONFLICT);
    if (nc.getValue() === '' || nc.getValue() === false) nc.insertCheckboxes();
    nc.setValue(false).setBackground('#FEE2E2');
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: '⚠️ Approval Blocked — Conflict on ' + spaceName + ' (' + formatDateLong(dateStr) + ')',
      body: 'Approval blocked for ' + teacherName + '\'s reservation.\n\nConflicts with: ' + conflict
    });
    return;
  }

  var calNote = '';
  try {
    var cal = CalendarApp.getCalendarById(CALENDAR_IDS[spaceId]);
    if (cal) {
      cal.createEvent(
        spaceName + ' — ' + teacherName + ' (' + gradeLevel + ')',
        parseDateTime(dateStr, startTimeStr), parseDateTime(dateStr, endTimeStr),
        { description: 'Purpose: ' + purpose + '\nRequested by: ' + teacherEmail }
      );
    }
  } catch (err) { calNote = err.message; }

  statusCell.setValue('Approved').setBackground('#DCFCE7').setFontColor('#166534').setFontWeight('normal');
  sheet.getRange(row, COL.APPROVE).setBackground('#DCFCE7');

  MailApp.sendEmail({
    to: teacherEmail,
    subject: '✅ Reservation Approved — ' + spaceName + ' on ' + formatDateLong(dateStr),
    body:
      'Hi ' + teacherName + ',\n\nYour space reservation has been approved.\n\n' +
      'Space: ' + spaceName + ' | Date: ' + formatDateLong(dateStr) +
      ' | Time: ' + formatTime12(startTimeStr) + ' – ' + formatTime12(endTimeStr) + '\n\n' +
      (calNote ? 'Note: ' + calNote + '\n\n' : '') +
      '— SLAM Athletics Administration'
  });
}

function handleConflictNotification(sheet, row) {
  var statusCell = sheet.getRange(row, COL.STATUS);
  if (statusCell.getValue() === 'CONFLICT - Notified') return;

  var rowData       = sheet.getRange(row, 1, 1, 14).getValues()[0];
  var teacherEmail  = rowData[COL.SUBMITTED_BY   - 1];
  var teacherName   = rowData[COL.TEACHER_NAME   - 1];
  var spaceId       = rowData[COL.SPACE          - 1];
  var spaceName     = SPACE_LABELS[spaceId] || spaceId;
  var dateStr       = normalizeDate(rowData[COL.DATE       - 1]);
  var startTimeStr  = normalizeTime(rowData[COL.START_TIME - 1]);
  var endTimeStr    = normalizeTime(rowData[COL.END_TIME   - 1]);
  var conflictNotes = rowData[COL.CONFLICT_NOTES - 1];

  MailApp.sendEmail({
    to: teacherEmail,
    subject: '⚠️ Reservation Conflict — ' + spaceName + ' on ' + formatDateLong(dateStr),
    body:
      'Hi ' + teacherName + ',\n\nYour reservation has a scheduling conflict and cannot be approved.\n\n' +
      'Space: ' + spaceName + ' | Date: ' + formatDateLong(dateStr) +
      ' | Time: ' + formatTime12(startTimeStr) + ' – ' + formatTime12(endTimeStr) + '\n\n' +
      (conflictNotes ? 'Conflict: ' + conflictNotes + '\n\n' : '') +
      'Please submit a new request for a different time.\n\n— SLAM Athletics Administration'
  });

  statusCell.setValue('CONFLICT - Notified').setBackground('#FECACA').setFontColor('#7F1D1D');
  sheet.getRange(row, COL.NOTIFY_CONFLICT).setBackground('#FECACA');
}

// ── Date/Time normalizers ─────────────────────────────────────

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
    return String(val.getHours()).padStart(2, '0') + ':' + String(val.getMinutes()).padStart(2, '0');
  }
  return String(val);
}

function parseDateTime(dateStr, timeStr) {
  var parts = timeStr.split(':');
  var dt    = new Date(dateStr + 'T00:00:00');
  dt.setHours(parseInt(parts[0]) || 0, parseInt(parts[1]) || 0, 0, 0);
  return dt;
}
