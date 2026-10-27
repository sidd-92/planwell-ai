import type { EventContext, GeneratedPlan, IdeaCategory, IdeaPlan } from '../../../shared/api';
import { checkOption, type BudgetRow, type FundingOption } from '../../../shared/ideaPlan';
import { AI_TASKS, POOL, SHORT, seedEvents } from '../data/seed';
import type { ActionKey, BudgetLine, Currency, Helper, Idea, Onboarding, Phase, PlanEvent, Vendor } from '../types';

// ── dates & money ─────────────────────────────────────────────────────────

const DAY = 864e5;

export function fmt(n: number, cur: Currency = 'USD'): string {
  return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export const dParse = (d: string) => new Date(d + 'T12:00:00');

export function dfmt(d: string | Date, o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const date = typeof d === 'string' ? dParse(d) : d;
  return isNaN(+date) ? String(d) : date.toLocaleDateString('en-US', o);
}

export const isoDay = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function daysTo(ev: Pick<PlanEvent, 'date'>, now = new Date()): number {
  return Math.max(0, Math.ceil((+dParse(ev.date) - +now) / DAY));
}

// ── derived numbers ───────────────────────────────────────────────────────

export function counts(ev: PlanEvent) {
  const c = { yes: ev.base.yes, no: ev.base.no, wait: ev.base.wait, invited: 0 };
  ev.guestList.forEach((g) => {
    if (g.r === 'Attending') c.yes += g.p;
    else if (g.r === 'Declined') c.no += g.p;
    else c.wait += g.p;
  });
  c.invited = c.yes + c.no + c.wait;
  return c;
}

/** The most over-committed line, or null when every line is within its allocation. */
export function budgetOverage(ev: PlanEvent) {
  const over = ev.budget.filter((r) => r.spent > r.alloc).sort((a, b) => b.spent - b.alloc - (a.spent - a.alloc))[0];
  return over ? { over, amt: over.spent - over.alloc } : null;
}

const isReserve = (b: BudgetLine) => /contingen|buffer|reserve|miscell/i.test(b.cat);

/** Only a reserve, or a line whose vendors are all booked, has money to spare. A line with open vendors or none yet is still planned spend. */
function hasSpare(ev: PlanEvent, b: BudgetLine) {
  if (isReserve(b)) return true;
  const mine = ev.vendors.filter((v) => !v.expense && budgetLineFor(ev, v) === b);
  return mine.length > 0 && mine.every(isBooked);
}

/** Where the money to cover an overage can come from: a reserve first, else a fully booked line with leftover. Null when nothing can be spared. */
export function budgetFix(ev: PlanEvent) {
  const o = budgetOverage(ev);
  if (!o) return null;
  const { over, amt } = o;
  const donor = ev.budget
    .filter((r) => r !== over && r.spent <= r.alloc && hasSpare(ev, r))
    .sort((a, b) => Number(isReserve(b)) - Number(isReserve(a)) || b.alloc - b.spent - (a.alloc - a.spent))[0];
  if (!donor) return null;
  const slack = donor.alloc - donor.spent;
  const move = Math.min(Math.ceil(amt / 100) * 100, Math.floor(slack / 100) * 100);
  if (move <= 0) return null;
  return { over, donor, amt, move, slack, partial: move < amt };
}

export const nowPhase = (ev: PlanEvent): Phase => ev.phases.find((p) => p.now) || ev.phases[0];

export function greet(ev: PlanEvent): string {
  const f = budgetOverage(ev);
  const c = counts(ev);
  const tf = ev.vendors.filter((v) => v.status === 'To find').map((v) => v.cat.toLowerCase());
  const items: string[] = [];
  if (f) items.push(`${f.over.cat.toLowerCase()} is ${fmt(f.amt, ev.currency)} over its line`);
  if (tf.length) items.push(`${tf.join(' and ')} ${tf.length > 1 ? 'are' : 'is'} still unbooked`);
  if (c.wait) items.push(`${c.wait} ${ev.type === 'community' ? 'RSVPs are unconfirmed' : 'guests haven’t replied'}`);
  if (!items.length) return `${ev.name} is in good shape. Ask me about the budget, timeline, vendors or ideas.`;
  return `Here’s where ${ev.name} stands: ${items.join(', ')}. Where do you want to start?`;
}

export function reminder(ev: PlanEvent, now = new Date()): string {
  const d = dParse(ev.date);
  const by = new Date(Math.max(+d - 28 * DAY, +now + 7 * DAY));
  const long: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  return `Hi! ${ev.host} would love to know if you can make it on ${dfmt(ev.date, long)}. Please reply by ${dfmt(by, long)} so we can confirm final numbers.`;
}

// ── budget lines ──────────────────────────────────────────────────────────

/** Adds a budget line, keeping a reserve line (Contingency) last. Returns an error message, or '' when added. */
export function addBudgetLine(ev: PlanEvent, name: string, alloc: number): string {
  const cat = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!cat) return 'Enter a name for the budget line.';
  if (ev.budget.some((b) => b.cat.toLowerCase() === cat.toLowerCase())) return `There is already a line called “${cat}”.`;
  if (ev.budget.length >= 40) return 'A budget can have up to 40 lines.';
  const line: BudgetLine = { cat, alloc: Math.max(0, Math.round(alloc) || 0), spent: 0 };
  const reserve = ev.budget.findIndex(isReserve);
  if (reserve >= 0 && reserve === ev.budget.length - 1) ev.budget.splice(reserve, 0, line);
  else ev.budget.push(line);
  return '';
}

