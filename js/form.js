// ============================================================
// form.js — 5-step reservation wizard
// ============================================================

const ReservationForm = {
  currentStep: 1,
  totalSteps: 5,
  data: {
    teacherName: '',
    gradeLevel: '',
    purpose: '',
    space: '',
    date: '',
    startTime: '',
    endTime: '',
  },

  // ----------------------------------------------------------
  // Build and initialize the form after auth succeeds
  // ----------------------------------------------------------
  init() {
    this._buildSteps();
    this._showStep(1);
  },

  // ----------------------------------------------------------
  // Inject step HTML into the page
  // ----------------------------------------------------------
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
      <!-- Progress bar -->
      <div class="form-progress">
        ${[1,2,3,4,5].map((n) => `
          <div class="progress-step" id="progress-${n}">
            <div class="progress-dot">${n}</div>
            <div class="progress-label">${this._stepLabel(n)}</div>
          </div>
        `).join('')}
        <div class="progress-line"><div class="progress-fill" id="progress-fill"></div></div>
      </div>

      <!-- Step 1: Teacher Info -->
      <div class="form-step" id="step-1">
        <h2 class="step-title">Who's making this reservation?</h2>
        <p class="step-subtitle">Enter your name and grade level.</p>
        <div class="field-group">
          <label class="field-label">Your Full Name</label>
          <input type="text" id="teacherName" class="text-input" placeholder="e.g. Ms. Johnson"
            value="${this._escape(this.data.teacherName)}" autocomplete="name" />
        </div>
        <div class="field-group">
          <label class="field-label">Grade Level</label>
          <div class="bubble-group" id="grade-bubbles">
            ${gradeOptions}
          </div>
        </div>
      </div>

      <!-- Step 2: Purpose -->
      <div class="form-step" id="step-2">
        <h2 class="step-title">What is this reservation for?</h2>
        <p class="step-subtitle">Describe the purpose of your reservation.</p>
        <div class="field-group">
          <label class="field-label">Reservation Purpose</label>
          <textarea id="purpose" class="text-input textarea" rows="4"
            placeholder="e.g. Grade level assembly, testing, practice, class activity...">${this._escape(this.data.purpose)}</textarea>
        </div>
        <div class="suggestion-chips">
          <span class="chip-label">Quick picks:</span>
          <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Grade level assembly')">Grade level assembly</button>
          <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Testing')">Testing</button>
          <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Practice')">Practice</button>
          <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('Class activity')">Class activity</button>
          <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('PE class')">PE class</button>
          <button type="button" class="suggestion-chip" onclick="ReservationForm._fillPurpose('School event')">School event</button>
        </div>
      </div>

      <!-- Step 3: Space Selection -->
      <div class="form-step" id="step-3">
        <h2 class="step-title">Which space are you reserving?</h2>
        <p class="step-subtitle">Select one space below.</p>
        <div class="space-bubble-group" id="space-bubbles">
          ${spaceOptions}
        </div>
      </div>

      <!-- Step 4: Date & Time -->
      <div class="form-step" id="step-4">
        <h2 class="step-title">When do you need it?</h2>
        <p class="step-subtitle">Select the date and time for your reservation.</p>
        <div class="field-group">
          <label class="field-label">Date</label>
          <input type="date" id="resDate" class="text-input" min="${this._todayStr()}" value="${this.data.date}" />
        </div>
        <div class="time-row">
          <div class="field-group">
            <label class="field-label">Start Time</label>
            <input type="time" id="startTime" class="text-input" value="${this.data.startTime}" />
          </div>
          <div class="field-group">
            <label class="field-label">End Time</label>
            <input type="time" id="endTime" class="text-input" value="${this.data.endTime}" />
          </div>
        </div>
      </div>

      <!-- Step 5: Review -->
      <div class="form-step" id="step-5">
        <h2 class="step-title">Review your request</h2>
        <p class="step-subtitle">Make sure everything looks right before submitting.</p>
        <div class="review-card" id="review-card">
          <!-- filled by _buildReviewCard() -->
        </div>
        <p class="submit-note">Once submitted, an admin will review and approve your request. You'll see it on the calendar once approved.</p>
      </div>

      <!-- Navigation buttons -->
      <div class="form-nav">
        <button type="button" class="nav-btn secondary" id="btn-back" onclick="ReservationForm.back()">← Back</button>
        <button type="button" class="nav-btn primary" id="btn-next" onclick="ReservationForm.next()">Next →</button>
        <button type="button" class="nav-btn submit" id="btn-submit" onclick="ReservationForm.submit()">Submit Request</button>
      </div>

      <!-- Feedback messages -->
      <div class="form-message error" id="form-error" style="display:none"></div>
      <div class="form-message warning" id="form-conflict" style="display:none"></div>

      <!-- Confirmation screen (replaces form on success) -->
      <div class="confirmation-screen" id="confirmation" style="display:none">
        <div class="confirm-icon">✓</div>
        <h2 class="confirm-title">Request Submitted!</h2>
        <p class="confirm-msg">Your reservation request has been submitted and is <strong>pending approval</strong>. An admin will review it and add it to the calendar once approved.</p>
        <div class="confirm-summary" id="confirm-summary"></div>
        <a href="index.html" class="nav-btn primary confirm-home-btn">View Calendar</a>
        <button type="button" class="nav-btn secondary confirm-new-btn" onclick="ReservationForm.reset()">Submit Another</button>
      </div>
    `;

    // Attach bubble button listeners
    this._attachBubbleListeners();
  },

  // ----------------------------------------------------------
  // Navigate to a step
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
  },

  _updateProgress(n) {
    for (let i = 1; i <= this.totalSteps; i++) {
      const dot = document.getElementById(`progress-${i}`);
      if (!dot) continue;
      dot.classList.toggle('completed', i < n);
      dot.classList.toggle('active', i === n);
    }
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = `${((n - 1) / (this.totalSteps - 1)) * 100}%`;
  },

  _updateNav(n) {
    const back = document.getElementById('btn-back');
    const next = document.getElementById('btn-next');
    const submit = document.getElementById('btn-submit');
    if (back) back.style.display = n === 1 ? 'none' : 'inline-flex';
    if (next) next.style.display = n === this.totalSteps ? 'none' : 'inline-flex';
    if (submit) submit.style.display = n === this.totalSteps ? 'inline-flex' : 'none';
  },

  // ----------------------------------------------------------
  // Next / Back navigation
  // ----------------------------------------------------------
  next() {
    if (!this._validateStep(this.currentStep)) return;
    this._saveStep(this.currentStep);
    if (this.currentStep === this.totalSteps - 1) this._buildReviewCard();
    this._showStep(this.currentStep + 1);
  },

  back() {
    this._saveStep(this.currentStep);
    this._showStep(this.currentStep - 1);
  },

  // ----------------------------------------------------------
  // Validate current step before advancing
  // ----------------------------------------------------------
  _validateStep(n) {
    const err = document.getElementById('form-error');
    this._clearMessages();

    if (n === 1) {
      const name = document.getElementById('teacherName').value.trim();
      if (!name) { this._showErr('Please enter your name.'); return false; }
      if (!this.data.gradeLevel) { this._showErr('Please select a grade level.'); return false; }
    }
    if (n === 2) {
      const purpose = document.getElementById('purpose').value.trim();
      if (!purpose) { this._showErr('Please describe the purpose of your reservation.'); return false; }
    }
    if (n === 3) {
      if (!this.data.space) { this._showErr('Please select a space.'); return false; }
    }
    if (n === 4) {
      const date = document.getElementById('resDate').value;
      const start = document.getElementById('startTime').value;
      const end = document.getElementById('endTime').value;
      if (!date) { this._showErr('Please select a date.'); return false; }
      if (!start) { this._showErr('Please select a start time.'); return false; }
      if (!end) { this._showErr('Please select an end time.'); return false; }
      if (start >= end) { this._showErr('End time must be after start time.'); return false; }
      if (new Date(date) < new Date(this._todayStr())) {
        this._showErr('Please select a date in the future.'); return false;
      }
    }
    return true;
  },

  // ----------------------------------------------------------
  // Save current step inputs into this.data
  // ----------------------------------------------------------
  _saveStep(n) {
    if (n === 1) {
      this.data.teacherName = document.getElementById('teacherName').value.trim();
    }
    if (n === 2) {
      this.data.purpose = document.getElementById('purpose').value.trim();
    }
    if (n === 4) {
      this.data.date = document.getElementById('resDate').value;
      this.data.startTime = document.getElementById('startTime').value;
      this.data.endTime = document.getElementById('endTime').value;
    }
  },

  // ----------------------------------------------------------
  // Re-apply saved selections when going back to a step
  // ----------------------------------------------------------
  _restoreSelections(n) {
    if (n === 1 && this.data.gradeLevel) {
      document.querySelectorAll('[data-field="gradeLevel"]').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.value === this.data.gradeLevel);
      });
    }
    if (n === 3 && this.data.space) {
      document.querySelectorAll('[data-field="space"]').forEach((btn) => {
        btn.classList.toggle('selected', btn.dataset.value === this.data.space);
      });
    }
  },

  // ----------------------------------------------------------
  // Build the review card on step 5
  // ----------------------------------------------------------
  _buildReviewCard() {
    this._saveStep(4);
    const space = CONFIG.SPACES.find((s) => s.id === this.data.space);
    const card = document.getElementById('review-card');
    if (!card) return;

    card.innerHTML = `
      <div class="review-row">
        <span class="review-label">Teacher</span>
        <span class="review-value">${this._escape(this.data.teacherName)}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Grade Level</span>
        <span class="review-value">${this._escape(this.data.gradeLevel)}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Purpose</span>
        <span class="review-value">${this._escape(this.data.purpose)}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Space</span>
        <span class="review-value">
          <span class="review-space-dot" style="background:${space ? space.color : '#6B7280'}"></span>
          ${space ? space.label : this.data.space}
        </span>
      </div>
      <div class="review-row">
        <span class="review-label">Date</span>
        <span class="review-value">${this._formatDateStr(this.data.date)}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Time</span>
        <span class="review-value">${this._formatTimeStr(this.data.startTime)} – ${this._formatTimeStr(this.data.endTime)}</span>
      </div>
    `;
  },

  // ----------------------------------------------------------
  // Submit the form to Apps Script
  // ----------------------------------------------------------
  submit() {
    this._saveStep(4);
    this._clearMessages();

    const submitBtn = document.getElementById('btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const payload = {
      action: 'submit',
      token: Auth.getToken(),
      teacherName: this.data.teacherName,
      gradeLevel: this.data.gradeLevel,
      purpose: this.data.purpose,
      space: this.data.space,
      date: this.data.date,
      startTime: this.data.startTime,
      endTime: this.data.endTime,
    };

    fetch(CONFIG.SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';

        if (data.conflict) {
          const el = document.getElementById('form-conflict');
          el.innerHTML = `<strong>Scheduling Conflict:</strong> ${this._escape(data.message)} Please go back and choose a different time or space.`;
          el.style.display = 'block';
          return;
        }

        if (!data.success) {
          this._showErr(data.message || 'Something went wrong. Please try again.');
          return;
        }

        this._showConfirmation();
      })
      .catch((err) => {
        console.error('Submit error:', err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
        this._showErr('Could not connect to the server. Please check your connection and try again.');
      });
  },

  // ----------------------------------------------------------
  // Show confirmation screen
  // ----------------------------------------------------------
  _showConfirmation() {
    document.getElementById('form-container').style.display = 'none';
    const conf = document.getElementById('confirmation');
    conf.style.display = 'block';

    const space = CONFIG.SPACES.find((s) => s.id === this.data.space);
    document.getElementById('confirm-summary').innerHTML = `
      <div class="review-row"><span class="review-label">Teacher</span><span class="review-value">${this._escape(this.data.teacherName)}</span></div>
      <div class="review-row"><span class="review-label">Space</span><span class="review-value">${space ? space.label : this.data.space}</span></div>
      <div class="review-row"><span class="review-label">Date</span><span class="review-value">${this._formatDateStr(this.data.date)}</span></div>
      <div class="review-row"><span class="review-label">Time</span><span class="review-value">${this._formatTimeStr(this.data.startTime)} – ${this._formatTimeStr(this.data.endTime)}</span></div>
    `;
  },

  // ----------------------------------------------------------
  // Reset the form for a new submission
  // ----------------------------------------------------------
  reset() {
    this.data = { teacherName: '', gradeLevel: '', purpose: '', space: '', date: '', startTime: '', endTime: '' };
    this.currentStep = 1;
    document.getElementById('confirmation').style.display = 'none';
    const fc = document.getElementById('form-container');
    fc.style.display = 'block';
    fc.innerHTML = '';
    this._buildSteps();
    this._showStep(1);
  },

  // ----------------------------------------------------------
  // Bubble button click handling
  // ----------------------------------------------------------
  _attachBubbleListeners() {
    document.querySelectorAll('.bubble-btn, .space-bubble-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;
        this.data[field] = value;
        document.querySelectorAll(`[data-field="${field}"]`).forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  },

  _fillPurpose(text) {
    const el = document.getElementById('purpose');
    if (el) el.value = text;
    this.data.purpose = text;
  },

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  _stepLabel(n) {
    return ['Info', 'Purpose', 'Space', 'Date & Time', 'Review'][n - 1];
  },

  _clearMessages() {
    ['form-error', 'form-conflict'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    });
  },

  _showErr(msg) {
    const el = document.getElementById('form-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },

  _todayStr() {
    return new Date().toISOString().split('T')[0];
  },

  _formatDateStr(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  },

  _formatTimeStr(str) {
    if (!str) return '';
    const [h, m] = str.split(':');
    const date = new Date();
    date.setHours(+h, +m);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },

  _escape(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
