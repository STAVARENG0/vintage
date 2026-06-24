(function () {
  'use strict';

  /**
   * VintageAuth (cookie-based)
   * - Does not read tokens from sessionStorage/localStorage.
   * - Validates the session with GET /me on the backend.
   * - Sends cross-domain cookies through fetch(..., { credentials: 'include' }).
   *
   * Optional backend configuration:
   *   - window.__API_BASE_URL__ = 'https://api.seudominio.com'
   *   - or window.API_BASE_URL
   *   - or VintageAuth.setApiBase('https://api.seudominio.com')
   */

  var DEFAULT_LOGIN_PAGE = 'cliente-login-2.html';
  var USER_CACHE_KEY = 'vw_user_cache';

  function safeJsonParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} }
  function ssRemove(k) { try { sessionStorage.removeItem(k); } catch (_) {} }

  function getApiBase() {
    var b = (window && (window.__API_BASE_URL__ || window.API_BASE_URL)) || '';
    // allow setting via VintageAuth._apiBase
    if (window.VintageAuth && typeof window.VintageAuth._apiBase === 'string') b = window.VintageAuth._apiBase;
    return String(b || '');
  }

  function joinUrl(base, path) {
    base = String(base || '');
    path = String(path || '');
    if (!base) return path;
    if (base.endsWith('/') && path.startsWith('/')) return base + path.slice(1);
    if (!base.endsWith('/') && !path.startsWith('/')) return base + '/' + path;
    return base + path;
  }

  function redirectToLogin(reason) {
    try {
      var back = (location && location.pathname) ? location.pathname.split('/').pop() : '';
      var url = DEFAULT_LOGIN_PAGE;
      var q = [];
      if (back) q.push('back=' + encodeURIComponent(back));
      if (reason) q.push('reason=' + encodeURIComponent(String(reason)));
      if (q.length) url += '?' + q.join('&');
      location.href = url;
    } catch (_) {
      location.href = DEFAULT_LOGIN_PAGE;
    }
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      }).catch(function (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      });
    });
  }

  /**
   * Fetch JSON with cookies.
   */
  function apiFetch(path, options) {
    options = options && typeof options === 'object' ? options : {};
    var base = getApiBase();
    var url = joinUrl(base, path);

    var headers = options.headers && typeof options.headers === 'object' ? options.headers : {};
    if (!headers.Accept) headers.Accept = 'application/json';

    var opts = {};
    for (var k in options) { if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k]; }
    opts.headers = headers;
    opts.credentials = 'include';

    return fetch(url, opts);
  }

  /**
   * GET /me
   * - If 200: returns { ok: true, user }.
   * - If 401/403: returns { ok: false, status }.
   * - Other statuses: returns { ok: false, status }.
   */
  function me() {
    return withTimeout(
      apiFetch('/user/me', { method: 'GET' })
        .then(function (res) {
          if (res.ok) {
            // It can be JSON or empty.
            return res.text().then(function (txt) {
              var data = safeJsonParse(txt);
              if (data) {
                ssSet(USER_CACHE_KEY, JSON.stringify(data));
              } else {
                // If JSON is missing, keep the existing cache.
              }
              return { ok: true, status: res.status, user: data || safeJsonParse(ssGet(USER_CACHE_KEY)) || null };
            });
          }
          return { ok: false, status: res.status };
        })
        .catch(function (err) {
          return { ok: false, status: 0, error: err && err.message ? err.message : String(err) };
        }),
      8000
    );
  }

  /**
   * Validate login and redirect on 401/403 or error.
   */
  function checkOrRedirect() {
    return me().then(function (r) {
      if (r && r.ok) {
        return r;
      }
      if (r && (r.status === 401 || r.status === 403)) {
        redirectToLogin('unauthorized');
        return r;
      }
      // Unexpected failure: redirect to login for safety.
      redirectToLogin('auth_failed');
      return r;
    });
  }

  /**
   * Optional logout: try POST /logout and redirect.
   */
  function logout() {
  ssRemove(USER_CACHE_KEY);

  var tries = [
    { path: '/logout', method: 'POST' },
    { path: '/logout', method: 'GET' },
    { path: '/auth/logout', method: 'POST' },
    { path: '/auth/logout', method: 'GET' },
    { path: '/user/logout', method: 'POST' },
    { path: '/user/logout', method: 'GET' },
    { path: '/auth/signout', method: 'POST' },
    { path: '/auth/signout', method: 'GET' }
  ];

  // Try ending the backend session; HttpOnly cookies can only be cleared this way.
  var p = Promise.resolve();
  tries.forEach(function (t) {
    p = p.then(function () {
      return apiFetch(t.path, { method: t.method }).catch(function () {});
    });
  });

  return p.then(function () {
    // Important: send to login without back= to avoid returning to the panel.
    location.href = DEFAULT_LOGIN_PAGE + '?reason=logout';
  });
}


  function getLoggedUser() {
    var user = safeJsonParse(ssGet(USER_CACHE_KEY)) || null;
    return { token: null, user: user, isLoggedIn: !!user };
  }

  function authHeaders(extra) {
    // Kept for compatibility, now without Authorization.
    var h = {};
    if (extra && typeof extra === 'object') {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
      }
    }
    return h;
  }

  function setApiBase(url) {
    window.VintageAuth._apiBase = String(url || '');
  }

  window.VintageAuth = window.VintageAuth || {};
  window.VintageAuth._apiBase = window.VintageAuth._apiBase || '';
  window.VintageAuth.setApiBase = setApiBase;
  window.VintageAuth.setApiBase("https://auth.vintage-clothes.ie");


  window.VintageAuth.apiFetch = apiFetch;
  window.VintageAuth.me = me;
  window.VintageAuth.checkOrRedirect = checkOrRedirect;

  // compat
  window.VintageAuth.getLoggedUser = getLoggedUser;
  window.VintageAuth.getToken = function () { return null; };
  window.VintageAuth.authHeaders = authHeaders;
  window.VintageAuth.requireTokenOrRedirect = checkOrRedirect;
  window.VintageAuth.logout = logout;
})();
