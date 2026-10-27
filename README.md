# PlanWell.AI — an AI-assisted event planner

PromptWars · Challenge 5: Celebration & Event Planner

## Chosen vertical

**Celebration & Event Planner.** PlanWell.AI helps a planner run weddings, birthdays and community events from one dashboard. It drafts a budget split, a dated timeline, a vendor checklist and an idea board from a few answers. An assistant then works on the plan with the planner.

## Approach and logic

1. **Google Cloud native.** The app is one container on **Cloud Run**: an Express server that serves the React app and a small JSON API. All generation runs on **Gemini through Vertex AI** (`gemini-3.8-flash` by default), using the Google Gen AI SDK (`@google/genai`) with `vertexai: true`. Auth uses the Cloud Run service account, so no API keys are stored anywhere.
2. **Structured output, not free text.** Every Gemini call sets `responseMimeType: application/json` and a `responseSchema`. Plans, chat replies and new ideas all come back as typed JSON that the UI renders directly: budget lines, phases, tasks with ISO deadlines, vendors, ideas, and the suggested action.
3. **AI proposes, the planner decides.** The assistant never changes the plan by itself. Each reply can carry one *suggested action* (rebalance a budget line, add three tasks, shortlist vendors, queue an RSVP reminder, generate ideas). It shows up as a button, and nothing changes until the planner clicks it.
4. **Grounded in the plan.** Each chat turn sends a compact snapshot of the event: budget lines, open tasks, vendor status, RSVP counts and ideas, plus the real local vendors for the event's area. Gemini answers from real numbers and is told to name only those vendors, so it doesn't invent businesses.
5. **Accounts and persistence with Convex.** Planners sign up with an email and password (Convex Auth). Signed-out visitors see only the sign-in screen. Each user's events are stored in **Convex** (one document per event, checked against a strict schema). Every change is saved immediately with an optimistic update, so the UI never waits on the network, and Convex's live queries keep other open tabs and devices in sync.
6. **Works without the cloud too.** If Vertex AI isn't configured or doesn't respond, the app switches to a built-in rules engine and a scaled template, so the demo never breaks. The assistant header shows **Gemini on Vertex AI** or **Offline mode**.

## How it works

1. **New event.** Pick a mode. **AI-guided** is a short chat: Gemini reads each free-text answer, and the server checks the values and asks the next question (type, client, name, date, Pune area, guests, budget, priorities, feel). **Manual setup** is a three-step form that starts from a template plan. Either way the plan is drafted and shown for **review** first. Nothing is created until the planner clicks **Approve plan**; **Change answers** shows every question with its answer for editing, then redrafts. Events can only be created in the supported Pune areas.
2. **Draft.** `POST /api/plan` sends those answers to Gemini with a strict schema. The server returns the plan, and the client normalises it: budget lines are scaled to add up exactly to the total, and phases are dated relative to the event.
3. **Dashboard.** Seven tabs: Overview (weekly briefing, next tasks, budget, vendors, RSVPs), Budget (editable allocations, add or remove budget lines, overage flags), Timeline (phases, tasks you can tick off or add), Vendors (real local vendors you can browse and choose, an editable cost and budget line, and a status you can click to advance; a Contacted, Booked or paid vendor's cost counts as committed on its budget line). You can also **Add expense** for costs that aren't a vendor (a permit fee, printing); each is a labelled row counted against a budget line. Booked vendors can then move to **Advance paid** (you enter the amount; the balance is shown as due after the event) and **Fully paid**. Payments are final: a paid vendor can't go back to an earlier stage, and Fully paid is the last stage, Volunteers (add friends and relatives who are helping and assign them timeline tasks; they aren't notified by the app yet, so you copy their task list or open a prefilled WhatsApp message), Guests (RSVP tracking, search, add guests, and upload a `.xlsx` or `.csv` guest list; every cell is editable in the table) and Ideas (a filterable idea board: shortlist ideas for the client and print the shortlist, or work an idea into the plan: Gemini proposes tasks, a cost and a budget line, you choose how to fund it from options calculated from your budget, and nothing changes until you confirm).
4. **Edit and delete.** *Edit* in the event header changes the name, client, date, area, guest count and feel. *Delete* asks for confirmation. The last remaining event can't be deleted, because an empty account is re-seeded with the sample events.
5. **Assistant.** `POST /api/chat` answers questions about the plan and suggests one action. `POST /api/ideas` adds three new ideas to the board. `POST /api/intake` runs one turn of the AI-guided new-event chat. Each tab also shows an inline suggestion when one applies.

