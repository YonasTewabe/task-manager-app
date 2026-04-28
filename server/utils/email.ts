import nodemailer from "nodemailer";

let cachedTransporter = null;

function getTransportConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    throw new Error("SMTP config is missing. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.");
  }

  return {
    host,
    port,
    secure,
    auth: { user, pass },
  };
}

export function getEmailTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(getTransportConfig());
  }
  return cachedTransporter;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from = process.env.SMTP_USER,
}) {
  if (!to) throw new Error("Recipient is required");
  if (!subject) throw new Error("Email subject is required");
  if (!text && !html) throw new Error("Email body is required");
  if (!from) throw new Error("Sender is required");

  const transporter = getEmailTransporter();
  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

export async function verifyEmailTransport() {
  const transporter = getEmailTransporter();
  return transporter.verify();
}
