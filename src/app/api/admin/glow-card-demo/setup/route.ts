import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { requireDb } from '@/lib/db/client';
import { ensureDemoTable } from '@/lib/glowCardDemo';

const accounts = [
  { design: 'passport', email: 'glowcard-passport@example.invalid', first: 'Passport' },
] as const;
const obsoleteDemoEmails = ['glowcard-orbit@example.invalid', 'glowcard-folio@example.invalid'];

function isStaffRequest(request: Request) {
  const adminToken = request.headers.get('cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith('wg_admin_session='))?.slice('wg_admin_session='.length);
  return Boolean(process.env.ADMIN_SESSION_TOKEN && adminToken === process.env.ADMIN_SESSION_TOKEN);
}

// The admin proxy protects this route. It creates only the fixed demonstration
// accounts and never sends verification or marketing email to a fake address.
export async function POST(request: Request) {
  if (!isStaffRequest(request)) {
    return NextResponse.json({ error: 'Staff sign-in required.' }, { status: 401 });
  }
  try {
    const db = requireDb();
    await ensureDemoTable();
    const existing = await db`SELECT email FROM customers WHERE email = ${accounts[0].email}`;
    if (existing.length) return NextResponse.json({ error: 'Demo accounts already exist. Passwords were not changed.' }, { status: 409 });
    const prepared = accounts.map(account => ({ ...account, password: randomBytes(18).toString('base64url') }));
    const rows = await db`
      INSERT INTO customers (email, password_hash, first_name, last_name,
        marketing_consent, referred_by, address_line1, address_city,
        address_postcode, address_country, account_status, email_verified, email_verified_at)
      VALUES
        (${prepared[0].email}, ${hashPassword(prepared[0].password)}, ${prepared[0].first}, 'Demo', false, 'Design demonstration', 'Example address', 'Example city', 'EXAMPLE', 'GB', 'active', true, now())
      RETURNING id, email
    `;
    const credentials = prepared.map(account => ({ design: account.design, email: account.email, password: account.password, customerId: Number(rows.find(row => row.email === account.email)?.id) }));
    return NextResponse.json({ created: credentials }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Demo account setup failed. Check the customer list before retrying.' }, { status: 503 });
  }
}

// Removes only the two rejected design accounts. The approved passport demo is
// deliberately outside this fixed list and cannot be deleted by this route.
export async function DELETE(request: Request) {
  if (!isStaffRequest(request)) {
    return NextResponse.json({ error: 'Staff sign-in required.' }, { status: 401 });
  }
  try {
    const removed = await requireDb()`
      DELETE FROM customers
      WHERE email = ANY(${obsoleteDemoEmails})
      RETURNING email
    `;
    return NextResponse.json({ removed: removed.map(row => row.email) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The unapproved demo accounts could not be removed.' }, { status: 503 });
  }
}
