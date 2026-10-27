import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import { ConvexError } from 'convex/values';

// Plain email + password accounts. No social logins and no email verification:
// signing up registers the email with the given password and signs the user in.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
          throw new ConvexError('Enter a valid email address.');
        }
        return { email };
      },
      validatePasswordRequirements(password: string) {
        if (password.length < 8) throw new ConvexError('Password must be at least 8 characters.');
        if (password.length > 128) throw new ConvexError('Password must be 128 characters or fewer.');
      },
    }),
  ],
});
