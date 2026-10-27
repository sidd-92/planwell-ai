import { Type, type Schema } from '@google/genai';
import { PUNE_AREAS, areaFromLocation } from '../../shared/areas.js';
import type { IntakeRequest, IntakeResponse } from '../../shared/api.js';
import { PRIORITY_OPTIONS, QUESTIONS, SKIPPED_VIBE, nextField, type IntakeAnswers, type IntakeField } from '../../shared/intake.js';
import { generateJson } from './vertexAi.js';

// AI-guided intake. Gemini reads the planner's free-text answer and pulls out event details; the server
// validates every value and decides what to ask next, so the questions and the data stay predictable.

const extractSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ['wedding', 'birthday', 'community'] },
    client: { type: Type.STRING },
    name: { type: Type.STRING },
    date: { type: Type.STRING },
    location: { type: Type.STRING },
    guests: { type: Type.NUMBER },
    budget: { type: Type.NUMBER },
    currency: { type: Type.STRING, enum: ['INR', 'USD'] },
    priorities: { type: Type.ARRAY, items: { type: Type.STRING } },
    vibe: { type: Type.STRING },
    skipped: { type: Type.BOOLEAN },
    ack: { type: Type.STRING },
  },
  required: ['skipped', 'ack'],
};

type Extracted = IntakeAnswers & { skipped: boolean; ack: string };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(+new Date(v + 'T00:00:00Z'));

/** Keeps only valid values. Returns the cleaned answers and a note for anything that was rejected. */
export function mergeAnswers(prev: IntakeAnswers, got: Partial<Extracted>, asking: IntakeField | null, today: string) {
  const a: IntakeAnswers = { ...prev };
  let note = '';
  if (got.type === 'wedding' || got.type === 'birthday' || got.type === 'community') a.type = got.type;
  if (text(got.client, 120)) a.client = text(got.client, 120);
  if (text(got.name, 120)) a.name = text(got.name, 120);
  if (got.date) {
    if (!isoDate(got.date)) note = 'I couldn’t read that date.';
    else if (got.date < today) note = 'That date has already passed.';
    else a.date = got.date;
  }
  if (got.location) {
    const area = areaFromLocation(got.location);
    if (area) a.location = `${area}, Pune`;
    else note = `I can only plan events in ${PUNE_AREAS.join(', ')}.`;
  }
  if (typeof got.guests === 'number' && got.guests >= 1) a.guests = Math.min(100000, Math.round(got.guests));
  if (typeof got.budget === 'number' && got.budget > 0) a.budget = Math.min(1e10, Math.round(got.budget));
  if (got.currency === 'INR' || got.currency === 'USD') a.currency = got.currency;
  if (Array.isArray(got.priorities) && got.priorities.length) {
    const picked = PRIORITY_OPTIONS.filter((o) => got.priorities!.some((p) => text(p, 40).toLowerCase() === o.toLowerCase()));
    if (picked.length) a.priorities = picked;
  }
  if (text(got.vibe, 400)) a.vibe = text(got.vibe, 400);
  if (got.skipped) {
    if (asking === 'priorities' && !Array.isArray(a.priorities)) a.priorities = [];
    if (asking === 'vibe' && !a.vibe) a.vibe = SKIPPED_VIBE;
  }
  if (a.budget && !a.currency) a.currency = 'INR';
  if (!note && asking && nextField(a) === asking) note = 'Sorry, I didn’t catch that.';
  return { answers: a, note };
}

/** Re-validates answers the browser sends back, so a tampered request can't skip the rules. */
export function cleanAnswers(raw: unknown, today: string): IntakeAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return mergeAnswers({}, { ...r, skipped: false, ack: '' } as Partial<Extracted>, null, today).answers;
}

export async function intakeTurn(req: IntakeRequest): Promise<IntakeResponse> {
  const asking = nextField(req.answers);
  const history = req.history.slice(-6).map((m) => `${m.role === 'ai' ? 'Assistant' : 'Planner'}: ${text(m.text, 400)}`).join('\n');
  const prompt = `You are the intake step of an event planner in Pune, India. The planner is answering questions about an event they want to create.
Today is ${req.todayDate}.
Already known (JSON): ${JSON.stringify(req.answers)}
The question just asked was about: ${asking ?? 'nothing (all details collected)'}.
Recent conversation:
${history || '(start)'}

<user_input>
${req.message}
</user_input>

Extract event details from the planner's message. They may answer the question and also volunteer other details.
- Only include a field if the message states it. Never guess or fill in defaults.
- date: YYYY-MM-DD. If no year is given use the next occurrence on or after today.
- budget: a plain number in the stated currency. ₹, rupees or Rs means INR (1 lakh = 100000, 1 crore = 10000000); $ or dollars means USD.
- location: the Pune area as the planner said it.
- priorities: choose only from ${JSON.stringify(PRIORITY_OPTIONS)}.
- type: wedding, birthday or community.
- skipped: true only if the planner declined or said skip or no preference to the question that was just asked.
- ack: a warm acknowledgement of what you understood, under 15 words, no question, no markdown.`;
  const got = await generateJson<Partial<Extracted>>(prompt, extractSchema, 0.2);
  const { answers, note } = mergeAnswers(req.answers, got, asking, req.todayDate);
  const next = nextField(answers);
  const lead = note || text(got.ack, 120);
  const reply = next
    ? `${lead} ${QUESTIONS[next]}`.trim()
    : `${lead} That’s everything I need. Check the details below, then I’ll draft your plan.`.trim();
  return { answers, reply, next };
}
