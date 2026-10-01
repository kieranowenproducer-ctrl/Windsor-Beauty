import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import { banCustomer, liftCustomerBan } from '@/lib/db/bans';

export const dynamic = 'force-dynamic';

/**
 * The very first ban runs before the ban columns exist, because the schema is created on demand
 * here the same way every other table on this site is. Without this retry the first press would
 * fail and the only cure would be knowing to go and press Run Database Setup.
 */
async function withSchema<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await ensureSchema();
    return run();
  }
}

// Shutting an account, and letting it back in (task 9cd55f28).
//
// Admin only, by the gate in src/proxy.ts that protects every /api/admin path. There is no
// route anywhere that bans somebody automatically: a ban is always a person pressing a button, and
// this is the only place it can happen.

/** Who pressed it. The admin panel has one shared login, so every ban is recorded against it. */
const ADMIN_ACTOR = 'Admin panel';

function customerId(params: { id: string }): number | null {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = customerId(params);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null;

  try {
    const result = await withSchema(() => banCustomer({ customerId: id, reason, adminName: ADMIN_ACTOR }));
    if (!result.ok) {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      alreadyBanned: result.alreadyBanned,
      message: result.alreadyBanned
        ? 'That account was already banned. Nothing changed.'
        : 'Account banned. They have been signed out and cannot sign in or order.',
    });
  } catch {
    return NextResponse.json({ error: 'Could not ban that account. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = customerId(params);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null;

  try {
    const result = await withSchema(() => liftCustomerBan({ customerId: id, reason, adminName: ADMIN_ACTOR }));
    if (!result.ok) {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      wasBanned: result.wasBanned,
      message: result.wasBanned
        ? 'Ban lifted. They can sign in and order again.'
        : 'That account was not banned. Nothing changed.',
    });
  } catch {
    return NextResponse.json({ error: 'Could not lift that ban. Please try again.' }, { status: 500 });
  }
}
