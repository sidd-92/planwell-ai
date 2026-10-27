import { v } from 'convex/values';

// Validator for one event's plan data. It mirrors PlanEvent in client/src/types.ts
// (minus `id`, which is the Convex document _id).

const task = v.object({
  t: v.string(),
  due: v.string(),
  done: v.boolean(),
  ai: v.optional(v.boolean()),
  assignee: v.optional(v.string()),
});

const helper = v.object({ id: v.string(), name: v.string(), contact: v.optional(v.string()) });

const phase = v.object({
  label: v.string(),
  range: v.string(),
  w: v.number(),
  now: v.optional(v.boolean()),
  tasks: v.array(task),
});

const budgetLine = v.object({ cat: v.string(), alloc: v.number(), spent: v.number() });

const vendor = v.object({
  cat: v.string(),
  name: v.string(),
  status: v.union(v.literal('To find'), v.literal('Shortlisted'), v.literal('Contacted'), v.literal('Booked'), v.literal('Advance paid'), v.literal('Fully paid')),
  cost: v.number(),
  next: v.string(),
  line: v.optional(v.string()),
  advance: v.optional(v.number()),
  expense: v.optional(v.boolean()),
});

const guest = v.object({
  n: v.string(),
  p: v.number(),
  r: v.union(v.literal('Awaiting'), v.literal('Attending'), v.literal('Declined')),
  d: v.string(),
  g: v.string(),
  contact: v.optional(v.string()),
  email: v.optional(v.string()),
  a1: v.optional(v.string()),
  a2: v.optional(v.string()),
  pin: v.optional(v.string()),
});

const idea = v.object({
  title: v.string(),
  cat: v.string(),
  desc: v.string(),
  sw: v.array(v.number()),
  saved: v.boolean(),
  fresh: v.optional(v.boolean()),
});

const actionKey = v.union(v.literal('budget'), v.literal('timeline'), v.literal('vendors'), v.literal('guests'), v.literal('ideas'));

const chatMsg = v.object({
  role: v.union(v.literal('ai'), v.literal('user')),
  text: v.string(),
  action: v.optional(actionKey),
  label: v.optional(v.string()),
  done: v.optional(v.boolean()),
});

export const eventData = v.object({
  type: v.union(v.literal('wedding'), v.literal('birthday'), v.literal('community')),
  typeLabel: v.string(),
  name: v.string(),
  client: v.string(),
  host: v.string(),
  date: v.string(),
  location: v.string(),
  guests: v.number(),
  vibe: v.string(),
  currency: v.union(v.literal('USD'), v.literal('INR')),
  budget: v.array(budgetLine),
  phases: v.array(phase),
  vendors: v.array(vendor),
  guestList: v.array(guest),
  base: v.object({ yes: v.number(), no: v.number(), wait: v.number() }),
  ideas: v.array(idea),
  applied: v.object({ timeline: v.optional(v.boolean()), ideas: v.optional(v.boolean()) }),
  reminded: v.boolean(),
  chat: v.array(chatMsg),
  aiDrafted: v.optional(v.boolean()),
  helpers: v.optional(v.array(helper)),
});
