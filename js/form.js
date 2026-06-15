// ============================================================
// form.js — 5-step reservation wizard (teacher + coach flows)
// ============================================================

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_NAMES_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const ReservationForm = {
  currentStep: 1,
  totalSteps: 5,
  data: {
    teacherName: '',
    gradeLevel: '',
    isCoach: false,
    purpose: '',
    space: '',
    entries: [],
    coachDays: [],   // [dayNum1, dayNum2], 1=Mon … 5=Fri
    groupId: null,
  },

  init() {
    const urlDate = new URLSearchParams(window.location.search).get('date');
    this._urlDate = urlDate || null;
    this._buildSteps();
    this._showStep(1);
    this._updatePreview();
  },

  _buildSteps() {
    const container = document.getElementById('form-container');
    if (!container) return;

    const gradeOptions = CONFIG.GRADE_LEVELS.map((g) => `
      <button type="button" class="bubble-btn" data-field="gradeLevel" data-value="${g}">${g}</button>
    `).join('');

    const spaceOptions = CONFIG.SPACES.map((s) => `
      <button type="button" class="space-bubble-btn" data-field="space" data-value="${s.id}"
        style="--space-color:${s.color}">
        <span class="space-dot" style="background:${s.color}"></span>
        ${s.label}
      </button>
    `).join('');

    container.innerHTML = `
      <div class="form-progress">
        ${[1,2,3,4,5].map((n) => `
          <div class="progress-step" id="progress-${n}">
            <div class="progress-dot">${n}</div>
            <div class="progress-label">${this._stepLabel(n)}</div>
          </div>
        `).join('')}
        <div class="progress-line"><div class="progress-fill" id="progress-fill"></div></div>
      </div>

      <!-- Step 1: Name + Role -->
      <div class="form-step" id="step-1">
        <h2 class="step-title">Who's making this reservation?</h2>
        <p class="step-subtitle">Enter your name and select your role.</p>
        <div class="field-group">
          <label class="field-label">Your Full Name</label>
          <input type="text" id="teacherName" class="text-input" placeholder="e.g. Ms. Johnson"
            value="${this._escape(this.data.teacherName)}" autocomplete="name" />
        </div>
        <div class="field-group">
          <label class="field-label">Grade Level / Role</label>
          <div class="bubble-group" id="grade-bubbles">${gradeOptions}</div>
        </div>
      </div>

      <!-- Step 2: Purpose — dual mode -->
      <div class="form-step" id="step-2">

        <!-- Teacher mode -->
        <div id="purpose-normal">
          <h2 class="step-title">What is this reservation for?</h2>
          <p class="step-subtitle">Keep it short — 5 words or less.</p>
          <div class="field-group">
            <label class="field-label">Reservation Purpose</label>
            <textarea id="purpose" class="text-input textarea" rows="4"
              placeholder="e.g. Assembly, testing, practice, PE class...">${this._escape(this.data.purpose)}</textarea>
          </div>
          <div class="suggestion-chips">
            <span class="chip-label">Quick picks:</span>
            <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Popsicle Party')">🍭 Popsicle Party</button>
            <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Water Day')">💧 Water Day</button>
            <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Fingerpainting')">🎨 Fingerpainting</button>
            <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Tie Dye Party')">🌈 Tie Dye Party</button>
          </div>
        </div>

        <!-- Coach mode -->
        <div id="purpose-coach" style="display:none">
          <h2 class="step-title">What type of booking?</h2>
          <p class="step-subtitle">Select your reservation type.</p>
          <div class="bubble-group">
            <button type="button" class="bubble-btn" data-purpose="Practice"
              onclick="ReservationForm._onCoachPurposeSelect('Practice')">🏃 Practice</button>
            <button type="button" class="bubble-btn" data-purpose="Banquet"
              onclick="ReservationForm._onCoachPurposeSelect('Banquet')">🎉 Banquet</button>
          </div>
        </div>
      </div>

      <!-- Step 3: Space -->
      <div class="form-step" id="step-3">
        <h2 class="step-title">Which space are you reserving?</h2>
        <p class="step-subtitle">Select one space below.</p>
        <div class="space-bubble-group" id="space-bubbles">${spaceOptions}</div>
      </div>

      <!-- Step 4: Date & Time — dual mode -->
      <div class="form-step" id="step-4">

        <!-- Normal date/time entry (teachers + coach banquet) -->
        <div id="date-normal">
          <h2 class="step-title">When do you need it?</h2>
          <p class="step-subtitle">Add one or more dates and times for your reservation.</p>
          <div id="entry-form">
            <div class="field-group">
              <label class="field-label">Date</label>
              <input type="date" id="resDate" class="text-input" min="${this._todayStr()}" />
            </div>
            <div class="time-row">
              <div class="field-group">
                <label class="field-label">Start Time</label>
                ${this._buildTimePicker('startTime', '08:00')}
              </div>
              <div class="field-group">
                <label class="field-label">End Time</label>
                ${this._buildTimePicker('endTime', '09:00')}
              </div>
            </div>
            <button type="button" class="nav-btn primary" id="btn-add-entry"
              onclick="ReservationForm._addEntry()" style="margin-top:10px;width:100%">
              ＋ Add Date
            </button>
          </div>
          <div id="entries-list" style="margin-top:20px"></div>
          <div id="entries-empty" style="text-align:center;padding:16px;color:#AAAAAA;font-size:13px;">
            No dates added yet. Pick a date and time above, then click "Add Date".
          </div>
        </div>

        <!-- Coach practice recurring builder -->
        <div id="date-coach-practice" style="display:none">
          <h2 class="step-title">Build your practice schedule</h2>
          <p class="step-subtitle">Choose 2 days, set times for each, then pick your season dates.</p>

          <div class="field-group">
            <label class="field-label">Practice Days
              <span style="font-weight:400;color:var(--muted);font-size:12px"> — select exactly 2</span>
            </label>
            <div class="bubble-group">
              ${[1,2,3,4,5].map(d => `
                <button type="button" class="bubble-btn day-bubble" data-day="${d}"
                  onclick="ReservationForm._onDayBubbleClick(${d})">${DAY_NAMES_SHORT[d]}</button>
              `).join('')}
            </div>
          </div>

          <div id="coach-day-times" style="display:none;margin-top:4px">
            <div class="field-group">
              <label class="field-label" id="coach-day1-label">Day 1 Times</label>
              <div class="time-row">
                <div class="field-group" style="flex:1">
                  <label class="field-label" style="font-size:11px;color:var(--muted)">Start</label>
                  ${this._buildTimePicker('coachDay1Start', '15:30')}
                </div>
                <div class="field-group" style="flex:1">
                  <label class="field-label" style="font-size:11px;color:var(--muted)">End</label>
                  ${this._buildTimePicker('coachDay1End', '17:00')}
                </div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label" id="coach-day2-label">Day 2 Times</label>
              <div class="time-row">
                <div class="field-group" style="flex:1">
                  <label class="field-label" style="font-size:11px;color:var(--muted)">Start</label>
                  ${this._buildTimePicker('coachDay2Start', '15:30')}
                </div>
                <div class="field-group" style="flex:1">
                  <label class="field-label" style="font-size:11px;color:var(--muted)">End</label>
                  ${this._buildTimePicker('coachDay2End', '17:00')}
                </div>
              </div>
            </div>
            <div class="time-row">
              <div class="field-group" style="flex:1">
                <label class="field-label">First Practice</label>
                <input type="date" id="coach-start-date" class="text-input" min="${this._todayStr()}" />
              </div>
              <div class="field-group" style="flex:1">
                <label class="field-label">Last Practice</label>
                <input type="date" id="coach-end-date" class="text-input" />
              </div>
            </div>
            <button type="button" class="nav-btn primary" style="width:100%;margin-top:10px"
              onclick="ReservationForm._generatePracticeSchedule()">
              Generate Schedule →
            </button>
          </div>

          <div id="coach-entries-list" style="margin-top:16px"></div>
          <div id="coach-entries-empty" style="text-align:center;padding:20px 16px;color:#AAAAAA;font-size:13px;margin-top:8px">
            Select 2 days and click "Generate Schedule" to see your practice dates.
          </div>
        </div>
      </div>

      <!-- Step 5: Review -->
      <div class="form-step" id="step-5">
        <h2 class="step-title">Review your request</h2>
        <p class="step-subtitle">Make sure everything looks right before submitting.</p>
        <div class="review-card" id="review-card"></div>
        <p class="submit-note" id="submit-note">You'll receive an email confirmation shortly after submitting. Each date will be individually reviewed for approval.</p>
      </div>

      <!-- Navigation -->
      <div class="form-nav">
        <button type="button" class="nav-btn secondary" id="btn-back"   onclick="ReservationForm.back()">← Back</button>
        <button type="button" class="nav-btn primary"   id="btn-next"   onclick="ReservationForm.next()">Next →</button>
        <button type="button" class="nav-btn submit"    id="btn-submit" onclick="ReservationForm.submit()">Submit Request</button>
      </div>

      <div class="form-message error"   id="form-error"    style="display:none"></div>
      <div class="form-message warning" id="form-conflict" style="display:none"></div>
    `;

    this._attachBubbleListeners();
    this._renderEntriesList();
  },

  // ----------------------------------------------------------
  // Coach: grade selection triggers coach mode
  // ----------------------------------------------------------
  _onGradeSelect(value) {
    const wasCoach = this.data.isCoach;
    this.data.gradeLevel = value;
    this.data.isCoach = (value === 'Coach');

    if (wasCoach && !this.data.isCoach) {
      this.data.purpose   = '';
      this.data.coachDays = [];
      this.data.entries   = [];
      this.data.groupId   = null;
      const purposeEl = document.getElementById('purpose');
      if (purposeEl) purposeEl.value = '';
    }
    this._updateStep2Mode();
    this._updateStep4Mode();
    this._updatePreview();
  },

  _updateStep2Mode() {
    const normalEl = document.getElementById('purpose-normal');
    const coachEl  = document.getElementById('purpose-coach');
    if (!normalEl || !coachEl) return;
    normalEl.style.display = this.data.isCoach ? 'none' : 'block';
    coachEl.style.display  = this.data.isCoach ? 'block' : 'none';
  },

  _updateStep4Mode() {
    const normalEl  = document.getElementById('date-normal');
    const coachEl   = document.getElementById('date-coach-practice');
    const showCoach = this.data.isCoach && this.data.purpose === 'Practice';
    if (!normalEl || !coachEl) return;
    normalEl.style.display = showCoach ? 'none' : 'block';
    coachEl.style.display  = showCoach ? 'block' : 'none';
  },

  // ----------------------------------------------------------
  // Coach: purpose selection (Practice / Banquet)
  // ----------------------------------------------------------
  _onCoachPurposeSelect(purpose) {
    const wasPractice = this.data.purpose === 'Practice';
    this.data.purpose = purpose;

    if (wasPractice && purpose !== 'Practice') {
      this.data.entries   = [];
      this.data.coachDays = [];
      this.data.groupId   = null;
    }

    document.querySelectorAll('#purpose-coach .bubble-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.purpose === purpose);
    });

    this._updateStep4Mode();
    this._updatePreview();
  },

  // ----------------------------------------------------------
  // Coach: day bubble selection (exactly 2)
  // ----------------------------------------------------------
  _onDayBubbleClick(dayNum) {
    const idx = this.data.coachDays.indexOf(dayNum);
    if (idx >= 0) {
      this.data.coachDays.splice(idx, 1);
    } else {
      if (this.data.coachDays.length >= 2) return;
      this.data.coachDays.push(dayNum);
      this.data.coachDays.sort((a, b) => a - b);
    }

    document.querySelectorAll('.day-bubble').forEach(btn => {
      btn.classList.toggle('selected', this.data.coachDays.includes(parseInt(btn.dataset.day)));
    });

    const timesEl = document.getElementById('coach-day-times');
    if (timesEl) timesEl.style.display = this.data.coachDays.length === 2 ? 'block' : 'none';

    if (this.data.coachDays.length === 2) {
      const lbl1 = document.getElementById('coach-day1-label');
      const lbl2 = document.getElementById('coach-day2-label');
      if (lbl1) lbl1.textContent = DAY_NAMES[this.data.coachDays[0]] + ' Times';
      if (lbl2) lbl2.textContent = DAY_NAMES[this.data.coachDays[1]] + ' Times';
      // Reset entries when days change
      this.data.entries = [];
      this.data.groupId = null;
      this._renderCoachEntriesList();
    }
  },

  // ----------------------------------------------------------
  // Coach: generate practice schedule
  // ----------------------------------------------------------
  async _generatePracticeSchedule() {
    this._clearMessages();

    const [d1, d2] = this.data.coachDays;
    const startDateStr = (document.getElementById('coach-start-date') || {}).value || '';
    const endDateStr   = (document.getElementById('coach-end-date')   || {}).value || '';
    const day1Start    = this._getTimeValue('coachDay1Start');
    const day1End      = this._getTimeValue('coachDay1End');
    const day2Start    = this._getTimeValue('coachDay2Start');
    const day2End      = this._getTimeValue('coachDay2End');

    if (!startDateStr || !endDateStr) { this._showErr('Please select a first and last practice date.'); return; }
    if (startDateStr >= endDateStr)   { this._showErr('Last practice must be after first practice.'); return; }
    if (!day1Start || !day1End || day1Start >= day1End) {
      this._showErr(`Please set valid times for ${DAY_NAMES[d1]}.`); return;
    }
    if (!day2Start || !day2End || day2Start >= day2End) {
      this._showErr(`Please set valid times for ${DAY_NAMES[d2]}.`); return;
    }

    const btn = document.querySelector('#date-coach-practice .nav-btn.primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

    // Fetch school holidays to skip
    let holidays = {};
    try {
      const url = CONFIG.SCRIPT_URL + '?action=getHolidays&token=' + encodeURIComponent(Auth.getToken());
      const res  = await fetch(url);
      const json = await res.json();
      (json.holidays || []).forEach(d => { holidays[d] = true; });
    } catch (_) { /* proceed without holiday list */ }

    if (btn) { btn.disabled = false; btn.textContent = 'Generate Schedule →'; }

    // Generate all matching dates
    const entries = [];
    const cur = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr   + 'T00:00:00');

    while (cur <= end) {
      const jsDay  = cur.getDay(); // 0=Sun,1=Mon…5=Fri,6=Sat
      const dateStr = cur.toISOString().split('T')[0];

      if (!holidays[dateStr]) {
        if (jsDay === d1) entries.push({ date: dateStr, startTime: day1Start, endTime: day1End });
        else if (jsDay === d2) entries.push({ date: dateStr, startTime: day2Start, endTime: day2End });
      }

      cur.setDate(cur.getDate() + 1);
    }

    if (entries.length === 0) {
      this._showErr('No practice dates found in that range. Check your day selections and dates.');
      return;
    }

    this.data.entries = entries;
    this.data.groupId = this._generateId();
    this._renderCoachEntriesList();
    this._updatePreview();
  },

  _renderCoachEntriesList() {
    const listEl  = document.getElementById('coach-entries-list');
    const emptyEl = document.getElementById('coach-entries-empty');
    if (!listEl || !emptyEl) return;

    if (this.data.entries.length === 0) {
      listEl.innerHTML   = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';

    let html = `<div class="entries-header">${this.data.entries.length} practice dates generated</div>`;
    html += this.data.entries.map((entry, i) => `
      <div class="entry-chip">
        <div class="entry-chip-info">
          <div class="entry-chip-date">${this._formatDateShort(entry.date)}</div>
          <div class="entry-chip-time">${this._formatTimeStr(entry.startTime)} – ${this._formatTimeStr(entry.endTime)}</div>
        </div>
        <button type="button" class="entry-chip-remove"
          onclick="ReservationForm._removeCoachEntry(${i})" title="Remove">✕</button>
      </div>
    `).join('');

    listEl.innerHTML = html;
  },

  _removeCoachEntry(index) {
    this.data.entries.splice(index, 1);
    this._renderCoachEntriesList();
    this._updatePreview();
  },

  // ----------------------------------------------------------
  // Normal multi-entry management
  // ----------------------------------------------------------
  _addEntry() {
    const dateEl = document.getElementById('resDate');
    const date = dateEl ? dateEl.value : '';
    const startTime = this._getTimeValue('startTime');
    const endTime   = this._getTimeValue('endTime');

    if (!date) { this._showErr('Please select a date.'); return; }
    if (!startTime || !endTime) { this._showErr('Please select start and end time.'); return; }
    if (startTime >= endTime) { this._showErr('End time must be after start time.'); return; }
    if (new Date(date) < new Date(this._todayStr())) { this._showErr('Please select a future date.'); return; }

    const duplicate = this.data.entries.some(e => e.date === date && e.startTime === startTime && e.endTime === endTime);
    if (duplicate) { this._showErr('This exact date and time combination has already been added.'); return; }

    this.data.entries.push({ date, startTime, endTime });
    this._renderEntriesList();
    this._updatePreview();

    if (dateEl) dateEl.value = '';
    this._resetTimePicker('startTime', '08:00');
    this._resetTimePicker('endTime', '09:00');
    this._clearMessages();
  },

  _removeEntry(index) {
    this.data.entries.splice(index, 1);
    this._renderEntriesList();
    this._updatePreview();
  },

  _resetTimePicker(fieldId, initialValue) {
    let h24 = 8, min = 0;
    if (initialValue) { const p = initialValue.split(':'); h24 = parseInt(p[0]) || 8; min = parseInt(p[1]) || 0; }
    const isPM = h24 >= 12;
    const h12  = h24 % 12 || 12;
    const minR = Math.round(min / 5) * 5 % 60;
    const hEl  = document.getElementById(`tp-h-${fieldId}`);
    const mEl  = document.getElementById(`tp-m-${fieldId}`);
    if (hEl) hEl.value = String(h12);
    if (mEl) mEl.value = String(minR);
    document.querySelectorAll(`#tp-${fieldId} .tp-ampm-btn`).forEach(btn => {
      btn.classList.toggle('active', btn.textContent === (isPM ? 'PM' : 'AM'));
    });
  },

  _renderEntriesList() {
    const listEl  = document.getElementById('entries-list');
    const emptyEl = document.getElementById('entries-empty');
    if (!listEl || !emptyEl) return;

    if (this.data.entries.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';

    const sorted = [...this.data.entries].map((e, i) => ({ ...e, origIndex: i }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = `<div class="entries-header">Dates Added</div>`;
    html += sorted.map(entry => `
      <div class="entry-chip">
        <div class="entry-chip-info">
          <div class="entry-chip-date">${this._formatDateShort(entry.date)}</div>
          <div class="entry-chip-time">${this._formatTimeStr(entry.startTime)} – ${this._formatTimeStr(entry.endTime)}</div>
        </div>
        <button type="button" class="entry-chip-remove"
          onclick="ReservationForm._removeEntry(${entry.origIndex})" title="Remove">✕</button>
      </div>
    `).join('');

    listEl.innerHTML = html;
  },

  // ----------------------------------------------------------
  // Custom time picker
  // ----------------------------------------------------------
  _buildTimePicker(fieldId, initialValue) {
    let h24 = 8, min = 0;
    if (initialValue) { const p = initialValue.split(':'); h24 = parseInt(p[0]) || 8; min = parseInt(p[1]) || 0; }
    const isPM = h24 >= 12;
    const h12  = h24 % 12 || 12;
    const minR = Math.round(min / 5) * 5 % 60;

    const hours   = [1,2,3,4,5,6,7,8,9,10,11,12];
    const minutes = [0,5,10,15,20,25,30,35,40,45,50,55];

    const hOpts = hours.map(h =>
      `<option value="${h}" ${h === h12 ? 'selected' : ''}>${String(h).padStart(2,'0')}</option>`).join('');
    const mOpts = minutes.map(m =>
      `<option value="${m}" ${m === minR ? 'selected' : ''}>${String(m).padStart(2,'0')}</option>`).join('');

    return `
      <div class="tp" id="tp-${fieldId}">
        <select class="tp-sel" id="tp-h-${fieldId}" onchange="ReservationForm._onTimeChange('${fieldId}')">${hOpts}</select>
        <span class="tp-colon">:</span>
        <select class="tp-sel" id="tp-m-${fieldId}" onchange="ReservationForm._onTimeChange('${fieldId}')">${mOpts}</select>
        <div class="tp-ampm">
          <button type="button" class="tp-ampm-btn${!isPM ? ' active' : ''}"
            onclick="ReservationForm._setAMPM('${fieldId}','AM')">AM</button>
          <button type="button" class="tp-ampm-btn${isPM ? ' active' : ''}"
            onclick="ReservationForm._setAMPM('${fieldId}','PM')">PM</button>
        </div>
      </div>`;
  },

  _setAMPM(fieldId, val) {
    document.querySelectorAll(`#tp-${fieldId} .tp-ampm-btn`).forEach(btn => {
      btn.classList.toggle('active', btn.textContent === val);
    });
    this._onTimeChange(fieldId);
  },

  _getTimeValue(fieldId) {
    const hEl  = document.getElementById(`tp-h-${fieldId}`);
    const mEl  = document.getElementById(`tp-m-${fieldId}`);
    const amEl = document.querySelector(`#tp-${fieldId} .tp-ampm-btn.active`);
    if (!hEl || !mEl || !amEl) return '';
    let h = parseInt(hEl.value) % 12;
    if (amEl.textContent === 'PM') h += 12;
    return `${String(h).padStart(2,'0')}:${String(parseInt(mEl.value)).padStart(2,'0')}`;
  },

  _onTimeChange() { this._updatePreview(); },

  // ----------------------------------------------------------
  // Navigation
  // ----------------------------------------------------------
  _showStep(n) {
    for (let i = 1; i <= this.totalSteps; i++) {
      const el = document.getElementById(`step-${i}`);
      if (el) el.classList.toggle('active', i === n);
    }
    this._updateProgress(n);
    this._updateNav(n);
    this._restoreSelections(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this._clearMessages();
    this.currentStep = n;

    if (n === 2) this._updateStep2Mode();
    if (n === 4) {
      this._updateStep4Mode();
      this._renderEntriesList();
      if (this.data.isCoach && this.data.purpose === 'Practice') {
        this._renderCoachEntriesList();
      }
      if (this._urlDate) {
        const dateInput = document.getElementById('resDate');
        if (dateInput && !dateInput.value) dateInput.value = this._urlDate;
      }
    }

    // Step 5: narrow layout + update submit note for coaches
    const layout = document.getElementById('reserve-layout');
    if (layout) layout.classList.toggle('step-review', n === this.totalSteps);
    if (n === this.totalSteps) {
      const note = document.getElementById('submit-note');
      if (note && this.data.isCoach && this.data.purpose === 'Practice') {
        note.textContent = `You'll receive a confirmation email with your full practice schedule. Each date is reviewed individually.`;
      }
    }
  },

  _updateProgress(n) {
    for (let i = 1; i <= this.totalSteps; i++) {
      const dot = document.getElementById(`progress-${i}`);
      if (!dot) continue;
      dot.classList.toggle('completed', i < n);
      dot.classList.toggle('active',    i === n);
    }
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = `${((n - 1) / (this.totalSteps - 1)) * 100}%`;
  },

  _updateNav(n) {
    const back   = document.getElementById('btn-back');
    const next   = document.getElementById('btn-next');
    const submit = document.getElementById('btn-submit');
    if (back)   back.style.display   = n === 1 ? 'none' : 'inline-flex';
    if (next)   next.style.display   = n === this.totalSteps ? 'none' : 'inline-flex';
    if (submit) submit.style.display = n === this.totalSteps ? 'inline-flex' : 'none';
  },

  next() {
    if (!this._validateStep(this.currentStep)) return;
    this._saveStep(this.currentStep);
    if (this.currentStep === this.totalSteps - 1) this._buildReviewCard();
    this._showStep(this.currentStep + 1);
    this._updatePreview();
  },

  back() {
    this._saveStep(this.currentStep);
    this._showStep(this.currentStep - 1);
    this._updatePreview();
  },

  // ----------------------------------------------------------
  // Validation
  // ----------------------------------------------------------
  _validateStep(n) {
    this._clearMessages();
    if (n === 1) {
      if (!document.getElementById('teacherName').value.trim()) {
        this._showErr('Please enter your name.'); return false;
      }
      if (!this.data.gradeLevel) {
        this._showErr('Please select a grade level or role.'); return false;
      }
    }
    if (n === 2) {
      if (this.data.isCoach) {
        if (!this.data.purpose) {
          this._showErr('Please select Practice or Banquet.'); return false;
        }
      } else {
        if (!document.getElementById('purpose').value.trim()) {
          this._showErr('Please describe the purpose.'); return false;
        }
      }
    }
    if (n === 3) {
      if (!this.data.space) { this._showErr('Please select a space.'); return false; }
    }
    if (n === 4) {
      if (this.data.entries.length === 0) {
        if (this.data.isCoach && this.data.purpose === 'Practice') {
          this._showErr('Please generate your practice schedule first.');
        } else {
          this._showErr('Please add at least one date and time.');
        }
        return false;
      }
    }
    return true;
  },

  _saveStep(n) {
    if (n === 1) this.data.teacherName = document.getElementById('teacherName').value.trim();
    if (n === 2 && !this.data.isCoach) {
      this.data.purpose = document.getElementById('purpose').value.trim();
    }
  },

  _restoreSelections(n) {
    if (n === 1 && this.data.gradeLevel) {
      document.querySelectorAll('[data-field="gradeLevel"]').forEach(b =>
        b.classList.toggle('selected', b.dataset.value === this.data.gradeLevel));
    }
    if (n === 2 && this.data.isCoach && this.data.purpose) {
      document.querySelectorAll('#purpose-coach .bubble-btn').forEach(btn =>
        btn.classList.toggle('selected', btn.dataset.purpose === this.data.purpose));
    }
    if (n === 3 && this.data.space) {
      document.querySelectorAll('[data-field="space"]').forEach(b =>
        b.classList.toggle('selected', b.dataset.value === this.data.space));
    }
    if (n === 4 && this.data.isCoach && this.data.coachDays.length === 2) {
      document.querySelectorAll('.day-bubble').forEach(btn => {
        btn.classList.toggle('selected', this.data.coachDays.includes(parseInt(btn.dataset.day)));
      });
      const timesEl = document.getElementById('coach-day-times');
      if (timesEl) timesEl.style.display = 'block';
      const lbl1 = document.getElementById('coach-day1-label');
      const lbl2 = document.getElementById('coach-day2-label');
      if (lbl1) lbl1.textContent = DAY_NAMES[this.data.coachDays[0]] + ' Times';
      if (lbl2) lbl2.textContent = DAY_NAMES[this.data.coachDays[1]] + ' Times';
    }
  },

  // ----------------------------------------------------------
  // Review card
  // ----------------------------------------------------------
  _buildReviewCard() {
    const space = CONFIG.SPACES.find(s => s.id === this.data.space);
    const card  = document.getElementById('review-card');
    if (!card) return;

    const sorted = [...this.data.entries].sort((a, b) => new Date(a.date) - new Date(b.date));

    let entriesHtml = '';
    sorted.forEach(entry => {
      entriesHtml += `
        <div class="review-entry-item">
          <span class="review-entry-dot" style="background:${space ? space.color : '#6B7280'}"></span>
          <div class="review-entry-info">
            <div class="review-entry-date">${this._formatDateStr(entry.date)}</div>
            <div class="review-entry-time">${this._formatTimeStr(entry.startTime)} – ${this._formatTimeStr(entry.endTime)}</div>
          </div>
        </div>`;
    });

    const roleLabel  = this.data.isCoach ? 'Role' : 'Grade Level';
    const roleValue  = this.data.gradeLevel;
    const countLabel = (this.data.isCoach && this.data.purpose === 'Practice')
      ? `Practice Dates (${this.data.entries.length})`
      : `Dates & Times (${this.data.entries.length})`;

    card.innerHTML = `
      <div class="review-row"><span class="review-label">Name</span><span class="review-value">${this._escape(this.data.teacherName)}</span></div>
      <div class="review-row"><span class="review-label">${roleLabel}</span><span class="review-value">${this._escape(roleValue)}</span></div>
      <div class="review-row"><span class="review-label">Purpose</span><span class="review-value">${this._escape(this.data.purpose)}</span></div>
      <div class="review-row"><span class="review-label">Space</span>
        <span class="review-value">
          <span class="review-space-dot" style="background:${space ? space.color : '#6B7280'}"></span>
          ${space ? space.label : this.data.space}
        </span>
      </div>
      <div class="review-entries-section">
        <div class="review-entries-label">${countLabel}</div>
        ${entriesHtml}
      </div>
    `;
  },

  // ----------------------------------------------------------
  // Submit
  // ----------------------------------------------------------
  submit() {
    this._saveStep(4);
    this._clearMessages();

    if (this.data.entries.length === 0) {
      this._showErr('Please add at least one date and time.');
      return;
    }

    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const groupId = (this.data.isCoach && this.data.purpose === 'Practice')
      ? (this.data.groupId || this._generateId())
      : null;
    this.data.groupId = groupId;

    const payload = {
      action:      'submit',
      token:       Auth.getToken(),
      teacherName: this.data.teacherName,
      gradeLevel:  this.data.gradeLevel,
      purpose:     this.data.purpose,
      space:       this.data.space,
      entries:     this.data.entries,
      isCoach:     this.data.isCoach,
      groupId:     groupId,
      date:        this.data.entries.length > 0 ? this.data.entries[0].date : '',
      startTime:   this.data.entries.length > 0 ? this.data.entries[0].startTime : '',
      endTime:     this.data.entries.length > 0 ? this.data.entries[0].endTime : '',
    };

    fetch(CONFIG.SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(data => {
        btn.disabled = false;
        btn.textContent = 'Submit Request';

        if (data.conflict) {
          const el = document.getElementById('form-conflict');
          el.innerHTML = `<strong>Scheduling Conflict:</strong> ${this._escape(data.message)}`;
          el.style.display = 'block';
          return;
        }
        if (!data.success) {
          this._showErr(data.message || 'Something went wrong. Please try again.');
          return;
        }
        this._showConfirmation(data);
      })
      .catch(err => {
        console.error('Submit error:', err);
        btn.disabled = false;
        btn.textContent = 'Submit Request';
        this._showErr('Could not connect to the server. Please check your connection and try again.');
      });
  },

  // ----------------------------------------------------------
  // Confirmation
  // ----------------------------------------------------------
  _showConfirmation(data) {
    const formCard = document.querySelector('.form-card');
    if (!formCard) return;
    const space = CONFIG.SPACES.find(s => s.id === this.data.space);
    const count = data.saved || this.data.entries.length;

    const sorted = [...this.data.entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    let entriesSummaryHtml = sorted.map(entry => `
      <div class="review-entry-item">
        <span class="review-entry-dot" style="background:${space ? space.color : '#6B7280'}"></span>
        <div class="review-entry-info">
          <div class="review-entry-date">${this._formatDateStr(entry.date)}</div>
          <div class="review-entry-time">${this._formatTimeStr(entry.startTime)} – ${this._formatTimeStr(entry.endTime)}</div>
        </div>
      </div>`).join('');

    const skipped = data.skippedHolidays || 0;
    const holidayNote = skipped > 0
      ? `<p style="font-size:13px;color:var(--muted);margin-top:6px">${skipped} date${skipped > 1 ? 's' : ''} skipped (school holiday).</p>`
      : '';

    formCard.innerHTML = `
      <div class="confirmation-screen">
        <div class="confirm-icon">✓</div>
        <h2 class="confirm-title">Request Submitted!</h2>
        <p class="confirm-msg">
          Your reservation request for <strong>${count} date${count !== 1 ? 's' : ''}</strong>
          is <strong>pending approval</strong>.
          A confirmation email has been sent to you.
        </p>
        ${holidayNote}
        <div class="confirm-summary review-card">
          <div class="review-row"><span class="review-label">Name</span><span class="review-value">${this._escape(this.data.teacherName)}</span></div>
          <div class="review-row"><span class="review-label">Space</span>
            <span class="review-value">
              <span class="review-space-dot" style="background:${space ? space.color : '#6B7280'}"></span>
              ${space ? space.label : this.data.space}
            </span>
          </div>
          <div class="review-entries-section">
            <div class="review-entries-label">Dates & Times (${count})</div>
            ${entriesSummaryHtml}
          </div>
        </div>
        <div class="confirm-actions">
          <a href="index.html" class="nav-btn primary">View Calendar</a>
          <button type="button" class="nav-btn secondary" onclick="ReservationForm.reset()">Submit Another</button>
        </div>
      </div>
    `;
  },

  // ----------------------------------------------------------
  // Reset
  // ----------------------------------------------------------
  reset() {
    this.data = { teacherName: '', gradeLevel: '', isCoach: false, purpose: '', space: '', entries: [], coachDays: [], groupId: null };
    this.currentStep = 1;
    const formCard = document.querySelector('.form-card');
    if (formCard) formCard.innerHTML = '<div id="form-container"></div>';
    this._buildSteps();
    this._showStep(1);
  },

  // ----------------------------------------------------------
  // Bubble & input listeners
  // ----------------------------------------------------------
  _attachBubbleListeners() {
    document.querySelectorAll('.bubble-btn, .space-bubble-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        if (!field) return; // coach purpose / day bubbles have their own onclick
        if (field === 'gradeLevel') {
          this._onGradeSelect(value);
        } else {
          this.data[field] = value;
        }
        document.querySelectorAll(`[data-field="${field}"]`).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this._updatePreview();
      });
    });

    const nameEl = document.getElementById('teacherName');
    if (nameEl) nameEl.addEventListener('input', () => { this.data.teacherName = nameEl.value.trim(); this._updatePreview(); });

    const purposeEl = document.getElementById('purpose');
    if (purposeEl) purposeEl.addEventListener('input', () => { this.data.purpose = purposeEl.value.trim(); this._updatePreview(); });
  },

  _fillPurpose(text) {
    const el = document.getElementById('purpose');
    if (el) el.value = text;
    this.data.purpose = text;
    this._updatePreview();
  },

  // ----------------------------------------------------------
  // Live preview
  // ----------------------------------------------------------
  _updatePreview() {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (val) { el.textContent = val; el.classList.remove('preview-field-empty'); }
      else     { el.textContent = '—'; el.classList.add('preview-field-empty'); }
    };

    const d = this.data;
    const titleEl = document.getElementById('preview-title');
    if (titleEl) {
      titleEl.textContent = d.purpose || 'Your Reservation';
      titleEl.classList.toggle('preview-empty-title', !d.purpose);
    }

    set('preview-teacher', d.teacherName || (document.getElementById('teacherName') || {}).value);
    set('preview-grade',   d.gradeLevel);

    if (d.entries.length > 0) {
      const sorted = [...d.entries].sort((a, b) => new Date(a.date) - new Date(b.date));
      if (d.entries.length === 1) {
        set('preview-date', this._formatDateStr(sorted[0].date));
        set('preview-time', `${this._formatTimeStr(sorted[0].startTime)} – ${this._formatTimeStr(sorted[0].endTime)}`);
      } else {
        set('preview-date', `${d.entries.length} dates selected`);
        set('preview-time', `${this._formatDateShort(sorted[0].date)} – ${this._formatDateShort(sorted[d.entries.length - 1].date)}`);
      }
    } else {
      set('preview-date', '');
      set('preview-time', '');
    }

    const spaceEl = document.getElementById('preview-space');
    if (spaceEl) {
      const sc = typeof CONFIG !== 'undefined' ? (CONFIG.SPACES || []).find(s => s.id === d.space) : null;
      if (sc) {
        spaceEl.innerHTML = `<span class="preview-space-chip" style="background:${sc.color}18;color:${sc.color};border-color:${sc.color}44"><span class="preview-space-dot-sm" style="background:${sc.color}"></span>${sc.label}</span>`;
        spaceEl.classList.remove('preview-field-empty');
      } else {
        spaceEl.textContent = '—'; spaceEl.classList.add('preview-field-empty');
      }
    }

    const bar = document.getElementById('preview-bar');
    if (bar) {
      const sp = typeof CONFIG !== 'undefined' ? (CONFIG.SPACES || []).find(s => s.id === d.space) : null;
      bar.style.background = sp ? sp.color : '#E2E2E2';
    }
  },

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  },
  _stepLabel(n)  { return ['Info','Purpose','Space','Schedule','Review'][n - 1]; },
  _clearMessages() {
    ['form-error','form-conflict'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    });
  },
  _showErr(msg) {
    const el = document.getElementById('form-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },
  _todayStr() { return new Date().toISOString().split('T')[0]; },
  _formatDateStr(str) {
    if (!str) return '';
    return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  },
  _formatDateShort(str) {
    if (!str) return '';
    return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },
  _formatTimeStr(str) {
    if (!str) return '';
    const [h, m] = str.split(':');
    const d = new Date(); d.setHours(+h, +m);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },
  _escape(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
