import { useEffect, useRef, useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { areaFromLocation, directoryKey } from '../../../shared/areas';
import type { Mutate } from '../App';
import { addExpense, budgetLineFor, fmt, isBooked, isPaid, markFullyPaid, patchVendor, recordAdvance, removeExpense, stepVendor } from '../lib/planner';
import type { PlanEvent, Vendor } from '../types';
import { Cell } from './EditableCell';
import { Segmented } from './Segmented';
import { tagFor } from './tags';

const FILTERS = ['All', 'To book', 'Booked'] as const;

/** All directory vendors for one category in the event's area, each with a shortlist button. */
function BrowsePanel({ ev, index, mutate, onClose }: { ev: PlanEvent; index: number; mutate: Mutate; onClose: () => void }) {
  const row = ev.vendors[index];
  const area = areaFromLocation(ev.location);
  const category = row ? directoryKey(row.cat) : undefined;
  const list = useQuery(api.vendorDirectory.browse, area && category ? { area, category } : 'skip');
  const lookUp = useAction(api.vendorDirectory.fetchCategory);
  const [search, setSearch] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const asked = useRef('');

  // Nothing stored for this category yet: search Google Places once for it, then it's cached for everyone.
  useEffect(() => {
    if (!area || !category || list === undefined || list.length > 0) return;
    const key = `${area}|${category}`;
    if (asked.current === key) return;
    asked.current = key;
    setSearch('busy');
    lookUp({ area, category }).then(() => setSearch('done'), () => setSearch('error'));
  }, [area, category, list, lookUp]);
  if (!row || isPaid(row)) return null; // a paid vendor can't be swapped
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div className="card-head">
        <span className="card-title">{row.cat} in {area ?? 'this area'}{list ? ` · ${list.length} found` : ''}</span>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
      {!area || !category ? (
        <p className="text-muted" style={{ fontSize: 13 }}>No directory for this {area ? 'category' : 'location'}.</p>
      ) : list === undefined ? (
        <p className="text-muted" style={{ fontSize: 13 }}>Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          {search === 'error'
            ? 'Couldn’t search just now. Try again later, or click the Vendor cell in the row to type one in yourself.'
            : search === 'done'
              ? `No well-rated ${row.cat.toLowerCase()} found near ${area}.`
              : `Searching for ${row.cat.toLowerCase()} near ${area}…`}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((d) => (
            <li key={d._id} className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-3)', padding: '10px 0', borderTop: '1px solid var(--color-border, #0001)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  ★ {d.rating.toFixed(1)} ({d.ratingCount}) · {d.address}
                  {d.phone ? ` · ${d.phone}` : ''}
                  {d.mapsUri ? <> · <a href={d.mapsUri} target="_blank" rel="noreferrer">Map</a></> : null}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                disabled={row.name === d.name}
                onClick={() => {
                  mutate((e) => {
                    const x = e.vendors[index];
                    if (isPaid(x)) return;
                    x.name = d.name;
                    if (x.status === 'To find') x.status = 'Shortlisted';
                    x.next = d.phone ? `Call ${d.phone}` : 'Contact vendor';
                  });
                  onClose();
                }}
              >
                {row.name === d.name ? 'Selected' : 'Choose'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STAGES: Vendor['status'][] = ['To find', 'Shortlisted', 'Contacted', 'Booked'];

/** One status chip. Click it for the moves that apply; a paid-in-full vendor has nothing left to do. */
function StatusMenu({ v, onStep, onPay, onRemove }: { v: Vendor; onStep: (dir: 1 | -1) => void; onPay: (kind: 'advance' | 'full') => void; onRemove: () => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => setAt(null);

  useEffect(() => {
    if (!at) return;
    const away = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu') && e.target !== btn.current) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [at]);

  if (v.status === 'Fully paid') {
    return <span className={tagFor(v.status)} title="Paid in full. Nothing comes after this.">{v.status}</span>;
  }

  const i = STAGES.indexOf(v.status);
  const items: { label: string; run: () => void; primary?: boolean }[] = [];
  if (!v.expense && i >= 0 && i < 3) items.push({ label: `Mark ${STAGES[i + 1]}`, run: () => onStep(1), primary: true });
  if (v.status === 'Booked') {
    items.push({ label: 'Record advance payment…', run: () => onPay('advance'), primary: true });
    items.push({ label: 'Mark fully paid…', run: () => onPay('full') });
  }
  if (v.status === 'Advance paid') items.push({ label: 'Mark fully paid…', run: () => onPay('full'), primary: true });
  if (v.expense && !isPaid(v)) items.push({ label: 'Remove expense…', run: onRemove });
  else if (i > 0) items.push({ label: `Back to ${STAGES[i - 1]}`, run: () => onStep(-1) });

  return (
    <>
      <button
        ref={btn}
        className={`${tagFor(v.status)} status-btn`}
        style={{ borderColor: v.status === 'Shortlisted' ? 'var(--color-accent)' : 'transparent' }}
        aria-haspopup="menu"
        aria-expanded={!!at}
        title={v.status === 'Advance paid' ? 'Advance paid. It can only move to Fully paid.' : 'Change status'}
        onClick={() => { const r = btn.current!.getBoundingClientRect(); setAt(at ? null : { x: r.left, y: r.bottom + 4 }); }}
      >
        {v.status} <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
      </button>
      {at && (
        <div className="menu" role="menu" style={{ left: at.x, top: at.y }}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" className={`menu-item${it.primary ? ' primary' : ''}`} onClick={() => { close(); it.run(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </>
  );
}

/** Confirms a payment. Payments are final, so this spells out what can no longer change. */
function PayDialog({ ev, index, kind, mutate, onClose, onDone }: { ev: PlanEvent; index: number; kind: 'advance' | 'full'; mutate: Mutate; onClose: () => void; onDone: (message: string) => void }) {
  const v = ev.vendors[index];
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  if (!v) return null;
  const due = kind === 'advance' ? v.cost - (+amount || 0) : v.cost - (v.status === 'Advance paid' ? v.advance ?? 0 : 0);

  function confirm() {
    let err = '';
    mutate((e) => { err = kind === 'advance' ? recordAdvance(e, index, +amount) : markFullyPaid(e, index); });
    if (err) setError(err);
    else onDone(kind === 'advance' ? `Advance of ${fmt(+amount, ev.currency)} recorded for ${v.name}` : `${v.name} marked fully paid`);
  }

  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={kind === 'advance' ? 'Record advance' : 'Mark fully paid'} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{kind === 'advance' ? 'Record advance payment' : 'Mark fully paid'}</div>
        <div className="dialog-body">
          {v.name} · {v.cat} · total {fmt(v.cost, ev.currency)}
        </div>
        {kind === 'advance' ? (
          <div className="field">
            <label htmlFor="adv-amt">Advance paid ({ev.currency})</label>
            <input id="adv-amt" className="input" type="number" min={0} autoFocus value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} />
            <span className="text-muted" style={{ fontSize: 12 }}>{+amount > 0 ? `Balance due after the event: ${fmt(Math.max(0, due), ev.currency)}` : 'Enter the amount you paid up front.'}</span>
          </div>
        ) : (
          <div className="dialog-body">{fmt(due, ev.currency)} will be recorded as paid, which completes this vendor.</div>
        )}
        <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>
          {kind === 'advance'
            ? 'Once recorded, this vendor can’t move back to Shortlisted, Contacted or Booked, and its cost is locked.'
            : 'This is the final stage. It can’t be undone, and the vendor’s cost is locked.'}
        </p>
        {error && <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={kind === 'advance' && !(+amount > 0)} onClick={confirm}>{kind === 'advance' ? 'Record advance' : 'Mark fully paid'}</button>
        </div>
      </div>
    </div>
  );
}

/** Adds a cost that isn't a vendor, so the budget line says what it's for. */
function ExpenseDialog({ ev, mutate, onClose, onDone }: { ev: PlanEvent; mutate: Mutate; onClose: () => void; onDone: (message: string) => void }) {
  const [what, setWhat] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [picked, setPicked] = useState('');
  const [error, setError] = useState('');
  const guess = what.trim() ? budgetLineFor(ev, { cat: what, name: '', status: 'To find', cost: 0, next: '' })?.cat ?? '' : '';
  const line = picked || guess;

  function save() {
    let err = '';
    mutate((e) => { err = addExpense(e, { what, to, amount: +amount, line }); });
    if (err) setError(err);
    else onDone(`Added ${what.trim()} (${fmt(+amount, ev.currency)})`);
  }

  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Add expense" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Add an expense</div>
        <div className="dialog-body">For costs that aren’t a vendor, like a permit fee or printing. It counts toward the budget line you choose.</div>
        <div className="field"><label htmlFor="ex-what">What is it for?</label><input id="ex-what" className="input" autoFocus placeholder="e.g. Ground permit fee" value={what} onChange={(e) => { setWhat(e.target.value); setError(''); }} /></div>
        <div className="field"><label htmlFor="ex-to">Paid to (optional)</label><input id="ex-to" className="input" placeholder="e.g. Baner ward office" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
          <div className="field"><label htmlFor="ex-amt">Amount ({ev.currency})</label><input id="ex-amt" className="input" type="number" min={0} value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} /></div>
          <div className="field">
            <label htmlFor="ex-line">Budget line</label>
            <select id="ex-line" className="input" value={line} onChange={(e) => { setPicked(e.target.value); setError(''); }}>
              <option value="">Choose a line…</option>
              {ev.budget.map((b) => <option key={b.cat} value={b.cat}>{b.cat}</option>)}
            </select>
          </div>
        </div>
        {error && <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!what.trim() || !(+amount > 0) || !line} onClick={save}>Add expense</button>
        </div>
      </div>
    </div>
  );
}

function RemoveExpenseDialog({ v, onConfirm, onClose }: { v: Vendor; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={onClose}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Remove expense" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Remove “{v.cat}”?</div>
        <div className="dialog-body">It’s taken off the budget line’s committed total. This can’t be undone.</div>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Keep it</button>
          <button className="btn btn-primary" onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>
  );
}

export function VendorsView({ ev, mutate, onNotify }: { ev: PlanEvent; mutate: Mutate; onNotify: (message: string) => void }) {
  const [pay, setPay] = useState<{ index: number; kind: 'advance' | 'full' } | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [browsing, setBrowsing] = useState<number | null>(null);
  const rows = ev.vendors
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => filter === 'All' || (filter === 'Booked' ? isBooked(v) : !isBooked(v)));

  return (
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <Segmented name="vseg" options={FILTERS} value={filter} onChange={setFilter} />
        <span className="text-muted" style={{ fontSize: 13 }}>Click a status to change it. Payments are final.</span>
        <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setAddingExpense(true)}>Add expense</button>
      </div>
      {addingExpense && <ExpenseDialog ev={ev} mutate={mutate} onClose={() => setAddingExpense(false)} onDone={(m) => { setAddingExpense(false); onNotify(m); }} />}
      {removing !== null && ev.vendors[removing] && (
        <RemoveExpenseDialog
          v={ev.vendors[removing]}
          onClose={() => setRemoving(null)}
          onConfirm={() => { const at = removing; mutate((e) => { removeExpense(e, at); }); setRemoving(null); onNotify('Expense removed'); }}
        />
      )}
      {pay && <PayDialog ev={ev} index={pay.index} kind={pay.kind} mutate={mutate} onClose={() => setPay(null)} onDone={(m) => { setPay(null); onNotify(m); }} />}
      {browsing !== null && <BrowsePanel key={browsing} ev={ev} index={browsing} mutate={mutate} onClose={() => setBrowsing(null)} />}
      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr><th>Category</th><th>Vendor</th><th>Status</th><th style={{ textAlign: 'right' }}>Cost</th><th>Budget line</th><th>Next step</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map(({ v, i }) => (
              <tr key={v.cat + i}>
                <td style={{ fontWeight: 600 }}>{v.cat}{v.expense && <> <span className="tag tag-outline" style={{ fontWeight: 400, fontSize: 11 }}>Expense</span></>}</td>
                <td>
                  {isPaid(v) ? v.name : (
                    <Cell
                      value={v.name}
                      label={v.expense ? 'Paid to' : 'Vendor'}
                      onCommit={(t) => mutate((e) => {
                        const x = e.vendors[i];
                        x.name = t || '—';
                        if (t && !x.expense && x.status === 'To find') x.status = 'Shortlisted'; // a named vendor is at least shortlisted
                      })}
                    />
                  )}
                </td>
                <td>
                  <StatusMenu v={v} onStep={(dir) => mutate((e) => { stepVendor(e, i, dir); })} onPay={(kind) => setPay({ index: i, kind })} onRemove={() => setRemoving(i)} />
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {isPaid(v) ? (
                    <div title="Locked: a payment has been recorded">
                      <div>{fmt(v.cost, ev.currency)}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {v.status === 'Fully paid' ? 'Paid in full' : `Paid ${fmt(v.advance ?? 0, ev.currency)} · ${fmt(v.cost - (v.advance ?? 0), ev.currency)} due`}
                      </div>
                    </div>
                  ) : (
                    <Cell value={v.cost ? String(v.cost) : ''} shown={fmt(v.cost, ev.currency)} label="Cost" type="number" align="right" onCommit={(t) => mutate((e) => { patchVendor(e, i, { cost: Math.max(0, Math.round(+t) || 0) }); })} />
                  )}
                </td>
                <td>
                  <select
                    className="input"
                    aria-label={`Budget line for ${v.cat}`}
                    title="The budget line this cost counts against once the vendor is Contacted or Booked"
                    value={budgetLineFor(ev, v)?.cat ?? ''}
                    onChange={(e) => { const line = e.target.value; mutate((x) => { patchVendor(x, i, { line }); }); }}
                    style={{ padding: '4px 10px', fontSize: 13, maxWidth: 190, borderColor: v.cost && !budgetLineFor(ev, v) ? 'var(--color-accent)' : undefined }}
                  >
                    <option value="">{v.cost ? 'Choose a line…' : 'None'}</option>
                    {ev.budget.map((b) => <option key={b.cat} value={b.cat}>{b.cat}</option>)}
                  </select>
                </td>
                <td className="text-muted" style={{ fontSize: 13 }}>
                  {isPaid(v) ? v.next : <Cell value={v.next} label="Next step" onCommit={(t) => mutate((e) => { e.vendors[i].next = t; })} />}
                </td>
                <td>{!isPaid(v) && !v.expense && <button className="btn btn-ghost" onClick={() => setBrowsing(i)}>Browse</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
