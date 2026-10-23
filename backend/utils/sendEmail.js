const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmail(to, subject, text) {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to,
    subject,
    text
  };
  return transporter.sendMail(mailOptions);
}

module.exports = sendEmail;
