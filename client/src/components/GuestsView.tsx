import { useEffect, useRef, useState } from 'react';
import type { Mutate } from '../App';
import { GCYCLE } from '../data/seed';
import { MAX_GUEST_ENTRIES, readSheetRows, rowsToGuests, templateCsv } from '../lib/guestImport';
import { counts } from '../lib/planner';
import type { PlanEvent } from '../types';
import { Cell } from './EditableCell';
import { PrintGuestList } from './PrintGuestList';
import { Segmented } from './Segmented';
import { tagFor } from './tags';

const FILTERS = ['All', 'Attending', 'Awaiting', 'Declined'] as const;

export function GuestsView({ ev, mutate, onNotify }: { ev: PlanEvent; mutate: Mutate; onNotify: (message: string) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [search, setSearch] = useState('');
  const [newGuest, setNewGuest] = useState('');
  const [newParty, setNewParty] = useState('1');
  const [importing, setImporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const allBox = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isComm = ev.type === 'community';
  const c = counts(ev);
  const q = search.trim().toLowerCase();
  const rows = ev.guestList
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => (filter === 'All' || g.r === filter) && (!q || [g.n, g.contact, g.email].some((f) => (f ?? '').toLowerCase().includes(q))));
  // Selections are row positions, so drop them whenever rows are added or removed.
  useEffect(() => { setPicked(new Set()); setConfirmBulk(false); setRemoving(null); }, [ev.guestList.length]);
  const visible = rows.map(({ i }) => i);
  const pickedVisible = visible.filter((i) => picked.has(i)).length;
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = pickedVisible > 0 && pickedVisible < visible.length;
  });
  const toggle = (i: number) => setPicked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const toggleAll = () => setPicked((s) => {
    const n = new Set(s);
    if (pickedVisible === visible.length) visible.forEach((i) => n.delete(i));
    else visible.forEach((i) => n.add(i));
    return n;
  });
  const listHeads = ev.guestList.reduce((a, g) => a + g.p, 0);
  const edit = (i: number, patch: Partial<PlanEvent['guestList'][number]>) => mutate((e) => { Object.assign(e.guestList[i], patch); });

  function removeSelected() {
    const n = picked.size;
    mutate((e) => { e.guestList = e.guestList.filter((_, i) => !picked.has(i)); });
    onNotify(`Removed ${n} ${n === 1 ? 'entry' : 'entries'} from the list`);
  }

  function removeGuest(i: number) {
    const g = ev.guestList[i];
    mutate((e) => { e.guestList.splice(i, 1); });
    onNotify(`Removed ${g?.n || 'entry'} from the list`);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const { guests, total, duplicates } = rowsToGuests(await readSheetRows(file), ev.guestList);
      if (!total) { onNotify('No guest rows found in that file.'); return; }
      if (ev.guestList.length + guests.length > MAX_GUEST_ENTRIES) { onNotify(`That would pass the ${MAX_GUEST_ENTRIES.toLocaleString('en-US')}-entry limit for one event.`); return; }
      mutate((e) => {
        e.guestList.push(...guests);
        // Named entries replace imported "awaiting" placeholders, so the total stays the expected count.
        e.base.wait = Math.max(0, e.base.wait - guests.length);
      });
      onNotify(`${guests.length}/${total} rows were added${duplicates ? ` (${duplicates} already on the list)` : ''}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Couldn’t read that file.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guest-list-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="col" style={{ gap: 'var(--space-6)' }}>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {([['Invited', c.invited], ['Attending', c.yes], ['Declined', c.no], ['Awaiting', c.wait]] as const).map(([l, v]) => (
          <div key={l} className="col"><span className="text-muted stat-label">{l}</span><span className="stat-num">{v.toLocaleString('en-US')}</span></div>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <Segmented name="gseg" options={FILTERS} value={filter} onChange={setFilter} />
        <input className="input" placeholder="Search name, phone or email" aria-label="Search guests" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240, maxWidth: '100%' }} />
        <div className="row" style={{ gap: 'var(--space-1)', marginLeft: 'auto' }}>
          <button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button>
          <button className="btn btn-secondary" disabled={!ev.guestList.length} onClick={() => setPrinting(true)}>Print guest list</button>
          <button className="btn btn-secondary" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? 'Reading…' : 'Upload .xlsx or .csv'}</button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>
      </div>
      <div className="col" style={{ gap: 'var(--space-2)' }}>
        {picked.size > 0 && (
          <div className="row" style={{ gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg))' }} role="status">
            <span style={{ fontSize: 14, fontWeight: 600 }}>{picked.size} selected</span>
            <button className="btn btn-primary" onClick={() => setConfirmBulk(true)}>Remove selected</button>
            <button className="btn btn-ghost" onClick={() => setPicked(new Set())}>Clear selection</button>
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 1100 }}>
            <thead>
              <tr><th style={{ width: 28 }}><input ref={allBox} type="checkbox" aria-label="Select all shown" checked={visible.length > 0 && pickedVisible === visible.length} disabled={!visible.length} onChange={toggleAll} /></th><th>Name</th><th style={{ textAlign: 'right' }}>Party</th><th>RSVP</th><th>Contact</th><th>Email</th><th>Address 1</th><th>Address 2</th><th>Pincode</th><th>{isComm ? 'Notes' : 'Dietary'}</th><th>{isComm ? 'Role' : 'Group'}</th></tr>
            </thead>
            <tbody>
              {rows.map(({ g, i }) => (
                <tr key={i} style={picked.has(i) ? { background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' } : undefined}>
                  <td><input type="checkbox" aria-label={`Select ${g.n || 'entry ' + (i + 1)}`} checked={picked.has(i)} onChange={() => toggle(i)} /></td>
                  <td style={{ fontWeight: 600 }}>
                    <Cell value={g.n} label="Name" onCommit={(v) => edit(i, { n: v })} />
                    {removing === i ? (
                      <span className="row" style={{ gap: 'var(--space-1)', fontSize: 12, fontWeight: 400 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 6px' }} onClick={() => { removeGuest(i); setRemoving(null); }}>Yes, remove</button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 6px', color: 'var(--color-text)' }} onClick={() => setRemoving(null)}>Keep</button>
                      </span>
                    ) : (
                      <button className="reset-btn text-muted" style={{ fontSize: 11, fontWeight: 400, textDecoration: 'underline' }} onClick={() => setRemoving(i)}>Remove from list</button>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: 'right', width: 70 }}><Cell value={String(g.p)} label="Party" type="number" align="right" onCommit={(v) => edit(i, { p: Math.max(1, Math.min(12, Math.round(+v) || 1)) })} /></td>
                  <td>
                    <button className={`${tagFor(g.r)} status-btn`} title="Change RSVP" onClick={() => mutate((e) => { const x = e.guestList[i]; x.r = GCYCLE[(GCYCLE.indexOf(x.r) + 1) % GCYCLE.length]; })}>{g.r}</button>
                  </td>
                  <td><Cell value={g.contact ?? ''} label="Contact" onCommit={(v) => edit(i, { contact: v })} /></td>
                  <td><Cell value={g.email ?? ''} label="Email" onCommit={(v) => edit(i, { email: v })} /></td>
                  <td><Cell value={g.a1 ?? ''} label="Address 1" onCommit={(v) => edit(i, { a1: v })} /></td>
                  <td><Cell value={g.a2 ?? ''} label="Address 2" onCommit={(v) => edit(i, { a2: v })} /></td>
                  <td><Cell value={g.pin ?? ''} label="Pincode" onCommit={(v) => edit(i, { pin: v })} /></td>
                  <td><Cell value={g.d} label={isComm ? 'Notes' : 'Dietary'} onCommit={(v) => edit(i, { d: v })} /></td>
                  <td><Cell value={g.g} label={isComm ? 'Role' : 'Group'} onCommit={(v) => edit(i, { g: v })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>
          Showing {rows.length} of {ev.guestList.length} named entries ({listHeads} people). Totals include {(c.invited - listHeads).toLocaleString('en-US')} imported from the client’s list.
        </span>
      </div>
      <form
        className="row"
        style={{ flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'flex-end', maxWidth: 560 }}
        onSubmit={(e) => {
          e.preventDefault();
          const n = newGuest.trim();
          if (!n) return;
          const p = Math.max(1, Math.min(12, +newParty || 1));
          mutate((x) => {
            x.guestList.push({ n, p, r: 'Awaiting', d: '', g: '' });
            // A named guest replaces one of the imported "awaiting" placeholders when there is one.
            x.base.wait = Math.max(0, x.base.wait - p);
          });
          setNewGuest('');
          setNewParty('1');
          onNotify(`Added ${n}`);
        }}
      >
        <div className="field" style={{ flex: '1 1 220px' }}><label htmlFor="ng">Add to list</label><input id="ng" className="input" placeholder="Full name" value={newGuest} onChange={(e) => setNewGuest(e.target.value)} /></div>
        <div className="field" style={{ width: 96 }}><label htmlFor="np">Party</label><input id="np" className="input" type="number" min={1} max={12} value={newParty} onChange={(e) => setNewParty(e.target.value)} /></div>
        <button className="btn btn-primary" type="submit" disabled={!newGuest.trim()}>Add</button>
      </form>
      {confirmBulk && (
        <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={() => setConfirmBulk(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Remove selected" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Remove {picked.size} {picked.size === 1 ? 'entry' : 'entries'}?</div>
            <div className="dialog-body">They’re taken off the {isComm ? 'attendee' : 'guest'} list for this event. This can’t be undone.</div>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmBulk(false)}>Keep them</button>
              <button className="btn btn-primary" onClick={() => { removeSelected(); setConfirmBulk(false); }}>Remove {picked.size}</button>
            </div>
          </div>
        </div>
      )}
      {printing && <PrintGuestList ev={ev} onClose={() => setPrinting(false)} />}
    </div>
  );
}
