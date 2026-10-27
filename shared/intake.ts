import type { Currency, EventType } from './api.js';
import { PUNE_AREAS } from './areas.js';

// The questions a new event needs answered. Used by the AI intake chat, the review/edit-answers screen
// and the server (which decides what to ask next), so the wording stays identical everywhere.

export type IntakeField = 'type' | 'client' | 'name' | 'date' | 'location' | 'guests' | 'budget' | 'priorities' | 'vibe';

export interface IntakeAnswers {
  type?: EventType;
  client?: string;
  name?: string;
  date?: string; // YYYY-MM-DD
  location?: string; // "<area>, Pune"
  guests?: number;
  budget?: number;
  currency?: Currency;
  /** An empty list means the planner skipped the question. */
  priorities?: string[];
  vibe?: string;
}

export const PRIORITY_OPTIONS = ['Food & drink', 'Music', 'Photography', 'Decor', 'Venue', 'Accessibility', 'Low-waste', 'Kids'];
export const SKIPPED_VIBE = 'Open to suggestions';

export const INTAKE_FIELDS: IntakeField[] = ['type', 'client', 'name', 'date', 'location', 'guests', 'budget', 'priorities', 'vibe'];

export const QUESTIONS: Record<IntakeField, string> = {
  type: 'What are you planning: a wedding, a birthday or a community event?',
  client: 'Who is it for? Give me the client’s name.',
  name: 'What should we call the event?',
  date: 'When is it? A date like 14 November is fine.',
  location: `Which area of Pune? I can plan in ${PUNE_AREAS.join(', ')}.`,
  guests: 'How many guests are you expecting?',
  budget: 'What’s the total budget? Tell me the amount and whether it’s in rupees or dollars.',
  priorities: `What matters most? For example ${PRIORITY_OPTIONS.slice(0, 5).join(', ').toLowerCase()}. Say “skip” if nothing stands out.`,
  vibe: 'Last one: describe the feel in a sentence, or say “skip”.',
};

function answered(a: IntakeAnswers, f: IntakeField): boolean {
  switch (f) {
    case 'guests':
    case 'budget':
      return typeof a[f] === 'number' && (a[f] as number) > 0;
    case 'priorities':
      return Array.isArray(a.priorities);
    default:
      return typeof a[f] === 'string' && (a[f] as string).length > 0;
  }
}

/** The first question still unanswered, or null when the plan can be drafted. */
export function nextField(a: IntakeAnswers): IntakeField | null {
  return INTAKE_FIELDS.find((f) => !answered(a, f)) ?? null;
}

/** Quick-reply suggestions for a question. */
export function chipsFor(f: IntakeField | null): string[] {
  if (f === 'type') return ['Wedding', 'Birthday', 'Community'];
  if (f === 'location') return [...PUNE_AREAS];
  if (f === 'priorities') return PRIORITY_OPTIONS;
  if (f === 'vibe') return ['Skip'];
  return [];
}
