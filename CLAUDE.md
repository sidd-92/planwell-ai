# PlanWell.AI

AI-assisted event planner (weddings, birthdays, community events). React + Vite client, Express API on Cloud Run, Gemini on Vertex AI, Convex for auth and storage. README.md has the product overview and deploy steps; this file is what you need to work in the code.

## Commands

- `npm run dev`: Express (`tsx watch server/index.ts`, port 8080) and Vite (port 5173) together. Run `npm run dev:convex` (`npx convex dev`) in a second terminal; it pushes functions and regenerates `convex/_generated/`.
- `npm run typecheck`: checks the client, the server and `convex/` (three tsconfigs). Run it after every change.
- `npx convex codegen`: refresh `convex/_generated/` after adding or changing Convex functions or the schema. The client's `api.*` types are stale until you do. It does not always push the functions: to deploy them to the dev deployment run `npx convex dev --once` (or keep `npx convex dev` running).
- There is no test suite or linter.

## Layout

- `client/src/`: React app. `App.tsx` holds the dashboard, the assistant actions and the per-tab suggestions. `lib/planner.ts` has the plan logic (budget fixes, `applyAction`, offline replies, `toContext`). `lib/store.ts` is the Convex-backed event store. `data/seed.ts` has the sample events and placeholder vendor names.
- `server/`: Express. Routes in `routes/planner.ts`, Gemini prompts and response schemas in `services/vertexAi.ts`, Convex token verification in `auth.ts`.
- `convex/`: schema, validators, functions. `validators.ts` is the strict validator for an event's plan data and mirrors `PlanEvent` in `client/src/types.ts`; change both together.
- `shared/`: code imported by client, server and Convex. `api.ts` has the request/response types. `areas.ts` has the Pune areas and vendor categories.

## Key behaviours

