// ============================================================
// auth.js — Google Sign-In with @slamnv.org domain restriction
// ============================================================
// Handles sign-in, domain verification, session storage,
// and sign-out. Shared by index.html and reserve.html.
// ============================================================

const Auth = {
  token: null,
  user: null,

  // ----------------------------------------------------------
  // Call this on every page load.
  // onSuccess(user) is called if user is already signed in.
  // onNeedSignIn() is called if sign-in is required.
  // onWrongDomain(email) is called if domain doesn't match.
  // ----------------------------------------------------------
  init(callbacks) {
    this._callbacks = callbacks;

    // Check if we have a valid stored session
    const stored = this._loadSession();
    if (stored) {
      this.token = stored.token;
      this.user = stored.user;
      callbacks.onSuccess(stored.user);
      return;
    }

    // Initialize Google Identity Services
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: (response) => this._handleCredential(response),
      auto_select: true,
      cancel_on_tap_outside: false,
    });

    // Render the sign-in button into #google-signin-btn
    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        logo_alignment: 'center',
        width: 280,
      }
    );

    // Prompt the One Tap flow
    google.accounts.id.prompt();

    callbacks.onNeedSignIn();
  },

  // ----------------------------------------------------------
  // Called by Google after the user picks their account
  // ----------------------------------------------------------
  _handleCredential(response) {
    const payload = this._parseJwt(response.credential);

    if (!payload.email.endsWith('@' + CONFIG.ALLOWED_DOMAIN)) {
      this._callbacks.onWrongDomain(payload.email);
      return;
    }

    this.token = response.credential;
    this.user = {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      given_name: payload.given_name,
    };

    // Store session (tokens last ~1 hour)
    sessionStorage.setItem('slam_auth', JSON.stringify({
      token: this.token,
      user: this.user,
      exp: payload.exp,
    }));

    this._callbacks.onSuccess(this.user);
  },

  // ----------------------------------------------------------
  // Load a session from storage if not expired
  // ----------------------------------------------------------
  _loadSession() {
    try {
      const raw = sessionStorage.getItem('slam_auth');
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Tokens expire after 1 hour; check with a 2-min buffer
      if (data.exp * 1000 < Date.now() + 120000) {
        sessionStorage.removeItem('slam_auth');
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  // ----------------------------------------------------------
  // Sign the user out and reload
  // ----------------------------------------------------------
  signOut() {
    sessionStorage.removeItem('slam_auth');
    google.accounts.id.disableAutoSelect();
    location.reload();
  },

  // ----------------------------------------------------------
  // Decode a JWT payload (no signature verification — backend does that)
  // ----------------------------------------------------------
  _parseJwt(token) {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  },

  // ----------------------------------------------------------
  // Returns the current ID token for API calls
  // ----------------------------------------------------------
  getToken() {
    return this.token;
  },
};
