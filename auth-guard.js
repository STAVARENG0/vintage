(function () {
  'use strict';

  /**
   * auth-guard (cookie-based)
   * - Validates the session with GET /me through VintageAuth.checkOrRedirect.
   * - If OK: stay on the page.
   * - If 401: redirect to login.
   */

  function run() {
    if (window.VintageAuth && typeof window.VintageAuth.checkOrRedirect === 'function') {
      // Wait for /me before releasing the page.
      window.VintageAuth.checkOrRedirect();
      return;
    }

    // If VintageAuth has not loaded yet, retry briefly.
    var tries = 0;
    var maxTries = 40; // ~2s
    var t = setInterval(function () {
      tries++;
      if (window.VintageAuth && typeof window.VintageAuth.checkOrRedirect === 'function') {
        clearInterval(t);
        window.VintageAuth.checkOrRedirect();
      } else if (tries >= maxTries) {
        clearInterval(t);
        // No guard available: redirect for safety.
        try { location.href = 'cliente-login-2.html?reason=missing_guard'; } catch (_) { location.href = 'cliente-login-2.html'; }
      }
    }, 50);
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  } catch (_) {
    run();
  }
})();