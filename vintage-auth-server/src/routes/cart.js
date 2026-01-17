<script>
(function(){
  const API_ROOT = "https://clientes-0r5d.onrender.com";
  const TOKEN_KEYS = ["vw_token","token","authToken","auth_token","access_token"];

  function getToken(){
    for (const k of TOKEN_KEYS){
      try{
        const t = localStorage.getItem(k);
        if (t) return t;
      }catch(_){}
    }
    return null;
  }

  function requireTokenOrRedirect(){
    const t = getToken();
    if (!t) window.location.href = "cliente-login-2.html";
    return t;
  }

  function authHeaders(){
    const token = getToken();
    if (!token) return {};
    return { Authorization: "Bearer " + token };
  }

  async function apiJson(path, opts = {}){
    const url = API_ROOT + path;
    const init = {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
        ...authHeaders(),
      },
    };
    if (opts.body !== undefined){
      init.body = (typeof opts.body === "string") ? opts.body : JSON.stringify(opts.body);
    }

    const res = await fetch(url, init);
    if (res.status === 401 || res.status === 403){
      requireTokenOrRedirect();
      throw new Error("unauthorized");
    }

    const text = await res.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch(_){ data = text; }

    if (!res.ok){
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ===== Rewards: backend first, fallback to localStorage =====
  async function loadRewardsStatus(){
    // tenta backend
    try{
      const data = await apiJson("/bonus/balance", { method: "GET" });

      const list = Array.isArray(data?.available)
        ? data.available
        : (Array.isArray(data?.bonuses) ? data.bonuses : []);

      const now = Date.now();

      const norm = (list || [])
        .filter(b => !b.used)
        .map((b) => {
          const type = String(b.type || b.kind || "").toLowerCase();
          const created = b.created_at || b.createdAt || b.created || null;
          let expiresAt = b.expiresAt || b.expires_at || b.expires || null;

          // shipping + discount expiram em 24h
          if (!expiresAt && (type === "percent" || type === "discount" || type === "shipping")){
            const base = created ? new Date(created).getTime() : now;
            expiresAt = new Date(base + 24*60*60*1000).toISOString();
          }

          return { ...b, type, value: Number(b.value || 0), created_at: created, expiresAt };
        });

      // points (cashback) acumulam
      const points = norm
        .filter(b => b.type === "cashback" || b.type === "points")
        .reduce((s, b) => s + (Number(b.value) || 0), 0);

      state.points = Math.max(0, Math.floor(points));

      // discount (percent)
      const disc = norm.find(b =>
        (b.type === "percent" || b.type === "discount") &&
        (Number(b.value) || 0) > 0 &&
        (!b.expiresAt || new Date(b.expiresAt).getTime() > now)
      );
      state.activeDiscount = disc ? { id: disc.id, percent: Number(disc.value || 0), expiresAt: disc.expiresAt } : null;

      // shipping
      const ship = norm.find(b =>
        b.type === "shipping" &&
        (!b.expiresAt || new Date(b.expiresAt).getTime() > now)
      );
      state.activeShipping = ship ? { id: ship.id, expiresAt: ship.expiresAt } : null;

      if (typeof renderCart === "function") renderCart();
      if (typeof renderCashback === "function") renderCashback();

      return { ok:true, points: state.points, activeDiscount: state.activeDiscount, activeShipping: state.activeShipping };
    }catch(e){
      // fallback localStorage (wheel -> cart)
      console.warn("Rewards backend indisponível. A usar localStorage.", e?.message || e);
      try{
        const raw = localStorage.getItem("vwi_rewards_state_v1");
        if (raw){
          const s = JSON.parse(raw) || {};
          if (typeof s.points === "number") state.points = Math.max(0, Math.floor(s.points));
          state.activeDiscount = s.activeDiscount || null;
          state.activeShipping = s.activeShipping || null;
          if (Array.isArray(s.cashbackHistory)) state.cashbackHistory = s.cashbackHistory;
        }
      }catch(_){}

      if (typeof renderCart === "function") renderCart();
      if (typeof renderCashback === "function") renderCashback();

      return { ok:true, points: state.points, activeDiscount: state.activeDiscount, activeShipping: state.activeShipping };
    }
  }

  // ===== Cart remote sync: DISABLED (until /cart exists) =====
  const DISABLE_REMOTE_CART = true;

  async function bootstrapCartSync(){
    // no-op (disabled)
  }

  function defaultAvatarDataUri(){
    const svg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop stop-color="#D4AF37" stop-opacity="0.35"/>
            <stop stop-color="#f0b43b" stop-opacity="0.18" offset="1"/>
          </linearGradient>
        </defs>
        <rect width="240" height="240" rx="120" fill="url(#g)"/>
        <circle cx="120" cy="92" r="44" fill="rgba(43,39,35,0.16)"/>
        <path d="M48 212c14-46 50-68 72-68s58 22 72 68" fill="rgba(43,39,35,0.14)"/>
      </svg>
    `);
    return `data:image/svg+xml;charset=utf-8,${svg}`;
  }

  function applyAvatar(user){
    const img = document.getElementById("avatar");
    if (!img) return;

    const raw = (user && (user.avatar_url || user.avatar || user.avatarUrl || user.photo_url || user.photoUrl)) || "";
    if (!raw){
      img.src = defaultAvatarDataUri();
      return;
    }

    let url = String(raw);
    if (!/^https?:\/\//i.test(url)){
      if (!url.startsWith("/")) url = "/" + url;
      url = API_ROOT + url;
    }

    url += (url.includes("?") ? "&" : "?") + "v=" + Date.now();
    img.src = url;
  }

  // ===== Public API =====
  window.VW_API = window.VW_API || {};
  window.VW_API.root = API_ROOT;
  window.VW_API.apiJson = apiJson;

  // bonuses
  window.VW_API.loadRewardsStatus = loadRewardsStatus;
  window.VW_API.bonusBalance = () => apiJson("/bonus/balance", { method:"GET" });
  window.VW_API.bonusSpin = () => apiJson("/bonus/spin", { method:"POST", body:{} });
  window.VW_API.bonusApply = (bonusId) => apiJson("/bonus/apply", { method:"POST", body:{ bonusId } });

  // cart (disabled)
  window.VW_API.bootstrapCartSync = bootstrapCartSync;
  if (DISABLE_REMOTE_CART){
    window.VW_API.loadCart = async () => [];
    window.VW_API.saveCart = async () => ({ ok:true });
  }

  // checkout
  window.VW_API.checkoutCreate = (payload) => apiJson("/checkout/create", { method:"POST", body: payload || {} });

  async function loadProfile(){
    requireTokenOrRedirect();

    try{
      const res = await fetch(API_ROOT + "/user/me", { headers: authHeaders() });

      if (res.status === 401 || res.status === 403){
        requireTokenOrRedirect();
        return;
      }
      if (!res.ok){
        console.warn("Failed to load /user/me:", res.status);
        return;
      }

      const user = await res.json();

      try{ state.me = user; }catch(_){}
      try{
        if (user && (user.id ?? user.user_id ?? user.userId)){
          localStorage.setItem("vw_user_id", String(user.id ?? user.user_id ?? user.userId));
        }
      }catch(_){}

      // mantém cart localStorage como fonte de verdade
      try{ if (typeof loadLocalCart === "function") loadLocalCart(); }catch(_){}
      try{ if (typeof renderCart === "function") renderCart(); }catch(_){}

      const nameEl = document.getElementById("userName");
      const emailEl = document.getElementById("userEmail");
      if (nameEl) nameEl.textContent = user.name || "Your Name";
      if (emailEl) emailEl.textContent = user.email || "email@example.com";

      applyAvatar(user);

      // rewards (backend se existir; senão localStorage)
      loadRewardsStatus();
    }catch(err){
      console.error("Error loading /user/me", err);
    }
  }

  document.addEventListener("DOMContentLoaded", loadProfile);
})();
</script>
