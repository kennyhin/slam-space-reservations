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
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyJjRxfxRdR2guWfqYwnnCu8X19zuvq8mRYYhGMHbzb46K9MGO3OlctWUFqU_Uu_Ddg/exec',

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
  // 5. Grade / role groups shown in Step 1 of the form
  //    Top-level click reveals sub-options. `value` is what gets
  //    stored + emailed; `label` is what the button shows.
  //    "Coach" has no subs — it selects directly and triggers the
  //    coach practice-schedule flow.
  // ----------------------------------------------------------
  GRADE_GROUPS: [
    {
      id: 'elementary',
      label: 'Elementary',
      icon: '🎒',
      subs: [
        { value: 'Kinder', label: 'Kinder' },
        { value: '1st Grade', label: '1st Grade' },
        { value: '2nd Grade', label: '2nd Grade' },
        { value: '3rd Grade', label: '3rd Grade' },
        { value: '4th Grade', label: '4th Grade' },
        { value: '5th Grade', label: '5th Grade' },
        { value: 'ES Specialist', label: 'Specialist' },
        { value: 'ES Special Teams', label: 'Special Teams' },
        { value: 'ES Admin', label: 'Admin' },
        { value: 'ES Instructional Assistant', label: 'Instructional Assistant' },
        { value: 'ES Instructional Coach', label: 'Instructional Coach' },
        { value: 'ES Office Staff', label: 'Office Staff' },
      ],
    },
    {
      id: 'middle',
      label: 'Middle School',
      icon: '📚',
      subs: [
        { value: '6th Grade', label: '6th Grade' },
        { value: '7th Grade', label: '7th Grade' },
        { value: '8th Grade', label: '8th Grade' },
        { value: 'MS Special Teams', label: 'Special Teams' },
        { value: 'MS Admin', label: 'Admin' },
        { value: 'MS Instructional Assistant', label: 'Instructional Assistant' },
        { value: 'MS Instructional Coach', label: 'Instructional Coach' },
        { value: 'MS Office Staff', label: 'Office Staff' },
      ],
    },
    {
      id: 'high',
      label: 'High School',
      icon: '🎓',
      subs: [
        { value: '9th Grade', label: '9th Grade' },
        { value: '10th Grade', label: '10th Grade' },
        { value: '11th Grade', label: '11th Grade' },
        { value: '12th Grade', label: '12th Grade' },
        { value: 'HS Special Teams', label: 'Special Teams' },
        { value: 'HS Admin', label: 'Admin' },
        { value: 'HS Instructional Assistant', label: 'Instructional Assistant' },
        { value: 'HS Instructional Coach', label: 'Instructional Coach' },
        { value: 'HS Office Staff', label: 'Office Staff' },
      ],
    },
    {
      id: 'coach',
      label: 'Coach',
      icon: '🏆',
      directValue: 'Coach',   // no subs — click sets gradeLevel = 'Coach'
    },
  ],

  // ----------------------------------------------------------
  // 6. How many days ahead to show on the calendar
  // ----------------------------------------------------------
  DAYS_AHEAD: 90,
};
