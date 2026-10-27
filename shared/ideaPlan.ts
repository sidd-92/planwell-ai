// Turning an idea into part of the plan: how to pay for it out of the existing budget. Pure functions, used
// by the dialog (always against the current budget) and re-checked before anything is applied.

export interface BudgetRow {
  category: string;
  allocated: number;
  committed: number;
  /** Every vendor on this line is booked, so what's left is genuinely spare. */
  settled?: boolean;
}

export interface FundingOption {
  id: 'reserve' | 'spread' | 'raise';
  label: string;
  /** Planned amount taken from each line. */
  moves: { from: string; amount: number }[];
  /** Added to the total budget instead of taken from other lines. */
  raise: number;
  /** A caution worth showing next to the option. */
  note?: string;
}

const isReserve = (category: string) => /contingen|buffer|reserve|miscell/i.test(category);
const sameLine = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The smallest unit amounts are rounded to. */
export const stepFor = (cost: number) => (cost >= 1000 ? 100 : 10);

/** Planned money on a line that nothing is committed to, rounded down to the step. */
function spare(r: BudgetRow, step: number) {
  return Math.max(0, Math.floor((r.allocated - r.committed) / step) * step);
}

/** Takes `need` from the donors, largest spare first. Returns null when they can't cover it. */
function takeLargestFirst(donors: { category: string; spare: number }[], need: number) {
  const moves: { from: string; amount: number }[] = [];
  let left = need;
  for (const d of [...donors].sort((a, b) => b.spare - a.spare)) {
    if (left <= 0) break;
    const amount = Math.min(d.spare, left);
    if (amount > 0) { moves.push({ from: d.category, amount }); left -= amount; }
  }
  return left > 0 ? null : moves;
}

/** Splits `need` across the donors in proportion to what each has spare, in whole steps. Null when they can't cover it. */
function takeProportionally(donors: { category: string; spare: number }[], need: number, step: number) {
  const total = donors.reduce((a, d) => a + d.spare, 0);
  if (total < need || donors.length === 0) return null;
  const amounts = donors.map((d) => Math.min(d.spare, Math.floor((need * d.spare) / total / step) * step));
  let left = need - amounts.reduce((a, b) => a + b, 0);
  // hand the rounding remainder to whichever lines still have room, one step at a time
  for (let guard = 0; left > 0 && guard < 10000; guard++) {
    let best = -1;
    donors.forEach((d, i) => { if (d.spare - amounts[i] >= step && (best < 0 || d.spare - amounts[i] > donors[best].spare - amounts[best])) best = i; });
    if (best < 0) return null;
    amounts[best] += step;
    left -= step;
  }
  if (left !== 0) return null;
  return donors.map((d, i) => ({ from: d.category, amount: amounts[i] })).filter((m) => m.amount > 0);
}

const sameMoves = (a: FundingOption['moves'], b: FundingOption['moves']) =>
  a.length === b.length && a.every((m, i) => m.from === b[i].from && m.amount === b[i].amount);

/** Ways to find `cost` for the `target` line. Always ends with raising the total, which needs no donor. */
export function fundingOptions(rows: BudgetRow[], cost: number, target: string): FundingOption[] {
  if (!(cost > 0)) return [];
  const step = stepFor(cost);
  const amount = Math.ceil(cost / step) * step;
  const donors = rows
    .filter((r) => !sameLine(r.category, target))
    .map((r) => ({ category: r.category, spare: spare(r, step), safe: isReserve(r.category) || !!r.settled, reserve: isReserve(r.category) }))
    .filter((d) => d.spare > 0);
  const options: FundingOption[] = [];

  // Safe money first: the contingency, then what's left on lines whose vendors are all booked.
  const reserves = donors.filter((d) => d.reserve);
  const settled = donors.filter((d) => d.safe && !d.reserve);
  const safeTotal = [...reserves, ...settled].reduce((a, d) => a + d.spare, 0);
  if (safeTotal >= amount) {
    const fromReserve = takeLargestFirst(reserves, Math.min(amount, reserves.reduce((a, d) => a + d.spare, 0))) ?? [];
    const rest = amount - fromReserve.reduce((a, m) => a + m.amount, 0);
    const fromSettled = rest > 0 ? takeLargestFirst(settled, rest) ?? [] : [];
    const moves = [...fromReserve, ...fromSettled];
    options.push({
      id: 'reserve',
      label: fromSettled.length === 0 ? 'Use the contingency' : fromReserve.length === 0 ? 'Use what’s left on booked lines' : 'Contingency, then what’s left on booked lines',
      moves,
      raise: 0,
    });
  }

  // Everything with budget left, in proportion. This can trim lines that still have things to book.
  const spread = takeProportionally(donors, amount, step);
  if (spread && !options.some((o) => sameMoves(o.moves, spread))) {
    const touchesOpen = spread.some((m) => !donors.find((d) => d.category === m.from)?.safe);
    options.push({
      id: 'spread',
      label: 'Spread across all lines with budget left',
      moves: spread,
      raise: 0,
      note: touchesOpen ? 'Trims lines that still have things to book.' : undefined,
    });
  }

  options.push({ id: 'raise', label: 'Raise the total budget', moves: [], raise: amount });
  return options;
}

/** Checks an option against the budget as it is now. Returns an error message, or '' when it can be applied. */
export function checkOption(rows: BudgetRow[], cost: number, option: FundingOption): string {
  const step = stepFor(cost);
  const total = option.raise + option.moves.reduce((a, m) => a + m.amount, 0);
  if (total !== Math.ceil(cost / step) * step) return 'The amounts don’t add up to the cost. Reopen the idea for fresh options.';
  for (const m of option.moves) {
    const row = rows.find((r) => sameLine(r.category, m.from));
    if (!row || m.amount <= 0) return 'A budget line in this option has changed. Reopen the idea for fresh options.';
    if (row.allocated - row.committed < m.amount) return `${row.category} no longer has that much to spare. Reopen the idea for fresh options.`;
  }
  return '';
}
