import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Verifies the Convex Auth token the browser sends as `Authorization: Bearer …`.
// Convex Auth signs tokens with the deployment's key, publishes the public keys at
// <site>/.well-known/jwks.json, sets the issuer to the site URL and the audience to "convex".

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):(\d+)$/;

/** The Convex deployment URL: any https deployment URL, or a local one from `npx convex dev`. */
export function convexUrl(): string | null {
  const url = (process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || '').trim().replace(/\/$/, '');
  if (LOCAL.test(url)) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.pathname === '/' && !u.search ? u.origin : null;
  } catch {
    return null;
  }
}

/** Where the deployment serves HTTP actions (the token issuer and JWKS host). */
export function siteUrl(): string | null {
  const explicit = (process.env.CONVEX_SITE_URL || process.env.VITE_CONVEX_SITE_URL || '').trim().replace(/\/$/, '');
  if (/^https:\/\/[^/\s]+$/.test(explicit) || LOCAL.test(explicit)) return explicit;
  const cloud = convexUrl();
  if (!cloud) return null;
  const local = LOCAL.exec(cloud);
  // Local deployments serve HTTP actions on the next port (3210 → 3211).
  if (local) return `http://${local[1]}:${Number(local[2]) + 1}`;
  // Cloud deployments, including regional ones (name.eu-west-1.convex.cloud → name.eu-west-1.convex.site).
  if (/\.convex\.cloud$/.test(cloud)) return cloud.replace(/\.convex\.cloud$/, '.convex.site');
  return null; // custom domain: set CONVEX_SITE_URL
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksFor = '';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const site = siteUrl();
  if (!site) {
    res.status(503).json({ error: 'Sign-in is not configured on this server (CONVEX_URL is missing).' });
    return;
  }
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Please sign in.' });
    return;
  }
  try {
    if (!jwks || jwksFor !== site) {
      jwks = createRemoteJWKSet(new URL(`${site}/.well-known/jwks.json`));
      jwksFor = site;
    }
    const { payload } = await jwtVerify(token, jwks, { issuer: site, audience: 'convex' });
    res.locals.userId = String(payload.sub || '').split('|')[0];
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}
