import { useState } from 'react';
import { PUNE_AREAS } from '../../../shared/areas';
import { isoDay } from '../lib/planner';
import type { PlanEvent } from '../types';

export interface EventEdits {
  name: string;
  client: string;
  host: string;
  date: string;
  location: string;
  guests: number;
  vibe: string;
}

/** Edit an event's details. The plan itself (budget, timeline, vendors) is edited in its own tabs. */
export function EditEventDialog({ ev, onSave, onClose }: { ev: PlanEvent; onSave: (edits: EventEdits) => void; onClose: () => void }) {
  const [f, setF] = useState({ name: ev.name, client: ev.client, host: ev.host, date: ev.date, location: ev.location, guests: String(ev.guests), vibe: ev.vibe });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const guests = Math.round(+f.guests);
  const valid = f.name.trim() && f.client.trim() && f.host.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.location && guests >= 1;
  const inArea = PUNE_AREAS.some((a) => f.location === `${a}, Pune`);

  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={onClose}>
      <div className="dialog" style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-label="Edit event" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Edit event</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-3)' }}>
          <div className="field"><label htmlFor="ed-name">Event name</label><input id="ed-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="ed-client">Client</label><input id="ed-client" className="input" value={f.client} onChange={(e) => set('client', e.target.value)} /></div>
          <div className="field"><label htmlFor="ed-host">Reminders come from</label><input id="ed-host" className="input" value={f.host} onChange={(e) => set('host', e.target.value)} /></div>
          <div className="field"><label htmlFor="ed-date">Date</label><input id="ed-date" className="input" type="date" min={isoDay(new Date())} value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div className="field">
            <label htmlFor="ed-loc">Location</label>
            <select id="ed-loc" className="input" value={f.location} onChange={(e) => set('location', e.target.value)}>
              {!inArea && <option value={f.location}>{f.location} (current)</option>}
              {PUNE_AREAS.map((a) => <option key={a} value={`${a}, Pune`}>{a}, Pune</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="ed-guests">{ev.type === 'community' ? 'Expected attendance' : 'Guest count'}</label><input id="ed-guests" className="input" type="number" min={1} value={f.guests} onChange={(e) => set('guests', e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="ed-vibe">Feel</label><input id="ed-vibe" className="input" value={f.vibe} onChange={(e) => set('vibe', e.target.value)} /></div>
        <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>Changing the date or location doesn’t rewrite the timeline or vendor list. Edit those in their tabs.</p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onSave({ name: f.name.trim(), client: f.client.trim(), host: f.host.trim(), date: f.date, location: f.location, guests, vibe: f.vibe.trim() })}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

export function DeleteEventDialog({ ev, busy, error, onConfirm, onClose }: { ev: PlanEvent; busy: boolean; error: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={busy ? undefined : onClose}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Delete event" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Delete “{ev.name}”?</div>
        <div className="dialog-body">This removes the event, its budget, timeline, vendors, guest list and chat. It can’t be undone.</div>
        {error && <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete event'}</button>
        </div>
      </div>
    </div>
  );
}
