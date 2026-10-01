import { NextResponse } from 'next/server';
import { listOrderEmailStatuses } from '@/lib/db/customerEmails';
import { isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  if (!isDbConfigured()) return NextResponse.json({ emails: [] });
  const { orderNumber } = await props.params;
  const emails = await listOrderEmailStatuses(orderNumber).catch(() => []);
  return NextResponse.json({
    emails: emails.map(email => ({
      id: email.id, type: email.email_type, status: email.delivery_status,
      subject: email.subject, sentAt: email.created_at, updatedAt: email.delivery_updated_at,
    })),
  });
}
