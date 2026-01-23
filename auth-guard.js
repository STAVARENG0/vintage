(function () {
  'use strict';

  /**
   * auth-guard (cookie-based)
   * - Valida sessão chamando GET /me (via VintageAuth.checkOrRedirect)
   * - Se OK: permanece na página
   * - Se 401: redireciona pro login
   */

  function run() {
    if (window.VintageAuth && typeof window.VintageAuth.checkOrRedirect === 'function') {
      // importante: aguarda o /me antes de liberar
      window.VintageAuth.checkOrRedirect();
      return;
    }

    // se VintageAuth ainda não carregou, tenta novamente por um curto período
    var tries = 0;
    var maxTries = 40; // ~2s
    var t = setInterval(function () {
      tries++;
      if (window.VintageAuth && typeof window.VintageAuth.checkOrRedirect === 'function') {
        clearInterval(t);
        window.VintageAuth.checkOrRedirect();
      } else if (tries >= maxTries) {
        clearInterval(t);
        // Sem guard disponível: redireciona por segurança
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