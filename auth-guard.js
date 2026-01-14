/*
  Vintage - Auth Guard (Front-end)
  - Protege páginas do painel: só abre se existir token e (se existir no backend) validar em /auth/me
  - Ajuste o API_BASE se você mudar a URL do seu backend.
*/
(function(){
  const API_BASE   = "https://clientes-0r5d.onrender.com"; // <-- troque se precisar
  const TOKEN_KEY  = "vw_token";
  const LOGIN_PAGE = "cliente-login-2.html";
  const ME_PATH    = "/auth/me"; // <-- crie no backend (GET) quando puder

  function getToken(){ return localStorage.getItem(TOKEN_KEY); }

  function goLogin(){
    // opcional: guardar a página atual pra voltar depois
    const back = encodeURIComponent(window.location.pathname.split("/").pop() || "painel.html");
    window.location.href = LOGIN_PAGE + "?back=" + back;
  }

  function logout(){
    localStorage.removeItem(TOKEN_KEY);
    goLogin();
  }

  async function fetchMe(){
    const token = getToken();
    if(!token) return null;

    let res;
    try{
      res = await fetch(API_BASE + ME_PATH, {
        headers: { "Authorization": "Bearer " + token }
      });
    }catch(err){
      // se der erro de rede, não derruba a página (mas avisa no console)
      console.warn("[Auth] Falha de rede ao validar token:", err);
      return null;
    }

    if(res.status === 401 || res.status === 403){
      logout();
      return null;
    }

    if(res.status === 404){
      // ainda não criou /auth/me no backend
      console.warn("[Auth] Endpoint /auth/me não existe ainda. Página liberada só pelo token local.");
      return null;
    }

    if(!res.ok){
      console.warn("[Auth] Resposta inesperada ao validar token:", res.status);
      return null;
    }

    try{
      return await res.json();
    }catch(err){
      console.warn("[Auth] Não consegui ler JSON do /auth/me:", err);
      return null;
    }
  }

  async function requireLogin(){
    const token = getToken();
    if(!token) goLogin();
    const me = await fetchMe();
    return me;
  }

  function applyMeToUI(me){
    if(!me) return;
    const nameEl  = document.getElementById("userName");
    const emailEl = document.getElementById("userEmail");

    if(nameEl)  nameEl.textContent  = me.name  || "Usuário";
    if(emailEl) emailEl.textContent = me.email || me.phone || "";

    // se existir "state" no seu script, tenta preencher também
    try{
      if(typeof state !== "undefined" && state){
        state.me = Object.assign(state.me || {}, me);
      }
    }catch(_){}
  }

  // expõe pra você usar depois
  window.VintageAuth = { API_BASE, TOKEN_KEY, LOGIN_PAGE, ME_PATH, getToken, requireLogin, fetchMe, logout, applyMeToUI };

  // roda automaticamente ao abrir a página
  document.addEventListener("DOMContentLoaded", async () => {
    const me = await requireLogin();
    applyMeToUI(me);
  });
})();
