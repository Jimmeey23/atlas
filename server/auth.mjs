// All application API routes use the same verified Supabase session. The service
// role remains server-only; never trust a decoded JWT or user-supplied identity.
export function apiAuth(client, { allowedEmails = process.env.ATLAS_ALLOWED_EMAILS || '' } = {}) {
  const allowed = new Set(allowedEmails.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  return async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!client) return res.status(503).json({ error: 'Supabase authentication is not configured on the server.' });
    const match = /^Bearer\s+([^\s]+)$/i.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error: 'Sign in to access Atlas.' });
    try {
      const { data, error } = await client.auth.getUser(match[1]);
      const user = data?.user;
      if (error || !user) return res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' });
      const providers = user.app_metadata?.providers || [user.app_metadata?.provider];
      if (!providers.includes('google')) return res.status(403).json({ error: 'Sign in with Google to access Atlas.' });
      if (allowed.size && (!user.email || !allowed.has(user.email.toLowerCase())))
        return res.status(403).json({ error: 'This account is not authorized to access Atlas.' });
      req.atlasUser = { id: user.id, email: user.email };
      next();
    } catch {
      res.status(503).json({ error: 'Authentication is temporarily unavailable. Please retry.' });
    }
  };
}
