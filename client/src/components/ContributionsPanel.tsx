import { useState } from 'react';
import type { Mutate } from '../App';
import { addContribution, fmt, removeContribution } from '../lib/planner';
import type { PlanEvent } from '../types';

/** What a community event has collected from residents, set against what is committed. */
export function ContributionsPanel({ ev, mutate, onNotify, committed }: { ev: PlanEvent; mutate: Mutate; onNotify: (message: string) => void; committed: number }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const $ = (n: number) => fmt(n, ev.currency);
  const list = ev.contributions ?? [];
  const collected = list.reduce((a, c) => a + c.amount, 0);
  const balance = collected - committed;

  return (
    <section className="col" style={{ gap: 'var(--space-4)', maxWidth: 760 }} aria-label="Contributions">
      <div className="col" style={{ gap: 4 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Contributions</h3>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Money collected from residents or members to cover this event.</p>
      </div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {([['Collected', $(collected)], ['Committed', $(committed)], [balance >= 0 ? 'Left over' : 'Still to collect', $(Math.abs(balance))]] as const).map(([l, v]) => (
          <div key={l} className="col"><span className="text-muted stat-label">{l}</span><span className="stat-num">{v}</span></div>
        ))}
      </div>
      <form
        className="row"
        style={{ flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          let err = '';
          mutate((x) => { err = addContribution(x, name, unit, +amount); });
          if (err) { setError(err); return; }
          onNotify(`Added ${name.trim()}`);
          setName(''); setUnit(''); setAmount(''); setError('');
        }}
      >
        <div className="field" style={{ flex: '2 1 180px' }}><label htmlFor="ct-name">Name</label><input id="ct-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="field" style={{ flex: '1 1 100px' }}><label htmlFor="ct-unit">Flat / unit</label><input id="ct-unit" className="input" placeholder="Optional" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
        <div className="field" style={{ flex: '1 1 120px' }}><label htmlFor="ct-amt">Amount ({ev.currency})</label><input id="ct-amt" className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <button className="btn btn-primary" type="submit" disabled={!name.trim() || !amount}>Add</button>
        {error && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
      </form>
      {list.length > 0 && (
        <div className="col" style={{ gap: 0 }}>
          {list.map((c) => (
            <div key={c.id} className="row" style={{ gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border, rgba(0,0,0,.08))', fontSize: 14 }}>
              <span style={{ flex: 1 }}>{c.name}{c.unit && <span className="text-muted"> · {c.unit}</span>}</span>
              <span className="num">{$(c.amount)}</span>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} aria-label={`Remove ${c.name}`} onClick={() => mutate((x) => removeContribution(x, c.id))}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
