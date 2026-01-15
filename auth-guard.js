/* auth-guard.js — Vintage Wear Ireland
   Guard simples e estável para manter login persistente.
   - Lê token de localStorage/sessionStorage/cookie
   - Normaliza para localStorage['vw_token']
   - Redireciona para cliente-login-2.html?back=<pagina> quando não autenticado
*/
(function(){
  const TOKEN_KEY = 'vw_token';
  const TOKEN_KEYS = [TOKEN_KEY, 'token', 'authToken', 'auth_token', 'access_token'];

  function readCookie(name){
    try{
      const escaped = name.replace(/[.$?*|{}()\[\]\\\/\+^]/g,'\\$&');
      const m = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    }catch(_){ return null; }
  }

  function writeCookie(name, value, maxAgeSeconds){
    try{
      const maxAge = typeof maxAgeSeconds === 'number' ? `; Max-Age=${maxAgeSeconds}` : '';
      document.cookie = `${name}=${encodeURIComponent(value)}; Path=/${maxAge}; SameSite=Lax`;
    }catch(_){}
  }

  function clearCookie(name){
    try{
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }catch(_){}
  }

  function getTokenRaw(){
    // localStorage
    for (const k of TOKEN_KEYS){
      try{
        const v = localStorage.getItem(k);
        if (v && typeof v === 'string' && v.trim()) return v.trim();
      }catch(_){}
    }
    // sessionStorage
    try{
      const v = sessionStorage.getItem(TOKEN_KEY);
      if (v && typeof v === 'string' && v.trim()) return v.trim();
    }catch(_){}
    // cookie
    const c = readCookie(TOKEN_KEY);
    if (c && c.trim()) return c.trim();
    return null;
  }

  function setToken(token){
    if (!token || typeof token !== 'string') return;
    try{ localStorage.setItem(TOKEN_KEY, token); }catch(_){}
    try{ sessionStorage.setItem(TOKEN_KEY, token); }catch(_){}
    // 30 dias
    writeCookie(TOKEN_KEY, token, 60*60*24*30);
  }

  function clearToken(){
    TOKEN_KEYS.forEach((k)=>{ try{ localStorage.removeItem(k); }catch(_){} });
    try{ sessionStorage.removeItem(TOKEN_KEY); }catch(_){}
    clearCookie(TOKEN_KEY);
  }

  function isJwtExpired(token){
    // Se não for JWT, não tenta validar expiração.
    if (!token || token.split('.').length !== 3) return false;
    try{
      const payloadB64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const pad = payloadB64.length % 4 ? '='.repeat(4 - (payloadB64.length % 4)) : '';
      const jsonStr = atob(payloadB64 + pad);
      const payload = JSON.parse(jsonStr);
      if (!payload || typeof payload.exp !== 'number') return false;
      const now = Math.floor(Date.now()/1000);
      // margem de 30s
      return payload.exp <= (now + 30);
    }catch(_){
      return false;
    }
  }

  function pageName(){
    return (location.pathname.split('/').pop() || 'painel.html');
  }

  function redirectToLogin(){
    const url = `cliente-login-2.html?back=${encodeURIComponent(pageName())}`;
    // replace evita voltar pra página protegida via "voltar"
    location.replace(url);
  }

  function getToken(){
    const t = getTokenRaw();
    if (t) setToken(t); // normaliza e garante persistência
    return t;
  }

  function requireAuth(){
    const t = getToken();
    if (!t){ redirectToLogin(); return null; }
    if (isJwtExpired(t)){ clearToken(); redirectToLogin(); return null; }
    return t;
  }

  function logout(){
    clearToken();
    redirectToLogin();
  }

  async function authFetch(input, init){
    const token = getToken();
    const headers = new Headers((init && init.headers) || {});
    if (token && !headers.has('Authorization')){
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, { ...(init||{}), headers });
  }

  // API pública
  window.VintageAuth = window.VintageAuth || {};
  window.VintageAuth.getToken = getToken;
  window.VintageAuth.requireAuth = requireAuth;
  window.VintageAuth.clearToken = clearToken;
  window.VintageAuth.logout = logout;
  window.VintageAuth.authFetch = authFetch;

  // Executa imediatamente
  requireAuth();
})();
