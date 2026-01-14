function looksLikeEmail(v){
  return String(v || "").includes("@");
}

function normalizeEmail(v){
  return String(v || "").trim().toLowerCase();
}

function normalizePhone(v){
  const raw = String(v || "").trim();
  let out = raw.replace(/[^0-9+]/g, "");
  if(out.includes("+")) out = "+" + out.replace(/\+/g, "");
  return out;
}

module.exports = { looksLikeEmail, normalizeEmail, normalizePhone };