/** Removes a budget line that has nothing committed to it. Vendors pointed at it go back to matching by name. */
export function removeBudgetLine(ev: PlanEvent, i: number): string {
  const line = ev.budget[i];
  if (!line) return '';
  if (line.spent > 0) return 'Money is committed to this line. Move or remove those costs first.';
  if (ev.budget.length <= 1) return 'A budget needs at least one line.';
  ev.vendors.forEach((v) => { if (v.line === line.cat) delete v.line; });
  ev.budget.splice(i, 1);
  return '';
}

// ── ideas into the plan ───────────────────────────────────────────────────

/** The budget as the idea planner sees it. A line is "settled" when it has vendors and all are booked. */
export function budgetRows(ev: PlanEvent): BudgetRow[] {
  return ev.budget.map((b) => {
    const mine = ev.vendors.filter((v) => !v.expense && budgetLineFor(ev, v) === b);
    return { category: b.cat, allocated: b.alloc, committed: b.spent, settled: mine.length > 0 && mine.every(isBooked) };
  });
}

/** A basic proposal for when Gemini can't be reached: one task, no cost estimate. */
export function fallbackIdeaPlan(ev: PlanEvent, title: string): IdeaPlan {
  const today = isoDay(new Date());
  const lead = isoDay(new Date(+dParse(ev.date) - 21 * DAY));
  return {
    tasks: [{ t: `Plan: ${title}`, due: lead > today ? lead : ev.date }],
    cost: 0,
    line: '',
    rationale: 'No cost estimate is available right now, so this adds the task only. Set any budget by hand on the Budget tab.',
  };
}

/**
 * Works an idea into the plan: adds the chosen tasks to the current phase and, if an option is given, moves
 * planned money to the idea's budget line (creating the line if needed). Nothing changes unless everything checks out.
 */
export function applyIdeaPlan(ev: PlanEvent, ideaIndex: number, plan: IdeaPlan, taskIndexes: number[], option: FundingOption | null): string {
  const idea = ev.ideas[ideaIndex];
  if (!idea) return 'That idea no longer exists.';
  const tasks = taskIndexes.map((i) => plan.tasks[i]).filter(Boolean);
  const budgeted = !!option && plan.cost > 0;
  if (!tasks.length && !budgeted) return 'Pick at least one task or a way to fund it.';
  if (budgeted) {
    const err = checkOption(budgetRows(ev), plan.cost, option!);
    if (err) return err;
    if (!plan.line.trim()) return 'Choose a budget line for this idea.';
  }

  if (budgeted) {
    let target = ev.budget.find((b) => b.cat.trim().toLowerCase() === plan.line.trim().toLowerCase());
    if (!target) {
      const err = addBudgetLine(ev, plan.line, 0);
      if (err) return err;
      target = ev.budget.find((b) => b.cat.trim().toLowerCase() === plan.line.trim().toLowerCase())!;
    }
    for (const m of option!.moves) {
      const from = ev.budget.find((b) => b.cat.trim().toLowerCase() === m.from.trim().toLowerCase())!;
      from.alloc -= m.amount;
      target.alloc += m.amount;
    }
    target.alloc += option!.raise;
  }
  const phase = nowPhase(ev);
  tasks.forEach((t) => phase.tasks.push({ t: t.t, due: dfmt(t.due), done: false, ai: true }));
  idea.added = true;
  delete idea.later;
  return '';
}

