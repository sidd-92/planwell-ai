import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { eventData } from './validators';

export default defineSchema({
  // users, authAccounts, authSessions, … managed by Convex Auth.
  ...authTables,

  // One document per event, owned by the user who created it.
  events: defineTable({
    userId: v.id('users'),
    data: eventData,
  }).index('by_user', ['userId']),

  // Which area and category lookups have already been made on demand, so each one hits Google Places once.
  directoryFetches: defineTable({
    area: v.string(),
    category: v.string(),
    found: v.number(),
  }).index('by_area_category', ['area', 'category']),

  // Real businesses fetched once from Google Places (see vendorDirectory.seed). Read-only for users.
  vendorDirectory: defineTable({
    placeId: v.string(),
    name: v.string(),
    area: v.string(),
    category: v.string(),
    address: v.string(),
    rating: v.number(),
    ratingCount: v.number(),
    phone: v.optional(v.string()),
    mapsUri: v.optional(v.string()),
  })
    .index('by_area_category', ['area', 'category'])
    .index('by_place', ['placeId', 'area', 'category']),
});
