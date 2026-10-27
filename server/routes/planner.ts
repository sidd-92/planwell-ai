import { Router, type Request, type Response } from 'express';
import type { ChatRequest, HealthResponse, IdeaPlanRequest, IdeasRequest, IntakeRequest, PlanRequest } from '../../shared/api.js';
import { areaFromLocation } from '../../shared/areas.js';
import { convexUrl, requireAuth } from '../auth.js';
import { cleanAnswers, intakeTurn } from '../services/intake.js';
import { MODEL, aiConfigured, chatReply, generateEventPlan, generateIdeas, planIdea } from '../services/vertexAi.js';

export const plannerRouter = Router();

const TYPES = ['wedding', 'birthday', 'community'];
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function fail(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error('[planner]', message);
  res.status(502).json({ error: 'The AI service could not complete this request.' });
}

plannerRouter.get('/health', (_req, res) => {
  const body: HealthResponse = { ok: true, ai: aiConfigured(), model: MODEL };
  res.json(body);
});

// Public client config. The Convex deployment URL is not a secret: the browser connects to it directly.
plannerRouter.get('/config', (_req, res) => {
  res.json({ convexUrl: convexUrl() });
});

plannerRouter.post('/plan', requireAuth, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const plan: PlanRequest = {
    eventType: TYPES.includes(b.eventType) ? b.eventType : 'wedding',
    title: str(b.title, 120),
    client: str(b.client, 120),
    targetDate: b.targetDate,
    todayDate: isDate(b.todayDate) ? b.todayDate : new Date().toISOString().slice(0, 10),
    guestCount: Math.max(1, Math.min(100000, Number(b.guestCount) || 0)),
    totalBudget: Math.max(0, Math.min(1e10, Number(b.totalBudget) || 0)),
    currency: b.currency === 'INR' ? 'INR' : 'USD',
    location: str(b.location, 160),
    priorities: Array.isArray(b.priorities) ? b.priorities.map((p: unknown) => str(p, 40)).filter(Boolean).slice(0, 10) : [],
    themePreferences: str(b.themePreferences, 400),
  };
  if (!plan.title || !plan.client || !isDate(plan.targetDate) || plan.totalBudget <= 0) {
    res.status(400).json({ error: 'title, client, targetDate (YYYY-MM-DD) and a positive totalBudget are required.' });
    return;
  }
  if (!areaFromLocation(plan.location)) {
    res.status(400).json({ error: 'location must be one of the supported areas in Pune.' });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json({ error: 'Vertex AI is not configured on this server.' });
    return;
  }
  try {
    res.json(await generateEventPlan(plan));
  } catch (err) {
    fail(res, err);
  }
});

plannerRouter.post('/chat', requireAuth, async (req: Request, res: Response) => {
  const b = req.body as Partial<ChatRequest>;
  const message = str(b?.message, 1000);
  if (!message || !b?.event) {
    res.status(400).json({ error: 'message and event are required.' });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json({ error: 'Vertex AI is not configured on this server.' });
    return;
  }
  try {
    const history = Array.isArray(b.history) ? b.history.slice(-8).map((m) => ({ role: m.role === 'ai' ? 'ai' as const : 'user' as const, text: str(m.text, 1500) })) : [];
    res.json(await chatReply({ event: b.event, history, message }));
  } catch (err) {
    fail(res, err);
  }
});

plannerRouter.post('/ideas', requireAuth, async (req: Request, res: Response) => {
  const b = req.body as Partial<IdeasRequest>;
  if (!b?.event) {
    res.status(400).json({ error: 'event is required.' });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json({ error: 'Vertex AI is not configured on this server.' });
    return;
  }
  try {
    res.json(await generateIdeas(b.event));
  } catch (err) {
    fail(res, err);
  }
});

plannerRouter.post('/intake', requireAuth, async (req: Request, res: Response) => {
  const b = req.body as Partial<IntakeRequest>;
  const today = isDate(b?.todayDate) ? (b!.todayDate as string) : new Date().toISOString().slice(0, 10);
  const message = str(b?.message, 600);
  if (!message) {
    res.status(400).json({ error: 'message is required.' });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json({ error: 'Vertex AI is not configured on this server.' });
    return;
  }
  try {
    const history = Array.isArray(b?.history) ? b.history.slice(-6).map((m) => ({ role: m.role === 'ai' ? ('ai' as const) : ('user' as const), text: str(m.text, 500) })) : [];
    res.json(await intakeTurn({ todayDate: today, answers: cleanAnswers(b?.answers, today), history, message }));
  } catch (err) {
    fail(res, err);
  }
});

plannerRouter.post('/idea-plan', requireAuth, async (req: Request, res: Response) => {
  const b = req.body as Partial<IdeaPlanRequest>;
  const title = str(b?.idea?.title, 120);
  if (!b?.event || !title) {
    res.status(400).json({ error: 'event and idea are required.' });
    return;
  }
  if (!aiConfigured()) {
    res.status(503).json({ error: 'Vertex AI is not configured on this server.' });
    return;
  }
  try {
    const idea = { title, category: str(b.idea?.category, 40), description: str(b.idea?.description, 400) };
    res.json(await planIdea({ event: b.event, idea }, new Date().toISOString().slice(0, 10)));
  } catch (err) {
    fail(res, err);
  }
});
