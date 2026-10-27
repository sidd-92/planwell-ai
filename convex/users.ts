import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';

/** The signed-in user's email, or null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user ? { email: user.email ?? '' } : null;
  },
});
