// ============================================================
// calendar.js — Fetches events and renders:
//   • FullCalendar (dot view — colored circles, no text)
//   • Side panel  — upcoming events this week (clickable)
//   • Today card  — what's happening today
// ============================================================

const CalendarView = {
  calendar: null,
  events: [],

  init() {
    const el = document.getElementById('calendar');
    if (!el) return;

    this.calendar = new FullCalendar.Calendar(el, {
      initialView: this._isMobile() ? 'listWeek' : 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listWeek',
      },
      buttonText: { today: 'Today', month: 'Month', week: 'Week', list: 'List' },
      height: 760,
      expandRows: true,
      nowIndicator: true,
      scrollTime: '07:00:00',
      slotMinTime: '06:00:00',
      slotMaxTime: '22:00:00',
      slotDuration: '00:30:00',
      slotLabelInterval: '01:00:00',
      allDaySlot: false,
      dayMaxEvents: false,
      eventTimeFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' },

      // Render a colored dot instead of event text
      eventContent: (arg) => ({
        html: `<span class="evt-dot" style="background:${arg.event.backgroundColor}"></span>`,
      }),

      eventClick: (info) => this._showEventDetail(info.event),
      events: [],
    });

    this.calendar.render();
    this.fetchEvents();
  },

  fetchEvents() {
    this._setLoading(true);
    const url = `${CONFIG.SCRIPT_URL}?action=getEvents&token=${encodeURIComponent(Auth.getToken())}`;

    fetch(url)
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        this.events = data.events || [];
        this._populateCalendar();
        this._renderUpcomingWeek();
        this._renderTodayEvents();
        this._setLoading(false);
      })
      .catch((err) => {
        console.error('Calendar fetch error:', err);
        this._setLoading(false);
        this._showError('Could not load reservations. Please refresh the page.');
      });
  },

  _populateCalendar() {
    this.calendar.getEvents().forEach((e) => e.remove());
    this.events.forEach((ev) => {
      const space = CONFIG.SPACES.find((s) => s.id === ev.space);
      this.calendar.addEvent({
        id: ev.id, title: ev.title, start: ev.start, end: ev.end,
        backgroundColor: space ? space.color : '#888B8D',
        borderColor:     space ? space.color : '#888B8D',
        textColor: '#ffffff',
        extendedProps: {
          space: ev.space,
          spaceLabel: space ? space.label : ev.space,
          description: ev.description,
        },
      });
    });
  },

  // ---- Side panel: next 7 days --------------------------------
  _renderUpcomingWeek() {
    const container = document.getElementById('upcoming-week-list');
    if (!container) return;

    const now     = new Date();
    const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcoming = this.events
      .filter((ev) => {
        const start = new Date(ev.start);
        return start >= now && start <= oneWeek;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    if (upcoming.length === 0) {
      container.innerHTML = '<div class="side-panel-empty">No reservations<br>in the next 7 days</div>';
      return;
    }

    container.innerHTML = upcoming
      .map((ev) => {
        const space      = CONFIG.SPACES.find((s) => s.id === ev.space);
        const color      = space ? space.color : '#888B8D';
        const spaceLabel = space ? space.label : ev.space;
        const start      = new Date(ev.start);
        const end        = new Date(ev.end);
        return `
          <div class="side-item" onclick="CalendarView._showEventDetailById('${this._escape(ev.id)}')">
            <div class="side-item-dot" style="background:${color}"></div>
            <div class="side-item-body">
              <div class="side-item-title">${this._escape(ev.title)}</div>
              <div class="side-item-date">${this._formatDate(start)}</div>
              <div class="side-item-time">${this._formatTime(start)} – ${this._formatTime(end)}</div>
              <span class="side-item-tag" style="background:${color}22;color:${color};border-color:${color}55">${spaceLabel}</span>
            </div>
          </div>`;
      })
      .join('');
  },

  // ---- Today card: events happening today --------------------
  _renderTodayEvents() {
    const container = document.getElementById('today-list');
    const titleEl   = document.getElementById('today-date-label');
    if (!container) return;

    const now      = new Date();
    const todayStr = now.toDateString();

    if (titleEl) {
      titleEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    const todayEvents = this.events
      .filter((ev) => new Date(ev.start).toDateString() === todayStr)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    if (todayEvents.length === 0) {
      container.innerHTML = `
        <div class="today-empty">
          <div class="today-empty-icon">🎉</div>
          Nothing planned today — the spaces are all yours!
        </div>`;
      return;
    }

    container.innerHTML = todayEvents
      .map((ev) => {
        const space      = CONFIG.SPACES.find((s) => s.id === ev.space);
        const color      = space ? space.color : '#888B8D';
        const spaceLabel = space ? space.label : ev.space;
        const start      = new Date(ev.start);
        const end        = new Date(ev.end);
        return `
          <div class="today-item" onclick="CalendarView._showEventDetailById('${this._escape(ev.id)}')">
            <div class="today-item-dot" style="background:${color}"></div>
            <div class="today-item-body">
              <div class="today-item-title">${this._escape(ev.title)}</div>
              <div class="today-item-meta">
                <span class="today-item-tag" style="background:${color}20;color:${color};border-color:${color}44">${spaceLabel}</span>
                <span class="today-item-time">${this._formatTime(start)} – ${this._formatTime(end)}</span>
              </div>
            </div>
          </div>`;
      })
      .join('');
  },

  // ---- Helpers ------------------------------------------------
  _showEventDetailById(id) {
    const calEvent = this.calendar.getEventById(id);
    if (calEvent) this._showEventDetail(calEvent);
  },

  _showEventDetail(event) {
    const space   = CONFIG.SPACES.find((s) => s.id === event.extendedProps.space);
    const color   = space ? space.color : '#888B8D';
    const modal   = document.getElementById('event-modal');
    const content = document.getElementById('event-modal-content');

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

  closeModal() { document.getElementById('event-modal').classList.remove('active'); },
  _isMobile()  { return window.innerWidth < 768; },
  _setLoading(state) { const el = document.getElementById('calendar-loading'); if (el) el.style.display = state ? 'flex' : 'none'; },
  _showError(msg)    { const el = document.getElementById('calendar-error');   if (el) { el.textContent = msg; el.style.display = 'block'; } },
  _formatDate(date)  { return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); },
  _formatTime(date)  { return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
  _escape(str)       { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
};