// ── volunteers ────────────────────────────────────────────────────────────

/** Tasks assigned to a volunteer, with where they sit in the timeline. */
export function helperTasks(ev: PlanEvent, id: string) {
  return ev.phases.flatMap((p, pi) => p.tasks.map((t, ti) => ({ t, pi, ti })).filter((x) => x.t.assignee === id));
}

export function addHelper(ev: PlanEvent, name: string, contact: string): string {
  const n = name.trim().slice(0, 60);
  if (!n) return 'Enter a name.';
  const helpers = (ev.helpers ??= []);
  if (helpers.length >= 100) return 'An event can have up to 100 volunteers.';
  if (helpers.some((h) => h.name.toLowerCase() === n.toLowerCase())) return `${n} is already a volunteer.`;
  helpers.push({ id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: n, contact: contact.trim().slice(0, 40) || undefined });
  return '';
}

/** Removes a volunteer and unassigns their tasks. */
export function removeHelper(ev: PlanEvent, id: string) {
  ev.phases.forEach((p) => p.tasks.forEach((t) => { if (t.assignee === id) delete t.assignee; }));
  ev.helpers = (ev.helpers ?? []).filter((h) => h.id !== id);
}

/** A message the planner can paste into WhatsApp or SMS. The app doesn't send it. */
export function helperMessage(ev: PlanEvent, h: Helper): string {
  const open = helperTasks(ev, h.id).filter((x) => !x.t.done);
  const when = dfmt(ev.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const lines = open.length ? open.map((x) => `• ${x.t.t}${x.t.due && x.t.due !== '—' ? ` (by ${x.t.due})` : ''}`).join('\n') : 'You have no open tasks right now.';
  return `Hi ${h.name}! Thank you for helping with ${ev.name} on ${when}${ev.location ? ` (${ev.location})` : ''}.\n\nYour tasks:\n${lines}`;
}

/** A WhatsApp link with the message filled in, or null when the number isn't usable. 10-digit numbers are taken as Indian. */
export function whatsappUrl(contact: string | undefined, text: string): string | null {
  let digits = (contact ?? '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits.length >= 11 && digits.length <= 15 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

// ── vendor costs and the budget ───────────────────────────────────────────
// A budget line's `spent` is its committed total: vendor costs (Contacted or Booked) plus any
// other expenses the planner adds. patchVendor keeps it in step when a vendor changes.

const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
/** How alike two names are: a shared whole word counts double a shared 4-letter start (rental/rentals). */
const similarity = (a: string, b: string) => {
  const bw = words(b);
  return words(a).reduce((n, w) => n + (bw.includes(w) ? 2 : bw.some((x) => x.slice(0, 4) === w.slice(0, 4)) ? 1 : 0), 0);
};
// Vendor categories and budget line names that mean the same thing but share no word.
const SAME: [RegExp, RegExp][] = [
  [/cater|food|bar\b/, /refresh|food|drink|cater|beverage/],
  [/hair|makeup|beauty/, /attire|beauty|hair|makeup/],
  [/music|dj|sound/, /music|sound|\bav\b|entertain/],
  [/officiant|ceremony/, /ceremony|officiant/],
  [/rental|tent|furniture|lounge/, /rental|tent|chair|furniture/],
  [/flor|decor/, /flor|decor|banner|signage/],
];

/** The budget line a vendor's cost counts against, or undefined when none fits. */
export function budgetLineFor(ev: PlanEvent, v: Vendor): BudgetLine | undefined {
  if (v.line !== undefined) return v.line ? ev.budget.find((b) => b.cat === v.line) : undefined;
  let best: BudgetLine | undefined;
  let bestScore = 0;
  for (const b of ev.budget) {
    const score = similarity(v.cat, b.cat);
    if (score > bestScore) { best = b; bestScore = score; }
  }
  if (best) return best;
  const cat = v.cat.toLowerCase();
  for (const [a, line] of SAME) {
    if (!a.test(cat)) continue;
    const hit = ev.budget.find((b) => line.test(b.cat.toLowerCase()));
    if (hit) return hit;
  }
  return undefined;
}

const PRE_PAYMENT: Vendor['status'][] = ['To find', 'Shortlisted', 'Contacted', 'Booked'];

/** Booked, or already paid something. */
export const isBooked = (v: Vendor) => v.status === 'Booked' || isPaid(v);
/** An advance or full payment has been recorded; the vendor can no longer move back or change cost. */
export const isPaid = (v: Vendor) => v.status === 'Advance paid' || v.status === 'Fully paid';
/** Money actually paid to the vendor so far. */
export const paidAmount = (v: Vendor) => (v.status === 'Fully paid' ? v.cost : v.status === 'Advance paid' ? v.advance ?? 0 : 0);

// Contacted, Booked and paid vendors have their cost committed to the budget.
const counted = (v: Vendor) => (v.status === 'To find' || v.status === 'Shortlisted' ? 0 : v.cost);

/** Moves a vendor one step through the negotiation stages (To find to Booked). Payments use recordAdvance and markFullyPaid. */
export function stepVendor(ev: PlanEvent, i: number, dir: 1 | -1) {
  const v = ev.vendors[i];
  const at = PRE_PAYMENT.indexOf(v.status);
  const to = PRE_PAYMENT[at + dir];
  if (at < 0 || !to) return;
  patchVendor(ev, i, { status: to });
}

/** Records the up-front payment on a Booked vendor. Returns an error message, or '' when done. */
export function recordAdvance(ev: PlanEvent, i: number, amount: number): string {
  const v = ev.vendors[i];
  if (v.status !== 'Booked') return 'Mark the vendor Booked before recording an advance.';
  if (!(v.cost > 0)) return 'Enter the vendor’s cost first.';
  const paid = Math.round(amount);
  if (!(paid > 0 && paid < v.cost)) return `The advance must be more than 0 and less than ${fmt(v.cost, ev.currency)}. To pay the whole amount, use Mark fully paid.`;
  v.status = 'Advance paid';
  v.advance = paid;
  v.next = `Balance ${fmt(v.cost - paid, ev.currency)} due after the event`;
  return '';
}

/** Marks the vendor paid in full. Final stage: there is nothing after it. */
export function markFullyPaid(ev: PlanEvent, i: number): string {
  const v = ev.vendors[i];
  if (v.status !== 'Booked' && v.status !== 'Advance paid') return 'Book the vendor before marking it paid.';
  if (!(v.cost > 0)) return 'Enter the vendor’s cost first.';
  v.status = 'Fully paid';
  v.next = 'Paid in full';
  return '';
}

/** Vendor costs currently counted against one budget line. */
export function vendorCommitted(ev: PlanEvent, line: BudgetLine): number {
  return ev.vendors.reduce((a, v) => (!v.expense && budgetLineFor(ev, v) === line ? a + counted(v) : a), 0);
}

/** Itemised expenses (permits, printing) counted against one budget line. */
export function expenseCommitted(ev: PlanEvent, line: BudgetLine): number {
  return ev.vendors.reduce((a, v) => (v.expense && budgetLineFor(ev, v) === line ? a + counted(v) : a), 0);
}

/** Adds a non-vendor cost as a Booked row, counted against the chosen budget line. Returns an error message, or '' when added. */
export function addExpense(ev: PlanEvent, e: { what: string; to: string; amount: number; line: string }): string {
  const what = e.what.trim();
  const amount = Math.round(e.amount);
  if (!what) return 'Say what the expense is for.';
  if (!(amount > 0)) return 'Enter an amount above 0.';
  if (!ev.budget.some((b) => b.cat === e.line)) return 'Choose a budget line.';
  ev.vendors.push({ cat: what.slice(0, 80), name: e.to.trim().slice(0, 80) || '—', status: 'To find', cost: 0, next: 'Expense', line: e.line, expense: true });
  const i = ev.vendors.length - 1;
  patchVendor(ev, i, { cost: amount });
  patchVendor(ev, i, { status: 'Booked' });
  return '';
}

/** Removes an expense that hasn't been paid, taking its amount off the budget line. */
export function removeExpense(ev: PlanEvent, i: number): string {
  const v = ev.vendors[i];
  if (!v?.expense) return 'Only expenses can be removed.';
  if (isPaid(v)) return 'A payment is recorded, so this can’t be removed.';
  patchVendor(ev, i, { status: 'To find' }); // takes the amount off the line
  ev.vendors.splice(i, 1);
  return '';
}

/** Changes a vendor's cost, status or budget line and moves the committed amount with it. */
export function patchVendor(ev: PlanEvent, i: number, patch: Partial<Pick<Vendor, 'cost' | 'status' | 'line'>>) {
  const v = ev.vendors[i];
  // Payments are final: no status or cost changes once something has been paid, and payment states only come from the payment functions.
  if (isPaid(v)) { delete patch.status; delete patch.cost; }
  else if (patch.status === 'Advance paid' || patch.status === 'Fully paid') delete patch.status;
  const from = budgetLineFor(ev, v);
  const was = counted(v);
  Object.assign(v, patch);
  const to = budgetLineFor(ev, v);
  if (from) from.spent = Math.max(0, from.spent - was);
  if (to) to.spent += counted(v);
}

// ── assistant actions ─────────────────────────────────────────────────────

/** Button label for an action, or null when it no longer applies. */
export function actionLabel(ev: PlanEvent, key: ActionKey): string | null {
  if (key === 'budget') {
    const f = budgetFix(ev);
    return f ? `Move ${fmt(f.move, ev.currency)} to ${f.over.cat}` : null;
  }
  if (key === 'timeline') return ev.applied.timeline ? null : 'Add 3 tasks';
  if (key === 'vendors') return ev.vendors.some((v) => v.status === 'To find') ? 'Shortlist all three' : null;
  if (key === 'guests') return !ev.reminded && counts(ev).wait ? 'Queue reminder' : null;
  if (key === 'ideas') return ev.applied.ideas ? null : 'Save to idea board';
  return null;
}

/** Directory vendors for one category. `null` means "area event with nothing to offer"; `undefined` means placeholder names. */
export type VendorPicks = { cat: string; names: string[] };

type NewIdea = { title: string; cat: string; desc: string };

/** Applies an action to a (cloned) event. Returns a toast message, or '' if nothing changed. */
export function applyAction(ev: PlanEvent, key: ActionKey, extraIdeas?: NewIdea[], vendorPicks?: VendorPicks | null): string {
  if (key === 'budget') {
    const f = budgetFix(ev);
    if (!f) return '';
    f.over.alloc += f.move;
    f.donor.alloc -= f.move;
    return `Moved ${fmt(f.move, ev.currency)} of planned budget from ${f.donor.cat} to ${f.over.cat}`;
  }
  if (key === 'timeline') {
    if (ev.applied.timeline) return '';
    const ph = nowPhase(ev);
    AI_TASKS[ev.type].forEach(([t, due]) => ph.tasks.push({ t, due, done: false, ai: true }));
    ev.applied.timeline = true;
    return 'Added 3 tasks to the timeline';
  }
  if (key === 'vendors') {
    if (vendorPicks === null) return '';
    const v = ev.vendors.find((x) => x.status === 'To find' && (!vendorPicks || x.cat === vendorPicks.cat));
    if (!v) return '';
    const names = vendorPicks?.names.length ? vendorPicks.names : SHORT[v.cat] || SHORT._;
    v.status = 'Shortlisted';
    v.name = vendorPicks ? names.join(' · ') : names[0] + ' +2 options';
    v.next = `Client picks from ${names.length} options`;
    return `Shortlisted ${names.length} ${v.cat.toLowerCase()} options`;
  }
  if (key === 'guests') {
    if (ev.reminded) return '';
    ev.reminded = true;
    return `Reminder queued for ${counts(ev).wait} ${ev.type === 'community' ? 'contacts' : 'guests'}`;
  }
  if (key === 'ideas') {
    if (ev.applied.ideas) return '';
    const fresh: Idea[] = (extraIdeas && extraIdeas.length
      ? extraIdeas
      : POOL[ev.type].map(([title, cat, desc]) => ({ title, cat, desc }))
    ).map((x, k) => ({ ...x, sw: swatchFor(ev.ideas.length + k), saved: false, fresh: true }));
    ev.ideas.unshift(...fresh);
    ev.applied.ideas = true;
    return `Added ${fresh.length} ideas to the board`;
  }
  return '';
}

const SWATCH_SETS = [[0, 3, 6, 2], [5, 6, 1, 3], [1, 4, 6, 0], [2, 7, 0, 5], [3, 6, 5, 0], [7, 1, 6, 4], [0, 6, 2, 3], [4, 3, 6, 5]];
export const swatchFor = (i: number) => SWATCH_SETS[i % SWATCH_SETS.length];

// ── offline assistant (used when Vertex AI is not reachable) ───────────────

export interface Reply {
  text: string;
  action?: ActionKey;
  label?: string;
}

export function respondLocally(ev: PlanEvent, text: string): Reply {
  const q = text.toLowerCase();
  const $ = (n: number) => fmt(n, ev.currency);
  const has = (...w: string[]) => w.some((x) => q.includes(x));
  const c = counts(ev);
  if (has('vendor', 'book', 'florist', 'dj', 'cater', 'supplier', 'restroom')) {
    const real = ev.vendors.filter((v) => !v.expense);
    const booked = real.filter(isBooked).length;
    const open = real.filter((v) => !isBooked(v));
    const tf = open.find((v) => v.status === 'To find');
    let t = `${booked} of ${real.length} vendors are booked.` + (open.length ? ` Still open: ${open.map((v) => `${v.cat} (${v.status.toLowerCase()})`).join(', ')}.` : '');
    if (tf) {
      const n = SHORT[tf.cat] || SHORT._;
      t += `\n\nFor ${tf.cat.toLowerCase()}, three options fit the budget and are free on ${dfmt(ev.date)}: ${n.join(', ')}.`;
      return { text: t, action: 'vendors', label: 'Shortlist all three' };
    }
    return { text: t };
  }
  if (has('budget', 'cost', 'spend', 'money', 'over', '$', '₹', 'afford')) {
    const bt = ev.budget.reduce((a, r) => a + r.alloc, 0);
    const bc = ev.budget.reduce((a, r) => a + r.spent, 0);
    const pct = Math.round((bc / Math.max(1, bt)) * 100);
    const f = budgetFix(ev);
    if (f) return { text: `${$(bc)} of ${$(bt)} is committed (${pct}%). ${f.over.cat} is ${$(f.amt)} over its line. ${f.donor.cat} has ${$(f.slack)} to spare, so I’d move ${$(f.move)} across to cover ${f.partial ? 'part of it' : 'it'}. That only changes planned amounts; nothing is paid.`, action: 'budget', label: `Move ${$(f.move)} to ${f.over.cat}` };
    const ov = budgetOverage(ev);
    if (ov) return { text: `${$(bc)} of ${$(bt)} is committed (${pct}%). ${ov.over.cat} is ${$(ov.amt)} over its line and no other line has money to spare. Raise its allocation or bring the vendor cost down.` };
    const big = ev.budget.slice().sort((a, b) => b.alloc - b.spent - (a.alloc - a.spent))[0];
    return { text: `${$(bc)} of ${$(bt)} is committed (${pct}%) and every line is within its allocation. The largest uncommitted line is ${big.cat} at ${$(big.alloc - big.spent)}.` };
  }
  if (has('rsvp', 'guest', 'invite', 'attend', 'remind', 'headcount')) {
    const t = `${c.yes} attending, ${c.no} declined, ${c.wait} yet to reply.`;
    if (!ev.reminded && c.wait) return { text: t + `\n\nDraft reminder:\n“${reminder(ev)}”`, action: 'guests', label: 'Queue reminder' };
    return { text: t + (ev.reminded ? ' A reminder is already queued.' : '') };
  }
  if (has('idea', 'theme', 'decor', 'inspir', 'menu', 'vibe', 'activit')) {
    if (!ev.applied.ideas) return { text: `Three directions based on “${ev.vibe}”:\n` + POOL[ev.type].map((p, k) => `${k + 1}. ${p[0]}: ${p[2]}`).join('\n'), action: 'ideas', label: 'Save to idea board' };
    return { text: `The board has ${ev.ideas.length} ideas, ${ev.ideas.filter((i) => i.saved).length} shortlisted. The closest fit for “${ev.vibe}” is ${ev.ideas[0]?.title ?? 'still to come'}.` };
  }
  if (has('due', 'next', 'task', 'timeline', 'todo', 'to do', 'week', 'when')) {
    const ph = nowPhase(ev);
    const open = ph.tasks.filter((t) => !t.done);
    const t = `${open.length} tasks are open in the current phase (${ph.range}):\n` + open.slice(0, 4).map((x) => `• ${x.t}, due ${x.due}`).join('\n');
    if (!ev.applied.timeline) return { text: t + `\n\nThree more that are easy to miss at this stage: ${AI_TASKS[ev.type].map((x) => x[0].toLowerCase()).join('; ')}.`, action: 'timeline', label: 'Add 3 tasks' };
    return { text: t };
  }
  return { text: `I can work across the budget, timeline, vendors, ${ev.type === 'community' ? 'attendees' : 'guests'} and ideas for ${ev.name}. Ask about any of them, or pick a prompt below.` };
}

// ── building events ───────────────────────────────────────────────────────

const TYPE_LABEL = { wedding: 'Wedding', birthday: 'Birthday', community: 'Community' } as const;

export function initialEvents(): PlanEvent[] {
  return seedEvents().map((e) => {
    const ev: PlanEvent = { ...e, applied: {}, reminded: false, chat: [] };
    ev.chat = [{ role: 'ai', text: greet(ev) }];
    return ev;
  });
}

function baseFromOnboarding(o: Onboarding): PlanEvent {
  const template = initialEvents().find((e) => e.type === o.type)!;
  return {
    ...template,
    id: 'n' + Date.now(),
    typeLabel: TYPE_LABEL[o.type],
    name: o.name.trim(),
    client: o.client.trim(),
    host: o.client.trim(),
    date: o.date,
    location: o.location.trim() || 'Venue to be confirmed',
    guests: +o.guests || 100,
    vibe: o.vibe.trim() || o.prios.join(', ').toLowerCase() || 'Your call',
    currency: o.currency,
    applied: {},
    reminded: false,
    guestList: [],
    base: { yes: 0, no: 0, wait: +o.guests || 100 },
  };
}

function fitToTotal(lines: { cat: string; alloc: number }[], total: number) {
  const sum = lines.reduce((a, b) => a + b.alloc, 0) || 1;
  const step = total >= 100000 ? 500 : 50;
  const out = lines.map((b) => ({ cat: b.cat, alloc: Math.round(((b.alloc / sum) * total) / step) * step, spent: 0 }));
  out[out.length - 1].alloc += total - out.reduce((a, b) => a + b.alloc, 0);
  return out;
}

/** Offline drafting: re-scale and re-date the matching template. */
export function draftFromTemplate(o: Onboarding): PlanEvent {
  const ev = baseFromOnboarding(o);
  const total = Math.max(500, +o.budget || 10000);
  ev.budget = fitToTotal(ev.budget, total);
  const d = dParse(o.date);
  ev.phases = ev.phases.slice(1).map((p, i) => {
    const start = new Date(+d - p.w * 7 * DAY);
    return { label: p.label, w: p.w, now: i === 0, range: 'From ' + dfmt(start), tasks: p.tasks.map((t, k) => ({ t: t.t.replace(/ with Saffron Table$/, ' with the caterer'), due: dfmt(new Date(+start + k * 4 * DAY)), done: false })) };
  });
  ev.vendors = ev.vendors.map((v) => ({ cat: v.cat, name: '—', status: 'To find', cost: 0, next: 'Needs sourcing' }));
  const nTasks = ev.phases.reduce((a, p) => a + p.tasks.length, 0);
  ev.chat = [{ role: 'ai', text: `I’ve drafted a plan for ${ev.name}: ${ev.budget.length} budget lines, ${nTasks} tasks across ${ev.phases.length} phases and a ${ev.vendors.length}-item vendor checklist. Nothing is booked yet, so the venue is the place to start.` }];
  return ev;
}

/** Turns Gemini's structured plan into a dashboard event. */
export function draftFromGemini(o: Onboarding, plan: GeneratedPlan): PlanEvent {
  const ev = baseFromOnboarding(o);
  const total = Math.max(500, +o.budget || 10000);
  const lines = plan.budgetBreakdown.filter((b) => b.category && b.allocatedAmount >= 0).map((b) => ({ cat: b.category, alloc: b.allocatedAmount }));
  if (lines.length) ev.budget = fitToTotal(lines, total);

  const eventDay = dParse(o.date);
  const phases = plan.timeline.filter((p) => p.tasks?.length);
  if (phases.length) {
    ev.phases = phases.map((p, i) => {
      const dates = p.tasks.map((t) => dParse(t.deadline)).filter((x) => !isNaN(+x)).sort((a, b) => +a - +b);
      const first = dates[0];
      const w = first ? Math.max(0, Math.round((+eventDay - +first) / (7 * DAY))) : 0;
      return {
        label: p.phase,
        w,
        now: i === 0,
        range: first ? 'From ' + dfmt(first) : '',
        tasks: p.tasks.map((t) => ({ t: t.taskName, due: dfmt(t.deadline), done: false })),
      };
    });
  }
  if (plan.vendorChecklist.length) {
    ev.vendors = plan.vendorChecklist.map((v) => ({ cat: v.category, name: '—', status: 'To find', cost: 0, next: v.nextStep }));
  }
  const pi = plan.personalizedIdeas;
  const ideas: NewIdea[] = [
    ...(pi.themeConcepts || []).map((x) => ({ title: x.title, cat: 'Theme', desc: x.description })),
    ...(pi.decorSuggestions || []).map((x) => ({ title: x.title, cat: 'Decor', desc: x.description })),
    ...(pi.foodIdeas || []).map((x) => ({ title: x.title, cat: 'Food', desc: x.description })),
    ...(pi.icebreakersOrActivities || []).map((x) => ({ title: x.title, cat: 'Activities', desc: x.description })),
  ];
  if (ideas.length) ev.ideas = ideas.map((x, i) => ({ ...x, sw: swatchFor(i), saved: false }));
  ev.aiDrafted = true;
  ev.chat = [{ role: 'ai', text: plan.summary || greet(ev) }];
  return ev;
}

/** Compact snapshot sent to the server as Gemini context. */
export function toContext(ev: PlanEvent, directory?: EventContext['directory']): EventContext {
  const c = counts(ev);
  return {
    name: ev.name,
    type: ev.type,
    date: ev.date,
    daysToGo: daysTo(ev),
    location: ev.location,
    guests: ev.guests,
    vibe: ev.vibe,
    currency: ev.currency,
    budget: ev.budget.map((b) => ({ category: b.cat, allocated: b.alloc, committed: b.spent })),
    openTasks: ev.phases.flatMap((p) => p.tasks.filter((t) => !t.done).map((t) => ({ task: t.t, due: t.due }))).slice(0, 12),
    vendors: ev.vendors.map((v) => ({ category: v.cat, name: v.name, status: v.status })),
    rsvp: { attending: c.yes, declined: c.no, awaiting: c.wait },
    ideas: ev.ideas.map((i) => i.title).slice(0, 12),
    directory,
  };
}

export const IDEA_CATS: IdeaCategory[] = ['Theme', 'Decor', 'Food', 'Activities'];
