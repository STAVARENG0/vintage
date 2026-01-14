const jwt = require("jsonwebtoken");

function signJwt(payload){
  const secret = process.env.JWT_SECRET;
  if(!secret) throw new Error("JWT_SECRET missing");
  const expiresIn = process.env.JWT_EXPIRES_IN || "30d";
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyJwt(token){
  const secret = process.env.JWT_SECRET;
  if(!secret) throw new Error("JWT_SECRET missing");
  return jwt.verify(token, secret);
}

module.exports = { signJwt, verifyJwt };
