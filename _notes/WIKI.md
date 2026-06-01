# SLAM Space Reservations — Agent Memory Wiki

> **Private:** Not linked from the live site. For AI agents and Kenny only.  
> **Owner:** Kenny Hin, Athletic Director, SLAM! Nevada — kenny.hin@slamnv.org  
> **Repo:** https://github.com/kennyhin/slam-space-reservations  
> **Live site:** https://kennyhin.github.io/slam-space-reservations  
> **Last updated:** May 2026 (Claude + Hermes contributions)

---

## Agent History

| Agent | What they worked on |
|---|---|
| **Claude (Anthropic)** | Built entire site from scratch — auth, calendar, form, CSS, branding, Apps Script backend, live preview card, custom time picker, Notion-style 3-col layout |
| **Hermes** | Multi-date reservation support, backend debugging, new Apps Script deployment, email formatting improvements, CODE_DEPLOY.gs file |

---

## 1. What This Is

A **private staff-only web app** for SLAM! Nevada teachers to reserve shared school spaces. Teachers sign in with their `@slamnv.org` Google account, complete a 5-step form, and Kenny (admin) approves via a Google Sheets menu. Approved events are added to Kenny's personal Google Calendar; he moves them to the correct space calendar manually.

**Second project:** Coach Kenny's personal landing page at `coachkenny.org` — `/Users/wasabi/Coach Kenny/index.html`. Separate GitHub repo. Contact form via Web3Forms (key: `7c27b5dc-c36d-466e-8b78-ffdba5bacc38`).

---

## 2. File Structure

```
Use of Space Request Form/
├── _notes/              ← 🔒 PRIVATE — agent wiki, not served publicly
│   └── WIKI.md          ← This file
├── index.html           ← Calendar dashboard (main page after login)
├── reserve.html         ← Reservation form (5-step wizard)
├── robots.txt           ← Blocks crawlers from _notes/
├── CODE_DEPLOY.gs       ← Clean copy of Apps Script for easy copy-paste (Hermes added)
├── css/
│   └── styles.css       ← ALL styles, single file, no preprocessor
├── js/
│   ├── config.js        ← ⭐ THE only file to edit for config changes
│   ├── auth.js          ← Google Sign-In (don't touch)
│   ├── calendar.js      ← Calendar view, MiniCal, right panel
│   └── form.js          ← 5-step form wizard, multi-date, live preview
├── images/
│   ├── slam-bull.png    ← Bull logo (auth screen)
│   └── slam-logo.png    ← Script logo (hidden in header CSS)
└── gas/
    └── Code.gs          ← Google Apps Script backend (paste into Apps Script editor)
```

---

## 3. Critical Config Values

**`js/config.js`** — only file needed for most changes:

```javascript
SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyJjRxfxRdR2guWfqYwnnCu8X19zuvq8mRYYhGMHbzb46K9MGO3OlctWUFqU_Uu_Ddg/exec'
// ⚠️ Updated by Hermes — this is the current active deployment URL

GOOGLE_CLIENT_ID: '180888278400-gjvc3nen005k7m95dejbm0oohn0rucmm.apps.googleusercontent.com'

ALLOWED_DOMAIN: 'slamnv.org'

SPACES: [
  { id: 'cafegym',           label: 'Cafegym',          color: '#E31837' },
  { id: 'es-turf',           label: 'ES Turf',          color: '#8CC63F' },
  { id: 'kinder-playground', label: 'Kinder Playground', color: '#2D3748' },
]

GRADE_LEVELS: ['Kinder', '1st', '2nd', '3rd', '4th', '5th', 'Staff']

DAYS_AHEAD: 90
```

---

## 4. Tech Stack

| Layer | Tech |
|---|---|
| Hosting | GitHub Pages — auto-deploys on push to `main` |
| Auth | Google Identity Services (GSI) JWT tokens |
| Calendar UI | FullCalendar v6 (CDN) |
| Backend | Google Apps Script (doGet/doPost web app) |
| Data store | Google Sheets ("Reservations" tab) |
| Email | MailApp in Apps Script |
| Calendar writes | CalendarApp.getDefaultCalendar() — Kenny's personal calendar |
| Fonts | Barlow Condensed + Inter (Google Fonts) |
| CSS/JS | Vanilla — no framework, no npm, no build step |

**To deploy:** `git add -A && git commit -m "..." && git push origin main` → live in ~2 min.

---

## 5. Brand / Design

| Color | Hex | PMS | Use |
|---|---|---|---|
| Red | `#C8102E` | PMS 186C | Primary — buttons, active states, today indicator |
| Green | `#A8D400` | PMS 802C | Accent — dots, sidebar button glow, completed steps |
| Gray | `#888B8D` | Cool Gray 8C | Secondary text |
| Black | `#0B0B0B` | PMS Black | Header, auth overlay |
| White | `#FFFFFF` | PMS White | Cards, backgrounds |

