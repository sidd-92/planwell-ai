import { useEffect, useRef, useState } from 'react';
import type { AiStatus } from '../App';
import type { ActionKey, PlanEvent } from '../types';
import { Close, Send, Sparkle } from './Icons';

interface Props {
  ev: PlanEvent;
  mode: 'docked' | 'floating' | 'full';
  ai: AiStatus;
  typing: boolean;
  chips: string[];
  onClose: () => void;
  onSend: (text: string) => void;
  onAction: (msgIndex: number, key: ActionKey) => void;
  /** Message currently being typed out, as `${eventId}:${index}`. */
  reveal: { key: string; shown: number } | null;
}

export function Assistant({ ev, mode, ai, typing, chips, onClose, onSend, onAction, reveal }: Props) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ev.id, ev.chat.length, reveal?.shown, typing]);

  const status = !ai.checked ? 'Connecting…' : ai.online ? `Gemini on Vertex AI` : 'Offline mode';

  return (
    <section className={`chat ${mode}`} aria-label="Assistant">
      <div className="chat-head">
        <span className="ai-badge sm"><Sparkle /></span>
        <div className="col" style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          <span className="display" style={{ fontSize: 17 }}>Assistant</span>
          <span className="text-muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ai.model || undefined}>
            Working on {ev.name} · {status}
          </span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close assistant"><Close /></button>
      </div>

      <div ref={logRef} className="chat-log" aria-live="polite">
        {ev.chat.map((m, i) => {
          const isAi = m.role === 'ai';
          const shown = isAi && reveal?.key === `${ev.id}:${i}` ? reveal.shown : m.text.length;
          const complete = shown >= m.text.length;
          return (
            <div key={i} className="col" style={{ alignItems: isAi ? 'flex-start' : 'flex-end', gap: 'var(--space-2)' }}>
              <div className={`bubble${isAi ? '' : ' user'}`}>{isAi ? m.text.slice(0, shown) : m.text}</div>
              {isAi && m.action && complete && !m.done && (
                <button className="btn btn-secondary" onClick={() => onAction(i, m.action!)} style={{ fontSize: 13, animation: 'pwIn .25s ease-out' }}>{m.label}</button>
              )}
              {m.done && <span className="tag tag-accent-2">Done · {m.label}</span>}
            </div>
          );
        })}
        {typing && (
          <div style={{ padding: 'var(--space-1) 0' }} aria-label="Assistant is typing">
            <span style={{ display: 'inline-flex', gap: 5 }}>
              {[0, 1, 2].map((k) => <span key={k} className="dot" style={{ animationDelay: `${k * 0.15}s` }} />)}
            </span>
          </div>
        )}
      </div>

      <div className="chips">
        {chips.map((c) => (
          <button key={c} className="btn btn-secondary chip" onClick={() => onSend(c)} disabled={typing}>{c}</button>
        ))}
      </div>
      <form
        className="row"
        style={{ gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4) var(--space-4)' }}
        onSubmit={(e) => { e.preventDefault(); if (!draft.trim() || typing) return; onSend(draft); setDraft(''); }}
      >
        <input className="input" placeholder="Ask about budget, vendors, timing…" aria-label="Message the assistant" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary btn-icon" type="submit" aria-label="Send" disabled={!draft.trim() || typing}><Send /></button>
      </form>
    </section>
  );
}
