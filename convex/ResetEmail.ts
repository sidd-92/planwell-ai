import { Email } from '@convex-dev/auth/providers/Email';
import { ConvexError } from 'convex/values';

// Six-digit code, valid for 15 minutes, drawn from the Web Crypto source.
function code(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export const ResetEmail = Email({
  id: 'password-reset',
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return code();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const key = process.env.AUTH_RESEND_KEY;
    if (!key) throw new ConvexError('Password reset email is not set up.');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? 'PlanWell.AI <onboarding@resend.dev>',
        to: [email],
        subject: 'Your PlanWell.AI password reset code',
        text: `Your code is ${token}. It expires in 15 minutes.\n\nIf you didn't ask to reset your password, ignore this email.`,
      }),
    });
    if (!res.ok) throw new ConvexError('Couldn’t send the reset email.');
  },
});