```
                ┌──HTTPS/JSON──▶ Cloud Run: Express ──▶ Vertex AI · Gemini (JSON schema output)
React (Vite) ───┤
                └──WebSocket───▶ Convex (Auth + events + vendorDirectory)
                                      └──▶ Places API (New): one-off seed only
```

### Persistence (Convex)

- `convex/schema.ts`: Convex Auth's tables, an `events` table indexed by `userId`, and the `vendorDirectory` table. Each event's plan (budget, phases, vendors, guests, ideas, chat) lives in a typed `data` field, validated by `convex/validators.ts`.
- `convex/events.ts`: `list` (live query), `seed` (sample events for a new account), `create` (rejects locations outside the Pune areas), `save` and `remove`. Every function reads the user from the session; a user can only read or change their own events.

### Vendor directory (Google Places)

- Real vendors come from the **Places API (New)** Text Search, fetched once by an internal Convex action and stored in the `vendorDirectory` table. Users never trigger a Places call, so cost is fixed by how often you seed.
- Coverage is deliberately small: four Pune areas (Koregaon Park, Kothrud, Baner, Viman Nagar) and eight categories (Venue, Catering, Photography, Music, Florist, Makeup, Rentals, Cake). Both lists are in `shared/areas.ts`.
- Only places rated 4.0+ with at least 10 reviews are kept. Each entry stores the name, address, rating, review count, phone and Maps link. Places doesn't return prices or availability.
- **Vendors tab:** the assistant suggests the top three for the first open category, and **Browse** on any row lists every vendor for that category and area, with **Choose** to put one on the row.
- Categories beyond those eight (a nursery, a printer, a waste partner) are looked up the first time someone opens **Browse** on them: one Google Places search for that area and category, then cached for everyone. A global cap of 300 lookups limits the cost.
- Events outside Pune (the three sample events) keep placeholder vendor names.

Seed it once per Convex deployment (about 32 requests, well under a dollar):

```bash
# Enable "Places API (New)" in your GCP project and create an API key restricted to it
npx convex env set GOOGLE_PLACES_API_KEY <your-key>          # add --prod for production
npx convex run vendorDirectory:seed                          # add --prod for production
npx convex run vendorDirectory:seed '{"only":"Rentals"}'     # optional: one category
```

### Sign-in (Convex Auth, email + password)

- `convex/auth.ts` uses the **Password** provider only: no social logins and no email verification. **Create account** registers the email with the password and signs the user in; **Sign in** checks the password. Passwords are hashed with Scrypt by Convex Auth, and must be 8–128 characters.
- Signed-out visitors see only the sign-in screen. Every Convex query and mutation requires a session.
- The Gemini endpoints (`/api/plan`, `/api/chat`, `/api/ideas`) also require sign-in: the browser sends its Convex Auth token, and Express verifies it against the deployment's public keys (`/.well-known/jwks.json`, issuer = the Convex site URL, audience `convex`) before calling Vertex AI. See `server/auth.ts`.

## Project layout

