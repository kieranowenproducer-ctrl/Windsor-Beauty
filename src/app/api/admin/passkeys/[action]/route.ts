import { adminPasskeyAction } from '@/lib/passkeys/admin';
import { passkeyConfig } from '@/lib/passkeys/policy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{action:string}>}) {
  return adminPasskeyAction(request,(await context.params).action);
}

export async function GET(request:Request,context:{params:Promise<{action:string}>}) {
  if((await context.params).action!=='available') return Response.json({error:'Not found.'},{status:404});
  let enabled=false;
  try { enabled=process.env.WB_ADMIN_PASSKEYS_ENABLED==='true' && passkeyConfig().origin===new URL(request.url).origin; } catch { /* Password login remains available. */ }
  return Response.json({enabled},{headers:{'Cache-Control':'no-store'}});
}
