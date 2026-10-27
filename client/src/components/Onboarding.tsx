import { useEffect, useRef, useState } from 'react';
import type { AiStatus } from '../App';
import type { GeneratedPlan } from '../../../shared/api';
import { PUNE_AREAS } from '../../../shared/areas';
import { PRIORITY_OPTIONS, QUESTIONS, SKIPPED_VIBE, type IntakeAnswers, type IntakeField } from '../../../shared/intake';
import { draftPlan } from '../lib/api';
import { dParse, draftFromGemini, draftFromTemplate, fmt, isoDay } from '../lib/planner';
import type { Currency, EventType, Onboarding as Ob, PlanEvent } from '../types';
import { Brand } from './Sidebar';
import { Check, Close } from './Icons';
import { IntakeChat } from './IntakeChat';
import { PlanReview } from './PlanReview';
import { Segmented } from './Segmented';

const TYPES: [EventType, string, string][] = [
  ['wedding', 'Wedding', 'Ceremony, reception, two families’ logistics'],
  ['birthday', 'Birthday', 'Milestones, surprise parties, dinners'],
  ['community', 'Community', 'Festivals, fundraisers, block parties'],
];
const CURRENCIES = ['USD', 'INR'] as const;

interface Props {
  ai: AiStatus;
  onClose: () => void;
  onCreate: (ev: PlanEvent, note: string) => Promise<void>;
}

type Result = { status: 'pending' } | { status: 'ok'; plan: GeneratedPlan } | { status: 'fallback' };
type Mode = 'ai' | 'manual';
type View = 'mode' | 'form' | 'chat' | 'draft' | 'review' | 'answers';
interface Draft { ev: PlanEvent; note: string }

const BAR: Record<View, number> = { mode: 0, form: 1, chat: 1, draft: 2, review: 3, answers: 3 };

function initial(): Ob {
  return {
    step: 0,
    type: 'wedding',
    client: '',
    name: '',
    date: isoDay(new Date(Date.now() + 233 * 864e5)),
    location: '',
    guests: '120',
    budget: '35000',
    currency: 'INR',
    prios: ['Food & drink', 'Photography'],
    vibe: '',
    gen: 0,
  };
}

function fromAnswers(a: IntakeAnswers, base: Ob): Ob {
  return {
    ...base,
    type: a.type ?? base.type,
    client: a.client ?? '',
    name: a.name ?? '',
    date: a.date ?? base.date,
    location: a.location ?? '',
    guests: String(a.guests ?? base.guests),
    budget: String(a.budget ?? base.budget),
    currency: a.currency ?? 'INR',
    prios: a.priorities ?? [],
    vibe: !a.vibe || a.vibe === SKIPPED_VIBE ? '' : a.vibe,
  };
}

