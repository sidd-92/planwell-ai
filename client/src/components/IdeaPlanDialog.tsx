import { useEffect, useMemo, useState } from 'react';
import type { IdeaPlan } from '../../../shared/api';
import { fundingOptions } from '../../../shared/ideaPlan';
import type { Mutate } from '../App';
import { planIdea } from '../lib/api';
import { applyIdeaPlan, budgetRows, dfmt, fallbackIdeaPlan, fmt, toContext } from '../lib/planner';
import type { PlanEvent } from '../types';

type Load = { s: 'loading' } | { s: 'ready'; plan: IdeaPlan; estimated: boolean } | { s: 'error' };

/**
 * Works one idea into the plan. Gemini proposes tasks, a cost and a budget line; the ways to fund it are worked out
 * from the current budget. Nothing changes until the planner confirms, and "Decide later" keeps the proposal.
 */
export function IdeaPlanDialog({ ev, index, aiOnline, mutate, onClose, onNotify }: { ev: PlanEvent; index: number; aiOnline: boolean; mutate: Mutate; onClose: () => void; onNotify: (message: string) => void }) {
  const idea = ev.ideas[index];
  const [load, setLoad] = useState<Load>(() => (idea?.later ? { s: 'ready', plan: idea.later, estimated: true } : { s: 'loading' }));
  const [tasks, setTasks] = useState<number[]>([]);
  const [pick, setPick] = useState<string>('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!idea || idea.later) return;
    if (!aiOnline) { setLoad({ s: 'ready', plan: fallbackIdeaPlan(ev, idea.title), estimated: false }); return; }
    let live = true;
    setLoad({ s: 'loading' });
    planIdea({ event: toContext(ev), idea: { title: idea.title, category: idea.cat, description: idea.desc } })
      .then((plan) => { if (live) setLoad({ s: 'ready', plan, estimated: true }); })
      .catch(() => { if (live) setLoad({ s: 'error' }); });
    return () => { live = false; };
    // only the first look (and a retry) should call Gemini, not every edit to the event
  }, [attempt]);

  const plan = load.s === 'ready' ? load.plan : null;
  // Always worked out against the budget as it is now, so a proposal kept for later is never stale.
  const options = useMemo(() => (plan && plan.cost > 0 ? fundingOptions(budgetRows(ev), plan.cost, plan.line) : []), [plan, ev]);
  useEffect(() => {
    if (plan) { setTasks(plan.tasks.map((_, i) => i)); setPick((p) => p || (options[0]?.id ?? 'none')); }
  }, [plan]);

  if (!idea) return null;
  const cur = ev.currency;
  const chosen = options.find((o) => o.id === pick) ?? null;
  const newLine = !!plan && plan.cost > 0 && !!plan.line && !ev.budget.some((b) => b.cat.trim().toLowerCase() === plan.line.trim().toLowerCase());

  const describe = (o: (typeof options)[number]) =>
    o.raise > 0 ? `The total budget goes up by ${fmt(o.raise, cur)}. Nothing is taken from other lines.` : `Takes ${o.moves.map((m) => `${fmt(m.amount, cur)} from ${m.from}`).join(', ')}. The total budget stays the same.`;

  function add() {
    if (!plan) return;
    let err = '';
    mutate((e) => { err = applyIdeaPlan(e, index, plan, tasks, chosen); });
    if (err) { setError(err); return; }
    const parts = [`${tasks.length} task${tasks.length === 1 ? '' : 's'}`];
    if (chosen && plan.cost > 0) parts.push(chosen.raise ? `${fmt(chosen.raise, cur)} added to the budget` : `${fmt(plan.cost, cur)} moved to ${plan.line}`);
    onNotify(`Added “${idea.title}” to the plan: ${parts.join(', ')}`);
    onClose();
  }

  function later() {
    if (!plan) return;
    mutate((e) => { e.ideas[index].later = plan; });
    onNotify('Saved for later. Reopen the idea to see the budget options again.');
    onClose();
  }

  return (
    <div className="dialog-backdrop" style={{ zIndex: 80 }} onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Add idea to plan" style={{ width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">Add “{idea.title}” to the plan</div>

        {load.s === 'loading' && <p className="text-muted" style={{ margin: 0 }}>Gemini is working out the tasks and what this would cost…</p>}
        {load.s === 'error' && (
          <>
            <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>Couldn’t get a proposal from Gemini just now.</p>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-secondary" onClick={() => setLoad({ s: 'ready', plan: fallbackIdeaPlan(ev, idea.title), estimated: false })}>Add the task only</button>
              <button className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
            </div>
          </>
        )}

        {plan && (
          <>
            {plan.rationale && <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>{plan.rationale}</p>}

            <div className="col" style={{ gap: 'var(--space-2)' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Tasks for the timeline</span>
              {plan.tasks.map((t, i) => (
                <label key={i} className="row" style={{ gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 14 }}>
                  <input type="checkbox" checked={tasks.includes(i)} onChange={() => setTasks((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))} style={{ marginTop: 4 }} />
                  <span style={{ flex: 1 }}>{t.t} <span className="text-muted" style={{ fontSize: 12 }}>· by {dfmt(t.due)}</span></span>
                </label>
              ))}
            </div>

            {plan.cost > 0 && (
              <div className="col" style={{ gap: 'var(--space-2)' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  Estimated cost {fmt(plan.cost, cur)} on <em style={{ fontStyle: 'normal' }}>{plan.line}</em>{newLine && <span className="tag tag-outline" style={{ marginLeft: 6 }}>new line</span>}
                </span>
                <span className="text-muted" style={{ fontSize: 13 }}>Where should the money come from? This changes planned amounts only. Nothing is spent.</span>
                {options.map((o) => (
                  <label key={o.id} className="row" style={{ gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 14 }}>
                    <input type="radio" name="fund" checked={pick === o.id} onChange={() => setPick(o.id)} style={{ marginTop: 4 }} />
                    <span style={{ flex: 1 }}>
                      <strong>{o.label}</strong>
                      <span className="text-muted" style={{ display: 'block', fontSize: 13 }}>{describe(o)}</span>
                      {o.note && <span style={{ display: 'block', fontSize: 12, color: 'var(--color-accent-700)' }}>{o.note}</span>}
                    </span>
                  </label>
                ))}
                <label className="row" style={{ gap: 'var(--space-2)', alignItems: 'flex-start', fontSize: 14 }}>
                  <input type="radio" name="fund" checked={pick === 'none'} onChange={() => setPick('none')} style={{ marginTop: 4 }} />
                  <span><strong>Don’t change the budget yet</strong><span className="text-muted" style={{ display: 'block', fontSize: 13 }}>Add the tasks now and sort out the money later.</span></span>
                </label>
              </div>
            )}
            {plan.cost === 0 && load.s === 'ready' && !load.estimated && <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Gemini isn’t available, so there’s no cost estimate. Set any budget by hand on the Budget tab.</p>}

            {error && <p role="alert" style={{ margin: 0, color: 'var(--color-accent-700)', fontSize: 14 }}>{error}</p>}
            <div className="dialog-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              {plan.cost > 0 && <button className="btn btn-secondary" onClick={later} title="Keep this proposal on the idea and decide on the budget later">Decide later</button>}
              <button className="btn btn-primary" onClick={add} disabled={!tasks.length && !(chosen && plan.cost > 0)}>Add to plan</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
