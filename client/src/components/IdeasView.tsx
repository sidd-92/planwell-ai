import { useState } from 'react';
import type { AiStatus, Mutate } from '../App';
import { SW } from '../data/seed';
import type { PlanEvent } from '../types';
import { IdeaPlanDialog } from './IdeaPlanDialog';
import { PrintIdeas } from './PrintIdeas';
import { Segmented } from './Segmented';

const FILTERS = ['All', 'Theme', 'Decor', 'Food', 'Activities', 'Shortlisted'] as const;

export function IdeasView({ ev, mutate, ai, onNotify }: { ev: PlanEvent; mutate: Mutate; ai: AiStatus; onNotify: (message: string) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [planning, setPlanning] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const cards = ev.ideas.map((it, i) => ({ it, i })).filter(({ it }) => filter === 'All' || (filter === 'Shortlisted' ? it.saved : it.cat === filter));
  const shortlisted = ev.ideas.filter((i) => i.saved).length;

  return (
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <Segmented name="iseg" options={FILTERS} value={filter} onChange={setFilter} style={{ maxWidth: '100%', overflowX: 'auto' }} />
        <span className="text-muted" style={{ fontSize: 13 }}>Tuned to “{ev.vibe}”</span>
        <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} disabled={!shortlisted} onClick={() => setPrinting(true)} title="A printable page of the shortlisted ideas for the client">Print shortlist ({shortlisted})</button>
      </div>
      {filter === 'Shortlisted' && cards.length === 0 && <p className="text-muted" style={{ margin: 0 }}>Nothing is shortlisted yet. Use Shortlist on an idea to keep it here.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', gap: 'var(--space-4)' }}>
        {cards.map(({ it, i }) => (
          <div key={it.title + i} className="card" style={{ gap: 'var(--space-3)', animation: 'pwIn .35s ease-out' }}>
            <div className="row" style={{ gap: 6 }}>
              {it.sw.map((k, j) => <span key={j} className="swatch" style={{ background: SW[k] }} />)}
            </div>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <span className="card-kicker">{it.cat}</span>
              {it.fresh && <span className="tag tag-accent-2">New</span>}
              {it.added && <span className="tag tag-accent-2">In the plan</span>}
              {!it.added && it.later && <span className="tag tag-outline">Decide later</span>}
            </div>
            <span className="card-title">{it.title}</span>
            <p className="card-body" style={{ textWrap: 'pretty' }}>{it.desc}</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-1)' }}>
              <button className={it.saved ? 'btn btn-secondary' : 'btn btn-ghost'} aria-pressed={it.saved} title="Keep this on a shortlist you can print for the client" onClick={() => mutate((e) => { e.ideas[i].saved = !e.ideas[i].saved; })}>
                {it.saved ? 'Shortlisted' : 'Shortlist'}
              </button>
              {!it.added && <button className="btn btn-ghost" onClick={() => setPlanning(i)}>{it.later ? 'Review budget options' : 'Add to plan'}</button>}
            </div>
          </div>
        ))}
      </div>
      {planning !== null && <IdeaPlanDialog key={planning} ev={ev} index={planning} aiOnline={ai.online} mutate={mutate} onClose={() => setPlanning(null)} onNotify={onNotify} />}
      {printing && <PrintIdeas ev={ev} onClose={() => setPrinting(false)} />}
    </div>
  );
}
