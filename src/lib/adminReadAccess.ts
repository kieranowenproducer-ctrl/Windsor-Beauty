// The same Beauty admin cookie checked by proxy.ts. These new reporting routes
// also check it at the handler boundary before loading any customer data.
export function hasAdminReadAccess(request: Request): boolean {
  const expected = process.env.ADMIN_SESSION_TOKEN;
  if (!expected) return false;
  const tokens = (request.headers.get('cookie') ?? '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith('wb_admin_session='));
  return tokens.length === 1 && tokens[0].slice('wb_admin_session='.length) === expected;
}
