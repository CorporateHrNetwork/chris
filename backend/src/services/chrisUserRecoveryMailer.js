// Recovery messages contain a single-use link only. Passwords and links are
// never logged, returned in the admin response, or stored in plaintext.
const escape = input => String(input || "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
async function sendRecoveryMail({to,firstName,portal,resetUrl}) {
  const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
  if(!apiKey||!from)throw new Error("Transactional email configuration unavailable");
  const label=portal==="ess"?"CHRiS Employee Self-Service":"CHRiS staff workspace";
  const subject=label+" — reset your password";
  const text=`Hello ${firstName},\n\nA Zermatt account administrator requested a password recovery for your ${label}.\nOpen the following one-time link within 15 minutes:\n${resetUrl}\n\nIf you did not request this, contact your Zermatt HR administrator.\n`;
  const html=`<p>Hello ${escape(firstName)},</p><p>A Zermatt account administrator requested password recovery for your ${escape(label)}.</p><p><a href="${escape(resetUrl)}">Reset password securely</a> (expires in 15 minutes).</p><p>If unexpected, contact HR.</p>`;
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({from,to:[to],subject,text,html})
  });
  if(!response.ok)throw new Error("Recovery email provider rejected delivery: "+response.status);
}
module.exports={sendRecoveryMail};
