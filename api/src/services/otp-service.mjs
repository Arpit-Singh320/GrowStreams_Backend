import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// In-memory OTP store: email -> { code, expiresAt }
// For production this should be Redis/DB, but works fine for low-volume
const otpStore = new Map();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send a 6-digit OTP to the given email via Resend.
 * Returns { sent: true } or throws.
 */
export async function sendOtp(email) {
  const code = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(email.toLowerCase(), { code, expiresAt });

  await resend.emails.send({
    from: 'GrowStreams <noreply@growstreams.xyz>',
    to: email,
    subject: `Your GrowStreams verification code: ${code}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;border:1px solid #30363d">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="color:#4ade80;font-size:28px;margin:0">🌱 GrowStreams</h1>
          <p style="color:#8b949e;font-size:14px;margin-top:8px">Email Verification</p>
        </div>
        <p style="color:#c9d1d9;font-size:15px">Enter this code to verify your email and complete your registration:</p>
        <div style="text-align:center;margin:28px 0">
          <span style="font-size:42px;font-weight:bold;letter-spacing:12px;color:#4ade80;font-family:monospace">${code}</span>
        </div>
        <p style="color:#8b949e;font-size:13px;text-align:center">This code expires in <strong>10 minutes</strong>.</p>
        <hr style="border:none;border-top:1px solid #30363d;margin:24px 0"/>
        <p style="color:#6e7681;font-size:12px;text-align:center">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  return { sent: true };
}

/**
 * Verify an OTP code for the given email.
 * Returns { valid: true } or throws with a descriptive error.
 */
export function verifyOtp(email, code) {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) throw Object.assign(new Error('No OTP found for this email. Please request a new code.'), { status: 400 });
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email.toLowerCase());
    throw Object.assign(new Error('OTP expired. Please request a new code.'), { status: 400 });
  }
  if (entry.code !== code.toString().trim()) {
    throw Object.assign(new Error('Incorrect code. Please try again.'), { status: 400 });
  }
  otpStore.delete(email.toLowerCase()); // one-time use
  return { valid: true };
}