CSS variables in `:root` at top of `styles.css`:
```css
--primary: #C8102E
--slam-green: #A8D400
--slam-gray: #888B8D
--slam-black: #0B0B0B
--gray-light: #F4F4F4  /* page background */
--gray-border: #E8E8E8
```

---

## 6. Page Layout

### `index.html` — Calendar Dashboard
**3-column Notion-style layout** (`.app-layout` CSS grid: `240px | 1fr | 268px`):
- **Left sidebar**: mini month calendar, space legend, animated red "Reserve a Space" button
- **Center**: FullCalendar 5-day timeline (9am–6pm default), red now-indicator, hover `+ Reserve` on slots, `dateClick` → `reserve.html?date=YYYY-MM-DD`
- **Right panel**: upcoming next 2 weeks by default; click event → shows detail; `← Back` returns to list
- **Mobile (< 900px)**: sidebars hidden, full-screen calendar, red mobile reserve bar at top, month view default, event modal for details

### `reserve.html` — Reservation Form
**2-column layout**: form left (`1fr`) | live preview card right (`250px`) → stacks on mobile.
- Step 5 (Review): preview hides, form centers at 640px max-width
- URL param: `?date=YYYY-MM-DD` pre-fills date

---

## 7. Form Wizard — Step-by-Step

The form is **5 steps** (built dynamically by `form.js`):

| Step | Title | What it collects |
|---|---|---|
| 1 | Info | Teacher name + grade level bubble |
| 2 | Purpose | Short description + quick-pick chips |
| 3 | Space | Which space (Cafegym / ES Turf / Kinder Playground) |
| 4 | Date & Time | **Multi-date** — add one or more date+time entries |
| 5 | Review | Summary + Submit |

### Multi-Date Support (added by Hermes)
Step 4 now supports **multiple date/time entries** per submission:
- User picks date + time, clicks **"+ Add Date"** → entry added to a list
- Can add as many dates as needed, remove individual entries
- Data stored as `ReservationForm.data.entries = [{ date, startTime, endTime }, ...]`
- On submit, all entries are sent together; each gets its own calendar event

**Key form.js data structure:**
```javascript
ReservationForm.data = {
  teacherName: '',
  gradeLevel: '',
  purpose: '',
  space: '',
  entries: [{ date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: 'HH:MM' }]
}
```

### Custom Time Picker
Native `<input type="time">` was replaced with a custom styled component (blue browser widget was ugly):
- Methods: `_buildTimePicker(fieldId, defaultValue)`, `_getTimeValue(fieldId)`, `_setAMPM(fieldId, val)`, `_onTimeChange(fieldId)`
- Hours 1–12 dropdown, minutes every 5 min, AM/PM toggle (red when active)

### Quick Picks
```
🍭 Popsicle Party  |  💧 Water Day  |  🎨 Fingerpainting  |  🌈 Tie Dye Party
```

### Live Preview Card
Updates in real-time as user fills each step. Space shown as colored chip. On Step 5, preview hides and form expands full width.

---

## 8. Google Apps Script Backend

