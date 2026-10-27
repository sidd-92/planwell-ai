import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { areaFromLocation, directoryKey } from '../../shared/areas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askAssistant, health, moreIdeas } from './lib/api';
import {
  actionLabel, applyAction, budgetFix, counts, dfmt, daysTo, fmt, nowPhase, reminder, respondLocally, toContext, type Reply, type VendorPicks,
} from './lib/planner';
import type { EventStore } from './lib/store';
import { AI_TASKS, SHORT } from './data/seed';
import type { ActionKey, PlanEvent, Screen } from './types';
import { Sidebar, Brand } from './components/Sidebar';
import { Overview } from './components/Overview';
import { BudgetView } from './components/BudgetView';
import { TimelineView } from './components/TimelineView';
import { VendorsView } from './components/VendorsView';
import { GuestsView } from './components/GuestsView';
import { VolunteersView } from './components/VolunteersView';
import { IdeasView } from './components/IdeasView';
import { Assistant } from './components/Assistant';
import { Onboarding } from './components/Onboarding';
import { DeleteEventDialog, EditEventDialog } from './components/EventDialogs';
import { Check, Sparkle, UpDown } from './components/Icons';

export type Mutate = (fn: (ev: PlanEvent) => string | void) => string | void;

export interface AiStatus {
  checked: boolean;
  online: boolean;
  model: string;
}

const TABS: [Screen, string][] = [['overview', 'Overview'], ['budget', 'Budget'], ['timeline', 'Timeline'], ['vendors', 'Vendors'], ['guests', 'Guests'], ['volunteers', 'Volunteers'], ['ideas', 'Ideas']];

/** Which assistant message is mid-way through the typing effect (never saved). */
interface Reveal {
  key: string;
  shown: number;
}

