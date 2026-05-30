# SLAM Space Reservations — Full Agent Handoff Document

> **For:** Hermes or any AI agent picking up this project  
> **Owner:** Kenny Hin, Athletic Director, SLAM! Nevada  
> **Contact:** kenny.hin@slamnv.org  
> **Last updated:** May 2026

---

## 1. What This Is

A private web app (staff only) that lets SLAM! Nevada teachers reserve shared school spaces — the Cafegym, ES Turf, and Kinder Playground. Teachers sign in with their `@slamnv.org` Google account, fill out a 5-step form, and Kenny (the admin) gets an email. He opens the linked Google Sheet, clicks the row, and uses the SLAM Reservations menu to approve. Approval emails the teacher back and adds the event to Kenny's personal Google Calendar.

There is also a second project — **Coach Kenny's landing page** at `/Users/wasabi/Coach Kenny/index.html` — which is a personal landing page at `coachkenny.org`. Documented briefly in Section 9.

---

## 2. Where Everything Lives

| Location | What it is |
|---|---|
| `/Users/wasabi/Use of Space Request Form/` | The main project folder |
| GitHub repo | `https://github.com/kennyhin/slam-space-reservations` |
| Live site | `https://kennyhin.github.io/slam-space-reservations` |
| Google Sheet | Linked to the Apps Script (URL is in the admin email body) |
| Apps Script | Bound to the Google Sheet (not standalone) |
| Coach Kenny page | `/Users/wasabi/Coach Kenny/index.html` (separate repo) |

### File tree (only the files that matter):
```
Use of Space Request Form/
├── index.html          ← Calendar/dashboard page (the landing page after login)
├── reserve.html        ← Reservation form page
├── css/
│   └── styles.css      ← ALL styles — one file, no preprocessor
├── js/
│   ├── config.js       ← THE only file to edit for configuration changes
│   ├── auth.js         ← Google Sign-In logic (don't touch unless auth breaks)
│   ├── calendar.js     ← Calendar view + mini calendar + right detail panel
│   └── form.js         ← 5-step reservation wizard + live preview card
├── images/
│   ├── slam-bull.png   ← Bull logo used on the auth/sign-in screen
│   └── slam-logo.png   ← SLAM script logo (hidden in header, shown on auth)
└── gas/
    └── Code.gs         ← Google Apps Script backend (must be pasted into Apps Script editor)
```

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Hosting | GitHub Pages (free, auto-deploys on push to `main`) |
| Auth | Google Identity Services (GSI) — OAuth2 JWT tokens |
| Calendar UI | FullCalendar v6 (CDN) |
| Backend | Google Apps Script (doGet / doPost web app) |
| Data store | Google Sheets (one sheet named "Reservations") |
| Email | Gmail via MailApp in Apps Script |
| Calendar events | Google Calendar API via CalendarApp in Apps Script |
| Fonts | Google Fonts — Barlow Condensed (headings) + Inter (body) |
| CSS | Vanilla CSS, no framework, no preprocessor |
| JS | Vanilla JS, no framework, no bundler |

**No npm, no node, no build step.** Everything is served statically from GitHub Pages. Push to `git push origin main` and it's live in 1-2 minutes.

---

## 4. Brand / Design System

### SLAM! Nevada Official Colors
| Name | Hex | Usage |
|---|---|---|
| PMS 186C Red | `#C8102E` | Primary — buttons, active states, today indicator, progress dots |
| PMS 802C Green | `#A8D400` | Accent — mini calendar dots, sidebar button glow, completed steps |
| Cool Gray 8C | `#888B8D` | Secondary text, Kinder Playground space color |
| PMS Black | `#0B0B0B` | Header, auth overlay, dark elements |
| PMS White | `#FFFFFF` | Card backgrounds, text on dark |

### CSS Variables (defined at top of `styles.css`)
```css
--primary:     #C8102E   /* Red — use for all interactive elements */
--slam-green:  #A8D400   /* Green — use for accents only, NOT button text bg */
--slam-gray:   #888B8D
--slam-black:  #0B0B0B
--slam-white:  #FFFFFF
--gray-light:  #F4F4F4   /* Page background */
--gray-border: #E8E8E8
```

### Fonts
- **Barlow Condensed** (700) — all headings, labels, progress steps, buttons
- **Inter** (400/500/600/700) — all body text, inputs, form content
- Dancing Script was added but is not currently in use (was removed from header)

### Key design principles
- Header is **white and very subtle** — small 50px height, Barlow Condensed text, all muted grays
- The 3-column app layout is **Notion-inspired** (gray sidebar | white main | gray sidebar)
- Form page is **2-column** on desktop (form left, preview card right), **stacked** on mobile
- No footer (hidden with `display: none !important` in CSS)