- **Events are one document each.** The whole plan (budget, phases, vendors, guests, ideas, chat) lives in `events.data`. The client mutates a cloned event and saves the whole thing (`events.save`) after every change.
- **AI proposes, the planner decides.** Gemini replies carry at most one `suggestedAction`; nothing changes until the planner clicks it. Every Gemini call uses a JSON `responseSchema`.
- **New-event flow.** `Onboarding.tsx` is a state machine: mode, then form or AI chat, then draft, review, and optionally answers (edit and redraft). Nothing is written to Convex until `onCreate` runs on **Approve plan**. The AI chat (`IntakeChat.tsx`, `POST /api/intake`) uses fixed questions from `shared/intake.ts`; Gemini only extracts values and writes the acknowledgement, and `server/services/intake.ts` validates everything and picks the next question. Manual mode uses the template plan, AI mode uses Gemini's.
- **Budget commitments.** A budget line's `spent` is its committed total: vendor costs (status Contacted or Booked) plus "other expenses". `patchVendor` in `lib/planner.ts` is the only place that should change a vendor's cost, status or `line`; it moves `spent` by the difference. `budgetLineFor` matches a vendor to a line by name (`Vendor.line` overrides it; `''` means none), so don't write `vendor.cost` or `status` directly.
- **Volunteers.** `PlanEvent.helpers` (id, name, optional phone) and `Task.assignee` (a helper id). `VolunteersView.tsx` adds volunteers and assigns tasks; the Timeline tab has an assignee picker too. Helper logic (`addHelper`, `removeHelper`, `helperMessage`, `whatsappUrl`) is in `lib/planner.ts`. Known limitation: volunteers are not notified by the app; the planner copies a task list or opens a prefilled WhatsApp link. Real notifications (email, SMS, WhatsApp API) are a post-MVP feature.
- **Budget lines.** The Budget tab can add a line (`addBudgetLine`, kept above a Contingency line) and remove one with nothing committed (`removeBudgetLine`). The total budget is the sum of the lines' planned amounts, so adding a line raises it.
- **Ideas into the plan.** Ideas can be shortlisted (`Idea.saved`, filter, printable page) and worked into the plan with **Add to plan** (`IdeaPlanDialog.tsx`). `POST /api/idea-plan` (`planIdea` in `vertexAi.ts`) asks Gemini only for tasks, a cost estimate and a budget line; the ways to pay for it come from `shared/ideaPlan.ts` (`fundingOptions`), calculated in code from the current budget so the amounts always add up. `applyIdeaPlan` re-checks the chosen option and changes nothing if the budget has moved. **Decide later** stores the proposal in `Idea.later`; the funding options are recalculated each time it is reopened.
- **Contributions.** Community events only (`ev.type === 'community'`), under the Budget tab in `ContributionsPanel.tsx`. `PlanEvent.collected` is one total, `contributors` are people (name, optional phone and detail) with no per-person amount, and `earmarked` is the part of the total already added to budget lines. **Add to budget lines** (`suggestContributionSplit` fills over-budget lines first, `applyContributionSplit` raises those lines' planned amounts) is deterministic code. The chat assistant sees a `contributions` summary in `EventContext`, asks if nothing was collected, mentions recent names, and points to that button; it can't record anything.
- **Expenses.** A non-vendor cost (permit fee, printing) is a `Vendor` row with `expense: true`, created by `addExpense` and removed by `removeExpense`. It shows in the Vendors table and counts toward its budget line like a vendor, but is excluded from vendor counts ("X of Y booked", the dots, the assistant's open-vendor list), so filter with `!v.expense` when counting vendors. Whatever is left of a line's `spent` after vendors and expenses is shown as "Other (not itemised)" with a Clear button.
- **Vendor payments.** Vendor status runs To find, Shortlisted, Contacted, Booked, Advance paid, Fully paid. The first four move freely with `stepVendor`; the payment states only come from `recordAdvance` and `markFullyPaid`, and once a vendor is paid its status and cost are locked (`patchVendor` ignores them). Use `isBooked` (Booked or beyond) and `isPaid` instead of comparing `status` strings.
- **Reminders are not sent.** "Queue reminder" only sets `PlanEvent.reminded` and shows a toast; the UI, the toast and the chat prompt all say nothing is sent. Sending invites and reminders (WhatsApp, SMS, email) is a planned post-MVP feature, so keep the "not sent yet" wording until it exists.
- **Guest import.** `lib/guestImport.ts` parses a `.xlsx` (via `read-excel-file`, loaded on demand) or `.csv` into guests; columns are No, Name, Contact, Email, Address 1, Address 2, Pincode, matched by header wording. Rows with any detail are added (half-filled is fine), rows with only a number are added as blank entries at the end, fully empty rows are ignored, and rows matching an existing name and contact are skipped. The toast reads `added/total rows were added`. The new guest fields are optional in `convex/validators.ts`, so older events still load.
- **Edit and delete.** `EventDialogs.tsx` and the header buttons in `App.tsx`. `events.remove` refuses to delete a user's last event, because an empty list triggers the sample-event re-seed.
- **Offline fallback.** If Vertex AI is unavailable the client uses the rules engine in `planner.ts`. Keep that path working when you change an AI feature.
- **Auth.** Convex Auth, password provider only. Every Convex function requires a session. `/api/plan`, `/api/chat` and `/api/ideas` verify the Convex token in `server/auth.ts`.
- **Pune areas only.** New events must be in one of `PUNE_AREAS` (`shared/areas.ts`). The dropdown, `POST /api/plan` and `events.create` all enforce it. The sample events (`events.seed`) are outside Pune and are deliberately exempt.

## Vendor directory

- Real vendors live in the Convex `vendorDirectory` table, filled once from Google Places (New) Text Search. Users cannot write to it.
- Seed: `npx convex env set GOOGLE_PLACES_API_KEY <key>` then `npx convex run vendorDirectory:seed` (optionally `'{"only":"Rentals"}'`). It is an internal action, so it runs only from the CLI. It keeps places rated 4.0+ with 10+ reviews. It costs a few cents; don't re-run it casually.
- Any other category (for example "Agricultural Nursery") is looked up on demand: opening Browse on it with no stored results calls `vendorDirectory:fetchCategory`, which searches Google Places once for that area and category, stores the results and records the lookup in `directoryFetches`. Later opens read from the directory. A global cap (`MAX_LOOKUPS`, 300) limits the cost. `directoryKey()` in `shared/areas.ts` maps a planner category to its directory key.
- Categories: `VENDOR_CATEGORIES` in `shared/areas.ts` maps free-form planner categories (for example "Photography & film") to directory categories by regex. Add a category there and re-seed it.
- Events in a Pune area shortlist from the directory and skip categories that have none. Events elsewhere fall back to the placeholder names in `SHORT`. In `applyAction`, `vendorPicks` of `undefined` means placeholders and `null` means a Pune event with nothing to offer.
- The chat prompt tells Gemini to name only vendors in `EventContext.directory`. That is a prompt instruction, not enforcement.

## Google Cloud architecture

```
Browser ──HTTPS/JSON──▶ Cloud Run (one container: Express + built React)
   │                        ├─▶ Vertex AI · Gemini      (service-account auth, no key)
   │                        └─▶ Convex JWKS             (verifies the user's token)
   └──WebSocket──▶ Convex (Auth + events + vendorDirectory)
                      └─▶ Places API (New)             (seed action only, API key in Convex env)
```

Why it is built this way:

- **One Cloud Run service for UI and API.** Express serves the Vite build and `/api/*` from the same origin, so there is no CORS setup and one thing to deploy. Cloud Run scales to zero, which keeps a hackathon demo nearly free, and the same `Dockerfile` runs locally. The image is two-stage, runs as the non-root `node` user and gets `PORT` from Cloud Run.
- **Gemini through Vertex AI, not an API key.** The Google Gen AI SDK runs with `vertexai: true` and Application Default Credentials. In production that is the Cloud Run service account, which `deploy.sh` grants `roles/aiplatform.user`. Locally it is `gcloud auth application-default login`. No Gemini key exists to leak, rotate or commit.
- **Gemini calls only from the server.** The browser never talks to Vertex AI. The server validates input and uses prompts with a JSON `responseSchema`, and treats planner text as data inside `<user_input>` tags. `/api/plan`, `/api/chat` and `/api/ideas` also require a signed-in user, so anonymous traffic can't run up Vertex AI cost.
- **Convex outside GCP, for state and sign-in.** Convex gives live queries, per-user documents and password auth without us running a database or an auth service. Cloud Run stays stateless, so it can scale to zero and be redeployed freely. The cost is a second platform. Express trusts Convex Auth tokens by checking them against the deployment's public keys (`server/auth.ts`); `CONVEX_URL` is the only link between the two.
- **Places API for vendors, called once, from Convex.** Real vendor data comes from Places (New) Text Search, run by the internal `vendorDirectory:seed` action and stored in Convex. Users never trigger a Places call, so cost is bounded by how often we seed (about 32 requests per full run). The key is restricted to Places (New) and kept in Convex env, not in the Cloud Run service.
- **Region split.** Cloud Run is in `asia-south1` (Mumbai) for latency to Pune users. Vertex AI runs in the `global` location (`GCP_LOCATION`), because the Gemini 3.x models are served from there and not from regional endpoints such as `us-central1` or `asia-south1`. Gemini calls aren't pinned to a region, so keep that in mind if you have data-residency requirements.
- **`deploy.sh` is the single deploy path.** It deploys Convex production, enables the Cloud Run, Cloud Build, Artifact Registry and Vertex AI APIs, grants the runtime service account Vertex access, runs `gcloud run deploy --source .`, then configures Convex Auth against the new Cloud Run URL (`SITE_URL`). Env vars set on the service: `GCP_PROJECT_ID`, `GCP_LOCATION`, `CONVEX_URL`.

## Conventions

- TypeScript strict, ESM (`"type": "module"`). Server imports use the `.js` extension (`'../services/vertexAi.js'`).
- Keep the existing comment style: short, explain why, no banners.
- Don't commit secrets. Local env is in `.env` and `.env.local` (`VITE_CONVEX_URL` is written by `npx convex dev`). Places and Convex keys are set with `npx convex env set`, not in files.
- Work on a branch and merge through a pull request; CI (`.github/workflows/ci.yml`) typechecks and builds every PR. Don't commit straight to `main`.
- Pushing to `main` deploys automatically through `.github/workflows/deploy.yml` once the one-time setup in the README ("CI/CD") is done, so don't push broken code to `main`. The job runs in the GitHub environment `prod`, which holds the `GCP_*` variables and the `CONVEX_DEPLOY_KEY` secret.
- Deployment is `./deploy.sh` (Convex production plus Cloud Run in asia-south1). It prompts before doing anything.
