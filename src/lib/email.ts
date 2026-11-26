import { Resend } from 'resend';

/**
 * Email via Resend. Without RESEND_API_KEY, emails are logged instead of sent.
 *
 * EMAIL_FROM_ADDRESS must use a domain verified in Resend (not gmail.com etc).
 * Either "noreply@yourdomain.com" or "Tochiwears <noreply@yourdomain.com>".
 */
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

const RAW_FROM = process.env.EMAIL_FROM_ADDRESS || 'noreply@tochiwears.com';
const FROM = RAW_FROM.includes('<') ? RAW_FROM : `Tochiwears <${RAW_FROM}>`;
const CLIENT_URL = trimSlash(process.env.CLIENT_URL || 'http://localhost:3000');

/** Frontend page with the "choose a new password" form; gets ?token=… */
export const RESET_PASSWORD_URL = trimSlash(
  process.env.RESET_PASSWORD_URL || `${CLIENT_URL}/auth/reset-password`,
);
/** Where the backend redirects after a verification link is clicked; gets ?verified=… */
export const VERIFY_REDIRECT_URL = trimSlash(
  process.env.VERIFY_EMAIL_REDIRECT_URL || `${CLIENT_URL}/login`,
);

export class EmailError extends Error {}

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!resend) {
    console.warn(`⚠️ RESEND_API_KEY not set. Email NOT sent → ${to}: "${subject}"\n${text}`);
    return;
  }

  // The Resend SDK reports API failures in `error` rather than throwing.
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, text });
  if (error) {
    console.error(`❌ Resend rejected email to ${to} (from ${FROM}): ${error.name}: ${error.message}`);
    throw new EmailError(error.message);
  }
  console.log(`✅ Email sent to ${to} (ID: ${data?.id})`);
  return data;
}

function layout(heading: string, intro: string, buttonText: string, link: string, footer: string) {
  const html = `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
    <h2 style="margin: 0 0 16px;">${heading}</h2>
    <p style="line-height: 1.5;">${intro}</p>
    <p style="margin: 28px 0;">
      <a href="${link}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">${buttonText}</a>
    </p>
    <p style="line-height: 1.5; font-size: 14px; color: #555;">Or paste this link into your browser:<br><a href="${link}" style="color: #555; word-break: break-all;">${link}</a></p>
    <p style="line-height: 1.5; font-size: 14px; color: #555;">${footer}</p>
    <p style="font-size: 13px; color: #999; margin-top: 32px;">Tochiwears</p>
  </div>`;
  const text = `${heading}\n\n${intro}\n\n${buttonText}: ${link}\n\n${footer}\n\nTochiwears`;
  return { html, text };
}

/**
 * The link hits the API (GET /auth/verify-email), which verifies and then
 * redirects to the frontend — so the frontend needs no verification page.
 */
export async function sendVerificationEmail(to: string, token: string, apiBaseUrl: string) {
  const link = `${trimSlash(apiBaseUrl)}/auth/verify-email?token=${token}`;
  const { html, text } = layout(
    'Welcome to Tochiwears!',
    'Thanks for signing up. Please confirm your email address. This link expires in 24 hours.',
    'Verify email',
    link,
    "If you didn't create an account, you can ignore this email.",
  );
  return sendEmail(to, 'Verify your email for Tochiwears', html, text);
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${RESET_PASSWORD_URL}?token=${token}`;
  const { html, text } = layout(
    'Reset your password',
    'We received a request to reset your Tochiwears password. This link expires in 1 hour.',
    'Choose a new password',
    link,
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  );
  return sendEmail(to, 'Reset your Tochiwears password', html, text);
}
