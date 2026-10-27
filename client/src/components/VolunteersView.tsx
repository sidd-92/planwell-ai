import { useState } from 'react';
import type { Mutate } from '../App';
import { addHelper, helperMessage, helperTasks, removeHelper, whatsappUrl } from '../lib/planner';
import type { PlanEvent } from '../types';
import { Check } from './Icons';
import { Cell } from './EditableCell';

/** Friends and relatives helping out, and the timeline tasks assigned to each. They aren't notified by the app. */
export function VolunteersView({ ev, mutate, onNotify }: { ev: PlanEvent; mutate: Mutate; onNotify: (message: string) => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const helpers = ev.helpers ?? [];

  const open = ev.phases.flatMap((p, pi) => p.tasks.map((t, ti) => ({ t, pi, ti, phase: p.label })).filter((x) => !x.t.assignee && !x.t.done));
  const assign = (pi: number, ti: number, id: string) => mutate((e) => { const t = e.phases[pi].tasks[ti]; if (id) t.assignee = id; else delete t.assignee; });

  async function copy(text: string, who: string) {
    try {
      await navigator.clipboard.writeText(text);
      onNotify(`Copied ${who}’s task list. Paste it into WhatsApp or a message.`);
    } catch {
      onNotify('Couldn’t copy. Your browser blocked clipboard access.');
    }
  }

  return (
    <div className="col" style={{ gap: 'var(--space-6)', maxWidth: 820 }}>
      <p className="text-muted" style={{ margin: 0, fontSize: 14, maxWidth: '64ch' }}>
        Add friends and relatives who are helping, then give them tasks from the timeline. <strong>Volunteers aren’t notified yet</strong>: copy their list or open WhatsApp to send it yourself. Automatic notifications are planned for later.
      </p>

      <form
        className="row"
        style={{ flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          let err = '';
          mutate((x) => { err = addHelper(x, name, contact); });
          if (err) { setError(err); return; }
          onNotify(`Added ${name.trim()}`);
          setName(''); setContact(''); setError('');
        }}
      >
        <div className="field" style={{ flex: '1 1 200px' }}><label htmlFor="vol-name">Volunteer name</label><input id="vol-name" className="input" placeholder="e.g. Meera Iyer" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /></div>
        <div className="field" style={{ flex: '1 1 180px' }}><label htmlFor="vol-contact">Phone (optional)</label><input id="vol-contact" className="input" inputMode="tel" placeholder="e.g. 98765 43210" value={contact} onChange={(e) => setContact(e.target.value)} /></div>
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Add volunteer</button>
      </form>
      {error && <p role="alert" style={{ margin: '-12px 0 0', color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}

      {helpers.length === 0 && <p className="text-muted" style={{ margin: 0 }}>No volunteers yet. Add someone above, then assign them tasks here or on the Timeline tab.</p>}

      {helpers.map((h) => {
        const mine = helperTasks(ev, h.id);
        const left = mine.filter((x) => !x.t.done).length;
        const message = helperMessage(ev, h);
        const wa = whatsappUrl(h.contact, message);
        return (
          <section key={h.id} className="card" style={{ padding: 'var(--space-4)' }}>
            <div className="card-head" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <span className="col" style={{ gap: 2 }}>
                <span className="card-title">{h.name}</span>
                <span className="text-muted" style={{ fontSize: 13 }}>
                  <Cell value={h.contact ?? ''} label="Phone" onCommit={(v) => mutate((e) => { const x = (e.helpers ?? []).find((y) => y.id === h.id); if (x) x.contact = v || undefined; })} />
                </span>
              </span>
              <span className="row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                <span className="text-muted num" style={{ fontSize: 13, marginRight: 'var(--space-2)' }}>{left} open · {mine.length - left} done</span>
                <button className="btn btn-ghost" onClick={() => void copy(message, h.name)}>Copy task list</button>
                {wa && <a className="btn btn-ghost" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
                {removing === h.id ? (
                  <>
                    <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { mutate((e) => { removeHelper(e, h.id); }); setRemoving(null); onNotify(`Removed ${h.name}`); }}>Remove, unassign {mine.length} task{mine.length === 1 ? '' : 's'}</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--color-text)' }} onClick={() => setRemoving(null)}>Keep</button>
                  </>
                ) : (
                  <button className="btn btn-ghost" style={{ color: 'var(--color-text)', opacity: 0.7 }} onClick={() => setRemoving(h.id)}>Remove</button>
                )}
              </span>
            </div>
            {mine.length === 0 ? (
              <p className="text-muted" style={{ margin: 'var(--space-2) 0 0', fontSize: 13 }}>No tasks yet. Assign one from the list below.</p>
            ) : (
              <div className="col">
                {mine.map(({ t, pi, ti }) => (
                  <div key={`${pi}-${ti}`} className="task-row">
                    <button
                      className={`checkbox${t.done ? ' on' : ''}`}
                      aria-label={`${t.done ? 'Reopen' : 'Complete'} “${t.t}”`}
                      aria-pressed={t.done}
                      onClick={() => mutate((e) => { const x = e.phases[pi].tasks[ti]; x.done = !x.done; })}
                    >
                      {t.done && <Check />}
                    </button>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1 }}>{t.t}</span>
                    <span className="text-muted num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{t.due}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 6px', color: 'var(--color-text)', opacity: 0.7 }} onClick={() => assign(pi, ti, '')}>Unassign</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {helpers.length > 0 && (
        <section className="col" style={{ gap: 'var(--space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Not assigned yet <span className="text-muted" style={{ fontSize: 13, fontWeight: 400 }}>· {open.length} open task{open.length === 1 ? '' : 's'}</span></h3>
          {open.length === 0 && <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Every open task has someone on it.</p>}
          {open.map(({ t, pi, ti, phase }) => (
            <div key={`${pi}-${ti}`} className="task-row">
              <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{t.t} <span className="text-muted" style={{ fontSize: 12 }}>· {phase}</span></span>
              <span className="text-muted num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{t.due}</span>
              <select className="input" aria-label={`Assign “${t.t}”`} value="" onChange={(e) => assign(pi, ti, e.target.value)} style={{ padding: '4px 10px', fontSize: 13, maxWidth: 160 }}>
                <option value="">Assign to…</option>
                {helpers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
