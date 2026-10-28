import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { areaFromLocation } from '../shared/areas';
import { eventData } from './validators';

const MAX_EVENTS = 100;

/** Every function requires a signed-in user; signed-out callers get nothing. */
async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError('Not signed in.');
  return userId;
}

async function owned(ctx: MutationCtx, id: Id<'events'>) {
  const userId = await requireUser(ctx);
  const doc = await ctx.db.get(id);
  if (!doc || doc.userId !== userId) throw new ConvexError('Event not found.');
  return doc;
}

/** The signed-in user's events, oldest first. Empty when signed out. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query('events')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('asc')
      .take(MAX_EVENTS);
  },
});

/** Adds a new event (from the onboarding flow) and returns its id. */
export const create = mutation({
  args: { data: eventData },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!areaFromLocation(args.data.location)) throw new ConvexError('Choose one of the supported areas in Pune.');
    const count = (
      await ctx.db
        .query('events')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(MAX_EVENTS)
    ).length;
    if (count >= MAX_EVENTS) throw new ConvexError(`An account can hold up to ${MAX_EVENTS} events.`);
    return await ctx.db.insert('events', { userId, data: args.data });
  },
});

/** Saves an event's whole plan. The client sends this after every change. */
export const save = mutation({
  args: { id: v.id('events'), data: eventData },
  handler: async (ctx, args) => {
    await owned(ctx, args.id);
    await ctx.db.patch(args.id, { data: args.data });
  },
});

/** Deletes an event. */
export const remove = mutation({
  args: { id: v.id('events') },
  handler: async (ctx, args) => {
    await owned(ctx, args.id);
    await ctx.db.delete(args.id);
  },
});