export function Onboarding({ ai, onClose, onCreate }: Props) {
  const [view, setView] = useState<View>('mode');
  const [mode, setMode] = useState<Mode>('manual');
  const [o, setO] = useState<Ob>(initial);
  const [result, setResult] = useState<Result>({ status: 'pending' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [backup, setBackup] = useState<Ob | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const tick = useRef<number | undefined>(undefined);
  const run = useRef(0);

  useEffect(() => () => window.clearInterval(tick.current), []);

  const set = <K extends keyof Ob>(k: K, v: Ob[K]) => {
    setO((s) => ({ ...s, [k]: v }));
    if (view === 'answers') setDirty(true);
  };
  const settled = result.status !== 'pending';

  // When the draft has come back, build the event and show it for review. Nothing is saved yet.
  useEffect(() => {
    if (view !== 'draft' || !settled || o.gen < 3) return;
    let ev: PlanEvent | null = null;
    let note = mode === 'manual' ? 'Starter plan from PlanWell’s template' : 'Gemini was unreachable, so this uses PlanWell’s template';
    if (result.status === 'ok') {
      try {
        ev = draftFromGemini(o, result.plan);
        note = 'Drafted with Gemini';
      } catch {
        ev = null; // malformed plan: use the template
      }
    }
    setDraft({ ev: ev ?? draftFromTemplate(o), note });
    setView('review');
  }, [view, settled, o, mode, result]);

  function startDrafting(m: Mode, data: Ob = o) {
    const id = ++run.current;
    setView('draft');
    setDraft(null);
    setSaveError('');
    setO((s) => ({ ...s, gen: 0 }));
    setResult({ status: 'pending' });
    window.clearInterval(tick.current);
    tick.current = window.setInterval(() => {
      setO((s) => (s.gen >= 3 ? s : { ...s, gen: s.gen + 1 }));
    }, 650);
    if (m === 'manual' || !ai.online) {
      setResult({ status: 'fallback' });
      return;
    }
    draftPlan({
      eventType: data.type,
      title: data.name.trim(),
      client: data.client.trim(),
      targetDate: data.date,
      todayDate: isoDay(new Date()),
      guestCount: +data.guests || 100,
      totalBudget: +data.budget || 0,
      currency: data.currency,
      location: data.location.trim(),
      priorities: data.prios,
      themePreferences: data.vibe.trim(),
    })
      .then((plan) => run.current === id && setResult({ status: 'ok', plan }))
      .catch(() => run.current === id && setResult({ status: 'fallback' }));
  }

  async function approve() {
    if (!draft) return;
    setSaving(true);
    setSaveError('');
    try {
      await onCreate(draft.ev, draft.note);
    } catch {
      setSaving(false);
      setSaveError('Couldn’t save the plan. Check your connection and try again.');
    }
  }

  function close() {
    run.current++;
    window.clearInterval(tick.current);
    onClose();
  }

  const dateOk = !!o.date && !isNaN(+dParse(o.date));
  const detailsOk = !!(o.client.trim() && o.name.trim() && dateOk && +o.budget > 0 && o.location && +o.guests >= 1);
  const weeksOut = Math.max(1, Math.round((+dParse(o.date || isoDay(new Date())) - Date.now()) / 6048e5));
  const genLabels = [
    `Splitting ${fmt(+o.budget || 0, o.currency)} across budget lines`,
    `Building a ${weeksOut}-week timeline`,
    'Matching a vendor checklist',
    `Collecting ideas for “${o.vibe || o.prios.join(', ').toLowerCase() || o.type}”`,
  ];
  const label: Record<View, string> = { mode: 'New event', form: `Step ${o.step + 1} of 3`, chat: 'AI-guided', draft: 'Drafting', review: 'Review', answers: 'Change answers' };

  const areaSelect = (id: string) => (
    <select id={id} className="input" value={o.location} onChange={(e) => set('location', e.target.value)}>
      <option value="">Choose an area in Pune</option>
      {PUNE_AREAS.map((a) => <option key={a} value={`${a}, Pune`}>{a}, Pune</option>)}
    </select>
  );
  const prioChips = (
    <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      {PRIORITY_OPTIONS.map((l) => {
        const on = o.prios.includes(l);
        return (
          <button key={l} className={on ? 'btn btn-primary' : 'btn btn-secondary'} aria-pressed={on} style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}
            onClick={() => set('prios', on ? o.prios.filter((x) => x !== l) : o.prios.concat([l]))}>
            {l}
          </button>
        );
      })}
    </div>
  );
  const budgetInput = (id: string) => (
    <div className="row" style={{ gap: 'var(--space-2)' }}>
      <input id={id} className="input" type="number" min={0} step={o.currency === 'INR' ? 10000 : 500} value={o.budget} onChange={(e) => set('budget', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
      <Segmented<Currency> name={'cur-' + id} options={CURRENCIES} value={o.currency} onChange={(c) => set('currency', c)} />
    </div>
  );

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label="New event">
      <div className="ob-inner">
        <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <Brand />
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <span className="text-muted" style={{ fontSize: 13 }}>{label[view]}</span>
            <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Close"><Close /></button>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {[0, 1, 2, 3].map((k) => (
            <span key={k} style={{ flex: 1, height: 4, borderRadius: 999, transition: 'background .3s', background: k <= BAR[view] ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 12%, transparent)' }} />
          ))}
        </div>

        {view === 'mode' && (
          <div className="col" style={{ gap: 'var(--space-4)' }}>
            <h2 style={{ margin: 0 }}>How would you like to start?</h2>
            <p className="text-muted" style={{ margin: 0, maxWidth: '52ch' }}>Either way you’ll see the full plan before anything is created, and you can change your answers.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 'var(--space-3)' }}>
              <button className="type-card" disabled={!ai.online} style={{ opacity: ai.online ? 1 : 0.55 }} onClick={() => { setMode('ai'); setView('chat'); }}>
                <span className="display" style={{ fontSize: 20 }}>AI-guided</span>
                <span className="text-muted" style={{ fontSize: 13 }}>
                  {ai.online ? 'Answer a few questions in chat. Gemini drafts a plan tailored to your answers.' : ai.checked ? 'Needs Gemini, which isn’t reachable right now. Use manual setup.' : 'Checking whether Gemini is available…'}
                </span>
              </button>
              <button className="type-card" onClick={() => { setMode('manual'); set('step', 0); setView('form'); }}>
                <span className="display" style={{ fontSize: 20 }}>Manual setup</span>
                <span className="text-muted" style={{ fontSize: 13 }}>Fill in a short form and start from a ready-made template plan you can edit.</span>
              </button>
            </div>
          </div>
        )}

        {view === 'chat' && (
          <IntakeChat
            onBack={() => setView('mode')}
            onDone={(a) => { const d = fromAnswers(a, o); setO(d); startDrafting('ai', d); }}
          />
        )}

        {view === 'form' && o.step === 0 && (
          <div className="col" style={{ gap: 'var(--space-4)' }}>
            <h2 style={{ margin: 0 }}>What are you planning?</h2>
            <p className="text-muted" style={{ margin: 0, maxWidth: '52ch' }}>Pick a starting shape. We draft the budget split, timeline and vendor checklist from it, and you can change everything after.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 'var(--space-3)' }}>
              {TYPES.map(([k, l, d]) => (
                <button key={k} className={`type-card${o.type === k ? ' on' : ''}`} aria-pressed={o.type === k} onClick={() => set('type', k)}>
                  <span className="display" style={{ fontSize: 20 }}>{l}</span>
                  <span className="text-muted" style={{ fontSize: 13 }}>{d}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'form' && o.step === 1 && (
          <div className="col" style={{ gap: 'var(--space-4)' }}>
            <h2 style={{ margin: 0 }}>The basics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'var(--space-4)' }}>
              <div className="field"><label htmlFor="ob-client">Client</label><input id="ob-client" className="input" placeholder="Who you're planning for" value={o.client} onChange={(e) => set('client', e.target.value)} /></div>
              <div className="field"><label htmlFor="ob-name">Event name</label><input id="ob-name" className="input" placeholder="e.g. Rivera–Cole Wedding" value={o.name} onChange={(e) => set('name', e.target.value)} /></div>
              <div className="field"><label htmlFor="ob-date">Date</label><input id="ob-date" className="input" type="date" min={isoDay(new Date())} value={o.date} onChange={(e) => set('date', e.target.value)} /></div>
              <div className="field"><label htmlFor="ob-loc">Location</label>{areaSelect('ob-loc')}</div>
              <div className="field"><label htmlFor="ob-guests">{o.type === 'community' ? 'Expected attendance' : 'Guest count'}</label><input id="ob-guests" className="input" type="number" min={1} value={o.guests} onChange={(e) => set('guests', e.target.value)} /></div>
              <div className="field"><label htmlFor="ob-budget">Total budget ({o.currency})</label>{budgetInput('ob-budget')}</div>
            </div>
          </div>
        )}

        {view === 'form' && o.step === 2 && (
          <div className="col" style={{ gap: 'var(--space-4)' }}>
            <h2 style={{ margin: 0 }}>What matters most?</h2>
            <p className="text-muted" style={{ margin: 0, maxWidth: '52ch' }}>Priorities get a larger share of the budget and earlier slots on the timeline.</p>
            {prioChips}
            <div className="field">
              <label htmlFor="ob-vibe">Describe the feel in a sentence</label>
              <textarea id="ob-vibe" className="input" placeholder="e.g. Relaxed garden dinner, candlelight, lots of family" value={o.vibe} onChange={(e) => set('vibe', e.target.value)} style={{ borderRadius: 'var(--radius-md)' }} />
            </div>
          </div>
        )}

        {view === 'draft' && (
          <div className="col" style={{ gap: 'var(--space-4)' }}>
            <h2 style={{ margin: 0 }}>{mode === 'ai' && ai.online ? 'Gemini is drafting the plan…' : 'Drafting the plan…'}</h2>
            <div className="col">
              {genLabels.map((l, k) => {
                const done = o.gen > k;
                return (
                  <div key={k} className="row" style={{ gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-divider)', opacity: o.gen >= k ? 1 : 0.4, transition: 'opacity .3s' }}>
                    <span style={{ flex: 'none', width: 24, height: 24, borderRadius: 999, display: 'grid', placeItems: 'center', color: 'var(--color-bg)', background: done ? 'var(--color-accent-2)' : 'color-mix(in srgb, var(--color-text) 12%, transparent)' }}>
                      {done && <Check />}
                    </span>
                    <span style={{ fontSize: 15 }}>{l}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'review' && draft && <PlanReview ev={draft.ev} note={draft.note} />}

        {view === 'answers' && (
          <div className="col" style={{ gap: 'var(--space-4)' }}>
            <div className="col" style={{ gap: 'var(--space-1)' }}>
              <h2 style={{ margin: 0 }}>Your answers</h2>
              <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>Change anything, then redraft. The current plan stays until you do.</p>
            </div>
            {([
              ['type', <div key="t" className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>{TYPES.map(([k, l]) => <button key={k} className={o.type === k ? 'btn btn-primary' : 'btn btn-secondary'} aria-pressed={o.type === k} style={{ fontFamily: 'var(--font-body)', fontSize: 13 }} onClick={() => set('type', k)}>{l}</button>)}</div>],
              ['client', <input key="c" className="input" aria-label={QUESTIONS.client} value={o.client} onChange={(e) => set('client', e.target.value)} />],
              ['name', <input key="n" className="input" aria-label={QUESTIONS.name} value={o.name} onChange={(e) => set('name', e.target.value)} />],
              ['date', <input key="d" className="input" type="date" aria-label={QUESTIONS.date} min={isoDay(new Date())} value={o.date} onChange={(e) => set('date', e.target.value)} />],
              ['location', <div key="l">{areaSelect('an-loc')}</div>],
              ['guests', <input key="g" className="input" type="number" min={1} aria-label={QUESTIONS.guests} value={o.guests} onChange={(e) => set('guests', e.target.value)} />],
              ['budget', <div key="b">{budgetInput('an-budget')}</div>],
              ['priorities', <div key="p">{prioChips}</div>],
              ['vibe', <textarea key="v" className="input" aria-label={QUESTIONS.vibe} placeholder="Optional" value={o.vibe} onChange={(e) => set('vibe', e.target.value)} style={{ borderRadius: 'var(--radius-md)' }} />],
            ] as [IntakeField, React.ReactNode][]).map(([f, input]) => (
              <div key={f} className="col" style={{ gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{QUESTIONS[f]}</span>
                {input}
              </div>
            ))}
          </div>
        )}

        {saveError && <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{saveError}</p>}

        {view === 'form' && (
          <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-4)' }}>
            <button className="btn btn-ghost" onClick={() => (o.step === 0 ? setView('mode') : set('step', o.step - 1))}>Back</button>
            <button
              className="btn btn-primary"
              disabled={o.step === 1 && !detailsOk}
              onClick={() => (o.step < 2 ? set('step', o.step + 1) : startDrafting('manual'))}
            >
              {o.step === 2 ? 'Draft my plan' : 'Continue'}
            </button>
          </div>
        )}

        {view === 'review' && (
          <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary" disabled={saving} onClick={() => { setBackup(o); setDirty(false); setView('answers'); }}>Change answers</button>
            <button className="btn btn-primary" disabled={saving} onClick={() => void approve()}>{saving ? 'Creating…' : 'Approve plan'}</button>
          </div>
        )}

        {view === 'answers' && (
          <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-4)' }}>
            <button className="btn btn-ghost" onClick={() => { if (backup) setO(backup); setDirty(false); setView('review'); }}>{dirty ? 'Discard changes' : 'Back to plan'}</button>
            <button className="btn btn-primary" disabled={!dirty || !detailsOk} onClick={() => startDrafting(mode)}>Redraft plan</button>
          </div>
        )}
      </div>
    </div>
  );
}
