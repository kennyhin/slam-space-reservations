// ============================================================
// Code.gs — SLAM Space Reservations — Google Apps Script Backend
// ============================================================
// Deploy this as a Web App:
//   Execute as: Me
//   Who has access: Anyone with a Google account
//
// After deploying, copy the Web App URL into js/config.js
// ============================================================

// ---- CONFIGURATION -----------------------------------------
// Update these Calendar IDs to match your Google Calendars.
// Find each Calendar ID in Google Calendar:
//   Settings → click the calendar → "Calendar ID" field
// ------------------------------------------------------------
const CALENDAR_IDS = {
  'cafegym':            'YOUR_CAFEGYM_CALENDAR_ID@group.calendar.google.com',
  'es-turf':            'YOUR_ES_TURF_CALENDAR_ID@group.calendar.google.com',
  'kinder-playground':  'YOUR_KINDER_CALENDAR_ID@group.calendar.google.com',
};

// Name of the Google Sheet tab where submissions are logged
const SHEET_NAME = 'Reservations';

// Only emails from this domain are allowed to use the system
const ALLOWED_DOMAIN = 'slamnv.org';

// How many days ahead to return events for the calendar view
const DAYS_AHEAD = 90;

// ============================================================
// ENTRY POINTS
// ============================================================

function doGet(e) {
  try {
    // CORS preflight
    if (e.parameter.action === 'ping') {
      return jsonResponse({ ok: true });
    }

    // Verify the Google ID token sent from the frontend
    const token = e.parameter.token;
    const auth = verifyToken(token);
    if (!auth.valid) {
      return jsonResponse({ error: 'Unauthorized', message: auth.message }, 403);
    }

    const events = getAllCalendarEvents();
    return jsonResponse({ success: true, events });

  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return jsonResponse({ error: err.message }, 500);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Verify the Google ID token
    const auth = verifyToken(data.token);
    if (!auth.valid) {
      return jsonResponse({ error: 'Unauthorized', message: auth.message }, 403);
    }

    // Validate required fields
    const required = ['teacherName', 'gradeLevel', 'purpose', 'space', 'date', 'startTime', 'endTime'];
    for (const field of required) {
      if (!data[field]) {
        return jsonResponse({ success: false, message: `Missing field: ${field}` });
      }
    }

    // Check that the space is valid
    if (!CALENDAR_IDS[data.space]) {
      return jsonResponse({ success: false, message: 'Invalid space selected.' });
    }

    // Check for scheduling conflicts before saving
    const conflict = checkConflict(data.space, data.date, data.startTime, data.endTime);
    if (conflict) {
      return jsonResponse({
        success: false,
        conflict: true,
        message: `This space already has a reservation during that time: "${conflict.title}". Please choose a different time or space.`,
      });
    }

    // Save the request to Google Sheets as Pending
    saveToSheet(data, auth.email);

    return jsonResponse({
      success: true,
      message: 'Your reservation request has been submitted and is pending admin approval.',
    });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ error: err.message }, 500);
  }
}

// ============================================================
// TOKEN VERIFICATION
// ============================================================
// Validates the Google ID token sent from the browser.
// Calls Google's tokeninfo endpoint to confirm authenticity
// and checks that the email belongs to the allowed domain.
// ============================================================

function verifyToken(token) {
  if (!token) return { valid: false, message: 'No token provided.' };

  try {
    const res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    const payload = JSON.parse(res.getContentText());

    if (payload.error || !payload.email) {
      return { valid: false, message: 'Invalid or expired token. Please refresh and sign in again.' };
    }

    if (!payload.email.endsWith('@' + ALLOWED_DOMAIN)) {
      return { valid: false, message: 'Email domain not permitted.' };
    }

    return { valid: true, email: payload.email, name: payload.name };

  } catch (err) {
    Logger.log('Token verification failed: ' + err.message);
    return { valid: false, message: 'Token verification failed.' };
  }
}

// ============================================================
// CALENDAR — READ
// ============================================================

