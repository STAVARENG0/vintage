const { Resend } = require("@resend/node");
const { cfg } = require("../config");

let client = null;
function getClient(){
  if(!client){
    if(!cfg.resendApiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(cfg.resendApiKey);
  }
  return client;
}

async function sendOtpEmail({ to, code, purpose }){
  const resend = getClient();
  const subject = purpose === "reset" ? "Your password reset code" : "Your verification code";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 10px">Vintage</h2>
      <p>Your code is:</p>
      <p style="font-size:26px;letter-spacing:4px;font-weight:700;margin:10px 0">${code}</p>
      <p>This code expires in ${cfg.otpTtlMinutes} minutes.</p>
      <p style="color:#666;font-size:12px;margin-top:18px">If you didn’t request this, you can ignore this email.</p>
    </div>
  `;

  await resend.emails.send({
    from: cfg.emailFrom,
    to,
    subject,
    html,
  });
}

module.exports = { sendOtpEmail };
