import type { ChatRequest, ChatResponse, GeneratedPlan, HealthResponse, IdeaPlan, IdeaPlanRequest, IdeasResponse, IntakeRequest, IntakeResponse, PlanRequest, EventContext } from '../../../shared/api';

// The signed-in user's Convex Auth token, kept current by <AuthTokenSync />.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function post<T>(url: string, body: unknown, timeoutMs = 45000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function health(): Promise<HealthResponse | null> {
  try {
    const res = await fetch('/api/health');
    return res.ok ? ((await res.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}

export async function fetchConfig(): Promise<{ convexUrl: string | null }> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return { convexUrl: null };
    const body = (await res.json()) as { convexUrl?: unknown };
    return { convexUrl: typeof body.convexUrl === 'string' && body.convexUrl ? body.convexUrl : null };
  } catch {
    return { convexUrl: null };
  }
}

export const draftPlan = (req: PlanRequest) => post<GeneratedPlan>('/api/plan', req, 90000);
export const askAssistant = (req: ChatRequest) => post<ChatResponse>('/api/chat', req);
export const moreIdeas = (event: EventContext) => post<IdeasResponse>('/api/ideas', { event });
export const intakeTurn = (req: IntakeRequest) => post<IntakeResponse>('/api/intake', req);
export const planIdea = (req: IdeaPlanRequest) => post<IdeaPlan>('/api/idea-plan', req, 60000);
