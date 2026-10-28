import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient, useQuery } from 'convex/react';
import { ConvexAuthProvider, useAuthActions, useAuthToken, useConvexAuth } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import App from './App';
import { AuthScreen } from './components/AuthScreen';
import { Welcome } from './components/Welcome';
import { useConvexStore } from './lib/store';
import { fetchConfig, setAuthToken } from './lib/api';
import './styles/organic.css';
import './styles/app.css';

function Splash({ message }: { message: string }) {
  return (
    <div className="loading">
      <div className="col" style={{ gap: 6, alignItems: 'center', maxWidth: 420 }}>
        <span className="brand-name">PlanWell<span className="ai">.AI</span></span>
        <span className="text-muted" style={{ fontSize: 14 }}>{message}</span>
      </div>
    </div>
  );
}

/** Keeps the token used for the Gemini API calls in step with the Convex session. */
function AuthTokenSync() {
  const token = useAuthToken();
  useEffect(() => setAuthToken(token), [token]);
  return null;
}

function SignedIn() {
  const store = useConvexStore();
  const me = useQuery(api.users.me, {});
  const { signOut } = useAuthActions();
  if (!store.ready) return <Splash message="Loading your events…" />;
  if (store.events.length === 0) return <Welcome store={store} onSignOut={() => void signOut()} />;
  return <App store={store} user={me?.email ?? ''} onSignOut={() => void signOut()} />;
}

/** Signed-out visitors only ever see the sign-in screen. */
function Gate() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return <Splash message="Loading…" />;
  return isAuthenticated ? <SignedIn /> : <AuthScreen />;
}

async function start() {
  const root = createRoot(document.getElementById('root')!);
  root.render(<Splash message="Loading…" />);
  // Dev: VITE_CONVEX_URL from .env.local (written by `npx convex dev`).
  // Cloud Run: CONVEX_URL on the server, read at runtime via /api/config.
  const url = import.meta.env.VITE_CONVEX_URL || (await fetchConfig()).convexUrl;
  if (!url) {
    root.render(<Splash message="PlanWell.AI needs a Convex deployment for sign-in. Run `npx convex dev`, or set CONVEX_URL on the server." />);
    return;
  }
  const convex = new ConvexReactClient(url);
  root.render(
    <StrictMode>
      <ConvexAuthProvider client={convex}>
        <AuthTokenSync />
        <Gate />
      </ConvexAuthProvider>
    </StrictMode>,
  );
}

void start();
