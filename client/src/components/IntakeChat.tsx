import { Fragment, useEffect, useRef, useState } from 'react';
import { QUESTIONS, chipsFor, type IntakeAnswers, type IntakeField } from '../../../shared/intake';
import { intakeTurn } from '../lib/api';
import { fmt, isoDay } from '../lib/planner';
import { Send } from './Icons';

type Msg = { role: 'ai' | 'user'; text: string };

const GREETING = `Hi! I’ll ask a few quick questions, then draft your plan. Nothing is saved until you approve it. ${QUESTIONS.type}`;

/** What the planner has told us so far, shown once everything is answered. */
export function answerSummary(a: IntakeAnswers): [string, string][] {
  const cur = a.currency ?? 'INR';
  return [
    ['Type', a.type ?? ''],
    ['Client', a.client ?? ''],
    ['Event', a.name ?? ''],
    ['Date', a.date ?? ''],
    ['Area', a.location ?? ''],
    ['Guests', a.guests ? String(a.guests) : ''],
    ['Budget', a.budget ? fmt(a.budget, cur) : ''],
    ['Priorities', a.priorities?.length ? a.priorities.join(', ') : 'None picked'],
    ['Feel', a.vibe ?? ''],
  ];
}

interface Props {
  onDone: (answers: IntakeAnswers) => void;
  onBack: () => void;
}

export function IntakeChat({ onDone, onBack }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'ai', text: GREETING }]);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [next, setNext] = useState<IntakeField | null>('type');
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, busy, next]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    const history = msgs;
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setDraft('');
    setPicked([]);
    setBusy(true);
    setError('');
    try {
      const r = await intakeTurn({ todayDate: isoDay(new Date()), answers, history: history.slice(-6), message });
      setAnswers(r.answers);
      setNext(r.next);
      setMsgs((m) => [...m, { role: 'ai', text: r.reply }]);
    } catch {
      setError('I couldn’t reach the AI just now. Try again, or go back and use manual setup.');
    } finally {
      setBusy(false);
    }
  }

  const chips = chipsFor(next);
  const multi = next === 'priorities';

  return (
    <div className="col" style={{ gap: 'var(--space-3)', flex: 1, minHeight: 0 }}>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <h2 style={{ margin: 0, flex: 1 }}>Tell me about the event</h2>
      </div>
      <div ref={logRef} className="col" style={{ gap: 'var(--space-3)', maxHeight: '48vh', overflowY: 'auto', padding: 'var(--space-2) 0' }} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className="col" style={{ alignItems: m.role === 'ai' ? 'flex-start' : 'flex-end' }}>
            <div className={`bubble${m.role === 'ai' ? '' : ' user'}`}>{m.text}</div>
          </div>
        ))}
        {busy && (
          <span style={{ display: 'inline-flex', gap: 5 }} aria-label="Assistant is typing">
            {[0, 1, 2].map((k) => <span key={k} className="dot" style={{ animationDelay: `${k * 0.15}s` }} />)}
          </span>
        )}
      </div>

      {next === null && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="card-head"><span className="card-title">What I have</span></div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', fontSize: 14 }}>
            {answerSummary(answers).map(([k, v]) => (<Fragment key={k}><dt className="text-muted">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></Fragment>))}
          </dl>
          <p className="text-muted" style={{ margin: 'var(--space-2) 0 0', fontSize: 12 }}>Something wrong? Just tell me, for example “make it 150 guests”.</p>
        </div>
      )}

      {chips.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {chips.map((c) => {
            const on = multi && picked.includes(c);
            return (
              <button
                key={c}
                className={on ? 'btn btn-primary chip' : 'btn btn-secondary chip'}
                aria-pressed={multi ? on : undefined}
                disabled={busy}
                onClick={() => (multi ? setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c])) : void send(c))}
              >
                {c}
              </button>
            );
          })}
          {multi && (
            <>
              <button className="btn btn-primary chip" disabled={busy || !picked.length} onClick={() => void send(picked.join(', '))}>Send {picked.length || ''} selected</button>
              <button className="btn btn-ghost chip" disabled={busy} onClick={() => void send('Skip')}>Skip</button>
            </>
          )}
        </div>
      )}

      {error && <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
      <form className="row" style={{ gap: 'var(--space-2)' }} onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <input className="input" placeholder="Type your answer…" aria-label="Your answer" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} disabled={busy} />
        <button className="btn btn-primary btn-icon" type="submit" aria-label="Send" disabled={!draft.trim() || busy}><Send /></button>
      </form>

      <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" disabled={next !== null || busy} onClick={() => onDone(answers)}>Draft my plan</button>
      </div>
    </div>
  );
}
