// ============================================================
// calendar.js — Fetches events from Apps Script and renders
//               FullCalendar + the Upcoming Reservations list
// ============================================================

const CalendarView = {
  calendar: null,
  events: [],

  // ----------------------------------------------------------
  // Initialize FullCalendar after auth succeeds
  // ----------------------------------------------------------
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
      buttonText: {
        today: 'Today',
        month: 'Month',
        week: 'Week',
        list: 'List',
      },
      height: 'auto',
      expandRows: true,
      nowIndicator: true,
      dayMaxEvents: 3,
      eventTimeFormat: {
        hour: 'numeric',
        minute: '2-digit',
        meridiem: 'short',
      },
      eventClick: (info) => this._showEventDetail(info.event),
      // Events are loaded via fetchEvents()
      events: [],
    });

    this.calendar.render();
    this.fetchEvents();
  },

  // ----------------------------------------------------------
  // Pull events from Apps Script and populate the calendar
  // ----------------------------------------------------------
  fetchEvents() {
    this._setLoading(true);

    const url = `${CONFIG.SCRIPT_URL}?action=getEvents&token=${encodeURIComponent(Auth.getToken())}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        this.events = data.events || [];
        this._populateCalendar();
        this._renderUpcomingList();
        this._setLoading(false);
      })
      .catch((err) => {
        console.error('Calendar fetch error:', err);
        this._setLoading(false);
        this._showError('Could not load reservations. Please refresh the page.');
      });
  },

  // ----------------------------------------------------------
  // Add events to FullCalendar with space-based colors
  // ----------------------------------------------------------
  _populateCalendar() {
    // Remove all existing events
    this.calendar.getEvents().forEach((e) => e.remove());

    this.events.forEach((ev) => {
      const space = CONFIG.SPACES.find((s) => s.id === ev.space);
      this.calendar.addEvent({
        id: ev.id,
        title: ev.title,
        start: ev.start,
        end: ev.end,
        backgroundColor: space ? space.color : '#6B7280',
        borderColor: space ? space.color : '#6B7280',
        textColor: '#ffffff',
        extendedProps: {
          space: ev.space,
          spaceLabel: space ? space.label : ev.space,
          description: ev.description,
          teacherName: ev.teacherName,
        },
      });
    });
  },

  // ----------------------------------------------------------
  // Render the "Upcoming Reservations" list below the calendar
  // ----------------------------------------------------------
  _renderUpcomingList() {
    const container = document.getElementById('upcoming-list');
    if (!container) return;

    const now = new Date();
    const upcoming = this.events
      .filter((ev) => new Date(ev.end) > now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 20);

    if (upcoming.length === 0) {
      container.innerHTML = '<p class="no-events">No upcoming reservations.</p>';
      return;
    }

    container.innerHTML = upcoming
      .map((ev) => {
        const space = CONFIG.SPACES.find((s) => s.id === ev.space);
        const color = space ? space.color : '#6B7280';
        const spaceLabel = space ? space.label : ev.space;
        const start = new Date(ev.start);
        const end = new Date(ev.end);

        return `
          <div class="upcoming-item">
            <div class="upcoming-space-dot" style="background:${color}"></div>
            <div class="upcoming-details">
              <div class="upcoming-title">${this._escape(ev.title)}</div>
              <div class="upcoming-meta">
                <span class="upcoming-space-tag" style="background:${color}20;color:${color};border-color:${color}40">${spaceLabel}</span>
                <span class="upcoming-date">${this._formatDate(start)}</span>
                <span class="upcoming-time">${this._formatTime(start)} – ${this._formatTime(end)}</span>
              </div>
            </div>
          </div>`;
      })
      .join('');
  },

  // ----------------------------------------------------------
  // Show a modal/popover with event details when clicked
  // ----------------------------------------------------------
  _showEventDetail(event) {
    const space = CONFIG.SPACES.find((s) => s.id === event.extendedProps.space);
    const color = space ? space.color : '#6B7280';
    const start = event.start;
    const end = event.end;

    const modal = document.getElementById('event-modal');
    const content = document.getElementById('event-modal-content');

    content.innerHTML = `
      <div class="modal-space-bar" style="background:${color}"></div>
      <div class="modal-body">
        <h3 class="modal-title">${this._escape(event.title)}</h3>
        <div class="modal-detail">
          <span class="modal-label">Space</span>
          <span class="modal-value">${space ? space.label : event.extendedProps.space}</span>
        </div>
        <div class="modal-detail">
          <span class="modal-label">Date</span>
          <span class="modal-value">${this._formatDate(start)}</span>
        </div>
        <div class="modal-detail">
          <span class="modal-label">Time</span>
          <span class="modal-value">${this._formatTime(start)} – ${this._formatTime(end)}</span>
        </div>
        ${event.extendedProps.description ? `
        <div class="modal-detail">
          <span class="modal-label">Notes</span>
          <span class="modal-value">${this._escape(event.extendedProps.description)}</span>
        </div>` : ''}
        <button class="modal-close-btn" onclick="CalendarView.closeModal()">Close</button>
      </div>`;

    modal.classList.add('active');
  },

  closeModal() {
    document.getElementById('event-modal').classList.remove('active');
  },

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  _isMobile() {
    return window.innerWidth < 768;
  },

  _setLoading(state) {
    const el = document.getElementById('calendar-loading');
    if (el) el.style.display = state ? 'flex' : 'none';
  },

  _showError(msg) {
    const el = document.getElementById('calendar-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },

  _formatDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  },

  _formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', meridiem: 'short' });
  },

  _escape(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
