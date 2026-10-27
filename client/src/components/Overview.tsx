import type { Mutate } from '../App';
import { budgetOverage, counts, fmt, isBooked } from '../lib/planner';
import type { PlanEvent, Screen } from '../types';
import { ChevronRight, Sparkle } from './Icons';
import { tagFor } from './tags';

interface Props {
  ev: PlanEvent;
  mutate: Mutate;
  go: (s: Screen) => void;
  guestTab: string;
  weeks: number;
}

export function Overview({ ev, mutate, go, guestTab, weeks }: Props) {
  const $ = (n: number) => fmt(n, ev.currency);
  const c = counts(ev);
  const bt = ev.budget.reduce((a, r) => a + r.alloc, 0);
  const bc = ev.budget.reduce((a, r) => a + r.spent, 0);
  const overTotal = ev.budget.reduce((a, r) => a + Math.max(0, r.spent - r.alloc), 0);
  const allOpen: { t: string; due: string; pi: number; ti: number }[] = [];
  ev.phases.forEach((ph, pi) => ph.tasks.forEach((t, ti) => { if (!t.done) allOpen.push({ t: t.t, due: t.due, pi, ti }); }));
  const realVendors = ev.vendors.filter((v) => !v.expense);
  const openV = realVendors.filter((v) => !isBooked(v));
  const tf = ev.vendors.filter((v) => v.status === 'To find');

  const brief: { title: string; meta: string; to: Screen }[] = [];
  const ov = budgetOverage(ev);
  if (ov) brief.push({ title: `Resolve the ${ov.over.cat.toLowerCase()} overage`, meta: `${$(ov.amt)} over its line`, to: 'budget' });
  if (tf.length) {
    const names = tf.map((v) => v.cat.toLowerCase());
    const title = names.length <= 2 ? `Book ${names.join(' and ')}` : `Book ${names[0]}, ${names[1]} +${names.length - 2} more`;
    brief.push({ title, meta: `${weeks} weeks to go`, to: 'vendors' });
  }
  if (allOpen[0]) brief.push({ title: allOpen[0].t, meta: `Due ${allOpen[0].due}`, to: 'timeline' });
  if (c.wait && !ev.reminded) brief.push({ title: `Chase ${c.wait} RSVPs`, meta: `${Math.round((c.wait / Math.max(1, c.invited)) * 100)}% still to reply`, to: 'guests' });

  const toggle = (pi: number, ti: number) => mutate((e) => { const t = e.phases[pi].tasks[ti]; t.done = !t.done; });

  return (
    <div className="grid-cards">
      {brief.length > 0 && (
        <div className="card" style={{ gridColumn: '1 / -1', gap: 'var(--space-3)' }}>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-accent-2)', display: 'flex' }}><Sparkle /></span>
            <span className="card-kicker">This week’s briefing</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-2)' }}>
            {brief.slice(0, 4).map((b) => (
              <button key={b.title} className="reset-btn brief-btn" onClick={() => go(b.to)}>
                <span className="col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>{b.meta}</span>
                </span>
                <ChevronRight style={{ flex: 'none' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ gap: 'var(--space-3)' }}>
        <div className="card-head"><span className="card-title">Next up</span><button className="btn btn-ghost" onClick={() => go('timeline')}>Timeline</button></div>
        <div className="col">
          {allOpen.slice(0, 5).map((t) => (
            <div key={`${t.pi}-${t.ti}`} className="task-row">
              <button className="checkbox" onClick={() => toggle(t.pi, t.ti)} aria-label={`Mark “${t.t}” done`} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{t.t}</span>
              <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{t.due}</span>
            </div>
          ))}
          {allOpen.length === 0 && <span className="text-muted" style={{ fontSize: 14 }}>Every task is done.</span>}
        </div>
      </div>

      <div className="card" style={{ gap: 'var(--space-3)' }}>
        <div className="card-head"><span className="card-title">Budget</span><button className="btn btn-ghost" onClick={() => go('budget')}>Details</button></div>
        <div className="row" style={{ alignItems: 'baseline', gap: 'var(--space-2)' }}>
          <span className="stat-num">{$(bc)}</span><span className="text-muted" style={{ fontSize: 13 }}>of {$(bt)} committed</span>
        </div>
        <span className="track" style={{ height: 10 }}><span style={{ width: `${Math.min(100, Math.round((bc / Math.max(1, bt)) * 100))}%`, background: 'var(--color-accent-2)' }} /></span>
        <div className="text-muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>{$(Math.max(0, bt - bc))} uncommitted</span>
          <span>{overTotal ? `${$(overTotal)} over on lines` : 'All lines within budget'}</span>
        </div>
      </div>

      <div className="card" style={{ gap: 'var(--space-3)' }}>
        <div className="card-head"><span className="card-title">Vendors</span><button className="btn btn-ghost" onClick={() => go('vendors')}>Checklist</button></div>
        <div className="row" style={{ alignItems: 'baseline', gap: 'var(--space-2)' }}>
          <span className="stat-num">{realVendors.length - openV.length}</span><span className="text-muted" style={{ fontSize: 13 }}>of {realVendors.length} booked</span>
        </div>
        <div className="col" style={{ gap: 'var(--space-2)' }}>
          {openV.slice(0, 4).map((v) => (
            <div key={v.cat} className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)', fontSize: 14 }}>
              <span>{v.cat}</span><span className={tagFor(v.status)}>{v.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ gap: 'var(--space-3)' }}>
        <div className="card-head"><span className="card-title">RSVPs</span><button className="btn btn-ghost" onClick={() => go('guests')}>{guestTab}</button></div>
        <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2, background: 'color-mix(in srgb, var(--color-text) 10%, transparent)' }}>
          <span style={{ flexGrow: c.yes, background: 'var(--color-accent-2)' }} />
          <span style={{ flexGrow: c.no, background: 'var(--color-accent)' }} />
          <span style={{ flexGrow: c.wait }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', fontSize: 13 }}>
          {([[c.yes, 'Attending'], [c.no, 'Declined'], [c.wait, 'Awaiting']] as const).map(([n, l]) => (
            <div key={l} className="col"><span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{n.toLocaleString('en-US')}</span><span className="text-muted">{l}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
