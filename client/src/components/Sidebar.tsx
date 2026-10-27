import { dfmt, daysTo } from '../lib/planner';
import type { PlanEvent } from '../types';
import { ChevronRight, Close, Plus } from './Icons';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" style={compact ? { alignItems: 'center', textAlign: 'center' } : undefined}>
      <span className="brand-name">PlanWell<span className="ai">.AI</span></span>
      {!compact && <span className="brand-tag">An AI-assisted event planner</span>}
    </div>
  );
}

interface Props {
  events: PlanEvent[];
  cur: number;
  floating: boolean;
  onSelect: (i: number) => void;
  onNew: () => void;
  onClose: () => void;
  user: string;
  onSignOut: () => void;
  /** Desktop only: shrink the sidebar to a slim rail to give the page more room. */
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ events, cur, floating, onSelect, onNew, onClose, user, onSignOut, collapsed, onToggle }: Props) {
  if (collapsed && !floating) {
    return (
      <aside className="sidebar rail" aria-label="Events">
        <button className="btn btn-secondary btn-icon" onClick={onToggle} aria-label="Expand sidebar" title="Expand sidebar"><ChevronRight /></button>
        <button className="btn btn-primary btn-icon" onClick={onNew} aria-label="New event" title="New event"><Plus /></button>
        <div className="col" style={{ gap: 'var(--space-2)', alignItems: 'center', marginTop: 'var(--space-2)' }}>
          {events.map((e, i) => (
            <button key={e.id} className={`reset-btn rail-dot${i === cur ? ' active' : ''}`} onClick={() => onSelect(i)} title={e.name} aria-label={e.name} aria-current={i === cur ? 'true' : undefined}>
              {(e.name[0] || '?').toUpperCase()}
            </button>
          ))}
        </div>
        <span className="avatar" aria-hidden="true" title={user} style={{ marginTop: 'auto' }}>{(user[0] || '?').toUpperCase()}</span>
      </aside>
    );
  }
  return (
    <aside className={`sidebar${floating ? ' floating' : ''}`} style={{ position: floating ? 'absolute' : 'relative' }}>
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <Brand />
        {floating ? (
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><Close /></button>
        ) : onToggle && (
          <button className="btn btn-ghost btn-icon" onClick={onToggle} aria-label="Collapse sidebar" title="Collapse sidebar"><ChevronRight style={{ transform: 'rotate(180deg)' }} /></button>
        )}
      </div>
      <button className="btn btn-primary btn-block" onClick={onNew} style={{ marginTop: 0 }}><Plus />New event</button>
      <div className="col" style={{ gap: 'var(--space-1)' }}>
        <h6 className="text-muted" style={{ margin: 'var(--space-2) 0 var(--space-1)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Events · {events.length}</h6>
        {events.map((e, i) => {
          const all = e.phases.flatMap((p) => p.tasks);
          const pct = Math.round((all.filter((t) => t.done).length / Math.max(1, all.length)) * 100);
          return (
            <button key={e.id} className={`reset-btn side-event${i === cur ? ' active' : ''}`} onClick={() => onSelect(i)} aria-current={i === cur ? 'true' : undefined}>
              <span className="kicker">{e.typeLabel}</span>
              <span className="display" style={{ fontSize: 16, lineHeight: 1.2 }}>{e.name}</span>
              <span className="text-muted" style={{ fontSize: 12 }}>{dfmt(e.date)} · {daysTo(e)} days</span>
              <span className="track" style={{ height: 5 }}><span style={{ width: `${pct}%`, background: 'var(--color-accent-2)' }} /></span>
            </button>
          );
        })}
      </div>
      <div className="col" style={{ marginTop: 'auto', gap: 'var(--space-2)' }}>
        <div className="row" style={{ gap: 'var(--space-2)', fontSize: 12 }}>
          <span className="sync-dot" aria-hidden="true" />
          <span className="text-muted">Synced with Convex</span>
        </div>
        <div className="row" style={{ gap: 'var(--space-2)', fontSize: 13 }}>
          <span className="avatar" aria-hidden="true">{(user[0] || '?').toUpperCase()}</span>
          <span className="col" style={{ lineHeight: 1.3, minWidth: 0, flex: 1 }}>
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user}>{user || 'Signed in'}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>Planner</span>
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', flex: 'none' }} onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}
