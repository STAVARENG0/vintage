const crypto = require("crypto");

function genCode(){
  // 6 digits
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
}

function genSalt(){
  return crypto.randomBytes(16).toString("hex");
}

function hashCode(code, salt){
  return crypto.createHash("sha256").update(String(code) + ":" + String(salt)).digest("hex");
}

module.exports = { genCode, genSalt, hashCode };
