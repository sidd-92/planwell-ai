import { useState } from 'react';

/** A table cell that reads as text and turns into an input on click. Blank cells show "Add". */
export function Cell({ value, label, onCommit, type = 'text', align, shown }: { value: string; label: string; onCommit: (v: string) => void; type?: 'text' | 'number'; align?: 'right'; /** What to show instead of the raw value when not editing. */ shown?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = (save: boolean) => {
    setEditing(false);
    if (save && draft.trim() !== value) onCommit(draft.trim());
  };
  if (editing) {
    return (
      <input
        className="input"
        autoFocus
        type={type}
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }}
        style={{ minWidth: 110, padding: '4px 10px', textAlign: align }}
      />
    );
  }
  const blank = !value || value === '—';
  return (
    <button
      className="reset-btn"
      title={`Edit ${label.toLowerCase()}`}
      onClick={() => { setDraft(blank ? '' : value); setEditing(true); }}
      style={{ width: '100%', textAlign: align ?? 'left', minHeight: 22, fontSize: 13, color: blank ? 'var(--color-accent)' : undefined, opacity: blank ? 0.7 : 1 }}
    >
      {blank ? 'Add' : shown ?? value}
    </button>
  );
}
