import { useState } from 'react';
import type { Mutate } from '../App';
import type { PlanEvent } from '../types';
import { Check, Plus } from './Icons';

export function TimelineView({ ev, mutate }: { ev: PlanEvent; mutate: Mutate }) {
  const [adding, setAdding] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <div className="col" style={{ gap: 'var(--space-8)', maxWidth: 760 }}>
      {ev.phases.map((ph, pi) => (
        <section key={ph.label + pi} className="col" style={{ gap: 'var(--space-2)' }}>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'baseline', gap: 'var(--space-2) var(--space-3)' }}>
            <h3 style={{ margin: 0, fontSize: 22 }}>{ph.label}</h3>
            <span className="text-muted" style={{ fontSize: 13 }}>{ph.range}</span>
            {ph.now && <span className="tag tag-accent">Current phase</span>}
            <span className="text-muted num" style={{ marginLeft: 'auto', fontSize: 13 }}>{ph.tasks.filter((t) => t.done).length}/{ph.tasks.length}</span>
          </div>
          <div className="col">
            {ph.tasks.map((t, ti) => (
              <div key={ti} className="task-row">
                <button
                  className={`checkbox${t.done ? ' on' : ''}`}
                  aria-label={`${t.done ? 'Reopen' : 'Complete'} “${t.t}”`}
                  aria-pressed={t.done}
                  onClick={() => mutate((e) => { const x = e.phases[pi].tasks[ti]; x.done = !x.done; })}
                >
                  {t.done && <Check />}
                </button>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1 }}>{t.t}</span>
                {t.ai && <span className="tag tag-accent-2">Suggested</span>}
                {(ev.helpers?.length ?? 0) > 0 && (
                  <select
                    className="input"
                    aria-label={`Assign “${t.t}”`}
                    title="Assign to a volunteer. They aren't notified by the app."
                    value={ev.helpers!.some((h) => h.id === t.assignee) ? t.assignee : ''}
                    onChange={(e) => { const id = e.target.value; mutate((x) => { const y = x.phases[pi].tasks[ti]; if (id) y.assignee = id; else delete y.assignee; }); }}
                    style={{ padding: '2px 8px', fontSize: 12, maxWidth: 130 }}
                  >
                    <option value="">Unassigned</option>
                    {ev.helpers!.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                )}
                <span className="text-muted num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{t.due}</span>
              </div>
            ))}
          </div>
          {adding === pi ? (
            <form
              className="row"
              style={{ gap: 'var(--space-2)', paddingTop: 'var(--space-2)' }}
              onSubmit={(e) => {
                e.preventDefault();
                const t = draft.trim();
                if (!t) return;
                mutate((x) => { x.phases[pi].tasks.push({ t, due: '—', done: false }); });
                setAdding(null);
                setDraft('');
              }}
            >
              <input className="input" autoFocus placeholder="New task" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-primary" type="submit">Add</button>
              <button className="btn btn-ghost" type="button" onClick={() => setAdding(null)}>Cancel</button>
            </form>
          ) : (
            <div><button className="btn btn-ghost" onClick={() => { setAdding(pi); setDraft(''); }}><Plus size={14} />Add task</button></div>
          )}
        </section>
      ))}
    </div>
  );
}
