// ============================================================
// calendar.js — Notion-style 3-column calendar app
//   • MiniCal    — left sidebar mini month calendar
//   • CalendarView — center 5-day timeline (9am–6pm)
//   • Detail panel — right sidebar event details
// ============================================================

// ============================================================
// MINI CALENDAR (left sidebar)
// ============================================================
const MiniCal = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth(),

  init() {
    this.render();
  },

  render() {
    const headerEl = document.getElementById('mini-cal-header');
    const gridEl   = document.getElementById('mini-cal-grid');
    const labelEl  = document.getElementById('mini-cal-month');
    if (!gridEl) return;

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const DAYS   = ['S','M','T','W','T','F','S'];

    labelEl.textContent = `${MONTHS[this.month]} ${this.year}`;

    // Day-of-week header
    headerEl.innerHTML = DAYS.map(d => `<span>${d}</span>`).join('');

    // Build day grid
    const firstDay    = new Date(this.year, this.month, 1).getDay();
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const today       = new Date();
    const eventDates  = CalendarView.getEventDates();

    let html = '';

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      html += '<span class="mini-day empty"></span>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday     = d === today.getDate() && this.month === today.getMonth() && this.year === today.getFullYear();
      const dateStr     = `${this.year}-${String(this.month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hasEvents   = eventDates.has(dateStr);
      const yr = this.year, mo = this.month;
      html += `<span class="mini-day${isToday ? ' today' : ''}${hasEvents ? ' has-events' : ''}"
               onclick="MiniCal.gotoDate(${yr},${mo},${d})">${d}</span>`;
    }

    gridEl.innerHTML = html;
  },

  prev() {
    this.month--;
    if (this.month < 0) { this.month = 11; this.year--; }
    this.render();
  },

  next() {
    this.month++;
    if (this.month > 11) { this.month = 0; this.year++; }
    this.render();
  },

  gotoDate(year, month, day) {
    if (CalendarView.calendar) {
      CalendarView.calendar.gotoDate(new Date(year, month, day));
    }
  },
};

// ============================================================
// MAIN CALENDAR VIEW
// ============================================================
const CalendarView = {
  calendar: null,
  events:   [],

  init() {
    const el = document.getElementById('calendar');
    if (!el) return;

    this.calendar = new FullCalendar.Calendar(el, {
      // 5-day rolling timeline, 9am–6pm; also supports month view
      views: {
        timeGridFiveDays: {
          type: 'timeGrid',
          duration: { days: 5 },
          buttonText: '5 Days',
        },
      },
      initialView: this._isMobile() ? 'listWeek' : 'timeGridFiveDays',
      headerToolbar: {
        left:   'prev,next today',
        center: 'title',
        right:  'timeGridFiveDays,dayGridMonth,listWeek',
      },
      buttonText: {
        today: 'Today',
        month: 'Month',
        list:  'List',
        timeGridFiveDays: '5 Days',
      },
      buttonIcons: false,

      height: '100%',
      expandRows: true,
      nowIndicator: true,
      slotMinTime: '09:00:00',
      slotMaxTime: '18:00:00',
      slotDuration: '00:30:00',
      slotLabelInterval: '01:00:00',
      allDaySlot: false,
      scrollTime: '08:30:00',

      eventTimeFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' },

      eventClick: (info) => {
        this._showEventDetail(info.event);
      },

      // Click empty slot / day → go to reserve.html with date pre-filled
      dateClick: (info) => {
        const dateStr = info.dateStr.split('T')[0];
        window.location.href = `reserve.html?date=${dateStr}`;
      },

      events: [],
    });

    this.calendar.render();
    this.fetchEvents();
  },

  fetchEvents() {
    this._setLoading(true);
    const url = `${CONFIG.SCRIPT_URL}?action=getEvents&token=${encodeURIComponent(Auth.getToken())}`;

    fetch(url)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        if (data.error) throw new Error(data.error);
        this.events = data.events || [];
        this._populateCalendar();
        MiniCal.render();
        this._renderUpcomingInPanel();   // show upcoming in right panel
        this._setLoading(false);
      })
      .catch(err => {
        console.error('Calendar fetch error:', err);
        this._setLoading(false);
        this._showError('Could not load reservations. Please refresh.');
      });
  },

  _populateCalendar() {
    this.calendar.getEvents().forEach(e => e.remove());
    this.events.forEach(ev => {
      const space = CONFIG.SPACES.find(s => s.id === ev.space);
      this.calendar.addEvent({
        id:    ev.id,
        title: ev.title,
        start: ev.start,
        end:   ev.end,
        backgroundColor: space ? space.color : '#888B8D',
        borderColor:     space ? space.color : '#888B8D',
        textColor:       '#ffffff',
        extendedProps: {
          space:       ev.space,
          spaceLabel:  space ? space.label : ev.space,
          description: ev.description,
        },
      });
    });
  },

  // ---- Upcoming events in right panel ------------------------
  _renderUpcomingInPanel() {
    const panel = document.getElementById('detail-panel');
    if (!panel) return;

    const now      = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const upcoming = this.events
      .filter(ev => { const s = new Date(ev.start); return s >= now && s <= twoWeeks; })
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    let html = `<div class="detail-section-title">Upcoming · Next 2 Weeks</div>`;

    if (upcoming.length === 0) {
      html += `<div style="font-size:12px;color:#AAAAAA;padding:8px 0;line-height:1.6;">
                 Nothing scheduled in the next 2 weeks
               </div>`;
    } else {
      html += upcoming.map(ev => {
        const space      = CONFIG.SPACES.find(s => s.id === ev.space);
        const color      = space ? space.color : '#888B8D';
        const spaceLabel = space ? space.label : ev.space;
        const start      = new Date(ev.start);
        const end        = new Date(ev.end);
        return `
          <div class="upcoming-panel-item" onclick="CalendarView._showEventDetailFromId('${this._escape(ev.id)}')">
            <div class="upcoming-panel-dot" style="background:${color}"></div>
            <div class="upcoming-panel-body">
              <div class="upcoming-panel-title">${this._escape(ev.title)}</div>
              <div class="upcoming-panel-meta">${this._formatDateShort(start)} · ${this._formatTime(start)}–${this._formatTime(end)}</div>
              <span class="upcoming-panel-tag" style="background:${color}18;color:${color};border-color:${color}33">${spaceLabel}</span>
            </div>
          </div>`;
      }).join('');
    }

    panel.innerHTML = html;
  },

  // Show detail from an event ID (used by upcoming list clicks)
  _showEventDetailFromId(id) {
    const calEvent = this.calendar.getEventById(id);
    if (calEvent) this._showEventDetail(calEvent);
  },

  // Returns a Set of 'YYYY-MM-DD' strings that have events (for mini-cal dots)
  getEventDates() {
    const dates = new Set();
    this.events.forEach(ev => {
      const d = ev.start ? ev.start.split('T')[0] : null;
      if (d) dates.add(d);
    });
    return dates;
  },

  // ---- Right panel event detail --------------------------------
  _showEventDetail(event) {
    if (this._isMobile()) {
      this._showModal(event);
      return;
    }

    const panel = document.getElementById('detail-panel');
    if (!panel) return;

    const space = CONFIG.SPACES.find(s => s.id === event.extendedProps.space);
    const color = space ? space.color : '#888B8D';
    const spaceLabel = space ? space.label : (event.extendedProps.space || '—');

    panel.innerHTML = `
      <div class="detail-color-bar" style="background:${color}"></div>
      <div class="detail-event-title">${this._escape(event.title)}</div>

      <div class="detail-row">
        <span class="detail-icon">📍</span>
        <span class="detail-label">Space</span>
        <span class="detail-value">
          <span class="detail-chip" style="background:${color}18;color:${color};border-color:${color}44">
            <span class="detail-chip-dot" style="background:${color}"></span>
            ${spaceLabel}
          </span>
        </span>
      </div>

      <div class="detail-row">
        <span class="detail-icon">📅</span>
        <span class="detail-label">Date</span>
        <span class="detail-value">${this._formatDate(event.start)}</span>
      </div>

      <div class="detail-row">
        <span class="detail-icon">🕐</span>
        <span class="detail-label">Time</span>
        <span class="detail-value">${this._formatTime(event.start)} – ${this._formatTime(event.end)}</span>
      </div>

      ${event.extendedProps.description ? `
      <div class="detail-row">
        <span class="detail-icon">📝</span>
        <span class="detail-label">Notes</span>
        <span class="detail-value">${this._escape(event.extendedProps.description)}</span>
      </div>` : ''}

      <button class="detail-close-btn" onclick="CalendarView.clearDetail()">← Back to Upcoming</button>
    `;
  },

  clearDetail() {
    this._renderUpcomingInPanel();
  },

  // Mobile fallback modal
  _showModal(event) {
    const space   = CONFIG.SPACES.find(s => s.id === event.extendedProps.space);
    const color   = space ? space.color : '#888B8D';
    const modal   = document.getElementById('event-modal');
    const content = document.getElementById('event-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="modal-space-bar" style="background:${color}"></div>
      <div class="modal-body">
        <h3 class="modal-title">${this._escape(event.title)}</h3>
        <div class="modal-detail"><span class="modal-label">Space</span><span class="modal-value">${space ? space.label : event.extendedProps.space}</span></div>
        <div class="modal-detail"><span class="modal-label">Date</span><span class="modal-value">${this._formatDate(event.start)}</span></div>
        <div class="modal-detail"><span class="modal-label">Time</span><span class="modal-value">${this._formatTime(event.start)} – ${this._formatTime(event.end)}</span></div>
        ${event.extendedProps.description ? `<div class="modal-detail"><span class="modal-label">Notes</span><span class="modal-value">${this._escape(event.extendedProps.description)}</span></div>` : ''}
        <button class="modal-close-btn" onclick="CalendarView.closeModal()">Close</button>
      </div>`;
    modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('event-modal');
    if (modal) modal.classList.remove('active');
  },

  // ---- Helpers -------------------------------------------------
  _isMobile()  { return window.innerWidth < 900; },
  _setLoading(on) {
    const el = document.getElementById('calendar-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
  },
  _showError(msg) {
    const el = document.getElementById('calendar-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },
  _formatDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  },
  _formatDateShort(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },
  _formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },
  _escape(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
