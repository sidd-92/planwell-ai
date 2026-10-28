import { useState } from 'react';
import type { Mutate } from '../App';
import { addContributor, applyContributionSplit, contributionLeft, fmt, removeContributor, suggestContributionSplit } from '../lib/planner';
import type { PlanEvent } from '../types';

/** What a community event has collected, who gave, and how much of it is on budget lines. */
export function ContributionsPanel({ ev, mutate, onNotify, committed }: { ev: PlanEvent; mutate: Mutate; onNotify: (message: string) => void; committed: number }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState('');
  const [split, setSplit] = useState<string[] | null>(null);
  const [splitError, setSplitError] = useState('');
  const $ = (n: number) => fmt(n, ev.currency);
  const list = ev.contributors ?? [];
  const collected = ev.collected ?? 0;
  const left = contributionLeft(ev);
  const balance = collected - committed;
  const step = ev.currency === 'INR' ? 100 : 10;

  return (
    <section className="col" style={{ gap: 'var(--space-4)', maxWidth: 760 }} aria-label="Contributions">
      <div className="col" style={{ gap: 4 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Contributions</h3>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Enter the total collected and note who contributed. How much each person gave isn’t tracked.</p>
      </div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="col">
          <label className="text-muted stat-label" htmlFor="ct-total">Collected ({ev.currency})</label>
          <input id="ct-total" className="input" type="number" min={0} step={step} value={collected || ''} placeholder="0" onChange={(e) => { const v = Math.max(0, Math.round(+e.target.value || 0)); mutate((x) => { x.collected = v; }); }} />
        </div>
        <div className="col"><span className="text-muted stat-label">Committed</span><span className="stat-num">{$(committed)}</span></div>
        <div className="col"><span className="text-muted stat-label">{balance >= 0 ? 'Left over' : 'Still to collect'}</span><span className="stat-num">{$(Math.abs(balance))}</span></div>
      </div>

      {collected > 0 && (
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          <span className="text-muted" style={{ fontSize: 14 }}>{$(left)} of the collection isn’t on any budget line yet.</span>
          {left > 0 && !split && (
            <div><button className="btn btn-secondary" onClick={() => { setSplit(suggestContributionSplit(ev).map((n) => (n ? String(n) : ''))); setSplitError(''); }}>Add to budget lines</button></div>
          )}
          {split && (
            <div className="col" style={{ gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 14 }}>Lines over budget are filled in first. Change any amount; this raises that line’s planned amount.</span>
              {ev.budget.map((r, i) => (
                <label key={r.cat + i} className="row" style={{ gap: 'var(--space-2)', fontSize: 14 }}>
                  <span style={{ flex: 1 }}>{r.cat}{r.spent > r.alloc && <span className="tag tag-accent" style={{ marginLeft: 8 }}>Over by {$(r.spent - r.alloc)}</span>}</span>
                  <input className="input alloc-input" type="number" min={0} step={step} aria-label={`Contribution to ${r.cat}`} value={split[i] ?? ''} onChange={(e) => { const next = [...split]; next[i] = e.target.value; setSplit(next); setSplitError(''); }} />
                </label>
              ))}
              {splitError && <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{splitError}</p>}
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    let err = '';
                    mutate((x) => { err = applyContributionSplit(x, split.map((n) => +n || 0)); });
                    if (err) { setSplitError(err); return; }
                    setSplit(null);
                    onNotify('Added the contributions to the budget');
                  }}
                >Add to budget</button>
                <button className="btn btn-ghost" onClick={() => setSplit(null)}>Not now</button>
              </div>
            </div>
          )}
        </div>
      )}

      <form
        className="row"
        style={{ flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          let err = '';
          mutate((x) => { err = addContributor(x, name, phone, detail); });
          if (err) { setError(err); return; }
          onNotify(`Added ${name.trim()}`);
          setName(''); setPhone(''); setDetail(''); setError('');
        }}
      >
        <div className="field" style={{ flex: '2 1 180px' }}><label htmlFor="ct-name">Name</label><input id="ct-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="field" style={{ flex: '1 1 140px' }}><label htmlFor="ct-phone">Phone</label><input id="ct-phone" className="input" type="tel" placeholder="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field" style={{ flex: '1 1 120px' }}><label htmlFor="ct-detail">Detail</label><input id="ct-detail" className="input" placeholder="Flat, lane… optional" value={detail} onChange={(e) => setDetail(e.target.value)} /></div>
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Add</button>
        {error && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
      </form>
      {list.length > 0 && (
        <div className="col" style={{ gap: 0 }}>
          {list.map((c) => (
            <div key={c.id} className="row" style={{ gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border, rgba(0,0,0,.08))', fontSize: 14 }}>
              <span style={{ flex: 1 }}>{c.name}{c.detail && <span className="text-muted"> · {c.detail}</span>}</span>
              {c.phone && <span className="text-muted num">{c.phone}</span>}
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} aria-label={`Remove ${c.name}`} onClick={() => mutate((x) => removeContributor(x, c.id))}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
