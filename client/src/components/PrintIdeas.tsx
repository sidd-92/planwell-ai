import { createPortal } from 'react-dom';
import { SW } from '../data/seed';
import { dfmt } from '../lib/planner';
import type { PlanEvent } from '../types';

/** The shortlisted ideas on a clean page, to print or save as a PDF for the client. */
export function PrintIdeas({ ev, onClose }: { ev: PlanEvent; onClose: () => void }) {
  const ideas = ev.ideas.filter((i) => i.saved);
  return createPortal(
    <div className="print-wrap" role="dialog" aria-modal="true" aria-label="Print shortlisted ideas">
      <div className="print-bar print-hide">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!ideas.length}>Print</button>
      </div>
      <div className="print-sheet">
        <h1 className="print-title">{ev.name}: ideas shortlist</h1>
        <p className="print-meta">{dfmt(ev.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {ev.location} · {ideas.length} idea{ideas.length === 1 ? '' : 's'}</p>
        {ideas.length === 0 ? (
          <p className="print-meta">Nothing is shortlisted yet. Shortlist ideas on the Ideas tab first.</p>
        ) : (
          ideas.map((it, i) => (
            <div key={i} className="print-idea">
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {it.sw.map((k, j) => <span key={j} style={{ width: 14, height: 14, borderRadius: 999, background: SW[k], display: 'inline-block' }} />)}
              </div>
              <div className="print-kicker">{it.cat}{it.added ? ' · in the plan' : ''}</div>
              <div className="print-idea-title">{it.title}</div>
              <p className="print-idea-body">{it.desc}</p>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
