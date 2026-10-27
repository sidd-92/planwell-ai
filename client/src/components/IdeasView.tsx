import { useState } from 'react';
import type { Mutate } from '../App';
import { SW } from '../data/seed';
import type { PlanEvent } from '../types';
import { Segmented } from './Segmented';

const FILTERS = ['All', 'Theme', 'Decor', 'Food', 'Activities'] as const;

export function IdeasView({ ev, mutate }: { ev: PlanEvent; mutate: Mutate }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const cards = ev.ideas.map((it, i) => ({ it, i })).filter(({ it }) => filter === 'All' || it.cat === filter);

  return (
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <Segmented name="iseg" options={FILTERS} value={filter} onChange={setFilter} style={{ maxWidth: '100%', overflowX: 'auto' }} />
        <span className="text-muted" style={{ fontSize: 13 }}>Tuned to “{ev.vibe}”</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', gap: 'var(--space-4)' }}>
        {cards.map(({ it, i }) => (
          <div key={it.title + i} className="card" style={{ gap: 'var(--space-3)', animation: 'pwIn .35s ease-out' }}>
            <div className="row" style={{ gap: 6 }}>
              {it.sw.map((k, j) => <span key={j} className="swatch" style={{ background: SW[k] }} />)}
            </div>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <span className="card-kicker">{it.cat}</span>
              {it.fresh && <span className="tag tag-accent-2">New</span>}
            </div>
            <span className="card-title">{it.title}</span>
            <p className="card-body" style={{ textWrap: 'pretty' }}>{it.desc}</p>
            <div>
              <button className={it.saved ? 'btn btn-secondary' : 'btn btn-ghost'} aria-pressed={it.saved} onClick={() => mutate((e) => { e.ideas[i].saved = !e.ideas[i].saved; })}>
                {it.saved ? 'Saved for client' : 'Save for client'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
