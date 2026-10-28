import type { ActionKey, Currency, EventType, IdeaPlan } from '../../shared/api';

export type { ActionKey, Currency, EventType };

export type Screen = 'overview' | 'budget' | 'timeline' | 'vendors' | 'guests' | 'volunteers' | 'ideas';

export interface Task {
  t: string;
  due: string;
  done: boolean;
  ai?: boolean;
  /** The volunteer (Helper id) this task is assigned to. */
  assignee?: string;
}

export interface Phase {
  label: string;
  range: string;
  /** Weeks before the event this phase starts — used when re-dating a template. */
  w: number;
  now?: boolean;
  tasks: Task[];
}

export interface BudgetLine {
  cat: string;
  alloc: number;
  spent: number;
}

/** Negotiation stages, then payment. Once an advance is paid a vendor never goes back to an earlier stage. */
export type VendorStatus = 'To find' | 'Shortlisted' | 'Contacted' | 'Booked' | 'Advance paid' | 'Fully paid';

export interface Vendor {
  cat: string;
  name: string;
  status: VendorStatus;
  cost: number;
  next: string;
  /** Budget line this vendor's cost counts against once Contacted or Booked. Unset = match by name; '' = none. */
  line?: string;
  /** Amount paid up front, recorded when the status moves to Advance paid. */
  advance?: number;
  /** A cost that isn't a vendor (permit fee, printing). Shown in the vendor table, but not counted as a vendor. */
  expense?: boolean;
}

export type RsvpStatus = 'Awaiting' | 'Attending' | 'Declined';

export interface Guest {
  n: string;
  p: number;
  r: RsvpStatus;
  d: string;
  g: string;
  /** Contact details, filled from an imported sheet or edited in the table. */
  contact?: string;
  email?: string;
  a1?: string;
  a2?: string;
  pin?: string;
}

export interface Idea {
  title: string;
  cat: string;
  desc: string;
  /** Indices into the swatch palette. */
  sw: number[];
  /** Shortlisted for the client. */
  saved: boolean;
  fresh?: boolean;
  /** Worked into the plan (tasks added, budget changed if the planner chose to). */
  added?: boolean;
  /** The planner chose to decide later; the proposal is kept so it can be reopened. */
  later?: IdeaPlan;
}

export interface ChatMsg {
  role: 'ai' | 'user';
  text: string;
  action?: ActionKey;
  label?: string;
  done?: boolean;
}

/** A friend or relative helping out. They aren't notified by the app. */
export interface Helper {
  id: string;
  name: string;
  contact?: string;
}

/** A person who contributed to a community event. How much each gave isn't tracked. */
export interface Contributor {
  id: string;
  name: string;
  phone?: string;
  /** Anything that tells people apart: a flat, a lane, a group. */
  detail?: string;
}

export interface PlanEvent {
  id: string;
  type: EventType;
  typeLabel: string;
  name: string;
  client: string;
  host: string;
  date: string;
  location: string;
  guests: number;
  vibe: string;
  currency: Currency;
  budget: BudgetLine[];
  phases: Phase[];
  vendors: Vendor[];
  guestList: Guest[];
  /** RSVP counts imported from the client's list, on top of the named guests. */
  base: { yes: number; no: number; wait: number };
  ideas: Idea[];
  applied: { timeline?: boolean; ideas?: boolean };
  reminded: boolean;
  chat: ChatMsg[];
  aiDrafted?: boolean;
  helpers?: Helper[];
  /** Community events only. */
  contributors?: Contributor[];
  /** Total collected, entered as one number. */
  collected?: number;
  /** Part of `collected` already added to budget lines. */
  earmarked?: number;
}

export interface Onboarding {
  step: number;
  type: EventType;
  client: string;
  name: string;
  date: string;
  location: string;
  guests: string;
  budget: string;
  currency: Currency;
  prios: string[];
  vibe: string;
  gen: number;
}