function getAllCalendarEvents() {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + DAYS_AHEAD);

  const allEvents = [];

  for (const [spaceId, calendarId] of Object.entries(CALENDAR_IDS)) {
    try {
      const cal = CalendarApp.getCalendarById(calendarId);
      if (!cal) {
        Logger.log('Calendar not found: ' + calendarId);
        continue;
      }

      const events = cal.getEvents(now, future);

      for (const event of events) {
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

  // Sort by start time
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  return allEvents;
}

// ============================================================
// CONFLICT CHECK
// ============================================================
// Checks whether the requested space already has a calendar
// event that overlaps with the requested date/time window.
// ============================================================

function checkConflict(space, date, startTime, endTime) {
  const calendarId = CALENDAR_IDS[space];
  if (!calendarId) return null;

  // Build Date objects from the date + time strings
  const startDt = new Date(date + 'T' + startTime + ':00');
  const endDt   = new Date(date + 'T' + endTime   + ':00');

  // Shrink window by 1 minute on each side so back-to-back
  // reservations (e.g. 9:00–10:00 and 10:00–11:00) don't conflict
  const checkStart = new Date(startDt.getTime() + 60000);
  const checkEnd   = new Date(endDt.getTime()   - 60000);

  try {
    const cal = CalendarApp.getCalendarById(calendarId);
    if (!cal) return null;

    const conflicts = cal.getEvents(checkStart, checkEnd);
    if (conflicts.length > 0) {
      return { title: conflicts[0].getTitle() };
    }
  } catch (err) {
    Logger.log('Conflict check error: ' + err.message);
  }

  return null;
}

// ============================================================
// GOOGLE SHEETS — SAVE SUBMISSION
// ============================================================

function saveToSheet(data, submitterEmail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  // Create the sheet and header row if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'Timestamp', 'Submitted By', 'Teacher Name', 'Grade Level',
      'Purpose', 'Space', 'Date', 'Start Time', 'End Time', 'Status'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0B0B0B')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 160);
  }

  sheet.appendRow([
    new Date(),          // Timestamp
    submitterEmail,      // Submitted By (from verified Google token)
    data.teacherName,
    data.gradeLevel,
    data.purpose,
    data.space,
    data.date,
    data.startTime,
    data.endTime,
    'Pending',           // Status — admin changes this to Approved/Denied
  ]);
}

// ============================================================
// ADMIN FUNCTION — Approve a reservation
// ============================================================
// HOW TO USE:
// 1. Open the Google Sheet
// 2. Click on any cell in the row you want to approve
// 3. In Apps Script editor: Run → approveReservation
// OR add a custom menu (see addAdminMenu below)
// ============================================================

function approveReservation() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('No Reservations sheet found.');
    return;
  }

  const row = sheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Please click on a data row first (not the header).');
    return;
  }

  const values = sheet.getRange(row, 1, 1, 10).getValues()[0];
  const [timestamp, submitter, teacherName, gradeLevel, purpose, space, date, startTime, endTime, status] = values;

  if (status === 'Approved') {
    SpreadsheetApp.getUi().alert('This reservation is already approved.');
    return;
  }

  if (status === 'Denied') {
    SpreadsheetApp.getUi().alert('This reservation was denied. Change the status to Pending first if you want to re-approve.');
    return;
  }

  // Final conflict check before approving
  const conflict = checkConflict(space, String(date), String(startTime), String(endTime));
  if (conflict) {
    SpreadsheetApp.getUi().alert(
      '⚠️ Conflict detected!\n\n"' + conflict.title + '" is already scheduled in the ' + space + ' during this time.\n\nApproval cancelled.'
    );
    return;
  }

  // Add to the correct Google Calendar
  const calendarId = CALENDAR_IDS[space];
  if (!calendarId) {
    SpreadsheetApp.getUi().alert('Calendar ID not found for space: ' + space);
    return;
  }

  const cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) {
    SpreadsheetApp.getUi().alert('Could not access calendar for space: ' + space + '\nCheck that the Calendar ID in CALENDAR_IDS is correct.');
    return;
  }

  const startDt = new Date(date + 'T' + startTime + ':00');
  const endDt   = new Date(date + 'T' + endTime   + ':00');

  const title = purpose + ' — ' + teacherName + ' (' + gradeLevel + ')';
  const description =
    'Teacher: ' + teacherName + '\n' +
    'Grade: '   + gradeLevel  + '\n' +
    'Purpose: ' + purpose     + '\n' +
    'Space: '   + space       + '\n' +
    'Submitted by: ' + submitter;

  cal.createEvent(title, startDt, endDt, { description });

  // Mark the row as Approved in the sheet
  sheet.getRange(row, 10).setValue('Approved').setBackground('#D1FAE5').setFontColor('#065F46');

  SpreadsheetApp.getUi().alert('✅ Approved!\n\n"' + title + '" has been added to the ' + space + ' calendar.');
}

// ---- Deny a reservation (marks row, does not touch calendar) ----
function denyReservation() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const row = sheet.getActiveRange().getRow();
  if (row < 2) { SpreadsheetApp.getUi().alert('Please select a data row.'); return; }

  sheet.getRange(row, 10).setValue('Denied').setBackground('#FEE2E2').setFontColor('#991B1B');
  SpreadsheetApp.getUi().alert('Reservation marked as Denied.');
}

// ============================================================
// ADMIN MENU — adds "SLAM Reservations" menu to the Sheet
// ============================================================
// This runs automatically when the spreadsheet is opened.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SLAM Reservations')
    .addItem('✅ Approve Selected Row', 'approveReservation')
    .addItem('❌ Deny Selected Row',    'denyReservation')
    .addToUi();
}

// ============================================================
// HELPERS
// ============================================================

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
