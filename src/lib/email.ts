import { Resend } from 'resend';

// Use a mock client if no API key is provided, so it doesn't crash in dev
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'noreply@tochiwears.com';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

/**
 * Helper function to send email via Resend
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  if (!resend) {
    console.warn('⚠️ RESEND_API_KEY is not set. Email not sent:');
    console.warn(`To: ${to}`);
    console.warn(`Subject: ${subject}`);
    return;
  }

  try {
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to} (ID: ${data.data?.id})`);
    return data;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw new Error('Failed to send email');
  }
}

/**
 * Send email verification link
 */
export async function sendVerificationEmail(to: string, token: string) {
  const verifyLink = `${CLIENT_URL}/verify-email?token=${token}`;
  
  const subject = 'Verify your email for Tochiwears';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to Tochiwears!</h2>
      <p>Thank you for signing up. Please verify your email address by clicking the link below:</p>
      <div style="margin: 30px 0;">
        <a href="${verifyLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>If you did not sign up for an account, you can safely ignore this email.</p>
    </div>
  `;

  return sendEmail(to, subject, html);
}

/**
 * Send password reset link
 */
export async function sendPasswordResetEmail(to: string, token: string) {
  const resetLink = `${CLIENT_URL}/reset-password?token=${token}`;
  
  const subject = 'Reset your Tochiwears password';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your password. Click the link below to choose a new one:</p>
      <div style="margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
      </div>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  `;

  return sendEmail(to, subject, html);
}
