(function(){
  'use strict';

  // Single source of truth for "who is the logged user":
  // - READS ONLY from sessionStorage
  // - Backend must identify user ONLY by validated token
  var TOKEN_KEYS = ['vw_token','token','authToken','auth_token','access_token','jwt'];

  function ssGet(k){
    try{ return sessionStorage.getItem(k); }catch(_){ return null; }
  }
  function ssSet(k,v){
    try{ sessionStorage.setItem(k, v); }catch(_){}
  }
  function ssRemove(k){
    try{ sessionStorage.removeItem(k); }catch(_){}
  }

  function safeJsonParse(raw){
    try{ return raw ? JSON.parse(raw) : null; }catch(_){ return null; }
  }

  function getLoggedUser(){
    var token = null;
    var foundKey = null;

    for (var i=0;i<TOKEN_KEYS.length;i++){
      var k = TOKEN_KEYS[i];
      var t = ssGet(k);
      if (t){
        token = String(t);
        foundKey = k;
        break;
      }
    }

    // Normalize token key to vw_token (WRITE only)
    if (token && foundKey && foundKey !== 'vw_token'){
      ssSet('vw_token', token);
    }

    var user = safeJsonParse(ssGet('vw_user_cache')) || null;

    return {
      token: token,
      user: user,
      isLoggedIn: !!token
    };
  }

  function getToken(){
    return getLoggedUser().token;
  }

  function authHeaders(extra){
    var h = {};
    var t = getToken();
    if (t) h.Authorization = 'Bearer ' + t;
    if (extra && typeof extra === 'object'){
      for (var k in extra){
        if (Object.prototype.hasOwnProperty.call(extra, k)){
          h[k] = extra[k];
        }
      }
    }
    return h;
  }

  function requireTokenOrRedirect(){
    var t = getToken();
    if (!t){
      try{
        var back = (location && location.pathname) ? location.pathname.split('/').pop() : '';
        var target = 'cliente-login-2.html' + (back ? ('?back=' + encodeURIComponent(back)) : '');
        location.href = target;
      }catch(_){
        location.href = 'cliente-login-2.html';
      }
      return null;
    }
    return t;
  }

  function logout(){
    for (var i=0;i<TOKEN_KEYS.length;i++){
      ssRemove(TOKEN_KEYS[i]);
    }
    ssRemove('vw_user_cache');
    ssRemove('vw_user_id');
    try{
      var back = (location && location.pathname) ? location.pathname.split('/').pop() : '';
      location.href = 'cliente-login-2.html' + (back ? ('?back=' + encodeURIComponent(back)) : '');
    }catch(_){
      location.href = 'cliente-login-2.html';
    }
  }

  window.VintageAuth = window.VintageAuth || {};
  window.VintageAuth.getLoggedUser = getLoggedUser;
  window.VintageAuth.getToken = getToken;
  window.VintageAuth.authHeaders = authHeaders;
  window.VintageAuth.requireTokenOrRedirect = requireTokenOrRedirect;
  window.VintageAuth.logout = logout;
})();
