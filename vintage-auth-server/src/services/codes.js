const { nanoid } = require("nanoid");

function makeNumericCode(){
  // 6-digit numeric code
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

function ttlMinutes(){
  return Number(process.env.CODE_TTL_MINUTES || 15);
}

function shouldReturnCode(){
  return String(process.env.RETURN_VERIFICATION_CODE || "true").toLowerCase() === "true";
}

module.exports = { makeNumericCode, ttlMinutes, shouldReturnCode };
