// ============================================================
// config.js — Edit this file to configure the site
// ============================================================
// This is the only file you need to update for your setup.
// Change the values below to match your Google project.
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  // 1. Your deployed Google Apps Script Web App URL
  //    (You get this after deploying Code.gs as a web app)
  // ----------------------------------------------------------
  SCRIPT_URL: 'https://script.google.com/a/macros/slamnv.org/s/AKfycbwxkxgPt2kjOfGjtwKwQSGO3bIAbG5TYOGVApTvbcH-lXFT5VjTaFYllnMa4xEl1teT/exec',

  // ----------------------------------------------------------
  // 2. Google OAuth Client ID
  //    From: console.cloud.google.com → APIs & Services → Credentials
  // ----------------------------------------------------------
  GOOGLE_CLIENT_ID: '180888278400-gjvc3nen005k7m95dejbm0oohn0rucmm.apps.googleusercontent.com',

  // ----------------------------------------------------------
  // 3. Allowed email domain — only these users can log in
  // ----------------------------------------------------------
  ALLOWED_DOMAIN: 'slamnv.org',

  // ----------------------------------------------------------
  // 4. Reservable spaces
  //    Add or remove spaces here. calendarId comes from
  //    Google Calendar → Settings → Calendar ID field.
  // ----------------------------------------------------------
  SPACES: [
    {
      id: 'cafegym',
      label: 'Cafegym',
      color: '#E31837',
      calendarId: 'c_312121ab4260fc7d2045f8298fd1aa135c36d62f7dba93137d4a70c177b5ce72@group.calendar.google.com',
    },
    {
      id: 'es-turf',
      label: 'ES Turf',
      color: '#8CC63F',
      calendarId: 'c_a5a420a35120dc73009599256852b43f3707ca70a2af0ea6b3de2311d5cfce7a@group.calendar.google.com',
    },
    {
      id: 'kinder-playground',
      label: 'Kinder Playground',
      color: '#2D3748',
      calendarId: 'c_e58aaacc91b7d88d6dc7937e2ee8a1799d1efdc338f60f3daefa301cdd25c91b@group.calendar.google.com',
    },
  ],

  // ----------------------------------------------------------
  // 5. Grade levels shown in the form
  // ----------------------------------------------------------
  GRADE_LEVELS: ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', 'Staff / Admin'],

  // ----------------------------------------------------------
  // 6. How many days ahead to show on the calendar
  // ----------------------------------------------------------
  DAYS_AHEAD: 90,
};