---

## 5. Page Architecture

### `index.html` — Calendar Dashboard

**Layout:** 3-column CSS grid (`.app-layout`)
```
[240px Left Sidebar] | [1fr Main Calendar] | [268px Right Panel]
Height: calc(100vh - 50px) — fills the full screen
```

**Left Sidebar (`.sidebar-left`):**
- Mini month calendar (rendered by `MiniCal` object in `calendar.js`)
- Click a date → main calendar navigates to that date
- Days with events have a small green dot underneath
- Space legend (colored dots + labels, built from `CONFIG.SPACES`)
- "Reserve a Space" button — SLAM red, shimmer + pulse animation

**Main Calendar (`.calendar-main`):**
- FullCalendar v6 in `timeGridFiveDays` view (custom 5-day rolling view)
- Time range: 9am–6pm (`slotMinTime: '09:00:00'`, `slotMaxTime: '18:00:00'`)
- Events display as colored cards with bold title + time
- Red now-indicator line with dot tracks current time
- View switcher: **5 Days | Month | List** (top right of calendar toolbar)
- Hovering empty time slots shows `+ Reserve` cue
- Hovering month cells shows `+ Reserve` badge at bottom-right
- **Clicking any empty slot/date** navigates to `reserve.html?date=YYYY-MM-DD` (pre-fills date)
- **Clicking an event** shows details in the right panel

**Right Panel (`.sidebar-right`):**
- Default state: shows **Upcoming Next 2 Weeks** — chronological list, click any item for details
- When event clicked: shows full detail (space chip, date, time, notes)
- "← Back to Upcoming" button returns to the list
- On mobile (< 900px): sidebars are hidden, falls back to modal for event details

**Mobile behavior:**
- Both sidebars hidden below 900px
- Calendar fills full screen
- Event click → modal popup (`.modal-overlay`)

---

### `reserve.html` — Reservation Form

**Layout:** 2-column on desktop (form left, preview card right), stacks to 1-column on mobile

**Form Wizard — 5 Steps (built by `form.js`):**

| Step | ID | What it collects |
|---|---|---|
| 1 — Info | `step-1` | Teacher full name (text) + Grade level (bubble buttons) |
| 2 — Purpose | `step-2` | Short description (textarea) + quick-pick chips |
| 3 — Space | `step-3` | Which space (large bubble buttons with colored dots) |
| 4 — Date & Time | `step-4` | Date input + two custom time pickers |
| 5 — Review | `step-5` | Summary card + submit button |

**Grade levels** (from `CONFIG.GRADE_LEVELS`):
```
Kinder / 1st / 2nd / 3rd / 4th / 5th / Staff
```

**Quick Picks** (hardcoded in `form.js`):
```
🍭 Popsicle Party | 💧 Water Day | 🎨 Fingerpainting | 🌈 Tie Dye Party
```

**Custom Time Picker (step 4):**
- Built entirely in JavaScript — no native `<input type="time">` (was blue and ugly)
- Hours: 1–12 dropdown | Minutes: every 5 min (00,05,10...55) | AM/PM toggle (red when active)
- Methods: `_buildTimePicker(fieldId, initialValue)`, `_getTimeValue(fieldId)`, `_setAMPM(fieldId, val)`, `_onTimeChange(fieldId)`

**Live Preview Card:**
- Appears to right of form on desktop, stacks below on mobile
- Updates in real-time as user types/selects each field
- Shows: colored bar (space color), title (purpose), Who/Grade/Space/Date/Time
- Space shown as a colored chip
- On **Step 5**: preview card hides and form centers at max-width 640px
- Controlled by `.reserve-layout.step-review` CSS class toggled in `_showStep()`

**URL Parameter Pre-fill:**
- `reserve.html?date=2026-08-04` pre-fills the date field in step 4
- Set in `form.js` → `init()`: reads `new URLSearchParams(window.location.search).get('date')`
- Calendar triggers this when user clicks an empty slot

**Back to Calendar link:**
- `← Back to Calendar` text link at top of page, links to `index.html`

---

## 6. JavaScript Objects

### `Auth` (auth.js)
Handles Google Sign-In, domain restriction, session storage.

```javascript
Auth.init({ onSuccess, onNeedSignIn, onWrongDomain })  // Call on page load
Auth.signOut()        // Clears session, reloads page
Auth.getToken()       // Returns current JWT token (for API calls)
```

