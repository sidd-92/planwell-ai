import { httpRouter } from 'convex/server';
import { auth } from './auth';

const http = httpRouter();

// Convex Auth endpoints (token refresh, JWKS used by the Express server to verify tokens).
auth.addHttpRoutes(http);

export default http;