export default function App({ store, user, onSignOut }: { store: EventStore; user: string; onSignOut: () => void }) {
  const { events } = store;
  const [curId, setCurId] = useState<string>(() => events[0]?.id ?? '');
  const found = events.findIndex((e) => e.id === curId);
  const cur = found >= 0 ? found : 0;
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [screen, setScreen] = useState<Screen>('overview');
  const [width, setWidth] = useState(() => window.innerWidth);
  const narrow = width < 820;
  const wide = width >= 1200;
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 1200);
  const [switcher, setSwitcher] = useState(false);
  const [railed, setRailed] = useState(() => {
    try { return localStorage.getItem('pw-sidebar') === 'collapsed'; } catch { return false; }
  });
  const toggleRail = useCallback(() => setRailed((r) => {
    try { localStorage.setItem('pw-sidebar', r ? 'open' : 'collapsed'); } catch { /* private mode: just don't remember it */ }
    return !r;
  }), []);
  const [typing, setTyping] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<{ busy: boolean; error: string } | null>(null);
  const [ai, setAi] = useState<AiStatus>({ checked: false, online: false, model: '' });
  const toastTimer = useRef<number | undefined>(undefined);
  const streamTimer = useRef<number | undefined>(undefined);

  // ── state helpers ──────────────────────────────────────────────────────
  const { update } = store;
  const evId = events[cur]?.id ?? '';
  const mutate: Mutate = useCallback((fn) => update(evId, fn), [update, evId]);

  const toast = useCallback((msg?: string | void) => {
    if (!msg) return;
    window.clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  useEffect(() => {
    if (store.error) {
      toast(store.error);
      store.clearError();
    }
  }, [store, store.error, toast]);

  // ── environment ───────────────────────────────────────────────────────
  useEffect(() => {
    health().then((h) => setAi({ checked: true, online: !!h?.ai, model: h?.model || '' }));
  }, []);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const prevLayout = useRef({ narrow, wide });
  useEffect(() => {
    const p = prevLayout.current;
    if (narrow !== p.narrow) {
      if (narrow) setChatOpen(false);
      else setSwitcher(false);
    }
    if (wide !== p.wide && !wide) setChatOpen(false);
    prevLayout.current = { narrow, wide };
  }, [narrow, wide]);

  useEffect(() => () => {
    window.clearInterval(streamTimer.current);
    window.clearTimeout(toastTimer.current);
  }, []);

  const ev = events[cur];
  const days = daysTo(ev);
  const weeks = Math.max(1, Math.round(days / 7));
  const isComm = ev.type === 'community';
  const guestTab = isComm ? 'Attendees' : 'Guests';
  const go = useCallback((s: Screen) => { setScreen(s); setSwitcher(false); }, []);

  // Latest events for async callbacks (store.update itself always works on the freshest copy).
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const byId = (id: string) => eventsRef.current.find((e) => e.id === id);

  // Real vendors from the Places directory for this event's Pune area. Events elsewhere keep placeholder names.
  const area = areaFromLocation(ev.location);
  const directory = useQuery(api.vendorDirectory.byArea, area ? { area } : 'skip');
  const picks = useMemo<VendorPicks | null | undefined>(() => {
    if (!area) return undefined;
    for (const v of ev.vendors) {
      if (v.status !== 'To find') continue;
      const cat = directoryKey(v.cat);
      const names = (directory ?? []).filter((d) => d.category === cat).map((d) => d.name);
      if (names.length) return { cat: v.cat, names };
    }
    return null;
  }, [area, directory, ev.vendors]);
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const directoryRef = useRef(directory);
  directoryRef.current = directory;

  // ── actions (budget fix, extra tasks, shortlists, reminders, ideas) ──
  const runAction = useCallback(async (id: string, key: ActionKey, msgIndex?: number) => {
    const markDone = (e: PlanEvent) => { if (msgIndex !== undefined && e.chat[msgIndex]) e.chat[msgIndex].done = true; };
    if (key === 'ideas') {
      setIdeaLoading(true);
      let fresh: { title: string; cat: string; desc: string }[] | undefined;
      const started = Date.now();
      const snapshot = byId(id);
      if (ai.online && snapshot) {
        try {
          const r = await moreIdeas(toContext(snapshot, directoryRef.current));
          fresh = r.ideas.slice(0, 3).map((i) => ({ title: i.title, cat: i.category, desc: i.description }));
        } catch {
          fresh = undefined;
        }
      }
      const wait = 900 - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const msg = update(id, (e) => { const m = applyAction(e, 'ideas', fresh); markDone(e); return m; });
      setIdeaLoading(false);
      toast(msg || 'Already done');
      return;
    }
    const msg = update(id, (e) => { const m = applyAction(e, key, undefined, picksRef.current); markDone(e); return m; });
    toast(msg || 'Already done');
  }, [ai.online, update, toast]);

  // ── assistant chat ────────────────────────────────────────────────────
  const startReveal = useCallback((key: string, len: number) => {
    window.clearInterval(streamTimer.current);
    let shown = 0;
    setReveal({ key, shown });
    streamTimer.current = window.setInterval(() => {
      shown = Math.min(len, shown + 4);
      if (shown >= len) {
        window.clearInterval(streamTimer.current);
        setReveal(null);
      } else {
        setReveal({ key, shown });
      }
    }, 16);
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    const id = evId;
    const snapshot = byId(id);
    if (!text || typing || !snapshot) return;
    window.clearInterval(streamTimer.current);
    setReveal(null);
    update(id, (e) => { e.chat.push({ role: 'user', text }); });
    setTyping(true);
    const started = Date.now();
    let reply: Reply = respondLocally(snapshot, text);
    if (ai.online) {
      try {
        const r = await askAssistant({
          event: toContext(snapshot, directoryRef.current),
          history: snapshot.chat.slice(-8).map((m) => ({ role: m.role, text: m.text })),
          message: text,
        });
        const key = r.suggestedAction !== 'none' ? r.suggestedAction : undefined;
        const latest = byId(id) ?? snapshot;
        const label = key ? (key === 'ideas' ? 'Add 3 ideas to the board' : actionLabel(latest, key)) : null;
        reply = { text: r.reply, action: label && key ? key : undefined, label: label || undefined };
      } catch {
        /* fall back to the offline answer */
      }
    }
    const wait = 750 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    let mi = -1;
    update(id, (e) => {
      e.chat.push({ role: 'ai', text: reply.text, action: reply.action, label: reply.label, done: false });
      mi = e.chat.length - 1;
    });
    setTyping(false);
    if (mi >= 0) startReveal(`${id}:${mi}`, reply.text.length);
  }, [ai.online, evId, update, startReveal, typing]);

  // ── inline assistant suggestion for the current tab ───────────────────
  const tip = useMemo(() => {
    const dkey = ev.id + screen;
    if (dismissed[dkey]) return null;
    const fix = budgetFix(ev);
    const c = counts(ev);
    const tf = ev.vendors.filter((v) => v.status === 'To find');
    const $ = (n: number) => fmt(n, ev.currency);
    let t: { text: string; cta: string; key: ActionKey } | null = null;
    if (screen === 'budget' && fix) t = { text: `${fix.over.cat} is ${$(fix.amt)} over its line. ${fix.donor.cat} has ${$(fix.slack)} to spare, so moving ${$(fix.move)} across ${fix.partial ? 'covers part of it' : 'covers it'} and keeps the total unchanged. This only changes planned amounts; nothing is paid.`, cta: `Move ${$(fix.move)}`, key: 'budget' };
    if (screen === 'timeline' && !ev.applied.timeline) { const ph = nowPhase(ev); t = { text: `${ph.tasks.filter((x) => !x.done).length} tasks are open in the current phase. Three more are easy to miss at this stage: ${AI_TASKS[ev.type].map((x) => x[0].toLowerCase()).join('; ')}.`, cta: 'Add 3 tasks', key: 'timeline' }; }
    if (screen === 'vendors' && picks !== null && (picks || tf[0])) {
      const cat = picks?.cat ?? tf[0].cat;
      const n = picks?.names ?? SHORT[cat] ?? SHORT._;
      t = { text: `${cat} is still unbooked with ${weeks} weeks to go. ${picks ? `Top-rated in ${area}` : 'Three options'}: ${n.join(', ')}.`, cta: 'Shortlist all three', key: 'vendors' };
    }
    if (screen === 'guests' && c.wait && !ev.reminded) t = { text: `${c.wait} ${isComm ? 'contacts' : 'guests'} haven’t replied. I can queue a reminder from ${ev.host} with a reply-by date: “${reminder(ev)}” Heads up: the app doesn’t send anything yet. Sending by WhatsApp or messaging is coming, so for now this only marks the reminder as queued.`, cta: 'Queue reminder', key: 'guests' };
    if (screen === 'ideas' && !ev.applied.ideas) t = { text: `These are tuned to “${ev.vibe}”. Want three more directions${ai.online ? ' from Gemini' : ''}?`, cta: ideaLoading ? 'Generating…' : 'Generate 3 more', key: 'ideas' };
    return t ? { ...t, dkey } : null;
  }, [ev, screen, dismissed, weeks, isComm, ideaLoading, ai.online, picks, area]);

  // ── layout ────────────────────────────────────────────────────────────
  const dock = !narrow && wide;
  const side = railed ? '64px' : '260px';
  const cols = narrow ? 'minmax(0,1fr)' : chatOpen && dock ? `${side} minmax(0,1fr) 380px` : `${side} minmax(0,1fr)`;
  const chatMode = narrow ? 'full' : dock ? 'docked' : 'floating';
  const showSidebar = !narrow || switcher;

  const chips = ['Where’s the budget at?', 'What’s due next?', 'Which vendors are still open?', isComm ? 'Activity ideas' : 'Decor ideas', 'RSVP status'];

  return (
    <div className={`frame${narrow ? ' narrow' : ''}`} style={{ gridTemplateColumns: cols }}>
      {narrow && switcher && <div className="backdrop" onClick={() => setSwitcher(false)} />}

      {showSidebar && (
        <Sidebar
          events={events}
          cur={cur}
          floating={narrow}
          onClose={() => setSwitcher(false)}
          onNew={() => { setSwitcher(false); setOnboarding(true); }}
          onSelect={(i) => { setCurId(events[i].id); setSwitcher(false); }}
          user={user}
          onSignOut={onSignOut}
          collapsed={railed && !narrow}
          onToggle={toggleRail}
        />
      )}

      <main className="main">
        <div className="main-inner">
          {narrow && (
            <div className="topbar">
              <button className="btn btn-secondary" onClick={() => setSwitcher(true)}><UpDown />All events</button>
              <Brand compact />
              <button className="btn btn-primary" onClick={() => setChatOpen(true)}><Sparkle />Ask</button>
            </div>
          )}

          <header className="ev-header">
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <span className="tag tag-accent-2">{ev.typeLabel}</span>
                <span className="tag tag-neutral">{ev.client}</span>
                {ev.aiDrafted && <span className="tag tag-outline">Drafted with Gemini</span>}
              </div>
              <h1 className="ev-title">{ev.name}</h1>
              <div className="text-muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 14 }}>
                <span>{dfmt(ev.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span>{ev.location}</span>
                <span>{ev.guests.toLocaleString('en-US')} {isComm ? 'expected' : 'guests'}</span>
              </div>
            </div>
            <div className="row" style={{ alignItems: 'flex-end', gap: 'var(--space-4)' }}>
              <div className="col"><span className="big-num">{days}</span><span className="text-muted" style={{ fontSize: 12 }}>days to go</span></div>
              <div className="row" style={{ gap: 'var(--space-1)' }}>
                <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn btn-ghost" onClick={() => setDeleting({ busy: false, error: events.length < 2 ? 'This is your only event. Create another before deleting it.' : '' })}>Delete</button>
              </div>
              {!narrow && (
                <button className="btn btn-secondary" onClick={() => setChatOpen(!chatOpen)}><Sparkle />{chatOpen ? 'Hide assistant' : 'Assistant'}</button>
              )}
            </div>
          </header>

          <nav className="tabs" aria-label="Event sections">
            {TABS.map(([k, l]) => (
              <button key={k} className={`tab${screen === k ? ' active' : ''}`} onClick={() => go(k)} aria-current={screen === k ? 'page' : undefined}>
                {k === 'guests' ? guestTab : l}
              </button>
            ))}
          </nav>

          {tip && (
            <div className="card tip">
              <span className="ai-badge"><Sparkle /></span>
              <div className="col" style={{ flex: 1, minWidth: 0, gap: 'var(--space-2)' }}>
                <span className="card-kicker">Assistant suggestion</span>
                <p style={{ margin: 0, fontSize: 14, maxWidth: '64ch', textWrap: 'pretty' }}>{tip.text}</p>
                <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <button className="btn btn-primary" onClick={() => void runAction(ev.id, tip.key)} disabled={ideaLoading}>{tip.cta}</button>
                  <button className="btn btn-ghost" onClick={() => setDismissed((d) => ({ ...d, [tip.dkey]: true }))}>Dismiss</button>
                </div>
              </div>
            </div>
          )}

          {screen === 'overview' && <Overview ev={ev} mutate={mutate} go={go} guestTab={guestTab} weeks={weeks} />}
          {screen === 'budget' && <BudgetView ev={ev} mutate={mutate} onNotify={toast} />}
          {screen === 'timeline' && <TimelineView key={ev.id} ev={ev} mutate={mutate} />}
          {screen === 'vendors' && <VendorsView ev={ev} mutate={mutate} onNotify={toast} />}
          {screen === 'guests' && <GuestsView key={ev.id} ev={ev} mutate={mutate} onNotify={toast} />}
          {screen === 'volunteers' && <VolunteersView key={ev.id} ev={ev} mutate={mutate} onNotify={toast} />}
          {screen === 'ideas' && <IdeasView ev={ev} mutate={mutate} />}
        </div>
      </main>

      {chatOpen && (
        <Assistant
          ev={ev}
          mode={chatMode}
          ai={ai}
          typing={typing}
          chips={chips}
          onClose={() => setChatOpen(false)}
          onSend={(t) => { if (narrow && !chatOpen) setChatOpen(true); void send(t); }}
          onAction={(mi, key) => void runAction(ev.id, key, mi)}
          reveal={reveal}
        />
      )}

      {editing && (
        <EditEventDialog
          ev={ev}
          onClose={() => setEditing(false)}
          onSave={(d) => {
            mutate((e) => { Object.assign(e, d); });
            setEditing(false);
            toast('Event updated');
          }}
        />
      )}

      {deleting && (
        <DeleteEventDialog
          ev={ev}
          busy={deleting.busy}
          error={deleting.error}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            if (events.length < 2) return;
            const id = ev.id;
            const nextId = events.find((e) => e.id !== id)?.id ?? '';
            setDeleting({ busy: true, error: '' });
            store.remove(id).then(() => {
              setCurId(nextId);
              setScreen('overview');
              setDeleting(null);
              toast('Event deleted');
            }).catch(() => setDeleting({ busy: false, error: 'Couldn’t delete the event. Check your connection and try again.' }));
          }}
        />
      )}

      {onboarding && (
        <Onboarding
          ai={ai}
          onClose={() => setOnboarding(false)}
          onCreate={async (newEv, note) => {
            const id = await store.add(newEv);
            setCurId(id);
            setScreen('overview');
            setOnboarding(false);
            setChatOpen(!narrow && wide);
            toast(note);
          }}
        />
      )}

      {toastMsg && (
        <div className="toast" role="status"><Check size={16} />{toastMsg}</div>
      )}
    </div>
  );
}
