// Types shared by the React client and the Express server.

export type EventType = 'wedding' | 'birthday' | 'community';
export type Currency = 'USD' | 'INR';
export type ActionKey = 'budget' | 'timeline' | 'vendors' | 'guests' | 'ideas';
export type IdeaCategory = 'Theme' | 'Decor' | 'Food' | 'Activities';

/** POST /api/plan — the onboarding answers. */
export interface PlanRequest {
  eventType: EventType;
  title: string;
  client: string;
  targetDate: string; // YYYY-MM-DD
  todayDate: string; // YYYY-MM-DD, so the model can schedule from "now"
  guestCount: number;
  totalBudget: number;
  currency: Currency;
  location: string;
  priorities: string[];
  themePreferences: string;
}

export interface IdeaItem {
  title: string;
  description: string;
}

/** Structured output Gemini must return for /api/plan. */
export interface GeneratedPlan {
  summary: string;
  budgetBreakdown: { category: string; allocatedAmount: number; percentage: number; notes: string }[];
  timeline: {
    phase: string;
    tasks: { taskName: string; deadline: string; priority: 'High' | 'Medium' | 'Low' }[];
  }[];
  vendorChecklist: { category: string; nextStep: string }[];
  personalizedIdeas: {
    themeConcepts: IdeaItem[];
    decorSuggestions: IdeaItem[];
    foodIdeas: IdeaItem[];
    icebreakersOrActivities: IdeaItem[];
  };
}

/** A compact snapshot of an event the client sends as context for chat and ideas. */
export interface EventContext {
  name: string;
  type: EventType;
  date: string;
  daysToGo: number;
  location: string;
  guests: number;
  vibe: string;
  currency: Currency;
  budget: { category: string; allocated: number; committed: number }[];
  openTasks: { task: string; due: string }[];
  vendors: { category: string; name: string; status: string }[];
  rsvp: { attending: number; declined: number; awaiting: number };
  ideas: string[];
  /** Real local vendors (Google Places directory). The only vendors the assistant may name. */
  directory?: { category: string; name: string; rating: number }[];
}

export interface ChatRequest {
  event: EventContext;
  history: { role: 'user' | 'ai'; text: string }[];
  message: string;
}

export interface ChatResponse {
  reply: string;
  suggestedAction: ActionKey | 'none';
}

export interface IdeasRequest {
  event: EventContext;
}

export interface IdeasResponse {
  ideas: { title: string; category: IdeaCategory; description: string }[];
}

export interface HealthResponse {
  ok: true;
  ai: boolean;
  model: string;
}

/** POST /api/intake: one turn of the AI-guided new-event conversation. */
export interface IntakeRequest {
  todayDate: string; // YYYY-MM-DD
  answers: import('./intake.js').IntakeAnswers;
  history: { role: 'ai' | 'user'; text: string }[];
  message: string;
}

export interface IntakeResponse {
  answers: import('./intake.js').IntakeAnswers;
  reply: string;
  /** The next unanswered field, or null once everything needed is known. */
  next: import('./intake.js').IntakeField | null;
}
