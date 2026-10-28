import { useState } from 'react';
import type { Mutate } from '../App';
import { addBudgetLine, budgetLineFor, expenseCommitted, fmt, isBooked, paidAmount, removeBudgetLine, vendorCommitted } from '../lib/planner';
import type { PlanEvent } from '../types';
import { ContributionsPanel } from './ContributionsPanel';

/** Green when booked, grey when not booked yet. */
function Dot({ on, label }: { on: boolean; label: string }) {
  return <span role="img" aria-label={label} title={label} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, flex: 'none', background: on ? 'var(--color-accent-2)' : 'color-mix(in srgb, var(--color-text) 25%, transparent)' }} />;
}

export function BudgetView({ ev, mutate, onNotify }: { ev: PlanEvent; mutate: Mutate; onNotify: (message: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<number | null>(null);
  const $ = (n: number) => fmt(n, ev.currency);
  const bt = ev.budget.reduce((a, r) => a + r.alloc, 0);
  const bc = ev.budget.reduce((a, r) => a + r.spent, 0);
  const paid = ev.vendors.reduce((a, v) => a + paidAmount(v), 0);
  const step = ev.currency === 'INR' ? 1000 : 50;
  const realVendors = ev.vendors.filter((v) => !v.expense);
  const booked = realVendors.filter(isBooked).length;
  const notBooked = realVendors.length - booked;

  return (
    <div className="col" style={{ gap: 'var(--space-6)' }}>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {([['Total budget', bt], ['Committed', bc], ['Paid so far', paid], ['Uncommitted', Math.max(0, bt - bc)]] as const).map(([l, v]) => (
          <div key={l} className="col"><span className="text-muted stat-label">{l}</span><span className="stat-num">{$(v)}</span></div>
        ))}
      </div>
      <div className="row" style={{ gap: 'var(--space-4)', fontSize: 14 }} aria-label="Vendor booking status">
        <span className="row" style={{ gap: 6 }}><Dot on label="Booked" /><strong>{booked}</strong> <span className="text-muted">booked</span></span>
        <span className="row" style={{ gap: 6 }}><Dot on={false} label="Not booked yet" /><strong>{notBooked}</strong> <span className="text-muted">not booked yet</span></span>
      </div>
      <div className="col" style={{ maxWidth: 760 }}>
        {ev.budget.map((r, i) => {
          const mine = realVendors.filter((v) => budgetLineFor(ev, v) === r);
          const allBooked = mine.length > 0 && mine.every(isBooked);
          const state = allBooked ? 'Booked' : mine.length ? 'Not booked yet' : 'No vendor yet';
          const fromVendors = vendorCommitted(ev, r);
          const fromExpenses = expenseCommitted(ev, r);
          const other = Math.max(0, r.spent - fromVendors - fromExpenses);
          const over = r.spent > r.alloc;
          const pct = r.alloc ? Math.min(100, Math.round((r.spent / r.alloc) * 100)) : r.spent ? 100 : 0;
          return (
            <div key={r.cat + i} className="budget-row">
              <span className="row" style={{ gap: 'var(--space-2)', fontWeight: 600, fontSize: 15 }}><Dot on={allBooked} label={state} />{r.cat}</span>
              <span className="row num" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                {over && <span className="tag tag-accent">Over</span>}
                {over ? $(r.spent - r.alloc) : `${$(r.alloc - r.spent)} left`}
              </span>
              <span className="track full" style={{ height: 8 }}><span style={{ width: `${pct}%`, background: over ? 'var(--color-accent)' : 'var(--color-accent-2)' }} /></span>
              <span className="text-muted full row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)', fontSize: 13 }}>
                Committed {$(r.spent)} of
                <input
                  className="input alloc-input"
                  type="number"
                  step={step}
                  min={0}
                  value={r.alloc}
                  aria-label={`Allocated to ${r.cat}`}
                  onChange={(e) => { const v = Math.max(0, +e.target.value || 0); mutate((x) => { x.budget[i].alloc = v; }); }}
                />
                planned
              </span>
              <span className="text-muted full row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)', fontSize: 13 }}>
                <span title="Cost of vendors marked Contacted, Booked or paid on the Vendors tab">Vendors {$(fromVendors)}</span>
                <span aria-hidden="true">·</span>
                <span title="Costs you added as expenses on the Vendors tab, such as permits or printing">Expenses {$(fromExpenses)}</span>
                {other > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span title="An amount from before expenses could be itemised. Clear it, or re-add it as an expense on the Vendors tab.">Other (not itemised) {$(other)}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => mutate((x) => { x.budget[i].spent = vendorCommitted(x, x.budget[i]) + expenseCommitted(x, x.budget[i]); })}>Clear</button>
                  </>
                )}
                {r.spent === 0 && ev.budget.length > 1 && (
                  removing === i ? (
                    <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => { let err = ''; mutate((x) => { err = removeBudgetLine(x, i); }); setRemoving(null); onNotify(err || `Removed ${r.cat}`); }}>Yes, remove</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px', color: 'var(--color-text)' }} onClick={() => setRemoving(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px', marginLeft: 'auto', color: 'var(--color-text)', opacity: 0.7 }} onClick={() => setRemoving(i)}>Remove line</button>
                  )
                )}
              </span>
            </div>
          );
        })}
        {adding ? (
          <form
            className="row"
            style={{ flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'flex-end', paddingTop: 'var(--space-3)' }}
            onSubmit={(e) => {
              e.preventDefault();
              let err = '';
              mutate((x) => { err = addBudgetLine(x, name, +amount); });
              if (err) { setError(err); return; }
              onNotify(`Added ${name.trim()}`);
              setAdding(false); setName(''); setAmount(''); setError('');
            }}
          >
            <div className="field" style={{ flex: '2 1 220px' }}><label htmlFor="bl-name">Budget line</label><input id="bl-name" className="input" autoFocus placeholder="e.g. Permits & municipal fees" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
            <div className="field" style={{ flex: '1 1 140px' }}><label htmlFor="bl-amt">Planned ({ev.currency})</label><input id="bl-amt" className="input" type="number" min={0} step={step} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Add line</button>
            <button className="btn btn-ghost" type="button" onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
            {error && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
          </form>
        ) : (
          <div style={{ paddingTop: 'var(--space-3)' }}><button className="btn btn-secondary" onClick={() => setAdding(true)}>Add budget line</button></div>
        )}
      </div>
      {ev.type === 'community' && <ContributionsPanel ev={ev} mutate={mutate} onNotify={onNotify} committed={bc} />}
    </div>
  );
}
