// Tells Convex to trust the JWTs that Convex Auth issues for this deployment.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
};