```
├── Dockerfile
├── CLAUDE.md                 Notes for working in this repo (commands, architecture, conventions)
├── convex/
│   ├── schema.ts             events table + index
│   ├── validators.ts         strict validator for an event's plan data
│   ├── events.ts             list / seed / create / save / remove (per user)
│   ├── vendorDirectory.ts    Places-backed vendor directory: seed action, byArea and browse queries
│   ├── auth.ts, auth.config.ts, http.ts   Convex Auth: password provider + HTTP routes
│   ├── users.ts              current user's email
│   └── _generated/           Convex codegen output (refreshed by `npx convex dev`)
├── server/
│   ├── auth.ts               verifies Convex Auth tokens on the AI routes
│   ├── index.ts              Express entry: /api routes + serves the built client
│   ├── routes/planner.ts     /api/health, /api/plan, /api/chat, /api/ideas (input validation)
│   └── services/vertexAi.ts  Gemini on Vertex AI: prompts + response schemas
├── shared/
│   ├── api.ts                Request/response types shared by client and server
│   └── areas.ts              Supported Pune areas and vendor categories (client, server and Convex)
└── client/
    ├── index.html
    └── src/
        ├── App.tsx           Layout, state, assistant + actions
        ├── components/       Sidebar, Overview, Budget, Timeline, Vendors, Guests, Ideas, Assistant, Onboarding
        ├── lib/planner.ts    Plan logic: budget fixes, RSVP counts, offline assistant, Gemini → dashboard mapping
        ├── lib/store.ts      The signed-in user's events in Convex (live, optimistic saves)
        ├── components/AuthScreen.tsx   Sign in / create account
        ├── lib/api.ts        Fetch helpers
        ├── data/seed.ts      Three sample events
        └── styles/           Organic design system tokens + app layout
```

## Google Cloud architecture and why

```
Browser ──HTTPS/JSON──▶ Cloud Run (one container: Express + built React)
   │                        ├─▶ Vertex AI · Gemini      (service-account auth, no key)
   │                        └─▶ Convex JWKS             (verifies the user's token)
   └──WebSocket──▶ Convex (Auth + events + vendorDirectory)
                      └─▶ Places API (New)             (seed action only, API key in Convex env)
```

The choices below are deliberate:

- **One Cloud Run service for UI and API.** Express serves the Vite build and `/api/*` from the same origin, so there is no CORS setup and one thing to deploy. Cloud Run scales to zero, which keeps a hackathon demo nearly free, and the same `Dockerfile` runs locally. The image is two-stage, runs as the non-root `node` user and gets `PORT` from Cloud Run.
- **Gemini through Vertex AI, not an API key.** The Google Gen AI SDK runs with `vertexai: true` and Application Default Credentials. In production that is the Cloud Run service account, which `deploy.sh` grants `roles/aiplatform.user`. Locally it is `gcloud auth application-default login`. No Gemini key exists to leak, rotate or commit.
- **Gemini calls only from the server.** The browser never talks to Vertex AI. The server validates input and uses prompts with a JSON `responseSchema`, and treats planner text as data inside `<user_input>` tags. `/api/plan`, `/api/chat` and `/api/ideas` also require a signed-in user, so anonymous traffic can't run up Vertex AI cost.
- **Convex outside GCP, for state and sign-in.** Convex gives live queries, per-user documents and password auth without you running a database or an auth service. Cloud Run stays stateless, so it can scale to zero and be redeployed freely. The cost is a second platform. Express trusts Convex Auth tokens by checking them against the deployment's public keys (`server/auth.ts`); `CONVEX_URL` is the only link between the two.
- **Places API for vendors, called once, from Convex.** Real vendor data comes from Places (New) Text Search, run by the internal `vendorDirectory:seed` action and stored in Convex. Users never trigger a Places call, so cost is bounded by how often you seed (about 32 requests per full run). The key is restricted to Places (New) and kept in Convex env, not in the Cloud Run service.
- **Region split.** Cloud Run is in `asia-south1` (Mumbai) for latency to Pune users. Vertex AI runs in the `global` location (`GCP_LOCATION`), because the Gemini 3.x models are served from there and not from regional endpoints such as `us-central1` or `asia-south1`. Gemini calls aren't pinned to a region, so keep that in mind if you have data-residency requirements.
- **`deploy.sh` is the single deploy path.** It deploys Convex production, enables the Cloud Run, Cloud Build, Artifact Registry and Vertex AI APIs, grants the runtime service account Vertex access, runs `gcloud run deploy --source .`, then configures Convex Auth against the new Cloud Run URL (`SITE_URL`). Env vars set on the service: `GCP_PROJECT_ID`, `GCP_LOCATION`, `CONVEX_URL`.

## Run locally

Requires Node 20+.

