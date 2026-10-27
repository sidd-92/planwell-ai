import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalAction, internalMutation, internalQuery, query, type ActionCtx } from './_generated/server';
import { PUNE_AREAS, VENDOR_CATEGORIES, searchTermFor } from '../shared/areas';

/** Top three vendors per category for an area, best rated first. Includes categories looked up on demand. */
export const byArea = query({
  args: { area: v.string() },
  handler: async (ctx, args) => {
    if (!(await getAuthUserId(ctx))) return [];
    const rows = await ctx.db
      .query('vendorDirectory')
      .withIndex('by_area_category', (q) => q.eq('area', args.area))
      .take(2000);
    const byCategory = new Map<string, typeof rows>();
    for (const r of rows) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
    const out: { category: string; name: string; rating: number }[] = [];
    for (const [category, list] of byCategory) {
      list.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
      out.push(...list.slice(0, 3).map((r) => ({ category, name: r.name, rating: r.rating })));
    }
    return out;
  },
});

/** Every directory vendor for one area and category, best rated first (for the Browse panel). */
export const browse = query({
  args: { area: v.string(), category: v.string() },
  handler: async (ctx, args) => {
    if (!(await getAuthUserId(ctx))) return [];
    const rows = await ctx.db
      .query('vendorDirectory')
      .withIndex('by_area_category', (q) => q.eq('area', args.area).eq('category', args.category))
      .take(50);
    return rows.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
  },
});

export const upsert = internalMutation({
  args: {
    placeId: v.string(), name: v.string(), area: v.string(), category: v.string(), address: v.string(),
    rating: v.number(), ratingCount: v.number(), phone: v.optional(v.string()), mapsUri: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('vendorDirectory')
      .withIndex('by_place', (q) => q.eq('placeId', args.placeId).eq('area', args.area).eq('category', args.category))
      .first();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert('vendorDirectory', args);
  },
});

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
};

/**
 * One-off: fetches real vendors from Google Places for every area x category and stores them.
 * Run with `npx convex run vendorDirectory:seed` (or `'{"only":"Rentals"}'`). Needs GOOGLE_PLACES_API_KEY set on the Convex deployment.
 * One request per area and category (`only` limits it to one category); asks for 8 results each and keeps places with a rating of 4.0+ and 10+ reviews.
 */
export const seed = internalAction({
  args: { only: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) throw new Error('Set GOOGLE_PLACES_API_KEY first: npx convex env set GOOGLE_PLACES_API_KEY <key>');
    let saved = 0;
    for (const area of PUNE_AREAS) {
      for (const cat of VENDOR_CATEGORIES) {
        if (args.only && cat.key !== args.only) continue;
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.googleMapsUri',
          },
          body: JSON.stringify({ textQuery: `${cat.search} in ${area}, Pune`, maxResultCount: 8, regionCode: 'IN' }),
        });
        if (!res.ok) throw new Error(`Places ${res.status} for ${cat.key} in ${area}: ${await res.text()}`);
        const { places = [] } = (await res.json()) as { places?: Place[] };
        for (const p of places) {
          if (!p.displayName || (p.rating ?? 0) < 4 || (p.userRatingCount ?? 0) < 10) continue;
          await ctx.runMutation(internal.vendorDirectory.upsert, {
            placeId: p.id, name: p.displayName.text, area, category: cat.key, address: p.formattedAddress ?? '',
            rating: p.rating ?? 0, ratingCount: p.userRatingCount ?? 0, phone: p.nationalPhoneNumber, mapsUri: p.googleMapsUri,
          });
          saved++;
        }
      }
    }
    return `Saved ${saved} vendors.`;
  },
});

/** Caps on-demand Google Places lookups across the whole app, so a hackathon demo can't run up a bill. */
const MAX_LOOKUPS = 300;

export const lookupState = internalQuery({
  args: { area: v.string(), category: v.string() },
  handler: async (ctx, args) => {
    const done = await ctx.db
      .query('directoryFetches')
      .withIndex('by_area_category', (q) => q.eq('area', args.area).eq('category', args.category))
      .first();
    const total = (await ctx.db.query('directoryFetches').take(MAX_LOOKUPS + 1)).length;
    return { done: !!done, total };
  },
});

export const markLookup = internalMutation({
  args: { area: v.string(), category: v.string(), found: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert('directoryFetches', args);
  },
});

async function lookUp(ctx: ActionCtx, args: { area: string; category: string }): Promise<{ found: number; cached: boolean }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Vendor search is not configured.');
  if (!(PUNE_AREAS as readonly string[]).includes(args.area)) throw new Error('Unsupported area.');
  // Built-in types keep their exact key ("Rentals"); anything else is a cleaned, lower-case name.
  const builtin = VENDOR_CATEGORIES.find((c) => c.key === args.category);
  const category = builtin?.key ?? args.category.toLowerCase().replace(/[^a-z0-9 &,-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!category) throw new Error('Missing category.');

  const state = await ctx.runQuery(internal.vendorDirectory.lookupState, { area: args.area, category });
  if (state.done) return { found: 0, cached: true };
  if (state.total >= MAX_LOOKUPS) throw new Error('The vendor search limit has been reached.');

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: `${searchTermFor(category)} in ${args.area}, Pune`, maxResultCount: 10, regionCode: 'IN' }),
  });
  if (!res.ok) throw new Error(`Places lookup failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const { places = [] } = (await res.json()) as { places?: Place[] };
  let found = 0;
  for (const p of places) {
    if (!p.displayName || (p.rating ?? 0) < 4 || (p.userRatingCount ?? 0) < 10) continue;
    await ctx.runMutation(internal.vendorDirectory.upsert, {
      placeId: p.id, name: p.displayName.text, area: args.area, category, address: p.formattedAddress ?? '',
      rating: p.rating ?? 0, ratingCount: p.userRatingCount ?? 0, phone: p.nationalPhoneNumber, mapsUri: p.googleMapsUri,
    });
    found++;
  }
  await ctx.runMutation(internal.vendorDirectory.markLookup, { area: args.area, category, found });
  return { found, cached: false };
}

/**
 * Looks up one category in one area on Google Places the first time anyone asks for it, then serves it
 * from the directory. Used by the Browse panel for categories the up-front seed doesn't cover.
 */
export const fetchCategory = action({
  args: { area: v.string(), category: v.string() },
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error('Not signed in.');
    return await lookUp(ctx, args);
  },
});

/** Same lookup without the sign-in check, for running from the CLI: npx convex run vendorDirectory:lookup '{"area":"Baner","category":"Agricultural Nursery"}' */
export const lookup = internalAction({
  args: { area: v.string(), category: v.string() },
  handler: async (ctx, args) => await lookUp(ctx, args),
});