- Stores session in `sessionStorage` as `slam_auth` (token + user info + expiry)
- Tokens from Google last ~1 hour
- Only allows `@slamnv.org` emails (set in `CONFIG.ALLOWED_DOMAIN`)
- Uses Google One Tap + renders sign-in button into `#google-signin-btn`

### `MiniCal` (calendar.js)
Left sidebar mini month calendar.

```javascript
MiniCal.init()            // Called once after auth, renders current month
MiniCal.prev()            // Previous month (called by ‹ button)
MiniCal.next()            // Next month (called by › button)
MiniCal.gotoDate(y,m,d)   // Navigates main FC calendar to this date
MiniCal.render()          // Re-renders the grid (called after events load)
```

- Gets event dates from `CalendarView.getEventDates()` to show green dots

### `CalendarView` (calendar.js)
Main FullCalendar controller + right panel.

```javascript
CalendarView.init()                    // Called once after auth
CalendarView.fetchEvents()             // Fetches from Apps Script, populates FC + mini cal
CalendarView.getEventDates()           // Returns Set of 'YYYY-MM-DD' strings (for mini-cal dots)
CalendarView._showEventDetail(event)   // Populates right panel with event details
CalendarView._showEventDetailById(id)  // Same but by calendar event ID
CalendarView._renderUpcomingInPanel()  // Shows next 2 weeks in right panel
CalendarView.clearDetail()             // Resets right panel to upcoming list
CalendarView.closeModal()              // Closes mobile event modal
```

**FullCalendar config highlights:**
```javascript
initialView: 'timeGridFiveDays'        // Custom 5-day rolling view
slotMinTime: '09:00:00'
slotMaxTime: '18:00:00'
nowIndicator: true                     // Red line + dot at current time
dateClick: (info) => navigate to reserve.html with date param
```

### `ReservationForm` (form.js)
The 5-step form wizard.

```javascript
ReservationForm.init()              // Called after auth on reserve.html
ReservationForm.next()              // Validate + advance step
ReservationForm.back()              // Go back one step
ReservationForm.submit()            // POST to Apps Script
ReservationForm.reset()             // Start over (after submission)
ReservationForm._updatePreview()    // Refreshes the live preview card
ReservationForm._buildTimePicker(fieldId, initialValue)  // Renders custom time picker
ReservationForm._getTimeValue(fieldId)   // Reads custom picker → 'HH:MM' string
ReservationForm._setAMPM(fieldId, val)   // Toggles AM/PM button
ReservationForm._onTimeChange(fieldId)   // Updates data + preview when time changes
```

**Data object:**
```javascript
ReservationForm.data = {
  teacherName: '',
  gradeLevel: '',
  purpose: '',
  space: '',        // One of: 'cafegym', 'es-turf', 'kinder-playground'
  date: '',         // YYYY-MM-DD
  startTime: '',    // HH:MM (24h)
  endTime: '',      // HH:MM (24h)
}
```

---

## 7. config.js — The Only File You Normally Edit

```javascript
const CONFIG = {
  SCRIPT_URL: 'https://script.google.com/a/macros/slamnv.org/s/...',  // Apps Script URL
  GOOGLE_CLIENT_ID: '180888278400-gjvc3nen005k7m95...',               // Google Cloud OAuth client
  ALLOWED_DOMAIN: 'slamnv.org',

  SPACES: [
    { id: 'cafegym',          label: 'Cafegym',          color: '#E31837', calendarId: '...' },
    { id: 'es-turf',          label: 'ES Turf',          color: '#8CC63F', calendarId: '...' },
    { id: 'kinder-playground',label: 'Kinder Playground', color: '#2D3748', calendarId: '...' },
  ],

  GRADE_LEVELS: ['Kinder', '1st', '2nd', '3rd', '4th', '5th', 'Staff'],

  DAYS_AHEAD: 90,
};
```

**To add a new space:** Add to `SPACES` array in `config.js` AND add the `calendarId` to `CALENDAR_IDS` in `Code.gs`.

**To change the Apps Script URL:** Happens when you redeploy as a new version. Update `SCRIPT_URL` here.

---

## 8. Google Apps Script Backend (Code.gs)