### Current deployment
- **Active URL** (in `config.js`): `https://script.google.com/macros/s/AKfycbyJjRxfxRdR2guWfqYwnnCu8X19zuvq8mRYYhGMHbzb46K9MGO3OlctWUFqU_Uu_Ddg/exec`
- **File to paste**: Use `CODE_DEPLOY.gs` in the repo root (Hermes's clean version) OR `gas/Code.gs`
- **Bound to**: Kenny's Google Sheet (URL sent in every admin notification email)

### Endpoints

**GET** `?action=getEvents&token=JWT`
→ Returns all events from all 3 space calendars for next 90 days

**POST** body: `{ token, teacherName, gradeLevel, purpose, space, entries: [{date, startTime, endTime}] }`
→ Validates token, checks conflicts, saves to sheet, emails teacher + admin

### Sheet columns
```
A: Timestamp | B: Email | C: Teacher | D: Grade | E: Purpose
F: Space | G: Date | H: Start | I: End | J: Status | K: Checkbox
```

### Approval workflow
1. Kenny gets email with link to the sheet
2. Clicks the row → **SLAM Reservations → ✅ Approve Selected Row**
3. Event created on Kenny's **personal calendar** (`CalendarApp.getDefaultCalendar()`)
4. Row turns green, teacher gets approval email
5. Kenny manually moves to correct space calendar if needed

### ⚠️ Known Hard Constraints
- **NO onEdit trigger** — Google Workspace EDU blocks CalendarApp/MailApp in simple triggers
- **NO showModalDialog** — blocked in Google Workspace EDU; use `ui.alert()` only
- **NO CalendarApp.getCalendarById() writes** — Kenny doesn't own the space calendars; writes blocked
- **Only** `CalendarApp.getDefaultCalendar()` works for creating events

### First-time setup after redeployment
1. Paste `CODE_DEPLOY.gs` content into Apps Script editor
2. Run `setup()` function → grant all permissions
3. Deploy → Web App → Execute as Me → Access: Anyone in organization
4. Copy new URL → paste into `config.js` → `SCRIPT_URL`
5. `git add js/config.js && git commit -m "Update script URL" && git push origin main`

---

## 9. JavaScript Objects Quick Reference

### `Auth` (auth.js)
```javascript
Auth.init({ onSuccess, onNeedSignIn, onWrongDomain })
Auth.signOut()
Auth.getToken()  // Returns JWT for API calls
```
Session stored in `sessionStorage` as `slam_auth`. Tokens expire ~1hr.

### `MiniCal` (calendar.js)
```javascript
MiniCal.init()           // Renders current month
MiniCal.prev() / .next() // Navigate months
MiniCal.gotoDate(y,m,d)  // Navigates main calendar
MiniCal.render()         // Re-renders (called after events load)
```

### `CalendarView` (calendar.js)
```javascript
CalendarView.init()
CalendarView.fetchEvents()
CalendarView.getEventDates()          // Set of 'YYYY-MM-DD' for mini-cal dots
CalendarView._showEventDetail(event)  // Populates right panel
CalendarView._renderUpcomingInPanel() // Shows next 2 weeks in right panel
CalendarView.clearDetail()
CalendarView.closeModal()             // Mobile modal
```

### `ReservationForm` (form.js)
```javascript
ReservationForm.init()           // Reads ?date= param, builds form
ReservationForm.next() / .back()
ReservationForm.submit()
ReservationForm._addEntry()      // Multi-date: adds current date/time to entries list
ReservationForm._updatePreview() // Refreshes live preview card
ReservationForm._buildTimePicker(fieldId, defaultVal)
ReservationForm._getTimeValue(fieldId)
```

---

## 10. Common Edit Recipes

### Change site colors
Edit `:root` in `css/styles.css`. `--primary` controls all buttons/active states.

### Add a quick-pick chip
In `form.js`, find `suggestion-chips` section:
```html
<button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('New Option')">New Option</button>
```

### Add a grade level
In `config.js`: `GRADE_LEVELS: ['Kinder', '1st', ..., 'NewGrade', 'Staff']`

### Add a new space
1. `config.js` → add to `SPACES` array
2. `CODE_DEPLOY.gs` / `gas/Code.gs` → add to `CALENDAR_IDS` and `SPACE_LABELS`
3. Redeploy Apps Script + update `SCRIPT_URL`

### Change time range on calendar
In `calendar.js` → `init()`: `slotMinTime: '08:00:00'`, `slotMaxTime: '20:00:00'`

### Change default mobile view
In `calendar.js`: `initialView: this._isMobile() ? 'dayGridMonth' : 'timeGridFiveDays'`
(Currently set to `dayGridMonth` for mobile)

---

## 11. Debugging Quick Reference

| Problem | Fix |
|---|---|
| Site not updating | Wait 2 min after push; hard refresh (Cmd+Shift+R) |
| Calendar shows no events | Check `SCRIPT_URL` in config.js matches deployed URL |
| "Unauthorized" | Token expired (>1hr); teacher signs out and back in |
| Approval fails | Apps Script editor → Executions tab for error details |
| Email not sending | Re-run `setup()` in Apps Script to re-authorize MailApp |
| New deployment URL | Update `CONFIG.SCRIPT_URL` in `config.js` and push |

---

## 12. What Was NOT Built (Future Ideas)

- Teachers cannot cancel/edit their own reservations (Kenny does it from the sheet)
- No web-based admin dashboard (all approval via Google Sheets menu)
- No recurring reservations (each form = one-time event, though multi-date now works)
- Kenny cannot write directly to space calendars (Workspace EDU restriction)

---

## 13. Recent Changes Log

| Date | Agent | Change |
|---|---|---|
| May 2026 | Claude | Built entire site from scratch |
| May 2026 | Claude | 3-column Notion layout, custom time picker, live preview card |
| May 2026 | Claude | AGENT_HANDOFF.md (original wiki) |
| May 2026 | Hermes | Multi-date reservation support in form + backend |
| May 2026 | Hermes | New Apps Script deployment, updated SCRIPT_URL |
| May 2026 | Hermes | CODE_DEPLOY.gs clean copy in repo root |
| May 2026 | Hermes | Improved email formatting for multi-date reservations |
| May 2026 | Claude | Mobile default view → month (was list) |
| May 2026 | Claude | Mobile "Reserve a Space" bar at top of calendar |
| May 2026 | Claude | Moved wiki from repo root to `_notes/WIKI.md` (private) |

---

*Last edited by: Claude (Anthropic) — May 2026*  
*Next agent: read this file first, then check `js/config.js` for current SCRIPT_URL*
