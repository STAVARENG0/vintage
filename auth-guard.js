(function(){
  'use strict';
  // Guard that depends ONLY on VintageAuth (which reads only from sessionStorage)
  function run(){
    if (window.VintageAuth && typeof window.VintageAuth.requireTokenOrRedirect === 'function'){
      window.VintageAuth.requireTokenOrRedirect();
    }
  }
  try{
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }catch(_){
    run();
  }
})();