### How to access it
1. Open the Google Sheet (Kenny has the link — it's in every admin notification email)
2. Extensions → Apps Script
3. The file `Code.gs` should already be there (it's bound to the sheet)

### Endpoints

**GET** `?action=getEvents&token=JWT_TOKEN`
- Verifies token against Google's OAuth endpoint
- Returns all calendar events for next 90 days from all 3 space calendars
- Response: `{ events: [ { id, title, start, end, space, description } ] }`

**POST** body: JSON with `{ action: 'submit', token, teacherName, gradeLevel, purpose, space, date, startTime, endTime }`
- Verifies token
- Checks for scheduling conflicts (±1 min buffer)
- Saves row to "Reservations" sheet
- Emails teacher (confirmation) + Kenny (notification with sheet link)
- Response: `{ success: true }` or `{ success: false, conflict: true, message: '...' }`

### Sheet columns
```
A: Timestamp | B: Submitted By (email) | C: Teacher Name | D: Grade Level
E: Purpose | F: Space ID | G: Date | H: Start Time | I: End Time
J: Status (Pending/Approved/Denied) | K: Checkbox (to approve)
```

### Approval workflow
1. Kenny receives email: "New reservation request from [Teacher] | [Space] | [Date]" with link to sheet
2. Kenny opens sheet, clicks the row with the pending request
3. Clicks **SLAM Reservations → ✅ Approve Selected Row** in the Google Sheets menu
4. Apps Script:
   - Creates a calendar event on **Kenny's personal calendar** (kenny.hin@slamnv.org) — title: `Purpose (TeacherName)`, description: `SpaceName · Grade`
   - Changes row status to **Approved** (green)
   - Emails teacher: "Your reservation has been approved!"
   - Shows popup with Google Calendar link for that month
5. Kenny manually moves the event to the correct space calendar if needed

> **Important:** The script writes to Kenny's PERSONAL calendar via `CalendarApp.getDefaultCalendar()`. This is intentional — Kenny doesn't own the space calendars, so direct write access is blocked by Google Workspace for Education.

### First-time setup (if Apps Script is reset)
1. Paste the entire Code.gs into Apps Script
2. Select `setup` from the function dropdown
3. Click Run ▶ — grant all permissions
4. Then click **Deploy → Manage Deployments** (or **New Deployment**)
5. Type: **Web App**, execute as: **Me**, access: **Anyone** (within the organization)
6. Copy the new URL and paste it into `CONFIG.SCRIPT_URL` in `config.js`
7. Push to GitHub

### Known quirks / gotchas
- **No onEdit trigger** — the old approach used checkbox clicks to auto-approve, but `onEdit` triggers can't use `CalendarApp` or `MailApp` due to Google Workspace EDU restrictions. Menu-only approval is the intentional fix.
- **showModalDialog blocked** — Google Workspace for Education blocks `HtmlService.showModalDialog`. Use `ui.alert()` only.
- **CalendarApp.getCalendarById()** — only works for calendars Kenny OWNS. The space calendars are managed by others, so reading events is possible but writing is blocked. That's why approvals go to his personal calendar.

---

## 9. Deployment

### Pushing changes
```bash
cd "/Users/wasabi/Use of Space Request Form"
git add -A
git commit -m "Description of change"
git push origin main
```
GitHub Pages auto-deploys. Live in ~1-2 minutes at `https://kennyhin.github.io/slam-space-reservations`.

### Git config (already set in this repo)
```
user.name = Kenny Hin
user.email = kenny.hin@slamnv.org
```

### GitHub Pages settings
- Repo: `kennyhin/slam-space-reservations`
- Branch: `main`, root `/`
- No custom domain on this repo (the main site is on GitHub Pages default URL)

---

## 10. CSS Architecture

All styles are in one file: `css/styles.css`. The sections in order:

1. **`:root` variables** — All color/spacing tokens
2. **Reset** — Box-sizing, base styles
3. **Auth overlay** — Sign-in screen styles (dark, centered)
4. **Site header** — White, 50px tall, very subtle
5. **App layout** — 3-column Notion grid (`index.html` only)
6. **Left sidebar** — Mini cal, legend, reserve button
7. **Main calendar area** — White center column
8. **FullCalendar overrides** — Light theme, event cards, now indicator, hover `+`
9. **Right detail panel** — Upcoming list + event detail view
10. **Reserve page layout** — 2-col grid + preview card
11. **Live preview card** — Event card preview
12. **Modal** — Mobile event detail fallback
13. **Page layout** — `.page-content` used by `reserve.html`
14. **Form wizard** — Progress bar, steps, bubbles, time picker
15. **Footer** — `display: none !important` (hidden)
16. **Responsive** — Two breakpoints: 1100px (tighten columns) and 700px (stack everything)

### Key CSS classes to know
| Class | What it does |
|---|---|
| `.app-layout` | 3-col grid on `index.html` — `240px 1fr 268px` |
| `.sidebar-left` | Left gray sidebar |
| `.calendar-main` | White center column |
| `.sidebar-right` | Right gray sidebar |
| `.reserve-layout` | 2-col on reserve.html — `1fr 250px` |
| `.reserve-layout.step-review` | Step 5: single column, preview hidden |
| `.preview-card` | Live preview card (sticky on desktop) |
| `.tp` | Custom time picker component |
| `.tp-ampm-btn.active` | Red AM/PM button |
| `.reserve-btn-sidebar` | Animated red sidebar button |

---

## 11. Common Edit Tasks

### Add a new quick-pick chip
In `form.js`, find the `suggestion-chips` section and add:
```html
<button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Your Text')">Your Text</button>
```

### Add a new grade level
In `config.js`, add to `GRADE_LEVELS` array:
```javascript
GRADE_LEVELS: ['Kinder', '1st', '2nd', '3rd', '4th', '5th', '6th', 'Staff'],
```

### Add a new reservable space
1. In `config.js`, add to `SPACES`:
```javascript
{ id: 'gym', label: 'Main Gym', color: '#FF6600', calendarId: 'calendar@group.calendar.google.com' }
```
2. In `Code.gs`, add to `CALENDAR_IDS` and `SPACE_LABELS`:
```javascript
const CALENDAR_IDS = { ..., 'gym': 'calendar@group.calendar.google.com' };
const SPACE_LABELS = { ..., 'gym': 'Main Gym' };
```

### Change the admin email
In `Code.gs`, change:
```javascript
const ADMIN_EMAIL = 'kenny.hin@slamnv.org';
```

### Change site colors
Update in `css/styles.css` → `:root` block. The primary color (`--primary`) affects ALL buttons, active states, focus rings, and the today indicator. The green (`--slam-green`) affects accents and the mini calendar dots.

### Make the calendar show a different time range
In `calendar.js` → `init()`:
```javascript
slotMinTime: '08:00:00',   // Change from 09:00
slotMaxTime: '20:00:00',   // Change from 18:00
```

### Change how many days ahead are shown
In `config.js`: `DAYS_AHEAD: 90`  
Also in `Code.gs`: `const DAYS_AHEAD = 90;`

---

## 12. Coach Kenny Landing Page (Secondary Project)

- **File:** `/Users/wasabi/Coach Kenny/index.html` (single self-contained HTML file)
- **Domain:** `coachkenny.org` (purchased from Namecheap, DNS pointing to GitHub Pages)
- **Repo:** `kennyhin/coach-kenny` (or similar — may need to create/check)
- **Purpose:** Personal landing page for Coach Kenny Hin with two link cards and a contact form

**Contact form:**
- Uses **Web3Forms** (free tier, 250 submissions/month)
- API Key: `7c27b5dc-c36d-466e-8b78-ffdba5bacc38` (already embedded in the file)
- Sends email to `kenny.hin@slamnv.org` + auto-reply to sender

**Design:**
- SLAM brand colors (black/green/red)
- Bull logo (`slam-bull.png`) + SLAM logo (`slam-logo.png`)
- Two cards: SLAM Athletics → `slamnvathletics.org` | Space Reservations → `kennyhin.github.io/slam-space-reservations`
- Floating bull logo animation, green top bar

---

## 13. What Was NOT Implemented (Future Ideas)

- **Kenny cannot write directly to the space calendars** — Google Workspace for Education blocks it. Events go to his personal calendar; he moves them manually.
- **No admin dashboard** — Approval is done via Google Sheets menu, not the web UI.
- **No edit/cancel for teachers** — Once submitted, teachers cannot cancel. Kenny does it from the sheet.
- **The web app runs on a free tier** — Apps Script execution time limit is 6 min, 100 email/day. More than sufficient for a school.
- **No recurrence/recurring reservations** — Each form submission is a one-time event.

---

## 14. Quick Reference — Debugging

| Problem | Where to look |
|---|---|
| Site not updating after push | Wait 2 minutes; check `https://kennyhin.github.io/slam-space-reservations` |
| Calendar not loading | Open browser DevTools → Network tab; check the Apps Script URL is responding |
| "Unauthorized" error | Token may be expired (>1hr); teacher needs to sign out and sign back in |
| Approval not working | Apps Script editor → Executions tab for errors |
| Email not sending | Apps Script `setup()` may need to be re-run to re-authorize MailApp |
| New deployment URL | Update `CONFIG.SCRIPT_URL` in `config.js` and push |
| Space calendar not showing events | That calendar may not be accessible; check Kenny owns it or has edit access |

---

*This document was written to be the single source of truth for this project. When in doubt, read the source files — they are all well-commented.*
