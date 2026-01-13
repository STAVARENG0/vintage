const jwt = require("jsonwebtoken");
const { cfg } = require("../config");

function signToken(user){
  const payload = {
    sub: String(user.id),
    email: user.email || null,
    phone: user.phone || null,
    name: user.name || null,
  };
  return jwt.sign(payload, cfg.jwtSecret, { expiresIn: cfg.jwtExpiresIn });
}

module.exports = { signToken };