```bash
npm install
cp .env.example .env            # set GCP_PROJECT_ID to a project with Vertex AI enabled
gcloud auth application-default login

# Terminal 1: Convex (first run logs in, creates the project and writes VITE_CONVEX_URL to .env.local)
npx convex dev

# Once per Convex deployment: generate the sign-in keys (JWT_PRIVATE_KEY, JWKS, SITE_URL).
# When it asks for the site URL, use http://localhost:5173.
npx @convex-dev/auth

# Terminal 2: API on :8080, app on http://localhost:5173
npm run dev
```

Seed the vendor directory (see *Vendor directory* above) to get real vendors in the Vendors tab.

Without `GCP_PROJECT_ID` the assistant runs in offline mode. A Convex deployment is required: without it the app can't sign anyone in, so it shows a setup message instead.

Production build: `npm run build && npm start`, then open http://localhost:8080.

## Deploy to Cloud Run

One command, run from this folder on a machine where `gcloud` and Convex are logged in:

```bash
./deploy.sh                                  # current gcloud project, Cloud Run in asia-south1 (Mumbai)
GCP_PROJECT_ID=my-project REGION=us-central1 ./deploy.sh
```

It runs five steps:

1. Installs dependencies.
2. Deploys the Convex functions to your production deployment (`npx convex deploy`) and captures its URL.
3. Enables Cloud Run, Cloud Build, Artifact Registry and Vertex AI, and gives the Cloud Run service account the **Vertex AI User** role.
4. Builds the Dockerfile with Cloud Build and deploys it to Cloud Run with `GCP_PROJECT_ID`, `GCP_LOCATION` and `CONVEX_URL`. The browser reads the Convex URL at runtime from `/api/config`, so the image is the same for every environment.
5. Creates the sign-in keys on the production Convex deployment (`npx @convex-dev/auth --prod`) and sets `SITE_URL` to the Cloud Run URL.

Re-running it is safe: later runs redeploy both sides and keep the existing sign-in keys.

## Deploy on every push (CI/CD)

`.github/workflows/deploy.yml` deploys on every push to `main`: it typechecks, deploys the Convex functions to production, then deploys to Cloud Run (the same steps as `./deploy.sh`). It signs in to Google Cloud with Workload Identity Federation, so no key file is stored anywhere. You can also run it by hand from the repo's **Actions** tab.

One-time setup:

1. Run `./deploy.sh` once by hand. It creates the Cloud Run service, the Convex production deployment and the sign-in keys, which the pipeline doesn't do. Also set the Places key on production: `npx convex env set GOOGLE_PLACES_API_KEY <key> --prod`.
2. Run `./scripts/setup-cd.sh`. It creates a deployer service account and a Workload Identity pool that only trusts this GitHub repository, and prints three values.
3. In GitHub, create an environment named **`prod`** (**Settings > Environments**) and add to it the **variables** `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA` (from step 2) and the **secret** `CONVEX_DEPLOY_KEY` (a production deploy key from the Convex dashboard).

**How to work with it:** make changes on a branch, open a pull request into `main` and let the CI workflow (`.github/workflows/ci.yml`: typecheck and build) pass, test it, then merge. The merge is the release: it triggers the deploy. Don't push to `main` directly.

The deploy job runs in the `prod` environment. In that environment's settings, set **Deployment branches** to `main` only, so a branch can't deploy to production. Every deploy runs a Cloud Build; the free tier covers a normal amount of pushing.

## Assumptions

- Events are limited to a few Pune areas to keep Places usage and cost small. To add an area or category, edit `shared/areas.ts` and run the seed again.
- Vendor data is a snapshot from Google Places. It can go stale, and it has no prices or availability, so the cost field is entered by hand.
- Currency is USD or INR per event (INR by default), picked during setup. Amounts are formatted for that locale (₹5,00,000 or $35,000).
- Gemini's budget lines are re-scaled on the client so they always add up exactly to the stated total.
- RSVP totals combine named guests with a count imported from the client's list.
- Accounts are email + password only, with no email verification or password reset (both can be added to the Password provider later).
- A new account starts with three sample events so the dashboard has something to show.
- When two devices edit the same event at the same moment, the last save wins for that event.
- The UI uses the "Organic" design system from the Claude Design project: Caprasimo and Figtree from Google Fonts, plain CSS tokens and no CSS framework.
