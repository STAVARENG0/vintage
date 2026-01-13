const dotenv = require("dotenv");
dotenv.config();

function must(name){
  const v = process.env[name];
  if(!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const cfg = {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,

  // DB
  databaseUrl: process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.RAILWAY_DATABASE_URL || "",
  dbHost: process.env.DB_HOST || "",
  dbPort: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  dbUser: process.env.DB_USER || "",
  dbPassword: process.env.DB_PASSWORD || "",
  dbName: process.env.DB_NAME || "",

  // JWT
  jwtSecret: must("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // CORS
  frontendOrigin: process.env.FRONTEND_ORIGIN || "",

  // Resend
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "Vintage <no-reply@vintage-clothes.ie>",

  // Twilio
  twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioFrom: process.env.TWILIO_FROM_NUMBER || "",

  // OTP
  otpTtlMinutes: process.env.OTP_TTL_MINUTES ? Number(process.env.OTP_TTL_MINUTES) : 10,
  otpMaxAttempts: process.env.OTP_MAX_ATTEMPTS ? Number(process.env.OTP_MAX_ATTEMPTS) : 5,
};

module.exports = { cfg };
