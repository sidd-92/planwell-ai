import { useEffect, useState } from 'react';
import type { AiStatus } from '../App';
import { health } from '../lib/api';
import type { EventStore } from '../lib/store';
import { Brand } from './Sidebar';
import { Onboarding } from './Onboarding';

/** Shown to an account with no events: new accounts start empty. */
export function Welcome({ store, onSignOut }: { store: EventStore; onSignOut: () => void }) {
  const [creating, setCreating] = useState(true);
  const [ai, setAi] = useState<AiStatus>({ checked: false, online: false, model: '' });
  useEffect(() => {
    health().then((h) => setAi({ checked: true, online: !!h?.ai, model: h?.model || '' }));
  }, []);

  return (
    <div className="auth">
      <div className="auth-card card">
        <Brand />
        <div className="col" style={{ gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>Plan your first event</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: 14 }}>You don’t have any events yet. Start one and we’ll draft the plan with you.</p>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => setCreating(true)}>Create an event</button>
        <button className="btn btn-ghost btn-block" onClick={onSignOut}>Sign out</button>
      </div>
      {creating && (
        <Onboarding
          ai={ai}
          onClose={() => setCreating(false)}
          onCreate={async (newEv) => { await store.add(newEv); }}
        />
      )}
    </div>
  );
}
