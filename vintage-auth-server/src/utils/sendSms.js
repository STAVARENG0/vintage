const twilio = require("twilio");
const { cfg } = require("../config");

let client = null;
function getClient(){
  if(!client){
    if(!cfg.twilioSid || !cfg.twilioToken) throw new Error("Twilio env vars not set");
    client = twilio(cfg.twilioSid, cfg.twilioToken);
  }
  return client;
}

async function sendOtpSms({ to, code, purpose }){
  if(!cfg.twilioFrom) throw new Error("TWILIO_FROM_NUMBER is not set");
  const c = getClient();
  const msg = purpose === "reset"
    ? `Vintage: your password reset code is ${code}. Expires in ${cfg.otpTtlMinutes} min.`
    : `Vintage: your verification code is ${code}. Expires in ${cfg.otpTtlMinutes} min.`;

  await c.messages.create({
    from: cfg.twilioFrom,
    to,
    body: msg,
  });
}

module.exports = { sendOtpSms };
