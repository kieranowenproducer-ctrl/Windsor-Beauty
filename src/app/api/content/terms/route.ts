import { NextResponse } from 'next/server';
import { getSiteContent, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The live Terms and Conditions, for the sign-up screen's terms box (task
// 3933725e). Read-only and public: this is the same text anyone can already
// read at /terms and inside the site entry gate.
//
// It exists because the editable copy is a `site_content` override that BEATS
// the code default in TermsAcceptanceModal — layout.tsx passes that override
// into the entry gate from the server, but MemberRegistrationForm is a client
// component shared by /account/register and /coming-soon, so it needs a route
// to read the same source. Without this the sign-up modal would quietly show
// different terms from the rest of the site.
export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ override: null });

  const row = await getSiteContent('terms').catch(() => null);
  const override = row?.body?.trim()
    ? { title: row.title, body: row.body, format: row.format }
    : null;

  return NextResponse.json({ override });
}
