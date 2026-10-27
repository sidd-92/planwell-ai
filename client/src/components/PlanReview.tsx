import { dfmt, fmt } from '../lib/planner';
import type { PlanEvent } from '../types';

/** Read-only preview of a drafted plan. Nothing here is saved until the planner approves it. */
export function PlanReview({ ev, note }: { ev: PlanEvent; note: string }) {
  const total = ev.budget.reduce((a, b) => a + b.alloc, 0);
  const summary = ev.chat[0]?.text;
  return (
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <div className="col" style={{ gap: 'var(--space-1)' }}>
        <h2 style={{ margin: 0 }}>Review your plan</h2>
        <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>
          Nothing is saved yet. Approve it to create the event, or change your answers and I’ll redraft.
        </p>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <span className="tag tag-accent-2">{ev.typeLabel}</span>
          <span className="tag tag-outline">{note}</span>
        </div>
        <h3 className="display" style={{ margin: 'var(--space-2) 0 var(--space-1)' }}>{ev.name}</h3>
        <div className="text-muted" style={{ fontSize: 14 }}>
          {ev.client} · {dfmt(ev.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {ev.location} · {ev.guests} guests
        </div>
        {summary && <p style={{ margin: 'var(--space-3) 0 0', fontSize: 14 }}>{summary}</p>}
      </div>

      <section className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="card-head"><span className="card-title">Budget</span><span className="num">{fmt(total, ev.currency)}</span></div>
        <table className="table"><tbody>
          {ev.budget.map((b) => (
            <tr key={b.cat}><td>{b.cat}</td><td className="num" style={{ textAlign: 'right' }}>{fmt(b.alloc, ev.currency)}</td></tr>
          ))}
        </tbody></table>
      </section>

      <section className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="card-head"><span className="card-title">Timeline</span></div>
        <div className="col" style={{ gap: 'var(--space-3)' }}>
          {ev.phases.map((p) => (
            <div key={p.label}>
              <div style={{ fontWeight: 600 }}>{p.label} <span className="text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {p.range}</span></div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 14 }}>
                {p.tasks.map((t) => <li key={t.t}>{t.t} <span className="text-muted">· {t.due}</span></li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="card-head"><span className="card-title">Vendors to find</span></div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          {ev.vendors.map((v) => <li key={v.cat}><strong>{v.cat}</strong> <span className="text-muted">· {v.next}</span></li>)}
        </ul>
      </section>

      <section className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="card-head"><span className="card-title">Ideas</span></div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          {ev.ideas.map((i) => <li key={i.title}><strong>{i.title}</strong> <span className="text-muted">· {i.cat}</span></li>)}
        </ul>
      </section>
    </div>
  );
}
