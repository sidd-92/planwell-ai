import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env.local (written by `npx convex dev`) and .env for local development.
// Cloud Run injects env vars directly. Existing variables are never overridden.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file not present — fine */
  }
}

const { plannerRouter } = await import('./routes/planner.js');
const { convexUrl, siteUrl } = await import('./auth.js');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/api', plannerRouter);

// Serve the built React client (dist/client) when it exists.
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.resolve(here, '../../client'), path.resolve(here, '../dist/client'), path.resolve(process.cwd(), 'dist/client')];
const clientDir = candidates.find((p) => existsSync(path.join(p, 'index.html')));
if (clientDir) {
  app.use(express.static(clientDir, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
  const raw = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!raw) console.warn('[config] CONVEX_URL is not set — the app will show a setup message instead of sign-in.');
  else if (!convexUrl()) console.warn(`[config] CONVEX_URL is not a valid https URL: "${raw}"`);
  else console.log(`[config] Convex: ${convexUrl()} (auth issuer ${siteUrl() ?? 'unknown: set CONVEX_SITE_URL'})`);
  console.log(`PlanWell.AI listening on http://localhost:${port}${clientDir ? '' : ' (API only — run the Vite dev server for the UI)'}`);
});
