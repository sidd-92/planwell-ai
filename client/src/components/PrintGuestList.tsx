import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { dfmt } from '../lib/planner';
import type { PlanEvent } from '../types';

const SHOW = ['Everyone', 'Not declined', 'Attending only'] as const;
type Show = (typeof SHOW)[number];

/** A check-in sheet: a tick box, name and phone for every guest, to print and take to the door. */
export function PrintGuestList({ ev, onClose }: { ev: PlanEvent; onClose: () => void }) {
  const [show, setShow] = useState<Show>('Everyone');
  const isComm = ev.type === 'community';

  // Alphabetical so a name is quick to find; unnamed entries go last.
  const rows = useMemo(() => {
    const keep = ev.guestList.filter((g) => show === 'Everyone' || (show === 'Not declined' ? g.r !== 'Declined' : g.r === 'Attending'));
    return keep.sort((a, b) => (a.n ? 0 : 1) - (b.n ? 0 : 1) || a.n.localeCompare(b.n));
  }, [ev.guestList, show]);
  const people = rows.reduce((a, g) => a + g.p, 0);

  return createPortal(
    <div className="print-wrap" role="dialog" aria-modal="true" aria-label="Print guest list">
      <div className="print-bar print-hide">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <label className="row text-muted" style={{ gap: 'var(--space-2)', fontSize: 13 }}>
            Include
            <select className="input" value={show} onChange={(e) => setShow(e.target.value as Show)} style={{ padding: '4px 12px' }}>
              {SHOW.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!rows.length}>Print</button>
        </div>
      </div>

      <div className="print-sheet">
        <h1 className="print-title">{ev.name}</h1>
        <p className="print-meta">
          {dfmt(ev.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {ev.location} · {isComm ? 'Attendee' : 'Guest'} check-in · {rows.length} entries, {people} people
        </p>
        {rows.length === 0 ? (
          <p className="print-meta">No {isComm ? 'attendees' : 'guests'} to print yet. Upload a list or add names first.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr><th style={{ width: 36 }}>Here</th><th style={{ width: 40 }}>#</th><th>Name</th><th>Phone</th><th style={{ width: 52 }}>Party</th></tr>
            </thead>
            <tbody>
              {rows.map((g, i) => (
                <tr key={i}>
                  <td><span className="print-box" aria-hidden="true" /></td>
                  <td>{i + 1}</td>
                  <td>{g.n || ''}</td>
                  <td>{g.contact || ''}</td>
                  <td>{g.p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>,
    document.body,
  );
}
